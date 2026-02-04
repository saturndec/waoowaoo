import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import { logAIAnalysis } from '@/lib/logger'
import { handleBillingError } from '@/lib/pricing'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { buildCharactersIntroduction } from '@/lib/constants'
import fs from 'fs'
import path from 'path'

function escapeControlCharsInJsonStrings(input: string): string {
    let out = ''
    let inString = false
    let escaped = false

    for (let i = 0; i < input.length; i++) {
        const ch = input[i]

        if (!inString) {
            if (ch === '"') {
                inString = true
            }
            out += ch
            continue
        }

        if (escaped) {
            out += ch
            escaped = false
            continue
        }

        if (ch === '\\') {
            out += ch
            escaped = true
            continue
        }

        if (ch === '"') {
            inString = false
            out += ch
            continue
        }

        if (ch === '\n') {
            out += '\\n'
            continue
        }
        if (ch === '\r') {
            out += '\\r'
            continue
        }
        if (ch === '\t') {
            out += '\\t'
            continue
        }

        const code = ch.charCodeAt(0)
        if (code >= 0 && code < 0x20) {
            out += `\\u${code.toString(16).padStart(4, '0')}`
            continue
        }

        out += ch
    }

    return out
}

/**
 * POST /api/novel-promotion/[projectId]/screenplay-conversion
 * 将clips的原文内容转换为结构化剧本格式
 * 在"开始创作"流程中调用，早于分镜生成
 */
