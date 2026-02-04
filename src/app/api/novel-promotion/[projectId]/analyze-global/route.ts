import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import fs from 'fs'
import path from 'path'
import { removeLocationPromptSuffix } from '@/lib/constants'
import { withTextBilling } from '@/lib/pricing'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

// 切片大小（字符）
const CHUNK_SIZE = 3000

// 按段落边界切分文本
function chunkContent(text: string, maxSize: number = CHUNK_SIZE): string[] {
    const chunks: string[] = []
    const paragraphs = text.split(/\n\n+/)
    let current = ''

    for (const p of paragraphs) {
        if (current.length + p.length + 2 > maxSize) {
            if (current.trim()) chunks.push(current.trim())
            current = p
        } else {
            current += (current ? '\n\n' : '') + p
        }
    }

    if (current.trim()) chunks.push(current.trim())
    return chunks
}

// 解析 JSON 响应（增强容错）
function parseJsonResponse(responseText: string): any {
    let cleanedText = responseText.trim()

    // 移除 markdown 代码块标记
    cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')

    // 提取 JSON 对象
    const firstBrace = cleanedText.indexOf('{')
    const lastBrace = cleanedText.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanedText = cleanedText.substring(firstBrace, lastBrace + 1)
    }

    // 🔥 修复常见的 LLM JSON 格式问题
    // 1. 移除尾随逗号（如 ], } 或 }, } 前的逗号）
    cleanedText = cleanedText.replace(/,\s*([}\]])/g, '$1')

    // 2. 修复中文引号
    cleanedText = cleanedText.replace(/[""]/g, '"')

    // 3. 移除控制字符
    cleanedText = cleanedText.replace(/[\x00-\x1F\x7F]/g, '')

    return JSON.parse(cleanedText)
}

