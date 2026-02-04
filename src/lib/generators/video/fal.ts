/**
 * FAL 视频生成器（增强版）
 * 
 * 支持：
 * - Wan 2.6 (fal-wan25)
 * - Veo 3.1 (fal-veo31)
 * - Sora 2 (fal-sora2)
 * - Kling 2.6 Pro (fal-kling25)
 */

import { BaseVideoGenerator, VideoGenerateParams, GenerateResult } from '../base'
import { getFalApiKey } from '@/lib/api-config'
import { submitFalTask } from '@/lib/async-submit'
import { imageUrlToBase64 } from '@/lib/cos'

// 模型到端点的映射
const FAL_VIDEO_ENDPOINTS: Record<string, string> = {
    'fal-wan25': 'wan/v2.6/image-to-video',
    'fal-veo31': 'fal-ai/veo3.1/fast/image-to-video',
    'fal-sora2': 'fal-ai/sora-2/image-to-video',
    'fal-kling25': 'fal-ai/kling-video/v2.6/pro/image-to-video',
}

export class FalVideoGenerator extends BaseVideoGenerator {
    private modelId: string = 'fal-wan25'

    setModelId(modelId: string): void {
        this.modelId = modelId
    }

    protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
        const { userId, imageUrl, prompt = '', options = {} } = params

        const apiKey = await getFalApiKey(userId)
        const {
            duration = 5,
            resolution = '720p',
            aspectRatio = '16:9',
            modelId = this.modelId
        } = options as any

        // 获取端点
        const endpoint = FAL_VIDEO_ENDPOINTS[modelId] || FAL_VIDEO_ENDPOINTS['fal-wan25']
        console.log(`[FAL Video] 使用模型: ${modelId}, 端点: ${endpoint}`)

        // 🔥 转换图片为Data URL（适配内网环境）
        let dataUrl = imageUrl
        if (!imageUrl.startsWith('data:')) {
            dataUrl = await imageUrlToBase64(imageUrl)
            console.log(`[FAL Video] 已转换首帧图片为 Data URL`)
        }

        // 根据模型构建不同的请求体
        let input: any

        if (modelId === 'fal-wan25') {
            input = {
                image_url: dataUrl,
                prompt,
                resolution: resolution === '1080p' ? '1080p' : '720p',
                duration: String(duration)
            }
        } else if (modelId === 'fal-veo31') {
            input = {
                image_url: dataUrl,
                prompt,
                aspect_ratio: aspectRatio,
                duration: '4s',
                generate_audio: false
            }
        } else if (modelId === 'fal-sora2') {
            input = {
                image_url: dataUrl,
                prompt,
                aspect_ratio: aspectRatio,
                duration: 4,
                delete_video: false
            }
        } else if (modelId === 'fal-kling25') {
            input = {
                image_url: dataUrl,
                prompt,
                duration: String(duration),
                negative_prompt: 'blur, distort, and low quality',
                cfg_scale: 0.5
            }
        } else {
            // 默认使用 Wan 2.6 格式
            input = {
                image_url: dataUrl,
                prompt,
                resolution: resolution === '1080p' ? '1080p' : '720p',
                duration: String(duration)
            }
        }

        try {
            // 使用统一的 submitFalTask 提交异步任务
            const requestId = await submitFalTask(endpoint, input, apiKey)
            console.log(`[FAL Video] 任务已提交: ${requestId}`)

            return {
                success: true,
                async: true,
                requestId,
                endpoint
            }
        } catch (error: any) {
            console.error(`[FAL Video] 提交失败:`, error.message)
            throw new Error(`FAL 视频任务提交失败: ${error.message || '未知错误'}`)
        }
    }
}
