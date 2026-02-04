/**
 * Vidu 视频生成器
 * 
 * 支持模型：
 * - viduq3-pro: 高效生成优质音视频内容
 * - viduq2-pro-fast: 价格触底、效果稳定，生成速度快
 * - viduq2-pro: 新模型，效果好，细节丰富
 * - viduq2-turbo: 新模型，效果好，生成快
 * - viduq2: 最新模型
 * - viduq1: 画面清晰，平滑转场，运镜稳定
 * - viduq1-classic: 画面清晰，转场、运镜更丰富
 * - vidu2.0: 生成速度快
 */

import { BaseVideoGenerator, VideoGenerateParams, GenerateResult } from './base'
import { getViduApiKey } from '@/lib/api-config'
import { imageUrlToBase64 } from '@/lib/cos'

const VIDU_BASE_URL = 'https://api.vidu.cn/ent/v2'

export class ViduVideoGenerator extends BaseVideoGenerator {
    protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
        const { userId, imageUrl, prompt = '', options = {} } = params

        const apiKey = await getViduApiKey(userId)
        const {
            modelId = 'viduq2-turbo',
            duration = 5,
            resolution = '720p',
            aspectRatio = '16:9',
            seed = 0,
            movementAmplitude = 'auto'
        } = options as any

        const logPrefix = `[Vidu Video ${modelId}]`

        // 🔥 转换图片为Data URL（适配内网环境）
        const dataUrl = imageUrl.startsWith('data:') ? imageUrl : await imageUrlToBase64(imageUrl)
        console.log(`${logPrefix} 已转换首帧图片为 Data URL`)

        // 🔥 简化请求体，只包含文档明确支持的参数
        const requestBody: any = {
            model: modelId,
            images: [dataUrl],
            duration: duration
        }

        // 根据分辨率设置 aspect_ratio
        // 1080p 通常是 16:9
        if (aspectRatio) {
            requestBody.aspect_ratio = aspectRatio
        }

        // 如果有提示词
        if (prompt) {
            requestBody.prompt = prompt
        }

        console.log(`${logPrefix} 提交图生视频任务`)
        console.log(`${logPrefix} - Model: ${modelId}`)
        console.log(`${logPrefix} - Duration: ${duration}s`)
        console.log(`${logPrefix} - 图片URL: ${imageUrl?.substring(0, 100)}...`)
        console.log(`${logPrefix} - 完整请求体:`, JSON.stringify(requestBody, null, 2))

        try {
            const response = await fetch(`${VIDU_BASE_URL}/img2video`, {
                method: 'POST',
                headers: {
                    'Authorization': `Token ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            })

            if (!response.ok) {
                const errorText = await response.text()
                console.error(`${logPrefix} API请求失败:`, response.status, errorText)
                throw new Error(`Vidu API Error: ${response.status} - ${errorText}`)
            }

            const data = await response.json()

            // 检查任务ID
            const taskId = data.task_id
            if (!taskId) {
                console.error(`${logPrefix} 响应中缺少 task_id:`, data)
                throw new Error('Vidu未返回task_id')
            }

            // 检查状态
            const state = data.state
            if (state === 'failed') {
                const errMsg = '任务提交失败'
                console.error(`${logPrefix} 任务提交失败:`, data)
                throw new Error(`Vidu: ${errMsg}`)
            }

            console.log(`${logPrefix} 任务已提交，task_id=${taskId}, state=${state}`)

            return {
                success: true,
                async: true,
                requestId: taskId,
                externalId: `VIDU:VIDEO:${taskId}`
            }
        } catch (error: any) {
            console.error(`${logPrefix} 生成失败:`, error)
            throw error
        }
    }
}
