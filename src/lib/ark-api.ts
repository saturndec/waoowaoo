/**
 * 火山引擎 API 统一调用工具
 * 
 * 解决问题：Vercel（海外）→ 火山引擎（北京）跨境网络超时
 * 
 * 功能：
 * - 60秒超时配置（Vercel Pro 函数限制）
 * - 自动重试机制（最多3次，指数退避）
 * - 详细的错误日志
 */

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

// 超时配置
const DEFAULT_TIMEOUT_MS = 60 * 1000  // 60秒
const MAX_RETRIES = 3
const RETRY_DELAY_BASE_MS = 2000  // 2秒起始延迟

interface ArkImageGenerationRequest {
    model: string
    prompt: string
    response_format?: 'url' | 'b64_json'
    size?: string  // 支持 '1K' | '2K' | '4K' 或具体像素值如 '2560x1440'
    aspect_ratio?: string  // 宽高比如 '3:2', '16:9', '1:1'
    watermark?: boolean
    image?: string[]  // 图生图时的参考图片
    sequential_image_generation?: 'enabled' | 'disabled'
    stream?: boolean
}

interface ArkImageGenerationResponse {
    data: Array<{
        url?: string
        b64_json?: string
    }>
}

interface ArkVideoTaskRequest {
    model: string
    content: Array<{
        type: 'image_url' | 'text'
        image_url?: { url: string }
        text?: string
    }>
    duration?: string
}

interface ArkVideoTaskResponse {
    id: string
    model: string
    status: 'processing' | 'succeeded' | 'failed'
    content?: Array<{
        type: 'video_url'
        video_url: { url: string }
    }>
    error?: {
        code: string
        message: string
    }
}

/**
 * 带超时的 fetch 封装
 */
async function fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    // 🔧 本地模式修复：相对路径需要补全完整 URL
    let fullUrl = url
    if (url.startsWith('/')) {
        // 服务端 fetch 需要完整 URL，使用 localhost:3000 作为基础地址
        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
        fullUrl = `${baseUrl}${url}`
    }

    try {
        const response = await fetch(fullUrl, {
            ...options,
            signal: controller.signal
        })
        return response
    } finally {
        clearTimeout(timeoutId)
    }
}

/**
 * 带重试的 fetch 封装
 */
async function fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = MAX_RETRIES,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    logPrefix: string = '[Ark API]'
): Promise<Response> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`${logPrefix} 第 ${attempt}/${maxRetries} 次尝试请求`)

            const response = await fetchWithTimeout(url, options, timeoutMs)

            // 请求成功
            if (response.ok) {
                if (attempt > 1) {
                    console.log(`${logPrefix} 第 ${attempt} 次尝试成功`)
                }
                return response
            }

            // HTTP 错误，但不是网络错误，可能是业务错误
            const errorText = await response.text()
            console.error(`${logPrefix} HTTP ${response.status}: ${errorText}`)

            // 对于某些错误不重试（如 400 参数错误、403 权限错误）
            if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
                // 创建一个可以返回原始文本的 Response
                return new Response(errorText, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers
                })
            }

            lastError = new Error(`HTTP ${response.status}: ${errorText}`)
        } catch (error: any) {
            lastError = error

            // 详细记录错误信息
            const errorDetails = {
                attempt,
                maxRetries,
                errorName: error.name,
                errorMessage: error.message,
                errorCause: error.cause ? String(error.cause) : undefined,
                isAbortError: error.name === 'AbortError',
                isTimeoutError: error.name === 'AbortError' || error.message?.includes('timeout'),
                isNetworkError: error.message?.includes('fetch failed') || error.name === 'TypeError'
            }

            console.error(`${logPrefix} 第 ${attempt}/${maxRetries} 次尝试失败:`, JSON.stringify(errorDetails, null, 2))
        }

        // 如果不是最后一次尝试，等待后重试
        if (attempt < maxRetries) {
            const delayMs = RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1)  // 指数退避：2s, 4s, 8s
            console.log(`${logPrefix} 等待 ${delayMs / 1000} 秒后重试...`)
            await new Promise(resolve => setTimeout(resolve, delayMs))
        }
    }

    // 所有重试都失败
    throw lastError || new Error(`${logPrefix} 所有 ${maxRetries} 次重试都失败`)
}

