/**
 * FAL 生成器（统一图像 + 视频）
 * 
 * 图像模型：
 * - Banana Pro (2K/4K) - fal-ai/nano-banana-pro
 * 
 * 视频模型：
 * - Wan 2.6 (fal-wan25) - wan/v2.6/image-to-video
 * - Veo 3.1 (fal-veo31) - fal-ai/veo3.1/fast/image-to-video
 * - Sora 2 (fal-sora2) - fal-ai/sora-2/image-to-video  
 * - Kling 2.6 Pro (fal-kling25) - fal-ai/kling-video/v2.6/pro/image-to-video
 */

import {
    BaseImageGenerator,
    BaseVideoGenerator,
    ImageGenerateParams,
    VideoGenerateParams,
    GenerateResult
} from './base'
import { getFalApiKey } from '@/lib/api-config'
import { submitFalTask } from '@/lib/async-submit'
import { imageUrlToBase64 } from '@/lib/cos'

// ============================================================
// 视频模型端点映射
// ============================================================

const FAL_VIDEO_ENDPOINTS: Record<string, string> = {
    'fal-wan25': 'wan/v2.6/image-to-video',
    'fal-veo31': 'fal-ai/veo3.1/fast/image-to-video',
    'fal-sora2': 'fal-ai/sora-2/image-to-video',
    'fal-kling25': 'fal-ai/kling-video/v2.6/pro/image-to-video',
}

// ============================================================
// FAL 图像生成器 (Banana Pro)
// ============================================================

export class FalImageGenerator extends BaseImageGenerator {
    protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
        const { userId, prompt, referenceImages = [], options = {} } = params

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

        if (hasReferenceImages) {
            // 🔥 转换参考图片为Data URL（适配内网/本地环境）
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

        return {
            success: true,
            async: true,
            requestId,        // 向后兼容
            endpoint,         // 向后兼容
            externalId: `FAL:IMAGE:${endpoint}:${requestId}`  // 🔥 标准格式
        }
    }
}

// ============================================================
// FAL 视频生成器 (Wan 2.6, Veo 3.1, Sora 2, Kling 2.6)
// ============================================================

export class FalVideoGenerator extends BaseVideoGenerator {
    protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
        const { userId, imageUrl, prompt = '', options = {} } = params

        const apiKey = await getFalApiKey(userId)
        const {
            duration = 5,
            resolution = '720p',
            aspectRatio = '16:9',
            modelId = 'fal-wan25'
        } = options as any

        // 获取端点
        const endpoint = FAL_VIDEO_ENDPOINTS[modelId] || FAL_VIDEO_ENDPOINTS['fal-wan25']
        console.log(`[FAL Video] 模型: ${modelId}, 端点: ${endpoint}`)

        // 根据模型构建不同的请求体
        let input: any

        switch (modelId) {
            case 'fal-wan25':
                input = {
                    image_url: imageUrl,
                    prompt,
                    resolution: resolution === '1080p' ? '1080p' : '720p',
                    duration: String(duration)
                }
                break
            case 'fal-veo31':
                input = {
                    image_url: imageUrl,
                    prompt,
                    aspect_ratio: aspectRatio,
                    duration: '4s',
                    generate_audio: false
                }
                break
            case 'fal-sora2':
                input = {
                    image_url: imageUrl,
                    prompt,
                    aspect_ratio: aspectRatio,
                    duration: 4,
                    delete_video: false
                }
                break
            case 'fal-kling25':
                input = {
                    image_url: imageUrl,
                    prompt,
                    duration: String(duration),
                    negative_prompt: 'blur, distort, and low quality',
                    cfg_scale: 0.5
                }
                break
            default:
                input = {
                    image_url: imageUrl,
                    prompt,
                    resolution: resolution === '1080p' ? '1080p' : '720p',
                    duration: String(duration)
                }
        }

        try {
            const requestId = await submitFalTask(endpoint, input, apiKey)
            console.log(`[FAL Video] 任务已提交: ${requestId}`)

            return {
                success: true,
                async: true,
                requestId,  // 向后兼容
                endpoint,   // 向后兼容  
                externalId: `FAL:VIDEO:${endpoint}:${requestId}`  // 🔥 标准格式
            }
        } catch (error: any) {
            console.error(`[FAL Video] 提交失败:`, error.message)
            throw new Error(`FAL 视频任务提交失败: ${error.message || '未知错误'}`)
        }
    }
}

// ============================================================
// 向后兼容别名
// ============================================================

export const FalBananaGenerator = FalImageGenerator
