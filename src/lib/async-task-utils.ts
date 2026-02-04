/**
 * 异步任务工具函数
 * 用于查询第三方 AI 服务的任务状态
 * 
 * 注意：API Key 现在通过参数传入，不再使用环境变量
 */

import { logInternal } from './logger'

export interface TaskStatus {
    status: 'pending' | 'completed' | 'failed'
    imageUrl?: string
    videoUrl?: string
    error?: string
}

/**
 * 查询 FAL Banana 任务状态
 * @param requestId 任务ID
 * @param apiKey FAL API Key
 */
export async function queryBananaTaskStatus(requestId: string, apiKey: string): Promise<TaskStatus> {
    if (!apiKey) {
        throw new Error('请配置 FAL API Key')
    }

    try {
        const statusResponse = await fetch(
            `https://queue.fal.run/fal-ai/nano-banana-pro/requests/${requestId}/status`,
            {
                headers: { 'Authorization': `Key ${apiKey}` },
                cache: 'no-store'
            }
        )

        if (!statusResponse.ok) {
            logInternal('Banana', 'ERROR', `Status query failed: ${statusResponse.status}`)
            return { status: 'pending' }
        }

        const data = await statusResponse.json()

        if (data.status === 'COMPLETED') {
            // 获取结果
            const resultResponse = await fetch(
                `https://queue.fal.run/fal-ai/nano-banana-pro/requests/${requestId}`,
                {
                    headers: { 'Authorization': `Key ${apiKey}` },
                    cache: 'no-store'
                }
            )

            if (resultResponse.ok) {
                const result = await resultResponse.json()
                const imageUrl = result.images?.[0]?.url

                if (imageUrl) {
                    return { status: 'completed', imageUrl }
                }
            }

            return { status: 'failed', error: 'No image URL in result' }
        } else if (data.status === 'FAILED') {
            return { status: 'failed', error: data.error || 'Banana generation failed' }
        }

        return { status: 'pending' }
    } catch (error: any) {
        logInternal('Banana', 'ERROR', 'Query error', { error: error.message })
        return { status: 'pending' }
    }
}

/**
 * 查询 Gemini Batch 任务状态
 * 使用 ai.batches.get() 方法查询任务状态
 * @param batchName 任务名称（如 batches/xxx）
 * @param apiKey Google AI API Key
 */
export async function queryGeminiBatchStatus(batchName: string, apiKey: string): Promise<TaskStatus> {
    if (!apiKey) {
        throw new Error('请配置 Google AI API Key')
    }

    try {
        const { GoogleGenAI } = await import('@google/genai')
        const ai = new GoogleGenAI({ apiKey })

        // 🔥 使用 ai.batches.get 查询任务状态
        const batchJob = await (ai as any).batches.get({ name: batchName })

        const state = batchJob.state || 'UNKNOWN'
        logInternal('GeminiBatch', 'INFO', `查询状态: ${batchName} -> ${state}`)

        // 检查完成状态
        if (state === 'JOB_STATE_SUCCEEDED') {
            // 从 inlinedResponses 中提取图片
            const responses = batchJob.dest?.inlinedResponses || []

            if (responses.length > 0) {
                const firstResponse = responses[0]
                const parts = firstResponse.response?.candidates?.[0]?.content?.parts || []

                for (const part of parts) {
                    if (part.inlineData?.data) {
                        const imageBase64 = part.inlineData.data
                        const mimeType = part.inlineData.mimeType || 'image/png'
                        const imageUrl = `data:${mimeType};base64,${imageBase64}`

                        logInternal('GeminiBatch', 'INFO', `✅ 获取到图片，MIME 类型: ${mimeType}`, { batchName })
                        return { status: 'completed', imageUrl }
                    }
                }
            }

            return { status: 'failed', error: 'No image data in batch result' }
        } else if (state === 'JOB_STATE_FAILED' || state === 'JOB_STATE_CANCELLED' || state === 'JOB_STATE_EXPIRED') {
            return { status: 'failed', error: `Gemini Batch failed: ${state}` }
        }

        // 仍在处理中 (PENDING, RUNNING 等)
        return { status: 'pending' }
    } catch (error: any) {
        logInternal('GeminiBatch', 'ERROR', 'Query error', { batchName, error: error.message, status: error.status })
        // 如果是 404 或任务不存在，标记为失败（不再重试）
        if (error.status === 404 || error.message?.includes('404') || error.message?.includes('not found') || error.message?.includes('NOT_FOUND')) {
            return { status: 'failed', error: `Batch task not found` }
        }
        return { status: 'pending' }
    }
}

/**
 * 查询 Seedance 视频任务状态
 * @param taskId 任务ID
 * @param apiKey 火山引擎 API Key
 */
export async function querySeedanceVideoStatus(taskId: string, apiKey: string): Promise<TaskStatus> {
    if (!apiKey) {
        throw new Error('请配置火山引擎 API Key')
    }

    try {
        const queryResponse = await fetch(
            `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${taskId}`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                cache: 'no-store'
            }
        )


        if (!queryResponse.ok) {
            logInternal('Seedance', 'ERROR', `Status query failed: ${queryResponse.status}`)
            return { status: 'pending' }
        }

        const queryData = await queryResponse.json()
        const status = queryData.status

        if (status === 'succeeded') {
            const videoUrl = queryData.content?.video_url

            if (videoUrl) {
                return { status: 'completed', videoUrl }
            }

            return { status: 'failed', error: 'No video URL in response' }
        } else if (status === 'failed') {
            const errorObj = queryData.error || {}
            const errorMessage = errorObj.message || 'Unknown error'
            return { status: 'failed', error: errorMessage }
        }

        return { status: 'pending' }
    } catch (error: any) {
        logInternal('Seedance', 'ERROR', 'Query error', { error: error.message })
        return { status: 'pending' }
    }
}
