/**
 * FAL 图片生成器
 * 
 * 支持：
 * - Banana Pro (2K/4K)
 */

import { BaseImageGenerator, ImageGenerateParams, GenerateResult } from '../base'
import { getFalApiKey } from '@/lib/api-config'
import { imageUrlToBase64 } from '@/lib/cos'

export class FalBananaGenerator extends BaseImageGenerator {
    protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
        const { userId, prompt, referenceImages = [], options = {} } = params

        // 获取 API Key
        const apiKey = await getFalApiKey(userId)

        const {
            aspectRatio = '4:3',
            resolution = '4K',
            outputFormat = 'png'
        } = options

        // 根据是否有参考图片选择端点
        const hasReferenceImages = referenceImages.length > 0
        const endpoint = hasReferenceImages
            ? 'fal-ai/nano-banana-pro/edit'
            : 'fal-ai/nano-banana-pro'

        const body: any = {
            prompt,
            num_images: 1,
            aspect_ratio: aspectRatio,
            resolution,
            output_format: outputFormat
        }

        // 🔥 转换参考图片为Data URL（适配内网环境）
        if (hasReferenceImages) {
            const dataUrls = await Promise.all(
                referenceImages.map(async (url: string) => {
                    // 如果已经是data URL，直接返回
                    if (url.startsWith('data:')) return url
                    // 否则转换为Data URL
                    return await imageUrlToBase64(url)
                })
            )
            body.image_urls = dataUrls
            console.log(`[FAL Image] 已转换 ${referenceImages.length} 张参考图片为 Data URL`)
        }

        // 提交异步任务
        const submitResponse = await fetch(`https://queue.fal.run/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Key ${apiKey}`
            },
            body: JSON.stringify(body),
            cache: 'no-store'
        })

        if (!submitResponse.ok) {
            const errorText = await submitResponse.text()
            throw new Error(`FAL 提交失败 (${submitResponse.status}): ${errorText}`)
        }

        const submitData = await submitResponse.json()
        const requestId = submitData.request_id

        if (!requestId) {
            throw new Error('FAL 未返回 request_id')
        }

        // 返回异步任务标识
        return {
            success: true,
            async: true,
            requestId,
            endpoint
        }
    }
}