/**
 * 火山引擎图片生成 API
 */
export async function arkImageGeneration(
    request: ArkImageGenerationRequest,
    options?: {
        apiKey: string  // 必须传入 API Key
        timeoutMs?: number
        maxRetries?: number
        logPrefix?: string
    }
): Promise<ArkImageGenerationResponse> {
    if (!options?.apiKey) {
        throw new Error('请配置火山引擎 API Key')
    }

    const {
        apiKey,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxRetries = MAX_RETRIES,
        logPrefix = '[Ark Image]'
    } = options

    const url = `${ARK_BASE_URL}/images/generations`

    console.log(`${logPrefix} 开始图片生成请求, 模型: ${request.model}`)
    console.log(`${logPrefix} 请求参数:`, JSON.stringify({
        model: request.model,
        size: request.size,
        aspect_ratio: request.aspect_ratio,
        watermark: request.watermark,
        imageCount: request.image?.length || 0,
        promptLength: request.prompt?.length || 0
    }))

    const response = await fetchWithRetry(
        url,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(request)
        },
        maxRetries,
        timeoutMs,
        logPrefix
    )

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`${logPrefix} 图片生成失败: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log(`${logPrefix} 图片生成成功`)
    return data
}

/**
 * 火山引擎视频任务创建 API
 */
export async function arkCreateVideoTask(
    request: ArkVideoTaskRequest,
    options: {
        apiKey: string  // 必须传入 API Key
        timeoutMs?: number
        maxRetries?: number
        logPrefix?: string
    }
): Promise<{ id: string;[key: string]: any }> {
    if (!options.apiKey) {
        throw new Error('请配置火山引擎 API Key')
    }

    const {
        apiKey,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxRetries = MAX_RETRIES,
        logPrefix = '[Ark Video]'
    } = options

    const url = `${ARK_BASE_URL}/contents/generations/tasks`

    console.log(`${logPrefix} 创建视频任务, 模型: ${request.model}`)

    const response = await fetchWithRetry(
        url,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(request)
        },
        maxRetries,
        timeoutMs,
        logPrefix
    )

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`${logPrefix} 创建视频任务失败: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const taskId = data.id
    console.log(`${logPrefix} 视频任务创建成功, taskId: ${taskId}`)
    return { id: taskId, ...data }
}

/**
 * 火山引擎视频任务状态查询 API
 */
export async function arkQueryVideoTask(
    taskId: string,
    options: {
        apiKey: string  // 必须传入 API Key
        timeoutMs?: number
        maxRetries?: number
        logPrefix?: string
    }
): Promise<ArkVideoTaskResponse> {
    if (!options.apiKey) {
        throw new Error('请配置火山引擎 API Key')
    }

    const {
        apiKey,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxRetries = MAX_RETRIES,
        logPrefix = '[Ark Video]'
    } = options

    const url = `${ARK_BASE_URL}/contents/generations/tasks/${taskId}`

    const response = await fetchWithRetry(
        url,
        {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        },
        maxRetries,
        timeoutMs,
        logPrefix
    )

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`${logPrefix} 查询视频任务失败: ${response.status} - ${errorText}`)
    }

    return await response.json()
}

/**
 * 通用的带超时和重试的 fetch 函数
 * 用于下载图片、视频等
 */
export async function fetchWithTimeoutAndRetry(
    url: string,
    options?: RequestInit & {
        timeoutMs?: number
        maxRetries?: number
        logPrefix?: string
    }
): Promise<Response> {
    const {
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxRetries = MAX_RETRIES,
        logPrefix = '[Fetch]',
        ...fetchOptions
    } = options || {}

    return fetchWithRetry(url, fetchOptions, maxRetries, timeoutMs, logPrefix)
}

// 导出常量，供其他模块参考
export const ARK_API_TIMEOUT_MS = DEFAULT_TIMEOUT_MS
export const ARK_API_MAX_RETRIES = MAX_RETRIES
