import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'

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
 * 注意：
 * - 仅接受标准 externalId（不再兼容历史拼装格式）
 */

import { queryFalStatus } from './async-submit'
import { queryGeminiBatchStatus, querySeedanceVideoStatus, queryGoogleVideoStatus } from './async-task-utils'
import { getProviderConfig, getUserModels } from './api-config'
import { buildRenderedTemplateRequest, buildTemplateVariables, normalizeResponseJson, readJsonPath, resolveTemplateOperation, type TemplateOperation } from './openai-compat-template-runtime'
import { composeModelKey } from './model-config-contract'

const OPENAI_COMPAT_PROVIDER_PREFIX = 'openai-compatible:'
const PROVIDER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface PollResult {
    status: 'pending' | 'completed' | 'failed'
    resultUrl?: string
    imageUrl?: string
    videoUrl?: string
    downloadHeaders?: Record<string, string>
    error?: string
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    if (typeof error === 'object' && error !== null) {
        const candidate = (error as { message?: unknown }).message
        if (typeof candidate === 'string') return candidate
    }
    return '查询异常'
}

/**
 * 解析 externalId 获取 provider、type 和请求信息
 */
export function parseExternalId(externalId: string): {
    provider: 'FAL' | 'ARK' | 'GEMINI' | 'GOOGLE' | 'MINIMAX' | 'VIDU' | 'OPENAI' | 'OCOMPAT' | 'BAILIAN' | 'SILICONFLOW' | 'UNKNOWN'
    type: 'VIDEO' | 'IMAGE' | 'BATCH' | 'UNKNOWN'
    endpoint?: string
    requestId: string
    providerToken?: string
    modelKeyToken?: string
    templateOperation?: TemplateOperation
} {
    // 标准格式：PROVIDER:TYPE:...
    if (externalId.startsWith('FAL:')) {
        const parts = externalId.split(':')

        if (parts[1] === 'VIDEO' || parts[1] === 'IMAGE') {
            if (parts.length < 4) {
                throw new Error(`无效 FAL externalId: "${externalId}"，应为 FAL:TYPE:endpoint:requestId`)
            }
            const endpoint = parts.slice(2, -1).join(':')
            const requestId = parts[parts.length - 1]
            if (!endpoint || !requestId) {
                throw new Error(`无效 FAL externalId: "${externalId}"，缺少 endpoint 或 requestId`)
            }
            return {
                provider: 'FAL',
                type: parts[1] as 'VIDEO' | 'IMAGE',
                endpoint,
                requestId,
            }
        }
        throw new Error(`无效 FAL externalId: "${externalId}"，TYPE 仅支持 VIDEO/IMAGE`)
    }

    if (externalId.startsWith('ARK:')) {
        const parts = externalId.split(':')
        const type = parts[1]
        const requestId = parts.slice(2).join(':')
        if ((type !== 'VIDEO' && type !== 'IMAGE') || !requestId) {
            throw new Error(`无效 ARK externalId: "${externalId}"，应为 ARK:TYPE:requestId`)
        }
        return {
            provider: 'ARK',
            type: type as 'VIDEO' | 'IMAGE',
            requestId,
        }
    }

    if (externalId.startsWith('GEMINI:')) {
        const parts = externalId.split(':')
        const type = parts[1]
        const requestId = parts.slice(2).join(':')
        if (type !== 'BATCH' || !requestId) {
            throw new Error(`无效 GEMINI externalId: "${externalId}"，应为 GEMINI:BATCH:batchName`)
        }
        return {
            provider: 'GEMINI',
            type: 'BATCH',
            requestId,
        }
    }

    if (externalId.startsWith('GOOGLE:')) {
        const parts = externalId.split(':')
        const type = parts[1]
        const requestId = parts.slice(2).join(':')
        if (type !== 'VIDEO' || !requestId) {
            throw new Error(`无效 GOOGLE externalId: "${externalId}"，应为 GOOGLE:VIDEO:operationName`)
        }
        return {
            provider: 'GOOGLE',
            type: 'VIDEO',
            requestId,
        }
    }

    if (externalId.startsWith('MINIMAX:')) {
        const parts = externalId.split(':')
        const type = parts[1]
        const requestId = parts.slice(2).join(':')
        if ((type !== 'VIDEO' && type !== 'IMAGE') || !requestId) {
            throw new Error(`无效 MINIMAX externalId: "${externalId}"，应为 MINIMAX:TYPE:taskId`)
        }
        return {
            provider: 'MINIMAX',
            type: type as 'VIDEO' | 'IMAGE',
            requestId,
        }
    }

    if (externalId.startsWith('VIDU:')) {
        const parts = externalId.split(':')
        const type = parts[1]
        const requestId = parts.slice(2).join(':')
        if ((type !== 'VIDEO' && type !== 'IMAGE') || !requestId) {
            throw new Error(`无效 VIDU externalId: "${externalId}"，应为 VIDU:TYPE:taskId`)
        }
        return {
            provider: 'VIDU',
            type: type as 'VIDEO' | 'IMAGE',
            requestId,
        }
    }

    if (externalId.startsWith('OPENAI:')) {
        const parts = externalId.split(':')
        const type = parts[1]
        const providerToken = parts[2]
        const requestId = parts.slice(3).join(':')
        if (type !== 'VIDEO' || !providerToken || !requestId) {
            throw new Error(`无效 OPENAI externalId: "${externalId}"，应为 OPENAI:VIDEO:providerToken:videoId`)
        }
        return {
            provider: 'OPENAI',
            type: 'VIDEO',
            providerToken,
            requestId,
        }
    }

    if (externalId.startsWith('OCOMPAT:')) {
        const parts = externalId.split(':')
        const type = parts[1]
        const providerToken = parts[2]
        const modelKeyToken = parts[3]
        const candidateOperation = parts[4]
        const hasOperation = candidateOperation === 'generate' || candidateOperation === 'edit'
        const requestId = hasOperation ? parts.slice(5).join(':') : parts.slice(4).join(':')
        if ((type !== 'VIDEO' && type !== 'IMAGE') || !providerToken || !modelKeyToken || !requestId) {
            throw new Error(`无效 OCOMPAT externalId: "${externalId}"，应为 OCOMPAT:TYPE:providerToken:modelKeyToken:taskId`)
        }
        return {
            provider: 'OCOMPAT',
            type: type as 'VIDEO' | 'IMAGE',
            providerToken,
            modelKeyToken,
            requestId,
            ...(hasOperation ? { templateOperation: candidateOperation as TemplateOperation } : {}),
        }
    }

    if (externalId.startsWith('BAILIAN:')) {
        const parts = externalId.split(':')
        const type = parts[1]
        const requestId = parts.slice(2).join(':')
        if ((type !== 'VIDEO' && type !== 'IMAGE') || !requestId) {
            throw new Error(`无效 BAILIAN externalId: "${externalId}"，应为 BAILIAN:TYPE:requestId`)
        }
        return {
            provider: 'BAILIAN',
            type: type as 'VIDEO' | 'IMAGE',
            requestId,
        }
    }

    if (externalId.startsWith('SILICONFLOW:')) {
        const parts = externalId.split(':')
        const type = parts[1]
        const requestId = parts.slice(2).join(':')
        if ((type !== 'VIDEO' && type !== 'IMAGE') || !requestId) {
            throw new Error(`无效 SILICONFLOW externalId: "${externalId}"，应为 SILICONFLOW:TYPE:requestId`)
        }
        return {
            provider: 'SILICONFLOW',
            type: type as 'VIDEO' | 'IMAGE',
            requestId,
        }
    }

    throw new Error(
        `无法识别的 externalId 格式: "${externalId}". ` +
        `支持的格式: FAL:TYPE:endpoint:requestId, ARK:TYPE:requestId, GEMINI:BATCH:batchName, GOOGLE:VIDEO:operationName, MINIMAX:TYPE:taskId, VIDU:TYPE:taskId, OPENAI:VIDEO:providerToken:videoId, OCOMPAT:TYPE:providerToken:modelKeyToken:taskId, OCOMPAT:TYPE:providerToken:modelKeyToken:operation:taskId, BAILIAN:TYPE:requestId, SILICONFLOW:TYPE:requestId`
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
    _ulogInfo(`[Poll] 解析 ${externalId.slice(0, 30)}... → provider=${parsed.provider}, type=${parsed.type}`)

    switch (parsed.provider) {
        case 'FAL':
            return await pollFalTask(parsed.endpoint!, parsed.requestId, userId)
        case 'ARK':
            return await pollArkTask(parsed.requestId, userId)
        case 'GEMINI':
            return await pollGeminiTask(parsed.requestId, userId)
        case 'GOOGLE':
            return await pollGoogleVideoTask(parsed.requestId, userId)
        case 'MINIMAX':
            return await pollMinimaxTask(parsed.requestId, userId)
        case 'VIDU':
            return await pollViduTask(parsed.requestId, userId)
        case 'OPENAI':
            return await pollOpenAIVideoTask(parsed.requestId, userId, parsed.providerToken)
        case 'OCOMPAT': {
            if (parsed.type !== 'VIDEO' && parsed.type !== 'IMAGE') {
                throw new Error(`无效 OCOMPAT 类型: ${parsed.type}`)
            }
            return await pollOCompatTask(
                parsed.type,
                parsed.requestId,
                userId,
                parsed.providerToken,
                parsed.modelKeyToken,
                parsed.templateOperation,
            )
        }
        case 'BAILIAN':
            return await pollBailianTask(parsed.requestId, userId)
        case 'SILICONFLOW':
            return await pollSiliconFlowTask(parsed.requestId)
        default:
            // 🔥 移除 fallback：未知 provider 直接抛出错误
            throw new Error(`未知的 Provider: ${parsed.provider}`)
    }
}

function decodeProviderId(token: string): string {
    const value = token.trim()
    if (!value) {
        throw new Error('OPENAI_PROVIDER_TOKEN_INVALID')
    }
    if (value.startsWith('u_')) {
        const uuid = value.slice(2).trim()
        if (!PROVIDER_UUID_PATTERN.test(uuid)) {
            throw new Error('OPENAI_PROVIDER_TOKEN_INVALID')
        }
        return `${OPENAI_COMPAT_PROVIDER_PREFIX}${uuid.toLowerCase()}`
    }
    if (PROVIDER_UUID_PATTERN.test(value)) {
        return `${OPENAI_COMPAT_PROVIDER_PREFIX}${value.toLowerCase()}`
    }
    const encoded = value.startsWith('b64_') ? value.slice(4) : value
    try {
        const decoded = Buffer.from(encoded, 'base64url').toString('utf8').trim()
        if (!decoded) {
            throw new Error('OPENAI_PROVIDER_TOKEN_INVALID')
        }
        return decoded
    } catch {
        throw new Error('OPENAI_PROVIDER_TOKEN_INVALID')
    }
}

function decodeModelKey(token: string): string {
    try {
        return Buffer.from(token, 'base64url').toString('utf8')
    } catch {
        throw new Error('OCOMPAT_MODEL_KEY_TOKEN_INVALID')
    }
}

function resolveOCompatModelKey(providerId: string, token: string): string {
    const decoded = decodeModelKey(token).trim()
    if (!decoded) {
        throw new Error('OCOMPAT_MODEL_KEY_TOKEN_INVALID')
    }
    if (decoded.includes('::')) {
        return decoded
    }
    const composed = composeModelKey(providerId, decoded)
    if (!composed) {
        throw new Error('OCOMPAT_MODEL_KEY_TOKEN_INVALID')
    }
    return composed
}

async function pollOCompatTask(
    type: 'VIDEO' | 'IMAGE',
    taskId: string,
    userId: string,
    providerToken?: string,
    modelKeyToken?: string,
    templateOperation?: TemplateOperation,
): Promise<PollResult> {
    if (!providerToken) throw new Error('OCOMPAT_PROVIDER_TOKEN_MISSING')
    if (!modelKeyToken) throw new Error('OCOMPAT_MODEL_KEY_TOKEN_MISSING')
    const providerId = decodeProviderId(providerToken)
    const modelKey = resolveOCompatModelKey(providerId, modelKeyToken)
    const config = await getProviderConfig(userId, providerId)
    if (!config.baseUrl) throw new Error(`PROVIDER_BASE_URL_MISSING: ${providerId}`)

    const models = await getUserModels(userId)
    const model = models.find((item) => item.modelKey === modelKey)
    if (!model || !model.compatMediaTemplate) {
        throw new Error(`OCOMPAT_TEMPLATE_NOT_FOUND: ${modelKey}`)
    }
    const template = resolveTemplateOperation(model.compatMediaTemplate, templateOperation || 'generate')
    if (template.mode !== 'async' || !template.status) {
        throw new Error(`OCOMPAT_TEMPLATE_NOT_ASYNC: ${modelKey}`)
    }

    const variables = buildTemplateVariables({
        model: model.modelId,
        prompt: '',
        taskId,
    })
    const statusRequest = await buildRenderedTemplateRequest({
        baseUrl: config.baseUrl,
        endpoint: template.status,
        variables,
        defaultAuthHeader: `Bearer ${config.apiKey}`,
    })
    const response = await fetch(statusRequest.endpointUrl, {
        method: statusRequest.method,
        headers: statusRequest.headers,
    })
    const rawText = await response.text().catch(() => '')
    if (!response.ok) {
        return {
            status: 'failed',
            error: `OCOMPAT status request failed: ${response.status}`,
        }
    }
    const payload = normalizeResponseJson(rawText)
    const statusRaw = readJsonPath(payload, template.response.statusPath)
    const status = typeof statusRaw === 'string' ? statusRaw.trim().toLowerCase() : ''
    if (!status) {
        return {
            status: 'failed',
            error: 'OCOMPAT status path resolve failed',
        }
    }
    const configuredDoneStates = (template.polling?.doneStates || []).map((item) => item.toLowerCase())
    const doneStates = configuredDoneStates.length > 0
        ? configuredDoneStates
        : ['completed', 'succeeded', 'done']
    const failStates = new Set([
        ...(template.polling?.failStates || []).map((item) => item.toLowerCase()),
        'failed',
        'error',
        'expired',
        'canceled',
        'cancelled',
    ])
    if (doneStates.includes(status)) {
        const outputUrl = resolveOCompatOutputUrl(payload, template.response, type)
        if (outputUrl) {
            return {
                status: 'completed',
                resultUrl: outputUrl,
                ...(type === 'VIDEO'
                    ? { videoUrl: outputUrl }
                    : { imageUrl: outputUrl }),
            }
        }
        if (template.content) {
            const contentRequest = await buildRenderedTemplateRequest({
                baseUrl: config.baseUrl,
                endpoint: template.content,
                variables,
                defaultAuthHeader: `Bearer ${config.apiKey}`,
            })
            return {
                status: 'completed',
                resultUrl: contentRequest.endpointUrl,
                ...(type === 'VIDEO'
                    ? { videoUrl: contentRequest.endpointUrl }
                    : { imageUrl: contentRequest.endpointUrl }),
                downloadHeaders: {
                    ...contentRequest.headers,
                },
            }
        }
        return {
            status: 'failed',
            error: 'OCOMPAT completed but output URL missing',
        }
    }
    if (failStates.has(status)) {
        const errorRaw = readJsonPath(payload, template.response.errorPath)
        return {
            status: 'failed',
            error: typeof errorRaw === 'string' && errorRaw.trim() ? errorRaw.trim() : `OCOMPAT task failed: ${status}`,
        }
    }
    return { status: 'pending' }
}

function extractUrlFromUnknown(value: unknown): string | undefined {
    if (typeof value === 'string') {
        const trimmed = value.trim()
        return trimmed || undefined
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const nested = extractUrlFromUnknown(item)
            if (nested) return nested
        }
        return undefined
    }

    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>
        const directUrl = extractUrlFromUnknown(record.url)
        if (directUrl) return directUrl
        const videoUrl = extractUrlFromUnknown(record.video_url)
        if (videoUrl) return videoUrl
        const outputUrl = extractUrlFromUnknown(record.output_url)
        if (outputUrl) return outputUrl
    }

    return undefined
}

