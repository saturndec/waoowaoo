/**
 * 统一异步任务轮询模块
 * 
 * 🔥 统一格式：PROVIDER:TYPE:REQUEST_ID
 * 
 * 例如：
 * - FAL:VIDEO:fal-ai/wan/v2.6:abc123
 * - FAL:IMAGE:fal-ai/nano-banana-pro:def456
 * - ARK:VIDEO:task_789
 * - ARK:IMAGE:task_xyz
 * - GEMINI:BATCH:batches/ghi012
 * 
 * 向后兼容：
 * - 旧格式 FAL:endpoint:requestId → 自动识别
 * - 旧格式 batches/xxx → 识别为 Gemini
 * - 无前缀 → 识别为 Ark
 */

import { queryFalStatus } from './async-submit'
import { queryGeminiBatchStatus, querySeedanceVideoStatus } from './async-task-utils'
import { getFalApiKey, getArkApiKey, getGoogleAiKey, getMinimaxApiKey, getViduApiKey } from './api-config'

export interface PollResult {
    status: 'pending' | 'completed' | 'failed'
    resultUrl?: string
    imageUrl?: string
    videoUrl?: string
    error?: string
}

/**
 * 解析 externalId 获取 provider、type 和请求信息
 */
function parseExternalId(externalId: string): {
    provider: 'FAL' | 'ARK' | 'GEMINI' | 'MINIMAX' | 'VIDU' | 'UNKNOWN'
    type: 'VIDEO' | 'IMAGE' | 'BATCH' | 'UNKNOWN'
    endpoint?: string
    requestId: string
} {
    // 新格式：PROVIDER:TYPE:...
    if (externalId.startsWith('FAL:')) {
        const parts = externalId.split(':')

        // 新格式：FAL:VIDEO:endpoint:requestId 或 FAL:IMAGE:endpoint:requestId
        if (parts[1] === 'VIDEO' || parts[1] === 'IMAGE') {
            return {
                provider: 'FAL',
                type: parts[1] as 'VIDEO' | 'IMAGE',
                endpoint: parts.slice(2, -1).join(':'),
                requestId: parts[parts.length - 1]
            }
        }

        // 旧格式：FAL:endpoint:requestId
        return {
            provider: 'FAL',
            type: 'UNKNOWN',
            endpoint: parts.slice(1, -1).join(':'),
            requestId: parts[parts.length - 1]
        }
    }

    // ARK 新格式
    if (externalId.startsWith('ARK:')) {
        const parts = externalId.split(':')
        return {
            provider: 'ARK',
            type: parts[1] as 'VIDEO' | 'IMAGE',
            requestId: parts.slice(2).join(':')
        }
    }

    // GEMINI 新格式
    if (externalId.startsWith('GEMINI:')) {
        const parts = externalId.split(':')
        return {
            provider: 'GEMINI',
            type: 'BATCH',
            requestId: parts.slice(2).join(':')
        }
    }

    // Gemini 旧格式：batches/xxx
    if (externalId.startsWith('batches/')) {
        return {
            provider: 'GEMINI',
            type: 'BATCH',
            requestId: externalId
        }
    }

    // MiniMax 新格式
    if (externalId.startsWith('MINIMAX:')) {
        const parts = externalId.split(':')
        return {
            provider: 'MINIMAX',
            type: parts[1] as 'VIDEO' | 'IMAGE',
            requestId: parts.slice(2).join(':')
        }
    }

    // Vidu 新格式
    if (externalId.startsWith('VIDU:')) {
        const parts = externalId.split(':')
        return {
            provider: 'VIDU',
            type: parts[1] as 'VIDEO' | 'IMAGE',
            requestId: parts.slice(2).join(':')
        }
    }

    // 🔥 移除 fallback：无法识别的格式直接报错，不再默默猜测
    throw new Error(
        `无法识别的 externalId 格式: "${externalId}". ` +
        `支持的格式: FAL:TYPE:endpoint:requestId, ARK:TYPE:requestId, GEMINI:BATCH:batchName, MINIMAX:TYPE:taskId, VIDU:TYPE:taskId, batches/xxx`
    )
}

/**
 * 统一轮询入口
 * 根据 externalId 格式自动选择正确的查询函数
 */
