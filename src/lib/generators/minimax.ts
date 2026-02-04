/**
 * MiniMax (海螺) 图像和视频生成器
 * 
 * 支持模型：
 * 视频：MiniMax-Hailuo-2.3, MiniMax-Hailuo-2.3-Fast, MiniMax-Hailuo-02, T2V-01, T2V-01-Director
 * 图像：image-01, image-01-live
 */

import { BaseImageGenerator, BaseVideoGenerator, ImageGenerateParams, VideoGenerateParams, GenerateResult } from './base'
import { getMinimaxApiKey } from '@/lib/api-config'
import { adaptVideoResolution } from './resolution-adapter'
import { imageUrlToBase64 } from '@/lib/cos'

const MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1'

// ==================== 视频生成器 ====================

export class MinimaxVideoGenerator extends BaseVideoGenerator {
    protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
        const { userId, imageUrl, prompt = '', options = {} } = params

        const apiKey = await getMinimaxApiKey(userId)
        const {
            modelId = 'MiniMax-Hailuo-2.3',
            duration = 6,
            resolution = '1080P'
        } = options as any

        // 🔥 使用集中式分辨率适配器
        const adaptedResolution = adaptVideoResolution('minimax', resolution)

        const logPrefix = `[MiniMax Video ${modelId}]`

        const requestBody: any = {
            model: modelId,
            prompt: prompt,
            duration: duration,
            resolution: adaptedResolution,
            prompt_optimizer: true
        }

        // 如果有首帧图片（图生视频）🔥 转换为Data URL（适配内网环境）
        if (imageUrl) {
            const dataUrl = imageUrl.startsWith('data:') ? imageUrl : await imageUrlToBase64(imageUrl)
            requestBody.first_frame_image = dataUrl
            console.log(`${logPrefix} 使用首帧图片 (已转Data URL)`)
        }

        console.log(`${logPrefix} 提交任务，duration=${duration}s，resolution=${adaptedResolution}`)

        try {
            const response = await fetch(`${MINIMAX_BASE_URL}/video_generation`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            })

            if (!response.ok) {
                const errorText = await response.text()
                console.error(`${logPrefix} API请求失败:`, response.status, errorText)
                throw new Error(`MiniMax API Error: ${response.status} - ${errorText}`)
            }

            const data = await response.json()

            // 检查响应
            if (data.base_resp?.status_code !== 0) {
                const errMsg = data.base_resp?.status_msg || '未知错误'
                console.error(`${logPrefix} 任务提交失败:`, errMsg)
                throw new Error(`MiniMax: ${errMsg}`)
            }

            const taskId = data.task_id
            if (!taskId) {
                console.error(`${logPrefix} 响应中缺少 task_id:`, data)
                throw new Error('MiniMax未返回task_id')
            }

            console.log(`${logPrefix} 任务已提交，task_id=${taskId}`)

            return {
                success: true,
                async: true,
                requestId: taskId,
                externalId: `MINIMAX:VIDEO:${taskId}`
            }
        } catch (error: any) {
            console.error(`${logPrefix} 生成失败:`, error)
            throw error
        }
    }
}

// ==================== 图像生成器 ====================

export class MinimaxImageGenerator extends BaseImageGenerator {
    protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
        const { userId, prompt, options = {} } = params

        const apiKey = await getMinimaxApiKey(userId)
        const {
            modelId = 'image-01',
            aspectRatio = '1:1',
            n = 1,
            referenceImage  // 图生图的参考图
        } = options as any

        const logPrefix = `[MiniMax Image ${modelId}]`

        // 判断是文生图还是图生图
        const isImage2Image = !!referenceImage
        const endpoint = isImage2Image ? 'image_generation' : 'image_generation'

        const requestBody: any = {
            model: modelId,
            prompt: prompt,
            aspect_ratio: aspectRatio,
            response_format: 'url',
            n: n,
            prompt_optimizer: true
        }

        // 图生图需要添加参考图
        if (isImage2Image) {
            requestBody.image = referenceImage
        }

        console.log(`${logPrefix} 提交${isImage2Image ? '图生图' : '文生图'}任务，aspectRatio=${aspectRatio}, n=${n}`)

        try {
            const response = await fetch(`${MINIMAX_BASE_URL}/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            })

            if (!response.ok) {
                const errorText = await response.text()
                console.error(`${logPrefix} API请求失败:`, response.status, errorText)
                throw new Error(`MiniMax API Error: ${response.status} - ${errorText}`)
            }

            const data = await response.json()

            // 检查响应
            if (data.base_resp?.status_code !== 0) {
                const errMsg = data.base_resp?.status_msg || '未知错误'
                console.error(`${logPrefix} 任务提交失败:`, errMsg)
                throw new Error(`MiniMax: ${errMsg}`)
            }

            // 海螺图像API是同步返回的
            const imageUrls = data.data?.image_urls || []
            if (imageUrls.length === 0) {
                console.error(`${logPrefix} 响应中没有图片:`, data)
                throw new Error('MiniMax未返回图片')
            }

            console.log(`${logPrefix} 生成成功，获得${imageUrls.length}张图片`)

            // 如果请求的是单张图片，直接返回第一张
            if (n === 1) {
                return {
                    success: true,
                    imageUrl: imageUrls[0]
                }
            }

            // 多张图片以逗号分隔存储在imageUrl中
            return {
                success: true,
                imageUrl: imageUrls.join(',')
            }
        } catch (error: any) {
            console.error(`${logPrefix} 生成失败:`, error)
            throw error
        }
    }
}
