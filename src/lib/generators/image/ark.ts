/**
 * 火山引擎 ARK 图片生成器
 * 
 * 支持：
 * - Seedream 4.5
 * - Seedream 4.0
 * 
 * 注意：Seedream 不支持 aspect_ratio 参数，必须用 size: "宽x高" 格式
 */

import { BaseImageGenerator, ImageGenerateParams, GenerateResult } from '../base'
import { getArkApiKey } from '@/lib/api-config'
import { arkImageGeneration } from '@/lib/ark-api'
import { imageUrlToBase64 } from '@/lib/cos'

// 4K 分辨率映射表（火山引擎 Seedream 只支持 4K）
const SIZE_MAP_4K: Record<string, string> = {
    '1:1': '4096x4096',
    '16:9': '5456x3072',
    '9:16': '3072x5456',
    '4:3': '4728x3544',
    '3:4': '3544x4728',
    '3:2': '5016x3344',
    '2:3': '3344x5016',
    '21:9': '6256x2680',
    '9:21': '2680x6256',
}

export class ArkSeedreamGenerator extends BaseImageGenerator {
    protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
        const { userId, prompt, referenceImages = [], options = {} } = params

        const apiKey = await getArkApiKey(userId)
        const {
            aspectRatio = '16:9',
            modelId = 'doubao-seedream-4-5-251128',
            size: directSize  // 直接传入的像素尺寸（如 "5016x3344"）
        } = options as any

        // 决定最终 size
        let size: string | undefined
        if (directSize) {
            size = directSize
        } else {
            size = SIZE_MAP_4K[aspectRatio] || SIZE_MAP_4K['16:9']
        }

        console.log(`[ARK Seedream] ========== 请求详情 ==========`)
        if (directSize) {
            console.log(`[ARK Seedream] 编辑模式: 使用传入尺寸 size=${directSize}`)
        } else {
            console.log(`[ARK Seedream] 生成模式: aspectRatio=${aspectRatio} → size=${size}`)
        }
        console.log(`[ARK Seedream] 模型=${modelId}`)
        console.log(`[ARK Seedream] ================================`)

        // 转换参考图片为 Base64
        const base64Images: string[] = []
        for (const imageUrl of referenceImages) {
            try {
                const base64 = await imageUrlToBase64(imageUrl)
                base64Images.push(base64)
            } catch (error) {
                console.log(`[ARK Seedream] 参考图片转换失败: ${imageUrl}`)
            }
        }

        // 构建请求体
        const requestBody: any = {
            model: modelId,
            prompt: prompt,
            sequential_image_generation: 'disabled',
            response_format: 'url',
            stream: false,
            watermark: false
        }

        // 🔥 只有非编辑模式才传 size
        if (size) {
            requestBody.size = size
        }

        if (base64Images.length > 0) {
            requestBody.image = base64Images
        }

        console.log(`[ARK Seedream] 最终请求体:`, JSON.stringify({
            model: requestBody.model,
            size: requestBody.size || '(未传)',
            imageCount: requestBody.image?.length || 0,
            promptLength: requestBody.prompt?.length || 0
        }))

        // 调用 ARK API
        const arkData = await arkImageGeneration(requestBody, {
            apiKey,
            logPrefix: '[ARK Seedream]'
        })

        const imageUrl = arkData.data?.[0]?.url

        if (!imageUrl) {
            throw new Error('ARK 未返回图片 URL')
        }

        return {
            success: true,
            imageUrl
        }
    }
}