export async function pollAsyncTask(
    externalId: string,
    userId: string
): Promise<PollResult> {
    if (!userId) {
        throw new Error('缺少用户ID，无法获取 API Key')
    }

    const parsed = parseExternalId(externalId)
    console.log(`[Poll] 解析 ${externalId.slice(0, 30)}... → provider=${parsed.provider}, type=${parsed.type}`)

    switch (parsed.provider) {
        case 'FAL':
            return await pollFalTask(parsed.endpoint!, parsed.requestId, userId)
        case 'ARK':
            return await pollArkTask(parsed.requestId, userId)
        case 'GEMINI':
            return await pollGeminiTask(parsed.requestId, userId)
        case 'MINIMAX':
            return await pollMinimaxTask(parsed.requestId, userId)
        case 'VIDU':
            return await pollViduTask(parsed.requestId, userId)
        default:
            // 🔥 移除 fallback：未知 provider 直接抛出错误
            throw new Error(`未知的 Provider: ${parsed.provider}`)
    }
}

/**
 * FAL 任务轮询
 */
async function pollFalTask(
    endpoint: string,
    requestId: string,
    userId: string
): Promise<PollResult> {
    const apiKey = await getFalApiKey(userId)
    const result = await queryFalStatus(endpoint, requestId, apiKey)

    return {
        status: result.completed ? (result.failed ? 'failed' : 'completed') : 'pending',
        resultUrl: result.resultUrl,
        imageUrl: result.resultUrl,
        videoUrl: result.resultUrl,
        error: result.error
    }
}

/**
 * Ark 任务轮询
 */
async function pollArkTask(
    taskId: string,
    userId: string
): Promise<PollResult> {
    const apiKey = await getArkApiKey(userId)
    const result = await querySeedanceVideoStatus(taskId, apiKey)

    return {
        status: result.status,
        videoUrl: result.videoUrl,
        resultUrl: result.videoUrl,
        error: result.error
    }
}

/**
 * Gemini Batch 任务轮询
 */
async function pollGeminiTask(
    batchName: string,
    userId: string
): Promise<PollResult> {
    const apiKey = await getGoogleAiKey(userId)
    const result = await queryGeminiBatchStatus(batchName, apiKey)

    return {
        status: result.status,
        imageUrl: result.imageUrl,
        resultUrl: result.imageUrl,
        error: result.error
    }
}

/**
 * MiniMax 任务轮询
 */
async function pollMinimaxTask(
    taskId: string,
    userId: string
): Promise<PollResult> {
    const apiKey = await getMinimaxApiKey(userId)
    const result = await queryMinimaxTaskStatus(taskId, apiKey)

    return {
        status: result.status,
        videoUrl: result.videoUrl,
        imageUrl: result.imageUrl,
        resultUrl: result.videoUrl || result.imageUrl,
        error: result.error
    }
}

/**
 * 查询 MiniMax 任务状态
 */