function resolveOCompatOutputUrl(
    payload: unknown,
    response: {
        outputUrlPath?: string
        outputUrlsPath?: string
    },
    type: 'VIDEO' | 'IMAGE',
): string | undefined {
    const candidates: unknown[] = []
    if (response.outputUrlPath) {
        candidates.push(readJsonPath(payload, response.outputUrlPath))
    }
    if (response.outputUrlsPath) {
        candidates.push(readJsonPath(payload, response.outputUrlsPath))
    }

    // xAI / gateway compatibility fallback:
    // older stored templates may have stale outputUrlPath, while upstream uses nested shapes like $.video.url.
    const fallbackPaths = type === 'VIDEO'
        ? ['$.video.url', '$.output_url', '$.video_url', '$.result.video.url', '$.result.url', '$.url', '$.data[0].url']
        : ['$.data[0].url', '$.url', '$.image.url', '$.result.url', '$.output_url']
    for (const path of fallbackPaths) {
        candidates.push(readJsonPath(payload, path))
    }

    for (const candidate of candidates) {
        const resolved = extractUrlFromUnknown(candidate)
        if (resolved) return resolved
    }
    return undefined
}

async function pollOpenAIVideoTask(
    videoId: string,
    userId: string,
    providerToken?: string,
): Promise<PollResult> {
    if (!providerToken) {
        throw new Error('OPENAI_PROVIDER_TOKEN_MISSING')
    }
    const providerId = decodeProviderId(providerToken)
    const config = await getProviderConfig(userId, providerId)
    if (!config.baseUrl) {
        throw new Error(`PROVIDER_BASE_URL_MISSING: ${config.id}`)
    }

    // Use raw fetch instead of SDK to handle varying response formats across gateways
    const baseUrl = config.baseUrl.replace(/\/+$/, '')
    const pollUrl = `${baseUrl}/videos/${encodeURIComponent(videoId)}`
    const response = await fetch(pollUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${config.apiKey}` },
    })

    if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`OPENAI_VIDEO_POLL_FAILED: ${response.status} ${text.slice(0, 200)}`)
    }

    const task = await response.json() as Record<string, unknown>
    const status = typeof task.status === 'string' ? task.status : ''

    // Pending statuses: OpenAI uses "queued"/"in_progress", some gateways use "processing"
    if (status === 'queued' || status === 'in_progress' || status === 'processing') {
        return { status: 'pending' }
    }

    if (status === 'failed') {
        const errorObj = task.error as Record<string, unknown> | undefined
        const message = (typeof errorObj?.message === 'string' ? errorObj.message : '')
            || (typeof task.error === 'string' ? task.error : '')
            || `OpenAI video task failed: ${videoId}`
        return { status: 'failed', error: message }
    }

    if (status !== 'completed') {
        // Unknown status, treat as pending
        return { status: 'pending' }
    }

    // Completed: prefer video_url from response body (some gateways provide it directly)
    const videoUrl = typeof task.video_url === 'string' ? task.video_url.trim() : ''
    if (videoUrl) {
        return {
            status: 'completed',
            videoUrl,
            resultUrl: videoUrl,
        }
    }

    // Fallback: OpenAI standard /videos/:id/content endpoint
    const taskId = typeof task.id === 'string' ? task.id : videoId
    const contentUrl = `${baseUrl}/videos/${encodeURIComponent(taskId)}/content`
    return {
        status: 'completed',
        videoUrl: contentUrl,
        resultUrl: contentUrl,
        downloadHeaders: {
            Authorization: `Bearer ${config.apiKey}`,
        },
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
    const { apiKey } = await getProviderConfig(userId, 'fal')
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
    const { apiKey } = await getProviderConfig(userId, 'ark')
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
    const { apiKey } = await getProviderConfig(userId, 'google')
    const result = await queryGeminiBatchStatus(batchName, apiKey)

    return {
        status: result.status,
        imageUrl: result.imageUrl,
        resultUrl: result.imageUrl,
        error: result.error
    }
}

/**
 * Google Veo 视频任务轮询
 */
async function pollGoogleVideoTask(
    operationName: string,
    userId: string
): Promise<PollResult> {
    const { apiKey } = await getProviderConfig(userId, 'google')
    const result = await queryGoogleVideoStatus(operationName, apiKey)

    return {
        status: result.status,
        videoUrl: result.videoUrl,
        resultUrl: result.videoUrl,
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
    const { apiKey } = await getProviderConfig(userId, 'minimax')
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
            _ulogError(`${logPrefix} 查询失败:`, response.status, errorText)
            return {
                status: 'failed',
                error: `查询失败: ${response.status}`
            }
        }

        const data = await response.json()

        // 检查响应
        if (data.base_resp?.status_code !== 0) {
            const errMsg = data.base_resp?.status_msg || '未知错误'
            _ulogError(`${logPrefix} task_id=${taskId} 错误:`, errMsg)
            return {
                status: 'failed',
                error: errMsg
            }
        }

        const status = data.status

        if (status === 'Success') {
            const fileId = data.file_id
            if (!fileId) {
                _ulogError(`${logPrefix} task_id=${taskId} 成功但无file_id`)
                return {
                    status: 'failed',
                    error: '任务完成但未返回视频'
                }
            }

            // 🔥 使用 file_id 调用文件检索API获取真实下载URL
            _ulogInfo(`${logPrefix} task_id=${taskId} 完成，正在获取下载URL...`)
            try {
                const fileResponse = await fetch(`https://api.minimaxi.com/v1/files/retrieve?file_id=${fileId}`, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`
                    }
                })

                if (!fileResponse.ok) {
                    const errorText = await fileResponse.text()
                    _ulogError(`${logPrefix} 文件检索失败:`, fileResponse.status, errorText)
                    return {
                        status: 'failed',
                        error: `文件检索失败: ${fileResponse.status}`
                    }
                }

                const fileData = await fileResponse.json()
                const downloadUrl = fileData.file?.download_url

                if (!downloadUrl) {
                    _ulogError(`${logPrefix} 文件检索成功但无download_url:`, fileData)
                    return {
                        status: 'failed',
                        error: '无法获取视频下载链接'
                    }
                }

                _ulogInfo(`${logPrefix} 获取下载URL成功: ${downloadUrl.substring(0, 80)}...`)
                return {
                    status: 'completed',
                    videoUrl: downloadUrl
                }
            } catch (error: unknown) {
                const errorMessage = getErrorMessage(error)
                _ulogError(`${logPrefix} 文件检索异常:`, error)
                return {
                    status: 'failed',
                    error: `文件检索失败: ${errorMessage}`
                }
            }
        } else if (status === 'Failed') {
            const errMsg = data.error_message || '生成失败'
            _ulogError(`${logPrefix} task_id=${taskId} 失败:`, errMsg)
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
    } catch (error: unknown) {
        const errorMessage = getErrorMessage(error)
        _ulogError(`${logPrefix} task_id=${taskId} 异常:`, error)
        return {
            status: 'failed',
            error: errorMessage
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
    _ulogInfo(`[Poll Vidu] 开始轮询 task_id=${taskId}, userId=${userId}`)

    const { apiKey } = await getProviderConfig(userId, 'vidu')
    _ulogInfo(`[Poll Vidu] API Key 长度: ${apiKey?.length || 0}`)

    const result = await queryViduTaskStatus(taskId, apiKey)
    _ulogInfo(`[Poll Vidu] 查询结果:`, result)

    return {
        status: result.status,
        videoUrl: result.videoUrl,
        resultUrl: result.videoUrl,
        error: result.error
    }
}

interface BailianTaskQueryResultItem {
    url?: string
    video_url?: string
    image_url?: string
}

interface BailianTaskQueryResponse {
    code?: string
    message?: string
    task_status?: string
    output?: {
        task_status?: string
        code?: string
        message?: string
        video_url?: string
        image_url?: string
        results?: BailianTaskQueryResultItem[]
    }
}

function readBailianTaskQueryMediaUrl(data: BailianTaskQueryResponse): {
    mediaUrl?: string
    videoUrl?: string
    imageUrl?: string
} {
    const output = data.output
    const videoUrl = typeof output?.video_url === 'string' ? output.video_url.trim() : ''
    if (videoUrl) {
        return { mediaUrl: videoUrl, videoUrl }
    }

    const imageUrl = typeof output?.image_url === 'string' ? output.image_url.trim() : ''
    if (imageUrl) {
        return { mediaUrl: imageUrl, imageUrl }
    }

    const firstResult = Array.isArray(output?.results) ? output.results[0] : undefined
    if (!firstResult || typeof firstResult !== 'object') {
        return {}
    }
    const firstVideoUrl = typeof firstResult.video_url === 'string' ? firstResult.video_url.trim() : ''
    if (firstVideoUrl) {
        return { mediaUrl: firstVideoUrl, videoUrl: firstVideoUrl }
    }
    const firstImageUrl = typeof firstResult.image_url === 'string' ? firstResult.image_url.trim() : ''
    if (firstImageUrl) {
        return { mediaUrl: firstImageUrl, imageUrl: firstImageUrl }
    }
    const firstUrl = typeof firstResult.url === 'string' ? firstResult.url.trim() : ''
    if (firstUrl) {
        return { mediaUrl: firstUrl }
    }

    return {}
}

async function pollBailianTask(requestId: string, userId: string): Promise<PollResult> {
    const logPrefix = '[Bailian Query]'

    try {
        const { apiKey } = await getProviderConfig(userId, 'bailian')
        const response = await fetch(
            `https://dashscope.aliyuncs.com/api/v1/tasks/${encodeURIComponent(requestId)}`,
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                },
            },
        )

        const raw = await response.text()
        let data: BailianTaskQueryResponse = {}
        if (raw) {
            try {
                const parsed = JSON.parse(raw) as unknown
                if (parsed && typeof parsed === 'object') {
                    data = parsed as BailianTaskQueryResponse
                } else {
                    throw new Error('BAILIAN_TASK_QUERY_RESPONSE_INVALID')
                }
            } catch {
                throw new Error('BAILIAN_TASK_QUERY_RESPONSE_INVALID_JSON')
            }
        }

        const outputCode = typeof data.output?.code === 'string' ? data.output.code.trim() : ''
        const outputMessage = typeof data.output?.message === 'string' ? data.output.message.trim() : ''
        const topLevelCode = typeof data.code === 'string' ? data.code.trim() : ''
        const topLevelMessage = typeof data.message === 'string' ? data.message.trim() : ''
        const resolvedCode = outputCode || topLevelCode
        const resolvedMessage = outputMessage || topLevelMessage

        if (!response.ok) {
            return {
                status: 'failed',
                error: `Bailian: 查询失败 ${response.status} ${resolvedCode || resolvedMessage}`.trim(),
            }
        }

        const taskStatus = (typeof data.output?.task_status === 'string'
            ? data.output.task_status
            : typeof data.task_status === 'string'
                ? data.task_status
                : '').trim().toUpperCase()

        if (taskStatus === 'FAILED' || taskStatus === 'CANCELED' || taskStatus === 'CANCELLED') {
            return {
                status: 'failed',
                error: `Bailian: ${resolvedCode || resolvedMessage || '任务失败'}`,
            }
        }

        if (taskStatus === 'SUCCEEDED' || taskStatus === 'SUCCESS') {
            const { mediaUrl, videoUrl, imageUrl } = readBailianTaskQueryMediaUrl(data)
            if (!mediaUrl) {
                return {
                    status: 'failed',
                    error: 'Bailian: 任务完成但未返回结果URL',
                }
            }
            return {
                status: 'completed',
                resultUrl: mediaUrl,
                videoUrl,
                imageUrl,
            }
        }

        return {
            status: 'pending',
        }
    } catch (error: unknown) {
        const errorMessage = getErrorMessage(error)
        _ulogError(`${logPrefix} task_id=${requestId} 异常:`, error)
        return {
            status: 'failed',
            error: `Bailian: ${errorMessage}`,
        }
    }
}

