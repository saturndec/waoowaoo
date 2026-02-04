/**
 * 火山引擎 ARK 视频生成器（增强版）
 * 
 * 支持：
 * - Seedance 1.0 Pro (doubao-seedance-1-0-pro-250615)
 * - Seedance 1.5 Pro (doubao-seedance-1-5-pro-251215)
 * - 批量模式 (-batch 后缀)
 * - 首尾帧模式
 * - 音频生成 (Seedance 1.5 Pro)
 */

import { BaseVideoGenerator, VideoGenerateParams, GenerateResult } from '../base'
import { getArkApiKey } from '@/lib/api-config'
import { arkCreateVideoTask } from '@/lib/ark-api'
import { imageUrlToBase64 } from '@/lib/cos'

export class ArkSeedanceVideoGenerator extends BaseVideoGenerator {
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

        // Seedance 1.5 Pro 只支持 480p/720p，强制使用 720p
        const isSeedance15Pro = realModel === 'doubao-seedance-1-5-pro-251215'
        const actualResolution = isSeedance15Pro ? '720p' : resolution

        console.log(`[ARK Video] 模型: ${realModel}, 批量模式: ${isBatchMode}, 分辨率: ${actualResolution}`)

        // 构建视频提示词
        // 使用 --ratio adaptive 自适应比例，根据输入图片自动匹配
        const fullVideoPrompt = `${prompt} --rs ${actualResolution} --ratio adaptive --dur 5 --fps 24`

        // 转换图片为 base64
        console.log(`[ARK Video] 转换图片为 base64: ${imageUrl}`)
        const imageBase64 = await imageUrlToBase64(imageUrl)

        // 构建请求体
        const content: any[] = [
            {
                type: 'text',
                text: fullVideoPrompt
            }
        ]

        // 添加首帧图片
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
            // 普通图生视频模式
            content.push({
                type: 'image_url',
                image_url: { url: imageBase64 }
            })
        }

        const requestBody: any = {
            model: realModel,
            content
        }

        // 批量模式：添加离线推理参数
        if (isBatchMode) {
            requestBody.service_tier = 'flex'
            requestBody.execution_expires_after = 86400
            console.log('[ARK Video] 批量模式: service_tier=flex, execution_expires_after=86400')
        }

        // 音频生成（仅 Seedance 1.5 Pro 支持）
        if (generateAudio !== undefined) {
            requestBody.generate_audio = generateAudio
        }

        try {
            // 使用带超时和重试的 arkCreateVideoTask
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
                requestId: taskId
            }
        } catch (error: any) {
            console.error(`[ARK Video] 创建任务失败:`, error.message)
            throw new Error(`ARK 视频任务创建失败: ${error.message || '未知错误'}`)
        }
    }
}
