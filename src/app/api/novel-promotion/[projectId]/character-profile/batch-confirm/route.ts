import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import { handleBillingError, withTextBilling } from '@/lib/pricing'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import fs from 'fs'
import path from 'path'

/**
 * 批量确认所有未确认的角色档案并生成视觉描述
 * POST /api/novel-promotion/[projectId]/character-profile/batch-confirm
 */
export const POST = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    // 由于有 billing 错误处理，保留内部 try-catch
    try {
        // 🔐 统一权限验证
        const authResult = await requireProjectAuth(projectId)
        if (isErrorResponse(authResult)) return authResult
        const session = authResult.session
        const project = authResult.project
        const novelPromotionData = authResult.novelData

        // 获取所有未确认的角色
        const unconfirmedCharacters = await prisma.novelPromotionCharacter.findMany({
            where: {
                novelPromotionProjectId: project.novelPromotionData.id,
                profileConfirmed: false,
                profileData: { not: null }
            }
        })

        if (unconfirmedCharacters.length === 0) {
            return NextResponse.json({ success: true, count: 0, message: '没有待确认的角色' })
        }

        console.log(`=== Batch confirming ${unconfirmedCharacters.length} characters ===`)

        // 使用 withTextBilling 包装批量生成
        const result = await withTextBilling(
            session.user.id,
            project.novelPromotionData.analysisModel,
            3000 * unconfirmedCharacters.length,  // 预估输入tokens
            2000 * unconfirmedCharacters.length,  // 预估输出tokens
            { projectId, action: 'batch_generate_visual', count: unconfirmedCharacters.length },
            async () => {
                const promptPath = path.join(process.cwd(), 'lib', 'prompts', 'novel-promotion', 'agent_character_visual.txt')
                let promptTemplate = fs.readFileSync(promptPath, 'utf-8')

                // 准备所有角色的档案数据
                const characterProfiles = unconfirmedCharacters.map(char => ({
                    name: char.name,
                    ...JSON.parse(char.profileData!)
                }))

                promptTemplate = promptTemplate.replace('{character_profiles}', JSON.stringify(characterProfiles, null, 2))

                // 调用AI批量生成
                const completion = await chatCompletion(
                    session.user.id,  // 🔥 修复：添加缺失的 userId 参数
                    project.novelPromotionData!.analysisModel,
                    [{ role: 'user', content: promptTemplate }],
                    { temperature: 0.7, skipBilling: true }  // 费用通过 withTextBilling 处理
                )

                const responseText = getCompletionContent(completion)

                // 解析JSON
                let cleanedText = responseText.trim()
                cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')
                const firstBrace = cleanedText.indexOf('{')
                const lastBrace = cleanedText.lastIndexOf('}')
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    cleanedText = cleanedText.substring(firstBrace, lastBrace + 1)
                }

                const visualData = JSON.parse(cleanedText)

                if (!visualData.characters || !Array.isArray(visualData.characters)) {
                    throw new Error('AI返回格式错误')
                }

                // 保存所有角色的外貌描述
                let successCount = 0
                for (const charVisual of visualData.characters) {
                    const character = unconfirmedCharacters.find(c => c.name === charVisual.name)
                    if (!character) {
                        console.warn(`Character ${charVisual.name} not found in unconfirmed list`)
                        continue
                    }

                    const appearances = charVisual.appearances || []
                    for (const app of appearances) {
                        const descriptions = app.descriptions || []
                        await prisma.characterAppearance.create({
                            data: {
                                characterId: character.id,
                                appearanceIndex: app.id || 1,
                                changeReason: app.change_reason || '初始形象',
                                description: descriptions[0] || '',
                                descriptions: JSON.stringify(descriptions)
                            }
                        })
                    }

                    // 标记已确认
                    await prisma.novelPromotionCharacter.update({
                        where: { id: character.id },
                        data: { profileConfirmed: true }
                    })

                    console.log(`✓ ${character.name}: ${appearances.length} appearances`)
                    successCount++
                }

                return {
                    success: true,
                    count: successCount
                }
            }
        )

        return NextResponse.json(result)

    } catch (error: any) {
        console.error('=== BATCH CONFIRM ERROR ===', error.message)
        const billingError = handleBillingError(error)
        if (billingError) return billingError
        throw error  // 重新抛出让 apiHandler 处理
    }
})
