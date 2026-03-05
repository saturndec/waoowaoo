import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
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
const DEFAULT_TIMEOUT_MS = 300 * 1000  // 300秒
const MAX_RETRIES = 3
const RETRY_DELAY_BASE_MS = 2000  // 2秒起始延迟

function normalizeError(error: unknown): {
    name?: string
    message: string
    cause?: string
    status?: number
} {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            cause: error.cause ? String(error.cause) : undefined,
        }
    }
    if (typeof error === 'object' && error !== null) {
        const e = error as {
            name?: unknown
            message?: unknown
            cause?: unknown
            status?: unknown
        }
        return {
            name: typeof e.name === 'string' ? e.name : undefined,
            message: typeof e.message === 'string' ? e.message : 'Unknown error',
            cause: e.cause ? String(e.cause) : undefined,
            status: typeof e.status === 'number' ? e.status : undefined,
        }
    }
    return { message: 'Unknown error' }
}

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
        type: 'image_url' | 'text' | 'draft_task'
        image_url?: { url: string }
        text?: string
        role?: 'first_frame' | 'last_frame' | 'reference_image'
        draft_task?: { id: string }
    }>
    resolution?: '480p' | '720p' | '1080p'
    ratio?: string
    duration?: number
    frames?: number
    seed?: number
    camera_fixed?: boolean
    watermark?: boolean
    return_last_frame?: boolean
    service_tier?: 'default' | 'flex'
    execution_expires_after?: number
    generate_audio?: boolean
    draft?: boolean
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function isInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value)
}

