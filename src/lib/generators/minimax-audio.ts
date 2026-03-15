import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
/**
 * MiniMax (海螺) 语音生成器
 *
 * 支持模型：
 * speech-2.8-hd, speech-2.8-turbo, speech-2.6-hd, speech-2.6-turbo, speech-02-hd, speech-02-turbo
 *
 * 使用异步 T2A API：提交任务后返回 task_id，通过轮询获取结果
 */

import { BaseAudioGenerator, type AudioGenerateParams, type GenerateResult } from './base'
import { getProviderConfig } from '@/lib/api-config'

const MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1'

const MINIMAX_AUDIO_MODELS = new Set([
    'speech-2.8-hd',
    'speech-2.8-turbo',
    'speech-2.6-hd',
    'speech-2.6-turbo',
    'speech-02-hd',
    'speech-02-turbo',
])

interface MinimaxAudioOptions {
    modelId?: string
    provider?: string
    modelKey?: string
    [key: string]: unknown
}

export class MinimaxAudioGenerator extends BaseAudioGenerator {
    protected async doGenerate(params: AudioGenerateParams): Promise<GenerateResult> {
        const { userId, text, voice, rate } = params
        const options = (params.options ?? {}) as MinimaxAudioOptions
        const modelId = typeof options.modelId === 'string' ? options.modelId : ''

        if (!modelId) {
            throw new Error('MINIMAX_AUDIO_OPTION_REQUIRED: modelId')
        }
        if (!MINIMAX_AUDIO_MODELS.has(modelId)) {
            throw new Error(`MINIMAX_AUDIO_MODEL_UNSUPPORTED: ${modelId}`)
        }
        if (!text || text.trim().length === 0) {
            throw new Error('MINIMAX_AUDIO_TEXT_REQUIRED')
        }

        const { apiKey } = await getProviderConfig(userId, 'minimax')
        const logPrefix = `[MiniMax Audio ${modelId}]`

        const voiceSetting: Record<string, unknown> = {}
        if (voice) {
            voiceSetting.voice_id = voice
        }
        if (typeof rate === 'number') {
            voiceSetting.speed = rate
        }

        const requestBody: Record<string, unknown> = {
            model: modelId,
            text: text,
            voice_setting: voiceSetting,
        }

        _ulogInfo(`${logPrefix} 提交异步语音任务`)

        try {
            const response = await fetch(`${MINIMAX_BASE_URL}/t2a_async_v2`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            })

            if (!response.ok) {
                const errorText = await response.text()
                _ulogError(`${logPrefix} API请求失败:`, response.status, errorText)
                throw new Error(`MiniMax API Error: ${response.status} - ${errorText}`)
            }

            const data = await response.json()

            if (data.base_resp?.status_code !== 0) {
                const errMsg = data.base_resp?.status_msg || '未知错误'
                _ulogError(`${logPrefix} 任务提交失败:`, errMsg)
                throw new Error(`MiniMax: ${errMsg}`)
            }

            const taskId = data.task_id
            if (!taskId) {
                _ulogError(`${logPrefix} 响应中缺少 task_id:`, data)
                throw new Error('MiniMax未返回task_id')
            }

            _ulogInfo(`${logPrefix} 任务已提交，task_id=${taskId}`)

            return {
                success: true,
                async: true,
                requestId: taskId,
                externalId: `MINIMAX:AUDIO:${taskId}`,
            }
        } catch (error: unknown) {
            _ulogError(`${logPrefix} 生成失败:`, error)
            throw error
        }
    }
}
