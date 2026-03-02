import { logInfo as _ulogInfo } from '@/lib/logging/core'
/**
 * 阿里云 qwen-voice-design 声音设计 API 集成
 * 
 * 使用方式：
 * 1. 调用 createVoiceDesign() 创建自定义声音
 * 2. 获取返回的 voice ID，可用于后续的 TTS 调用
 */

export interface VoiceDesignInput {
    /** 声音提示词，描述想要的声音特征 */
    voicePrompt: string
    /** 预览文本，用于生成预览音频 */
    previewText: string
    /** 目标 TTS 模型，必须与后续合成保持一致 */
    targetModel: string
    /** 可选的声音名称 */
    preferredName?: string
    /** 语言，默认 zh */
    language?: 'zh' | 'en'
}

export interface VoiceDesignResult {
    success: boolean
    /** 生成的声音 ID，可用于后续 TTS 调用 */
    voiceId?: string
    /** 目标模型 */
    targetModel?: string
    /** 预览音频 base64 */
    audioBase64?: string
    /** 音频采样率 */
    sampleRate?: number
    /** 音频格式 */
    responseFormat?: string
    /** 调用次数 */
    usageCount?: number
    /** 请求 ID */
    requestId?: string
    /** 错误信息 */
    error?: string
    /** 错误代码 */
    errorCode?: string
}

/**
 * 调用阿里云 qwen-voice-design API 创建自定义声音
 * @param input 声音设计输入
 * @param apiKey 阿里百炼 API Key
 */
export async function createVoiceDesign(input: VoiceDesignInput, apiKey: string): Promise<VoiceDesignResult> {
    if (!apiKey) {
        return {
            success: false,
            error: '请配置阿里百炼 API Key'
        }
    }
    if (!input.targetModel || !input.targetModel.trim()) {
        return {
            success: false,
            error: '缺少目标语音模型（targetModel）'
        }
    }
    const targetModel = input.targetModel.trim()

    const requestBody = {
        model: 'qwen-voice-design',
        input: {
            action: 'create',
            target_model: targetModel,
            voice_prompt: input.voicePrompt,
            preview_text: input.previewText,
            preferred_name: input.preferredName || 'custom_voice',
            language: input.language || 'zh'
        },
        parameters: {
            sample_rate: 24000,
            response_format: 'wav'
        }
    }

    // 添加调试日志
    _ulogInfo('[VoiceDesign] 请求体:', JSON.stringify(requestBody, null, 2))

    try {
        const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        })

        const data = await response.json()

        if (response.ok && data.output) {
            return {
                success: true,
                voiceId: data.output.voice,
                targetModel: data.output.target_model,
                // 音频数据在 output.preview_audio.data 中
                audioBase64: data.output.preview_audio?.data,
                sampleRate: data.output.preview_audio?.sample_rate,
                responseFormat: data.output.preview_audio?.response_format,
                usageCount: data.usage?.count,
                requestId: data.request_id
            }
        } else {
            return {
                success: false,
                error: data.message || '声音设计 API 调用失败',
                errorCode: data.code,
                requestId: data.request_id
            }
        }

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '网络请求失败'
        return {
            success: false,
            error: message || '网络请求失败'
        }
    }
}

/**
 * 验证声音提示词是否有效
 */
export function validateVoicePrompt(voicePrompt: string): { valid: boolean; error?: string } {
    if (!voicePrompt || voicePrompt.trim().length === 0) {
        return { valid: false, error: '声音提示词不能为空' }
    }

    if (voicePrompt.length > 500) {
        return { valid: false, error: '声音提示词不能超过500个字符' }
    }

    return { valid: true }
}

/**
 * 验证预览文本是否有效
 */
export function validatePreviewText(previewText: string): { valid: boolean; error?: string } {
    if (!previewText || previewText.trim().length === 0) {
        return { valid: false, error: '预览文本不能为空' }
    }

    if (previewText.length < 5) {
        return { valid: false, error: '预览文本至少需要5个字符' }
    }

    if (previewText.length > 200) {
        return { valid: false, error: '预览文本不能超过200个字符' }
    }

    return { valid: true }
}