function validateArkVideoTaskRequest(request: ArkVideoTaskRequest) {
    const allowedTopLevelKeys = new Set([
        'model',
        'content',
        'resolution',
        'ratio',
        'duration',
        'frames',
        'seed',
        'camera_fixed',
        'watermark',
        'return_last_frame',
        'service_tier',
        'execution_expires_after',
        'generate_audio',
        'draft',
    ])
    for (const key of Object.keys(request)) {
        if (!allowedTopLevelKeys.has(key)) {
            throw new Error(`ARK_VIDEO_REQUEST_FIELD_UNSUPPORTED: ${key}`)
        }
    }

    if (!isNonEmptyString(request.model)) {
        throw new Error('ARK_VIDEO_REQUEST_INVALID: model is required')
    }
    if (!Array.isArray(request.content) || request.content.length === 0) {
        throw new Error('ARK_VIDEO_REQUEST_INVALID: content must be a non-empty array')
    }

    const allowedRatios = new Set(['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'])
    if (request.ratio !== undefined && !allowedRatios.has(request.ratio)) {
        throw new Error(`ARK_VIDEO_REQUEST_INVALID: ratio=${request.ratio}`)
    }

    if (request.resolution !== undefined && request.resolution !== '480p' && request.resolution !== '720p' && request.resolution !== '1080p') {
        throw new Error(`ARK_VIDEO_REQUEST_INVALID: resolution=${request.resolution}`)
    }

    if (request.duration !== undefined) {
        if (!isInteger(request.duration)) {
            throw new Error('ARK_VIDEO_REQUEST_INVALID: duration must be integer')
        }
        if (request.duration !== -1 && (request.duration < 2 || request.duration > 12)) {
            throw new Error(`ARK_VIDEO_REQUEST_INVALID: duration=${request.duration}`)
        }
    }

    if (request.frames !== undefined) {
        if (!isInteger(request.frames)) {
            throw new Error('ARK_VIDEO_REQUEST_INVALID: frames must be integer')
        }
        if (request.frames < 29 || request.frames > 289 || (request.frames - 25) % 4 !== 0) {
            throw new Error(`ARK_VIDEO_REQUEST_INVALID: frames=${request.frames}`)
        }
    }

    if (request.seed !== undefined) {
        if (!isInteger(request.seed)) {
            throw new Error('ARK_VIDEO_REQUEST_INVALID: seed must be integer')
        }
        if (request.seed < -1 || request.seed > 4294967295) {
            throw new Error(`ARK_VIDEO_REQUEST_INVALID: seed=${request.seed}`)
        }
    }

    if (request.execution_expires_after !== undefined) {
        if (!isInteger(request.execution_expires_after)) {
            throw new Error('ARK_VIDEO_REQUEST_INVALID: execution_expires_after must be integer')
        }
        if (request.execution_expires_after < 3600 || request.execution_expires_after > 259200) {
            throw new Error(`ARK_VIDEO_REQUEST_INVALID: execution_expires_after=${request.execution_expires_after}`)
        }
    }

    if (
        request.service_tier !== undefined
        && request.service_tier !== 'default'
        && request.service_tier !== 'flex'
    ) {
        throw new Error(`ARK_VIDEO_REQUEST_INVALID: service_tier=${String(request.service_tier)}`)
    }

    if (request.draft === true) {
        if (request.resolution !== undefined && request.resolution !== '480p') {
            throw new Error('ARK_VIDEO_REQUEST_INVALID: draft only supports 480p')
        }
        if (request.return_last_frame === true) {
            throw new Error('ARK_VIDEO_REQUEST_INVALID: return_last_frame is not supported when draft=true')
        }
        if (request.service_tier === 'flex') {
            throw new Error('ARK_VIDEO_REQUEST_INVALID: service_tier=flex is not supported when draft=true')
        }
    }

    for (let index = 0; index < request.content.length; index += 1) {
        const item = request.content[index]
        const path = `content[${index}]`
        if (!isRecord(item)) {
            throw new Error(`ARK_VIDEO_REQUEST_INVALID: ${path} must be object`)
        }

        if (item.type === 'text') {
            if (!isNonEmptyString(item.text)) {
                throw new Error(`ARK_VIDEO_REQUEST_INVALID: ${path}.text is required`)
            }
            continue
        }

        if (item.type === 'image_url') {
            if (!isRecord(item.image_url) || !isNonEmptyString(item.image_url.url)) {
                throw new Error(`ARK_VIDEO_REQUEST_INVALID: ${path}.image_url.url is required`)
            }
            if (
                item.role !== undefined
                && item.role !== 'first_frame'
                && item.role !== 'last_frame'
                && item.role !== 'reference_image'
            ) {
                throw new Error(`ARK_VIDEO_REQUEST_INVALID: ${path}.role=${String(item.role)}`)
            }
            continue
        }

        if (item.type === 'draft_task') {
            if (!isRecord(item.draft_task) || !isNonEmptyString(item.draft_task.id)) {
                throw new Error(`ARK_VIDEO_REQUEST_INVALID: ${path}.draft_task.id is required`)
            }
            continue
        }

        throw new Error(`ARK_VIDEO_REQUEST_INVALID: ${path}.type=${String((item as { type?: unknown }).type)}`)
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
            _ulogInfo(`${logPrefix} 第 ${attempt}/${maxRetries} 次尝试请求`)

            const response = await fetchWithTimeout(url, options, timeoutMs)

            // 请求成功
            if (response.ok) {
                if (attempt > 1) {
                    _ulogInfo(`${logPrefix} 第 ${attempt} 次尝试成功`)
                }
                return response
            }

            // HTTP 错误，但不是网络错误，可能是业务错误
            const errorText = await response.text()
            _ulogError(`${logPrefix} HTTP ${response.status}: ${errorText}`)

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
        } catch (error: unknown) {
            const normalized = normalizeError(error)
            lastError = error instanceof Error ? error : new Error(normalized.message)

            // 详细记录错误信息
            const errorDetails = {
                attempt,
                maxRetries,
                errorName: normalized.name,
                errorMessage: normalized.message,
                errorCause: normalized.cause,
                isAbortError: normalized.name === 'AbortError',
                isTimeoutError: normalized.name === 'AbortError' || normalized.message.includes('timeout'),
                isNetworkError: normalized.message.includes('fetch failed') || normalized.name === 'TypeError'
            }

            _ulogError(`${logPrefix} 第 ${attempt}/${maxRetries} 次尝试失败:`, JSON.stringify(errorDetails, null, 2))
        }

        // 如果不是最后一次尝试，等待后重试
        if (attempt < maxRetries) {
            const delayMs = RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1)  // 指数退避：2s, 4s, 8s
            _ulogInfo(`${logPrefix} 等待 ${delayMs / 1000} 秒后重试...`)
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

    _ulogInfo(`${logPrefix} 开始图片生成请求, 模型: ${request.model}`)
    _ulogInfo(`${logPrefix} 请求参数:`, JSON.stringify({
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
    _ulogInfo(`${logPrefix} 图片生成成功`)
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
): Promise<{ id: string; [key: string]: unknown }> {
    if (!options.apiKey) {
        throw new Error('请配置火山引擎 API Key')
    }
    validateArkVideoTaskRequest(request)

    const {
        apiKey,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxRetries = MAX_RETRIES,
        logPrefix = '[Ark Video]'
    } = options

    const url = `${ARK_BASE_URL}/contents/generations/tasks`

    _ulogInfo(`${logPrefix} 创建视频任务, 模型: ${request.model}`)

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
    _ulogInfo(`${logPrefix} 视频任务创建成功, taskId: ${taskId}`)
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