async function pollSiliconFlowTask(requestId: string): Promise<PollResult> {
    return {
        status: 'failed',
        error: `ASYNC_POLL_NOT_IMPLEMENTED: SILICONFLOW task polling not implemented (${requestId})`,
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
        _ulogInfo(`${logPrefix} 查询任务 task_id=${taskId}`)

        // 🔥 正确的查询接口路径：/tasks/{id}/creations
        const response = await fetch(`https://api.vidu.cn/ent/v2/tasks/${taskId}/creations`, {
            headers: {
                'Authorization': `Token ${apiKey}`
            }
        })

        _ulogInfo(`${logPrefix} HTTP状态: ${response.status}`)

        if (!response.ok) {
            const errorText = await response.text()
            _ulogError(`${logPrefix} 查询失败:`, response.status, errorText)
            return {
                status: 'failed',
                error: `Vidu: 查询失败 ${response.status}`
            }
        }

        const data = await response.json()
        _ulogInfo(`${logPrefix} 响应数据:`, JSON.stringify(data, null, 2))

        // 检查任务状态
        const state = data.state

        if (state === 'success') {
            // 🔥 任务成功，从 creations 数组中获取视频URL
            const creations = data.creations
            if (!creations || creations.length === 0) {
                _ulogError(`${logPrefix} task_id=${taskId} 成功但无生成物`)
                return {
                    status: 'failed',
                    error: 'Vidu: 任务完成但未返回视频'
                }
            }

            const videoUrl = creations[0].url
            if (!videoUrl) {
                _ulogError(`${logPrefix} task_id=${taskId} 成功但生成物无URL`)
                return {
                    status: 'failed',
                    error: 'Vidu: 任务完成但未返回视频URL'
                }
            }

            _ulogInfo(`${logPrefix} task_id=${taskId} 完成，视频URL: ${videoUrl.substring(0, 80)}...`)
            return {
                status: 'completed',
                videoUrl: videoUrl
            }
        } else if (state === 'failed') {
            // 🔥 使用 err_code 作为错误消息，添加 Vidu: 前缀便于错误码映射
            const errCode = data.err_code || 'Unknown'
            _ulogError(`${logPrefix} task_id=${taskId} 失败: ${errCode}`)
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
    } catch (error: unknown) {
        const errorMessage = getErrorMessage(error)
        _ulogError(`${logPrefix} task_id=${taskId} 异常:`, error)
        return {
            status: 'failed',
            error: `Vidu: ${errorMessage}`  // 添加前缀
        }
    }
}

// ==================== 格式化辅助函数 ====================

/**
 * 创建标准格式的 externalId
 */
export function formatExternalId(
    provider: 'FAL' | 'ARK' | 'GEMINI' | 'GOOGLE' | 'MINIMAX' | 'VIDU' | 'OPENAI' | 'OCOMPAT' | 'BAILIAN' | 'SILICONFLOW',
    type: 'VIDEO' | 'IMAGE' | 'BATCH',
    requestId: string,
    endpoint?: string,
    providerToken?: string,
    modelKeyToken?: string,
): string {
    if (provider === 'FAL') {
        if (!endpoint) {
            throw new Error('FAL externalId requires endpoint')
        }
        return `FAL:${type}:${endpoint}:${requestId}`
    }
    if (provider === 'OPENAI') {
        if (!providerToken) {
            throw new Error('OPENAI externalId requires providerToken')
        }
        return `OPENAI:${type}:${providerToken}:${requestId}`
    }
    if (provider === 'OCOMPAT') {
        if (!providerToken) {
            throw new Error('OCOMPAT externalId requires providerToken')
        }
        if (!modelKeyToken) {
            throw new Error('OCOMPAT externalId requires modelKeyToken')
        }
        return `OCOMPAT:${type}:${providerToken}:${modelKeyToken}:${requestId}`
    }
    return `${provider}:${type}:${requestId}`
}
