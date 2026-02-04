import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import { handleBillingError, withTextBilling } from '@/lib/pricing'
import { validateProfileData, stringifyProfileData } from '@/types/character-profile'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import fs from 'fs'
import path from 'path'

/**
 * 确认角色档案并生成视觉描述
 * POST /api/novel-promotion/[projectId]/character-profile/confirm
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

        const { characterId, profileData, generateImage } = await request.json()

        if (!characterId) {
            throw new ApiError('INVALID_PARAMS', { message: '缺少characterId' })
        }

        // 获取角色
        const character = await prisma.novelPromotionCharacter.findUnique({
            where: { id: characterId }
        })

        if (!character) {
            throw new ApiError('NOT_FOUND', { message: 'Character not found' })
        }

        // 如果用户提供了新的profileData,先更新
        let finalProfileData = character.profileData
        if (profileData) {
            if (!validateProfileData(profileData)) {
                throw new ApiError('INVALID_PARAMS', { message: '档案数据格式错误' })
            }
            finalProfileData = stringifyProfileData(profileData)
            await prisma.novelPromotionCharacter.update({
                where: { id: characterId },
                data: { profileData: finalProfileData }
            })
        }

        if (!finalProfileData) {
            throw new ApiError('INVALID_PARAMS', { message: '角色缺少档案数据' })
        }

        const parsedProfile = JSON.parse(finalProfileData)

        // 使用 withTextBilling 包装
        const result = await withTextBilling(
            session.user.id,
            project.novelPromotionData.analysisModel,
            3000,  // 预估输入tokens
            2000,  // 预估输出tokens
            { projectId, characterId, action: 'generate_character_visual' },
            async () => {
                // 读取视觉生成prompt
                const promptPath = path.join(process.cwd(), 'lib', 'prompts', 'novel-promotion', 'agent_character_visual.txt')
                let promptTemplate = fs.readFileSync(promptPath, 'utf-8')

                // 替换占位符
                const characterProfiles = JSON.stringify([{
                    name: character.name,
                    ...parsedProfile
                }], null, 2)

                promptTemplate = promptTemplate.replace('{character_profiles}', characterProfiles)

                // 调用AI生成视觉描述
                const completion = await chatCompletion(
                    session.user.id,
                    project.novelPromotionData.analysisModel,
                    [{ role: 'user', content: promptTemplate }],
                    { temperature: 0.7, skipBilling: true }  // 费用通过 withTextBilling 处理
                )

                const responseText = getCompletionContent(completion)

                // 解析JSON响应
                let cleanedText = responseText.trim()
                cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')
                const firstBrace = cleanedText.indexOf('{')
                const lastBrace = cleanedText.lastIndexOf('}')
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    cleanedText = cleanedText.substring(firstBrace, lastBrace + 1)
                }

                const visualData = JSON.parse(cleanedText)

                if (!visualData.characters?.[0]?.appearances?.[0]) {
                    throw new Error('AI返回格式错误:缺少appearances')
                }

                const appearances = visualData.characters[0].appearances

                // 保存外貌描述到数据库
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

                // 标记档案已确认
                await prisma.novelPromotionCharacter.update({
                    where: { id: characterId },
                    data: { profileConfirmed: true }
                })

                console.log(`✓ Generated visual descriptions for ${character.name}: ${appearances.length} appearances`)

                return {
                    success: true,
                    character: {
                        ...character,
                        profileConfirmed: true,
                        appearances
                    }
                }
            }
        )

        return NextResponse.json(result)

    } catch (error: any) {
        console.error('=== CHARACTER PROFILE CONFIRM ERROR ===', error.message)
        const billingError = handleBillingError(error)
        if (billingError) return billingError
        throw error  // 重新抛出让 apiHandler 处理
    }
})