async function queryMinimaxTaskStatus(
    taskId: string,
    apiKey: string
): Promise<{ status: 'pending' | 'completed' | 'failed'; videoUrl?: string; imageUrl?: string; error?: string }> {
    const logPrefix = '[MiniMax Query]'

    try {
        const response = await fetch(`https://api.minimaxi.com/v1/query/video_generation?task_id=${taskId}`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error(`${logPrefix} 查询失败:`, response.status, errorText)
            return {
                status: 'failed',
                error: `查询失败: ${response.status}`
            }
        }

        const data = await response.json()

        // 检查响应
        if (data.base_resp?.status_code !== 0) {
            const errMsg = data.base_resp?.status_msg || '未知错误'
            console.error(`${logPrefix} task_id=${taskId} 错误:`, errMsg)
            return {
                status: 'failed',
                error: errMsg
            }
        }

        const status = data.status

        if (status === 'Success') {
            const fileId = data.file_id
            if (!fileId) {
                console.error(`${logPrefix} task_id=${taskId} 成功但无file_id`)
                return {
                    status: 'failed',
                    error: '任务完成但未返回视频'
                }
            }

            // 🔥 使用 file_id 调用文件检索API获取真实下载URL
            console.log(`${logPrefix} task_id=${taskId} 完成，正在获取下载URL...`)
            try {
                const fileResponse = await fetch(`https://api.minimaxi.com/v1/files/retrieve?file_id=${fileId}`, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`
                    }
                })

                if (!fileResponse.ok) {
                    const errorText = await fileResponse.text()
                    console.error(`${logPrefix} 文件检索失败:`, fileResponse.status, errorText)
                    return {
                        status: 'failed',
                        error: `文件检索失败: ${fileResponse.status}`
                    }
                }

                const fileData = await fileResponse.json()
                const downloadUrl = fileData.file?.download_url

                if (!downloadUrl) {
                    console.error(`${logPrefix} 文件检索成功但无download_url:`, fileData)
                    return {
                        status: 'failed',
                        error: '无法获取视频下载链接'
                    }
                }

                console.log(`${logPrefix} 获取下载URL成功: ${downloadUrl.substring(0, 80)}...`)
                return {
                    status: 'completed',
                    videoUrl: downloadUrl
                }
            } catch (error: any) {
                console.error(`${logPrefix} 文件检索异常:`, error)
                return {
                    status: 'failed',
                    error: `文件检索失败: ${error.message}`
                }
            }
        } else if (status === 'Failed') {
            const errMsg = data.error_message || '生成失败'
            console.error(`${logPrefix} task_id=${taskId} 失败:`, errMsg)
            return {
                status: 'failed',
                error: errMsg
            }
        } else {
            // Processing 或其他状态都视为 pending
            return {
                status: 'pending'
            }
        }
    } catch (error: any) {
        console.error(`${logPrefix} task_id=${taskId} 异常:`, error)
        return {
            status: 'failed',
            error: error.message || '查询异常'
        }
    }
}

/**
 * Vidu 任务轮询
 */
async function pollViduTask(
    taskId: string,
    userId: string
): Promise<PollResult> {
    console.log(`[Poll Vidu] 开始轮询 task_id=${taskId}, userId=${userId}`)

    const apiKey = await getViduApiKey(userId)
    console.log(`[Poll Vidu] API Key 长度: ${apiKey?.length || 0}`)

    const result = await queryViduTaskStatus(taskId, apiKey)
    console.log(`[Poll Vidu] 查询结果:`, result)

    return {
        status: result.status,
        videoUrl: result.videoUrl,
        resultUrl: result.videoUrl,
        error: result.error
    }
}

/**
 * 查询 Vidu 任务状态
 */
async function queryViduTaskStatus(
    taskId: string,
    apiKey: string
): Promise<{ status: 'pending' | 'completed' | 'failed'; videoUrl?: string; error?: string }> {
    const logPrefix = '[Vidu Query]'

    try {
        console.log(`${logPrefix} 查询任务 task_id=${taskId}`)

        // 🔥 正确的查询接口路径：/tasks/{id}/creations
        const response = await fetch(`https://api.vidu.cn/ent/v2/tasks/${taskId}/creations`, {
            headers: {
                'Authorization': `Token ${apiKey}`
            }
        })

        console.log(`${logPrefix} HTTP状态: ${response.status}`)

        if (!response.ok) {
            const errorText = await response.text()
            console.error(`${logPrefix} 查询失败:`, response.status, errorText)
            return {
                status: 'failed',
                error: `Vidu: 查询失败 ${response.status}`
            }
        }

        const data = await response.json()
        console.log(`${logPrefix} 响应数据:`, JSON.stringify(data, null, 2))

        // 检查任务状态
        const state = data.state

        if (state === 'success') {
            // 🔥 任务成功，从 creations 数组中获取视频URL
            const creations = data.creations
            if (!creations || creations.length === 0) {
                console.error(`${logPrefix} task_id=${taskId} 成功但无生成物`)
                return {
                    status: 'failed',
                    error: 'Vidu: 任务完成但未返回视频'
                }
            }

            const videoUrl = creations[0].url
            if (!videoUrl) {
                console.error(`${logPrefix} task_id=${taskId} 成功但生成物无URL`)
                return {
                    status: 'failed',
                    error: 'Vidu: 任务完成但未返回视频URL'
                }
            }

            console.log(`${logPrefix} task_id=${taskId} 完成，视频URL: ${videoUrl.substring(0, 80)}...`)
            return {
                status: 'completed',
                videoUrl: videoUrl
            }
        } else if (state === 'failed') {
            // 🔥 使用 err_code 作为错误消息，添加 Vidu: 前缀便于错误码映射
            const errCode = data.err_code || 'Unknown'
            console.error(`${logPrefix} task_id=${taskId} 失败: ${errCode}`)
            return {
                status: 'failed',
                error: `Vidu: ${errCode}`  // 添加前缀以便错误映射识别
            }
        } else {
            // created, queueing, processing 都视为 pending
            return {
                status: 'pending'
            }
        }
    } catch (error: any) {
        console.error(`${logPrefix} task_id=${taskId} 异常:`, error)
        return {
            status: 'failed',
            error: `Vidu: ${error.message || '查询异常'}`  // 添加前缀
        }
    }
}

// ==================== 格式化辅助函数 ====================

/**
 * 创建标准格式的 externalId
 */
export function formatExternalId(
    provider: 'FAL' | 'ARK' | 'GEMINI',
    type: 'VIDEO' | 'IMAGE' | 'BATCH',
    requestId: string,
    endpoint?: string
): string {
    if (provider === 'FAL' && endpoint) {
        return `FAL:${type}:${endpoint}:${requestId}`
    }
    return `${provider}:${type}:${requestId}`
}