export const POST = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuth(projectId)
    if (isErrorResponse(authResult)) return authResult
    const session = authResult.session

    const novelData = await prisma.novelPromotionProject.findUnique({
        where: { projectId },
        include: {
            characters: true,
            locations: true,
            episodes: {
                orderBy: { episodeNumber: 'asc' },
                select: { id: true, name: true, novelText: true }
            }
        }
    })

    if (!novelData) {
        throw new ApiError('NOT_FOUND', { message: 'Novel promotion data not found' })
    }

    // 1. 收集所有内容
    let allContent = ''

    // 添加全局设定（如果有）
    if (novelData.globalAssetText?.trim()) {
        allContent += `【全局设定】\n${novelData.globalAssetText}\n\n`
    }

    // 添加所有 episode 内容
    for (const ep of novelData.episodes) {
        if (ep.novelText?.trim()) {
            allContent += `【${ep.name}】\n${ep.novelText}\n\n`
        }
    }

    if (!allContent.trim()) {
        throw new ApiError('INVALID_PARAMS', { message: '没有可分析的内容，请先添加剧集或全局设定' })
    }

    console.log(`=== 全局资产分析开始 ===`)
    console.log(`总内容长度: ${allContent.length} 字符`)

    // 2. 切分内容
    const chunks = chunkContent(allContent, CHUNK_SIZE)
    console.log(`切分为 ${chunks.length} 个切片`)

    // 3. 加载提示词模板
    const characterPromptPath = path.join(process.cwd(), 'lib', 'prompts', 'novel-promotion', 'agent_character_profile.txt')
    const locationPromptPath = path.join(process.cwd(), 'lib', 'prompts', 'novel-promotion', 'select_location.txt')
    const characterPromptTemplate = fs.readFileSync(characterPromptPath, 'utf-8')
    const locationPromptTemplate = fs.readFileSync(locationPromptPath, 'utf-8')

    // 4. 初始化已有资产（包含完整信息用于 AI 理解）
    // 存储角色完整信息，用于更新时查找
    let existingCharacters = novelData.characters.map(c => ({
        id: c.id,
        name: c.name,
        aliases: c.aliases ? JSON.parse(c.aliases as string) : [],
        introduction: (c as any).introduction || ''
    }))
    let existingCharacterNames = existingCharacters.map(c => c.name)

    // 构建角色信息字符串（用于发送给 AI）
    function buildCharactersLibInfo(): string {
        if (existingCharacters.length === 0) return '暂无已有角色'
        return existingCharacters.map((c, i) => {
            const aliasStr = c.aliases.length > 0 ? `别名：${c.aliases.join('、')}` : '别名：无'
            const introStr = c.introduction ? `介绍：${c.introduction}` : '介绍：暂无'
            return `${i + 1}. ${c.name}\n   ${aliasStr}\n   ${introStr}`
        }).join('\n\n')
    }

    let existingLocationNames = novelData.locations.map(l => l.name)
    // 添加已有的场景 summary 供去重参考
    let existingLocationInfo = novelData.locations.map(l =>
        l.summary ? `${l.name}(${l.summary})` : l.name
    )

    // 统计
    const stats = {
        totalChunks: chunks.length,
        processedChunks: 0,
        newCharacters: 0,
        updatedCharacters: 0,
        newLocations: 0,
        skippedCharacters: 0,
        skippedLocations: 0
    }

    // 5. 串行分析每个切片
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        console.log(`\n--- 分析切片 ${i + 1}/${chunks.length} (${chunk.length} 字符) ---`)

        // 准备提示词（发送完整角色信息，包含别名和介绍）
        const characterPrompt = characterPromptTemplate
            .replace('{input}', chunk)
            .replace('{characters_lib_info}', buildCharactersLibInfo())

        const locationPrompt = locationPromptTemplate
            .replace('{input}', chunk)
            .replace('{locations_lib_name}', existingLocationInfo.join(', ') || '无')

        // 使用 withTextBilling 包装 API 调用
        const chunkResult = await withTextBilling(
            session.user.id,
            novelData.analysisModel,
            3000,  // 预估输入 tokens（每切片）
            2000,  // 预估输出 tokens
            { projectId, action: 'analyze_global_chunk' },
            async () => {
                // 并行调用角色和场景分析
                const [characterCompletion, locationCompletion] = await Promise.all([
                    chatCompletion(session.user.id, novelData.analysisModel,
                        [{ role: 'user', content: characterPrompt }],
                        { temperature: 0.7, projectId, action: 'analyze_global_characters' }
                    ),
                    chatCompletion(session.user.id, novelData.analysisModel,
                        [{ role: 'user', content: locationPrompt }],
                        { temperature: 0.7, projectId, action: 'analyze_global_locations' }
                    )
                ])

                return {
                    characterResponse: getCompletionContent(characterCompletion),
                    locationResponse: getCompletionContent(locationCompletion)
                }
            }
        )

        // 解析响应（新格式：new_characters + updated_characters）
        let charactersData: { new_characters?: any[], updated_characters?: any[], characters?: any[] } = {}
        let locationsData: { locations?: any[] } = { locations: [] }

        try {
            charactersData = parseJsonResponse(chunkResult.characterResponse)
            // 兼容旧格式（如果 AI 返回 characters 而不是 new_characters）
            if (!charactersData.new_characters && charactersData.characters) {
                charactersData.new_characters = charactersData.characters
            }
            console.log(`  解析到 ${charactersData.new_characters?.length || 0} 个新角色, ${charactersData.updated_characters?.length || 0} 个需更新`)
        } catch (e: any) {
            console.error(`  角色解析失败: ${e.message}`)
        }

        try {
            locationsData = parseJsonResponse(chunkResult.locationResponse)
            console.log(`  解析到 ${locationsData.locations?.length || 0} 个场景`)
        } catch (e: any) {
            console.error(`  场景解析失败: ${e.message}`)
        }

        // 保存新角色
        for (const char of (charactersData.new_characters || [])) {
            // 检查是否已存在（名称或别名）
            const nameExists = existingCharacterNames.some(
                n => n.toLowerCase() === char.name.toLowerCase()
            )
            const aliasExists = (char.aliases || []).some((alias: string) =>
                existingCharacterNames.some(n => n.toLowerCase() === alias.toLowerCase())
            )

            if (nameExists || aliasExists) {
                console.log(`  跳过已存在角色: ${char.name}`)
                stats.skippedCharacters++
                continue
            }

            try {
                const profileData = {
                    role_level: char.role_level,
                    archetype: char.archetype,
                    personality_tags: char.personality_tags || [],
                    era_period: char.era_period,
                    social_class: char.social_class,
                    occupation: char.occupation,
                    costume_tier: char.costume_tier,
                    suggested_colors: char.suggested_colors || [],
                    primary_identifier: char.primary_identifier,
                    visual_keywords: char.visual_keywords || [],
                    gender: char.gender,
                    age_range: char.age_range
                }

                const newChar = await prisma.novelPromotionCharacter.create({
                    data: {
                        novelPromotionProjectId: novelData.id,
                        name: char.name,
                        aliases: JSON.stringify(char.aliases || []),
                        introduction: char.introduction || '',
                        profileData: JSON.stringify(profileData),
                        profileConfirmed: false
                    }
                })

                // 添加到已存在列表（用于后续切片去重和 AI 参考）
                existingCharacterNames.push(char.name)
                if (char.aliases) {
                    existingCharacterNames.push(...char.aliases)
                }
                existingCharacters.push({
                    id: newChar.id,
                    name: char.name,
                    aliases: char.aliases || [],
                    introduction: char.introduction || ''
                })

                stats.newCharacters++
                console.log(`  ✓ 新增角色: ${char.name}`)
            } catch (dbError: any) {
                console.error(`  ✗ 保存角色失败 "${char.name}": ${dbError.message}`)
            }
        }

        // 更新已有角色的介绍和别名
        for (const update of (charactersData.updated_characters || [])) {
            // 查找已有角色
            const existingChar = existingCharacters.find(
                c => c.name.toLowerCase() === update.name.toLowerCase()
            )

            if (!existingChar) {
                console.log(`  ⚠️ 更新目标角色不存在: ${update.name}`)
                continue
            }

            try {
                const updateData: any = {}

                // 更新介绍
                if (update.updated_introduction) {
                    updateData.introduction = update.updated_introduction
                    existingChar.introduction = update.updated_introduction
                }

                // 合并新别名
                if (update.updated_aliases && update.updated_aliases.length > 0) {
                    const currentAliases = existingChar.aliases || []
                    const newAliases = update.updated_aliases.filter(
                        (a: string) => !currentAliases.some((ca: string) => ca.toLowerCase() === a.toLowerCase())
                    )
                    const mergedAliases = [...currentAliases, ...newAliases]
                    updateData.aliases = JSON.stringify(mergedAliases)
                    existingChar.aliases = mergedAliases
                    // 添加新别名到去重列表
                    existingCharacterNames.push(...newAliases)
                }

                if (Object.keys(updateData).length > 0) {
                    await prisma.novelPromotionCharacter.update({
                        where: { id: existingChar.id },
                        data: updateData
                    })
                    stats.updatedCharacters++
                    console.log(`  ✓ 更新角色: ${update.name}`)
                }
            } catch (dbError: any) {
                console.error(`  ✗ 更新角色失败 "${update.name}": ${dbError.message}`)
            }
        }

        // 保存场景
        for (const loc of (locationsData.locations || [])) {
            // 过滤无效场景
            const invalidKeywords = ['幻想', '抽象', '无明确', '空间锚点', '未说明', '不明确']
            const isInvalid = invalidKeywords.some(keyword =>
                loc.name.includes(keyword) || (loc.summary || '').includes(keyword)
            )
            if (isInvalid) {
                console.log(`  跳过无效场景: ${loc.name}`)
                stats.skippedLocations++
                continue
            }

            // 检查是否已存在
            const nameExists = existingLocationNames.some(
                n => n.toLowerCase() === loc.name.toLowerCase()
            )
            if (nameExists) {
                console.log(`  跳过已存在场景: ${loc.name}`)
                stats.skippedLocations++
                continue
            }

            try {
                const descriptions = loc.descriptions || (loc.description ? [loc.description] : [])
                const cleanDescriptions = descriptions.map((d: string) => removeLocationPromptSuffix(d || ''))

                const location = await prisma.novelPromotionLocation.create({
                    data: {
                        novelPromotionProjectId: novelData.id,
                        name: loc.name,
                        summary: loc.summary || null
                    }
                })

                // 创建 LocationImage 记录
                for (let j = 0; j < cleanDescriptions.length; j++) {
                    await prisma.locationImage.create({
                        data: {
                            locationId: location.id,
                            imageIndex: j,
                            description: cleanDescriptions[j]
                        }
                    })
                }

                // 添加到已存在列表
                existingLocationNames.push(loc.name)
                existingLocationInfo.push(loc.summary ? `${loc.name}(${loc.summary})` : loc.name)

                stats.newLocations++
                console.log(`  ✓ 新增场景: ${loc.name}`)
            } catch (dbError: any) {
                console.error(`  ✗ 保存场景失败 "${loc.name}": ${dbError.message}`)
            }
        }

        stats.processedChunks++
    }

    console.log(`\n=== 全局资产分析完成 ===`)
    console.log(`新增角色: ${stats.newCharacters}, 跳过: ${stats.skippedCharacters}`)
    console.log(`新增场景: ${stats.newLocations}, 跳过: ${stats.skippedLocations}`)

    return NextResponse.json({
        success: true,
        stats: {
            totalChunks: stats.totalChunks,
            newCharacters: stats.newCharacters,
            newLocations: stats.newLocations,
            skippedCharacters: stats.skippedCharacters,
            skippedLocations: stats.skippedLocations,
            totalCharacters: existingCharacterNames.length,
            totalLocations: existingLocationNames.length
        }
    })
})
