/**
 * POST /api/novel-promotion/[projectId]/analyze-shot-variants
 * 
 * AI 分析镜头变体推荐
 * 发送当前镜头图片给分析模型，返回 5-8 个多样化的变体建议
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { chatCompletionWithVision, getCompletionContent } from '@/lib/llm-client'
import { recordText } from '@/lib/pricing'
import { logAIAnalysis } from '@/lib/logger'
import { getSignedUrl } from '@/lib/cos'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import fs from 'fs'
import path from 'path'

// 解析 JSON 数组响应
function parseJsonArrayResponse(responseText: string): any[] {
    let jsonText = responseText.trim()
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')

    const firstBracket = jsonText.indexOf('[')
    const lastBracket = jsonText.lastIndexOf(']')

    if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
        throw new Error('JSON格式错误：未找到有效的JSON数组')
    }

    jsonText = jsonText.substring(firstBracket, lastBracket + 1)
    return JSON.parse(jsonText)
}

export interface ShotVariantSuggestion {
    id: number
    title: string
    description: string
    shot_type: string
    camera_move: string
    video_prompt: string
    creative_score: number
}

export const POST = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult
    const session = authResult.session

    const body = await request.json()
    const { panelId } = body

    if (!panelId) {
        throw new ApiError('INVALID_PARAMS', { message: 'Missing panelId' })
    }

    // 获取项目数据
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
            novelPromotionData: {
                include: {
                    characters: { include: { appearances: true } }
                }
            }
        }
    })

    if (!project) {
        throw new ApiError('NOT_FOUND', { message: 'Project not found' })
    }

    if (project.userId !== session.user.id) {
        throw new ApiError('FORBIDDEN')
    }

    const novelPromotionData = project.novelPromotionData
    if (!novelPromotionData) {
        throw new ApiError('NOT_FOUND', { message: 'Project data not found' })
    }

    // 获取 panel 信息
    const panel = await prisma.novelPromotionPanel.findUnique({
        where: { id: panelId }
    })

    if (!panel) {
        throw new ApiError('NOT_FOUND', { message: 'Panel not found' })
    }

    // 检查是否有图片
    if (!panel.imageUrl) {
        throw new ApiError('INVALID_PARAMS', { message: '该镜头还没有生成图片，无法分析变体' })
    }

    // 获取图片 URL
    const imageUrl = panel.imageUrl.startsWith('images/')
        ? getSignedUrl(panel.imageUrl, 3600)
        : panel.imageUrl

    // 解析角色信息
    let charactersInfo = '无'
    if (panel.characters) {
        try {
            const chars = JSON.parse(panel.characters)
            if (Array.isArray(chars) && chars.length > 0) {
                charactersInfo = chars.map((c: any) => {
                    const name = typeof c === 'string' ? c : c.name
                    const appearance = typeof c === 'string' ? null : c.appearance
                    return appearance ? `${name}（${appearance}）` : name
                }).join('、')
            }
        } catch { }
    }

    // 读取提示词模板
    const promptPath = path.join(process.cwd(), 'lib', 'prompts', 'novel-promotion', 'agent_shot_variant_analysis.txt')
    const promptTemplate = fs.readFileSync(promptPath, 'utf-8')

    // 构建提示词
    const prompt = promptTemplate
        .replace('{panel_description}', panel.description || '无')
        .replace('{shot_type}', panel.shotType || '中景')
        .replace('{camera_move}', panel.cameraMove || '固定')
        .replace('{location}', panel.location || '未知')
        .replace('{characters_info}', charactersInfo)

    // 记录请求日志
    logAIAnalysis(session.user.id, session.user.name || 'unknown', projectId, project.name, {
        action: 'ANALYZE_SHOT_VARIANTS',
        input: {
            panelId,
            镜头序号: panel.panelNumber,
            描述: panel.description,
            景别: panel.shotType,
            运镜: panel.cameraMove,
            场景: panel.location,
            角色: charactersInfo
        },
        model: novelPromotionData.analysisModel
    })

    // 调用 AI 分析（支持图片）
    const completion = await chatCompletionWithVision(
        session.user.id,
        novelPromotionData.analysisModel,
        prompt,
        [imageUrl],
        { reasoning: true }
    )

    // 记录用量
    const usage = (completion as any).usage
    if (usage) {
        await recordText({
            projectId,
            userId: session.user.id,
            model: novelPromotionData.analysisModel,
            action: 'ANALYZE_SHOT_VARIANTS',
            inputTokens: usage.prompt_tokens || 0,
            outputTokens: usage.completion_tokens || 0,
            metadata: { panelId }
        })
    }

    // 解析响应
    const responseText = getCompletionContent(completion)
    if (!responseText) {
        throw new ApiError('AI_ERROR', { message: 'AI 无响应' })
    }

    const suggestions: ShotVariantSuggestion[] = parseJsonArrayResponse(responseText)

    // 验证结果
    if (!Array.isArray(suggestions) || suggestions.length < 3) {
        throw new ApiError('AI_ERROR', { message: '生成的变体数量不足' })
    }

    // 记录输出日志
    logAIAnalysis(session.user.id, session.user.name || 'unknown', projectId, project.name, {
        action: 'ANALYZE_SHOT_VARIANTS_OUTPUT',
        output: {
            panelId,
            推荐数量: suggestions.length,
            推荐列表: suggestions.map(s => s.title)
        },
        model: novelPromotionData.analysisModel
    })

    return NextResponse.json({
        success: true,
        suggestions,
        panelInfo: {
            panelNumber: panel.panelNumber,
            imageUrl: imageUrl,
            description: panel.description
        }
    })
})
