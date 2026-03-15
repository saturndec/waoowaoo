import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
/**
 * MiniMax (海螺) 图像生成器
 *
 * 支持模型：image-01, image-01-live
 *
 * 使用同步 API：直接返回 base64 图像数据
 */

import { BaseImageGenerator, type ImageGenerateParams, type GenerateResult } from './base'
import { getProviderConfig } from '@/lib/api-config'

const MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1'

const MINIMAX_IMAGE_MODELS = new Set([
    'image-01',
    'image-01-live',
])

interface MinimaxImageOptions {
    modelId?: string
    provider?: string
    modelKey?: string
    aspectRatio?: string
    [key: string]: unknown
}

export class MinimaxImageGenerator extends BaseImageGenerator {
    protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
        const { userId, prompt } = params
        const options = (params.options ?? {}) as MinimaxImageOptions
        const modelId = typeof options.modelId === 'string' ? options.modelId : 'image-01'

        if (!MINIMAX_IMAGE_MODELS.has(modelId)) {
            throw new Error(`MINIMAX_IMAGE_MODEL_UNSUPPORTED: ${modelId}`)
        }
        if (!prompt || prompt.trim().length === 0) {
            throw new Error('MINIMAX_IMAGE_PROMPT_REQUIRED')
        }

        const { apiKey } = await getProviderConfig(userId, 'minimax')
        const logPrefix = `[MiniMax Image ${modelId}]`

        const requestBody: Record<string, unknown> = {
            model: modelId,
            prompt: prompt,
            response_format: 'url',
        }
        if (options.aspectRatio) {
            requestBody.aspect_ratio = options.aspectRatio
        }

        _ulogInfo(`${logPrefix} 提交图像生成请求`)

        try {
            const response = await fetch(`${MINIMAX_BASE_URL}/image_generation`, {
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
                _ulogError(`${logPrefix} 图像生成失败:`, errMsg)
                throw new Error(`MiniMax: ${errMsg}`)
            }

            const imageUrl = data.data?.image_urls?.[0]
            const imageBase64 = data.data?.image_base64?.[0]

            if (!imageUrl && !imageBase64) {
                _ulogError(`${logPrefix} 响应中缺少图像数据:`, data)
                throw new Error('MiniMax未返回图像数据')
            }

            _ulogInfo(`${logPrefix} 图像生成成功`)

            return {
                success: true,
                imageUrl: imageUrl,
                imageBase64: imageBase64,
            }
        } catch (error: unknown) {
            _ulogError(`${logPrefix} 生成失败:`, error)
            throw error
        }
    }
}
