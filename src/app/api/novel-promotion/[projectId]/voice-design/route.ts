/**
 * 声音设计 API
 * POST /api/novel-promotion/[projectId]/voice-design
 * 
 * 使用阿里云 qwen-voice-design 模型根据文本描述创建自定义声音
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logError } from '@/lib/logger'
import { withVoiceDesignBilling, handleBillingError } from '@/lib/pricing'
import {
    createVoiceDesign,
    validateVoicePrompt,
    validatePreviewText,
    VoiceDesignInput
} from '@/lib/qwen-voice-design'
import { getQwenApiKey } from '@/lib/api-config'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

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
    const { voicePrompt, previewText, preferredName, language } = body

    // 验证输入
    const promptValidation = validateVoicePrompt(voicePrompt)
    if (!promptValidation.valid) {
        throw new ApiError('INVALID_PARAMS', { message: promptValidation.error })
    }

    const textValidation = validatePreviewText(previewText)
    if (!textValidation.valid) {
        throw new ApiError('INVALID_PARAMS', { message: textValidation.error })
    }

    // 使用 withVoiceDesignBilling 包装 - 由于 billing 函数有特殊处理，保留内部 try-catch
    try {
        const result = await withVoiceDesignBilling(
            session.user.id,
            { projectId, action: 'voice_design' },
            async () => {
                const input: VoiceDesignInput = {
                    voicePrompt,
                    previewText,
                    preferredName: preferredName || 'custom_voice',
                    language: language || 'zh'
                }

                console.log('[VoiceDesign] 开始创建声音设计:', {
                    projectId,
                    voicePrompt: voicePrompt.substring(0, 50) + '...',
                    previewText: previewText.substring(0, 30) + '...',
                    preferredName: input.preferredName
                })

                const qwenApiKey = await getQwenApiKey(session.user.id)
                const result = await createVoiceDesign(input, qwenApiKey)

                if (!result.success) {
                    console.error('[VoiceDesign] 声音设计创建失败:', {
                        error: result.error,
                        errorCode: result.errorCode,
                        requestId: result.requestId
                    })
                    throw new Error(result.error || '声音设计失败')
                }

                console.log('[VoiceDesign] 声音设计创建成功:', {
                    voiceId: result.voiceId,
                    targetModel: result.targetModel,
                    requestId: result.requestId
                })

                return {
                    success: true,
                    voiceId: result.voiceId,
                    targetModel: result.targetModel,
                    audioBase64: result.audioBase64,
                    requestId: result.requestId
                }
            }
        )

        return NextResponse.json(result)
    } catch (error: any) {
        // 处理 billing 错误（余额不足等）
        const billingError = handleBillingError(error)
        if (billingError) return billingError
        throw error  // 重新抛出让 apiHandler 处理
    }
})