export const POST = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuth(projectId)
    if (isErrorResponse(authResult)) return authResult
    const session = authResult.session
    const project = authResult.project
    const novelPromotionData = authResult.novelData

    const body = await request.json()
    const { episodeId } = body

    if (!episodeId) {
        throw new ApiError('INVALID_PARAMS', { message: '缺少 episodeId 参数' })
    }

    // 获取项目的角色和场景数据
    const fullData = await prisma.novelPromotionProject.findUnique({
        where: { projectId },
        include: {
            characters: true,
            locations: true
        }
    })

    // 获取剧集的所有clips
    const episode = await prisma.novelPromotionEpisode.findUnique({
        where: { id: episodeId },
        include: {
            clips: { orderBy: { createdAt: 'asc' } }
        }
    })

    if (!episode || episode.clips.length === 0) {
        throw new ApiError('INVALID_PARAMS', { message: '没有找到clips，请先进行片段切分' })
    }

    // 💰 计费已在 screenplay-conversion 的调用方处理

    // 读取剧本转换提示词模板
    const screenplayPromptPath = path.join(process.cwd(), 'lib', 'prompts', 'novel-promotion', 'screenplay_conversion.txt')
    const screenplayPromptTemplate = fs.readFileSync(screenplayPromptPath, 'utf-8')

    // 获取资产名称和介绍
    const charactersLibName = fullData?.characters?.map((c: any) => c.name).join('、') || '无'
    const locationsLibName = fullData?.locations?.map((l: any) => l.name).join('、') || '无'
    const charactersIntroduction = buildCharactersIntroduction(fullData?.characters || [])

    console.log(`[剧本转换] 开始处理 ${episode.clips.length} 个clips`)

    // 记录开始日志
    logAIAnalysis(session.user.id, session.user.name || 'Unknown', projectId, project.name, {
        action: 'SCREENPLAY_CONVERSION_START',
        input: {
            episodeId,
            episodeName: episode.name,
            clipCount: episode.clips.length
        },
        model: novelPromotionData.analysisModel
    })

    // 并行处理所有clips
    const results = await Promise.all(episode.clips.map(async (clip: any) => {
        const clipId = clip.startText
            ? `${clip.startText.substring(0, 10)}...~...${clip.endText?.substring(0, 10) || ''}`
            : clip.id

        try {
            console.log(`[剧本转换] Clip ${clipId}: 开始转换...`)

            // 构建提示词
            let screenplayPrompt = screenplayPromptTemplate
                .replace('{clip_content}', clip.content || '')
                .replace('{locations_lib_name}', locationsLibName)
                .replace('{characters_lib_name}', charactersLibName)
                .replace('{characters_introduction}', charactersIntroduction)
                .replace('{clip_id}', clip.id)

            // 调用AI
            const screenplayCompletion = await chatCompletion(
                session.user.id,
                novelPromotionData.analysisModel,
                [{ role: 'user', content: screenplayPrompt }],
                { reasoning: true, projectId, action: 'screenplay_conversion' }
            )

            const screenplayResponseText = getCompletionContent(screenplayCompletion)
            let screenplay: any = null

            if (screenplayResponseText) {
                let screenplayJsonText = screenplayResponseText.trim()

                // 移除 markdown 代码块标记（支持多种格式）
                screenplayJsonText = screenplayJsonText
                    .replace(/^```json\s*/i, '')
                    .replace(/^```\s*/, '')
                    .replace(/\s*```$/g, '')
                    .replace(/```json\s*/gi, '')  // 移除中间的 ```json
                    .replace(/```\s*/g, '')       // 移除所有剩余的 ```

                const firstBrace = screenplayJsonText.indexOf('{')
                const lastBrace = screenplayJsonText.lastIndexOf('}')

                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    screenplayJsonText = screenplayJsonText.substring(firstBrace, lastBrace + 1)

                    try {
                        screenplay = JSON.parse(screenplayJsonText)
                        // 覆盖关键字段，避免占位符或缺失
                        screenplay.clip_id = clip.id
                        screenplay.original_text = clip.content || ''

                        console.log(`[剧本转换] Clip ${clipId}: 成功，共 ${screenplay.scenes?.length || 0} 个场景`)

                        // 保存到数据库
                        await prisma.novelPromotionClip.update({
                            where: { id: clip.id },
                            data: { screenplay: JSON.stringify(screenplay) }
                        })

                        // 费用已在调用方统一处理

                        // 记录成功日志
                        logAIAnalysis(session.user.id, session.user.name || 'Unknown', projectId, project.name, {
                            action: 'SCREENPLAY_CONVERSION' as any,
                            output: {
                                clipId: clip.id,
                                片段标识: clipId,
                                场景数量: screenplay.scenes?.length || 0,
                                剧本结果: screenplay
                            },
                            model: novelPromotionData.analysisModel
                        })

                        return { clipId: clip.id, success: true, sceneCount: screenplay.scenes?.length || 0 }
                    } catch (parseError: any) {
                        // 尝试修复：将字符串内控制字符转义为合法JSON
                        const repairedJsonText = escapeControlCharsInJsonStrings(screenplayJsonText)
                        try {
                            screenplay = JSON.parse(repairedJsonText)

                            // 覆盖关键字段，避免占位符或缺失
                            screenplay.clip_id = clip.id
                            screenplay.original_text = clip.content || ''

                            console.log(`[剧本转换] Clip ${clipId}: JSON修复成功，共 ${screenplay.scenes?.length || 0} 个场景`)

                            await prisma.novelPromotionClip.update({
                                where: { id: clip.id },
                                data: { screenplay: JSON.stringify(screenplay) }
                            })

                            logAIAnalysis(session.user.id, session.user.name || 'Unknown', projectId, project.name, {
                                action: 'SCREENPLAY_CONVERSION' as any,
                                output: {
                                    clipId: clip.id,
                                    片段标识: clipId,
                                    场景数量: screenplay.scenes?.length || 0,
                                    JSON修复: true,
                                    剧本结果: screenplay
                                },
                                model: novelPromotionData.analysisModel
                            })

                            return { clipId: clip.id, success: true, sceneCount: screenplay.scenes?.length || 0 }
                        } catch (repairError: any) {
                            // JSON 解析失败，打印详细调试信息
                            console.warn(`[剧本转换] Clip ${clipId}: JSON解析失败: ${parseError.message}`)
                            console.warn(`[剧本转换] 原始响应长度: ${screenplayResponseText.length}`)
                            console.warn(`[剧本转换] 提取的JSON长度: ${screenplayJsonText.length}`)
                            console.warn(`[剧本转换] JSON前100字符: ${screenplayJsonText.substring(0, 100)}`)
                            console.warn(`[剧本转换] JSON后100字符: ${screenplayJsonText.substring(screenplayJsonText.length - 100)}`)
                            // 记录失败日志
                            logAIAnalysis(session.user.id, session.user.name || 'Unknown', projectId, project.name, {
                                action: 'SCREENPLAY_CONVERSION' as any,
                                output: {
                                    clipId: clip.id,
                                    片段标识: clipId,
                                    失败原因: 'JSON解析失败',
                                    错误信息: repairError.message,
                                    响应长度: screenplayResponseText.length
                                },
                                model: novelPromotionData.analysisModel
                            })
                            return { clipId: clip.id, success: false, error: repairError.message }
                        }
                    }
                }
            }

            // 记录格式错误日志
            logAIAnalysis(session.user.id, session.user.name || 'Unknown', projectId, project.name, {
                action: 'SCREENPLAY_CONVERSION' as any,
                output: {
                    clipId: clip.id,
                    片段标识: clipId,
                    失败原因: 'AI返回格式错误',
                    响应内容: screenplayResponseText?.substring(0, 500) || 'empty'
                },
                model: novelPromotionData.analysisModel
            })
            return { clipId: clip.id, success: false, error: 'AI返回格式错误' }
        } catch (error: any) {
            console.error(`[剧本转换] Clip ${clipId}: 失败:`, error.message)
            // 记录异常日志
            logAIAnalysis(session.user.id, session.user.name || 'Unknown', projectId, project.name, {
                action: 'SCREENPLAY_CONVERSION' as any,
                output: {
                    clipId: clip.id,
                    片段标识: clipId,
                    失败原因: '转换异常',
                    错误信息: error.message
                },
                model: novelPromotionData.analysisModel
            })
            return { clipId: clip.id, success: false, error: error.message }
        }
    }))

    // 统计结果
    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length
    const totalScenes = results.reduce((sum, r) => sum + (r.sceneCount || 0), 0)

    console.log(`[剧本转换] 完成: ${successCount}/${episode.clips.length} 成功, 共 ${totalScenes} 个场景`)

    return NextResponse.json({
        success: true,
        message: `剧本转换完成: ${successCount}/${episode.clips.length} 成功`,
        results,
        summary: {
            total: episode.clips.length,
            success: successCount,
            failed: failCount,
            totalScenes
        }
    })
})
