/**
 * 火山引擎 ARK 生成器（统一图像 + 视频）
 * 
 * 图像模型：
 * - Seedream 4.5 (doubao-seedream-4-5-251128)
 * - Seedream 4.0
 * 
 * 视频模型：
 * - Seedance 1.0 Pro (doubao-seedance-1-0-pro-250615)
 * - Seedance 1.5 Pro (doubao-seedance-1-5-pro-251215)
 * - 支持批量模式 (-batch 后缀)
 * - 支持首尾帧模式
 * - 支持音频生成 (Seedance 1.5 Pro)
 */

import {
    BaseImageGenerator,
    BaseVideoGenerator,
    ImageGenerateParams,
    VideoGenerateParams,
    GenerateResult
} from './base'
import { getArkApiKey } from '@/lib/api-config'
import { arkImageGeneration, arkCreateVideoTask } from '@/lib/ark-api'
import { imageUrlToBase64 } from '@/lib/cos'

// ============================================================
// 图像尺寸映射表
// ============================================================

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

// ============================================================
// ARK 图像生成器 (Seedream)
// ============================================================

export class ArkImageGenerator extends BaseImageGenerator {
    protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
        const { userId, prompt, referenceImages = [], options = {} } = params

        const apiKey = await getArkApiKey(userId)
        const {
            aspectRatio = '16:9',
            modelId = 'doubao-seedream-4-5-251128',
            size: directSize  // 直接传入的像素尺寸（编辑模式）
        } = options as any

        // 决定最终 size
        let size: string | undefined
        if (directSize) {
            size = directSize
        } else {
            size = SIZE_MAP_4K[aspectRatio] || SIZE_MAP_4K['16:9']
        }

        console.log(`[ARK Image] 模型=${modelId}, aspectRatio=${aspectRatio}, size=${size || '(未传)'}`)

        // 转换参考图片为 Base64
        const base64Images: string[] = []
        for (const imageUrl of referenceImages) {
            try {
                const base64 = await imageUrlToBase64(imageUrl)
                base64Images.push(base64)
            } catch (error) {
                console.log(`[ARK Image] 参考图片转换失败: ${imageUrl}`)
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

        if (size) {
            requestBody.size = size
        }

        if (base64Images.length > 0) {
            requestBody.image = base64Images
        }

        // 调用 ARK API
        const arkData = await arkImageGeneration(requestBody, {
            apiKey,
            logPrefix: '[ARK Image]'
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

// ============================================================
// ARK 视频生成器 (Seedance)
// ============================================================

export class ArkVideoGenerator extends BaseVideoGenerator {
    protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
        const { userId, imageUrl, prompt = '', options = {} } = params

        const apiKey = await getArkApiKey(userId)
        const {
            modelId = 'doubao-seedance-1-0-pro-fast-251015',
            resolution = '720p',
            aspectRatio = '16:9',
            generateAudio,
            lastFrameImageUrl,  // 首尾帧模式的尾帧图片
        } = options as any

        // 解析批量模式
        const isBatchMode = modelId.endsWith('-batch')
        const realModel = isBatchMode ? modelId.replace('-batch', '') : modelId

        // Seedance 1.5 Pro 只支持 480p/720p
        const isSeedance15Pro = realModel === 'doubao-seedance-1-5-pro-251215'
        const actualResolution = isSeedance15Pro ? '720p' : resolution

        console.log(`[ARK Video] 模型: ${realModel}, 批量: ${isBatchMode}, 分辨率: ${actualResolution}`)

        // 构建视频提示词
        const fullVideoPrompt = `${prompt} --rs ${actualResolution} --ratio adaptive --dur 5 --fps 24`

        // 转换图片为 base64
        const imageBase64 = await imageUrlToBase64(imageUrl)

        // 构建请求体 content
        const content: any[] = [
            { type: 'text', text: fullVideoPrompt }
        ]

        if (lastFrameImageUrl) {
            // 首尾帧模式
            const lastImageBase64 = await imageUrlToBase64(lastFrameImageUrl)
            content.push({
                type: 'image_url',
                image_url: { url: imageBase64 },
                role: 'first_frame'
            })
            content.push({
                type: 'image_url',
                image_url: { url: lastImageBase64 },
                role: 'last_frame'
            })
            console.log(`[ARK Video] 首尾帧模式`)
        } else {
            content.push({
                type: 'image_url',
                image_url: { url: imageBase64 }
            })
        }

        const requestBody: any = {
            model: realModel,
            content
        }

        // 批量模式参数
        if (isBatchMode) {
            requestBody.service_tier = 'flex'
            requestBody.execution_expires_after = 86400
            console.log('[ARK Video] 批量模式: service_tier=flex')
        }

        // 音频生成（仅 Seedance 1.5 Pro）
        if (generateAudio !== undefined) {
            requestBody.generate_audio = generateAudio
        }

        try {
            const taskData = await arkCreateVideoTask(requestBody, {
                apiKey,
                logPrefix: '[ARK Video]'
            })

            const taskId = taskData.id

            if (!taskId) {
                throw new Error('ARK 未返回 task_id')
            }

            console.log(`[ARK Video] 任务已创建: ${taskId}`)

            return {
                success: true,
                async: true,
                requestId: taskId,  // 向后兼容
                externalId: `ARK:VIDEO:${taskId}`  // 🔥 标准格式
            }
        } catch (error: any) {
            console.error(`[ARK Video] 创建任务失败:`, error.message)
            throw new Error(`ARK 视频任务创建失败: ${error.message || '未知错误'}`)
        }
    }
}

// ============================================================
// 向后兼容别名
// ============================================================

export const ArkSeedreamGenerator = ArkImageGenerator
export const ArkSeedanceVideoGenerator = ArkVideoGenerator
