/**
 * 声音设计 API (Asset Hub 独立版)
 * POST /api/asset-hub/voice-design
 * 
 * 使用阿里云 qwen-voice-design 模型根据文本描述创建自定义声音
 */

import { NextRequest, NextResponse } from 'next/server'
import { logError } from '@/lib/logger'
import { withVoiceDesignBilling } from '@/lib/pricing'
import {
    createVoiceDesign,
    validateVoicePrompt,
    validatePreviewText,
    VoiceDesignInput
} from '@/lib/qwen-voice-design'
import { getQwenApiKey } from '@/lib/api-config'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

export const POST = apiHandler(async (request: NextRequest) => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

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

    // 使用 withVoiceDesignBilling 包装 (Asset Hub 使用 'asset-hub' 作为标识)
    const result = await withVoiceDesignBilling(
        session.user.id,
        { projectId: 'asset-hub', action: 'voice_design' },
        async () => {
            const input: VoiceDesignInput = {
                voicePrompt,
                previewText,
                preferredName: preferredName || 'custom_voice',
                language: language || 'zh'
            }

            console.log('[AssetHub VoiceDesign] 开始创建声音设计:', {
                voicePrompt: voicePrompt.substring(0, 50) + '...',
                previewText: previewText.substring(0, 30) + '...',
                preferredName: input.preferredName
            })

            const qwenApiKey = await getQwenApiKey(session.user.id)
            const voiceResult = await createVoiceDesign(input, qwenApiKey)

            if (!voiceResult.success) {
                console.error('[AssetHub VoiceDesign] 声音设计创建失败:', {
                    error: voiceResult.error,
                    errorCode: voiceResult.errorCode,
                    requestId: voiceResult.requestId
                })
                throw new Error(voiceResult.error || '声音设计失败')
            }

            console.log('[AssetHub VoiceDesign] 声音设计创建成功:', {
                voiceId: voiceResult.voiceId,
                targetModel: voiceResult.targetModel,
                requestId: voiceResult.requestId
            })

            return {
                success: true,
                voiceId: voiceResult.voiceId,
                targetModel: voiceResult.targetModel,
                audioBase64: voiceResult.audioBase64,
                requestId: voiceResult.requestId
            }
        }
    )

    return NextResponse.json(result)
})
