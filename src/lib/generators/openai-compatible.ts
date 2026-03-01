import OpenAI from 'openai'
import {
    BaseImageGenerator,
    BaseVideoGenerator,
    type GenerateResult,
    type ImageGenerateParams,
    type VideoGenerateParams,
} from './base'
import { getProviderConfig } from '@/lib/api-config'
import { toFetchableUrl } from '@/lib/cos'

type UnknownRecord = Record<string, unknown>

const IMAGE_ALLOWED_OPTION_KEYS = new Set([
    'provider',
    'modelId',
    'modelKey',
    'aspectRatio',
    'resolution',
    'size',
    'outputFormat',
])

const VIDEO_ALLOWED_OPTION_KEYS = new Set([
    'provider',
    'modelId',
    'modelKey',
    'prompt',
    'duration',
    'fps',
    'resolution',
    'aspectRatio',
    'generateAudio',
    'lastFrameImageUrl',
    'preset',
])

function asRecord(value: unknown): UnknownRecord | null {
    return value && typeof value === 'object' ? (value as UnknownRecord) : null
}

function getByPath(value: unknown, path: string): unknown {
    const tokens = path.split('.')
    let current: unknown = value

    for (const token of tokens) {
        if (Array.isArray(current)) {
            const index = Number.parseInt(token, 10)
            if (!Number.isFinite(index) || index < 0 || index >= current.length) {
                return undefined
            }
            current = current[index]
            continue
        }

        const record = asRecord(current)
        if (!record) return undefined
        current = record[token]
    }

    return current
}

function pickFirstStringByPaths(value: unknown, paths: readonly string[]): string | null {
    for (const path of paths) {
        const candidate = getByPath(value, path)
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate.trim()
        }
    }

    if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim()
    }

    return null
}

function extractUrlFromHtml(html: string): string | null {
    const sourceMatch = html.match(/<source[^>]+src=["']([^"']+)["']/i)
    if (sourceMatch?.[1]) return normalizeExtractedUrl(sourceMatch[1])

    const videoMatch = html.match(/<video[^>]+src=["']([^"']+)["']/i)
    if (videoMatch?.[1]) return normalizeExtractedUrl(videoMatch[1])

    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i)
    if (iframeMatch?.[1]) return normalizeExtractedUrl(iframeMatch[1])

    const urlMatch = html.match(/https?:\/\/[^\s"'<>]+/i)
    if (urlMatch?.[0]) return normalizeExtractedUrl(urlMatch[0])

    return null
}

function decodeHtmlAmp(value: string): string {
    return value.replace(/&amp;/g, '&').trim()
}

function normalizeExtractedUrl(value: string): string {
    return decodeHtmlAmp(value)
        .replace(/\\n/g, '')
        .replace(/\\r/g, '')
        .trim()
}

function pickFirstRawStringByPaths(value: unknown, paths: readonly string[]): string | null {
    for (const path of paths) {
        const candidate = getByPath(value, path)
        if (typeof candidate === 'string' && candidate.length > 0) {
            return candidate
        }
    }

    if (typeof value === 'string' && value.length > 0) {
        return value
    }

    return null
}

const SSE_TEXT_PATHS: readonly string[] = [
    'choices.0.delta.content',
    'choices.0.message.content',
    'choices.0.message.content.0.text',
]

function extractTextFromSsePayload(payload: string): string | null {
    if (!payload.includes('data:')) return null

    const parts: string[] = []
    const lines = payload.split(/\r?\n/)
    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const rawData = trimmed.slice(5).trim()
        if (!rawData || rawData === '[DONE]') continue

        try {
            const parsed = JSON.parse(rawData) as unknown
            const delta = pickFirstRawStringByPaths(parsed, SSE_TEXT_PATHS)
            if (delta) {
                parts.push(delta)
            }
        } catch {
            // Ignore malformed chunks and keep parsing.
        }
    }

    if (parts.length === 0) return null
    return parts.join('')
}

function extractUrlFromSsePayload(payload: string): string | null {
    if (!payload.includes('data:')) return null

    const lines = payload.split(/\r?\n/)
    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const rawData = trimmed.slice(5).trim()
        if (!rawData || rawData === '[DONE]') continue

        try {
            const parsed = JSON.parse(rawData) as unknown
            const delta = pickFirstRawStringByPaths(parsed, SSE_TEXT_PATHS)
            if (!delta) continue
            const extracted = extractUrlFromHtml(delta)
            if (extracted) return extracted
        } catch {
            // Ignore malformed chunks and keep parsing.
        }
    }

    const text = extractTextFromSsePayload(payload)
    if (!text) return null
    return extractUrlFromHtml(text)
}

function ensureAllowedOptionKeys(
    options: Record<string, unknown>,
    allowedKeys: Set<string>,
    errorPrefix: string,
) {
    for (const [key, value] of Object.entries(options)) {
        if (value === undefined) continue
        if (!allowedKeys.has(key)) {
            throw new Error(`${errorPrefix}_OPTION_UNSUPPORTED: ${key}`)
        }
    }
}

function normalizeSize(rawSize: string, field: string, errorPrefix: string): string {
    const size = rawSize.trim().toLowerCase()
    if (size === 'auto') return 'auto'

    if (/^\d{2,5}x\d{2,5}$/i.test(size)) {
        return size
    }

    throw new Error(`${errorPrefix}_OPTION_VALUE_UNSUPPORTED: ${field}=${rawSize}`)
}

function mapAspectRatioToImageSize(aspectRatio: string): string {
    switch (aspectRatio.trim()) {
        case '1:1':
            return '1024x1024'
        case '3:4':
            return '1024x1536'
        case '9:16':
            // OpenAI-compatible image endpoints generally expose limited portrait sizes.
            return '1024x1536'
        case '3:2':
            return '1792x1024'
        case '16:9':
            return '1792x1024'
        case '4:3':
            return '1536x1024'
        default:
            throw new Error(`OPENAI_COMPATIBLE_IMAGE_OPTION_VALUE_UNSUPPORTED: aspectRatio=${aspectRatio}`)
    }
}

function resolveImageSize(options: Record<string, unknown>): string | undefined {
    const size = typeof options.size === 'string' ? options.size : undefined
    const resolution = typeof options.resolution === 'string' ? options.resolution : undefined
    const aspectRatio = typeof options.aspectRatio === 'string' ? options.aspectRatio : undefined

    if (size) return normalizeSize(size, 'size', 'OPENAI_COMPATIBLE_IMAGE')
    if (resolution) return normalizeSize(resolution, 'resolution', 'OPENAI_COMPATIBLE_IMAGE')
    if (aspectRatio) return mapAspectRatioToImageSize(aspectRatio)

    return undefined
}

function normalizeImageDataUrl(base64: string): string {
    if (base64.startsWith('data:image/')) return base64
    return `data:image/png;base64,${base64}`
}

function parseImageFromMessageContent(content: unknown): GenerateResult | null {
    if (typeof content === 'string') {
        const trimmed = content.trim()
        if (!trimmed) return null

        if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')) {
            return {
                success: true,
                imageUrl: trimmed,
            }
        }

        if (trimmed.startsWith('data:image/')) {
            return {
                success: true,
                imageUrl: trimmed,
            }
        }

        const markdownMatch = trimmed.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i)
        if (markdownMatch?.[1]) {
            return {
                success: true,
                imageUrl: normalizeExtractedUrl(markdownMatch[1]),
            }
        }

        const fromSse = extractUrlFromSsePayload(trimmed)
        if (fromSse) {
            return {
                success: true,
                imageUrl: fromSse,
            }
        }

        const extractedUrl = extractUrlFromHtml(trimmed)
        if (extractedUrl) {
            return {
                success: true,
                imageUrl: extractedUrl,
            }
        }

        return null
    }

    if (Array.isArray(content)) {
        for (const item of content) {
            const parsed = parseImageFromMessageContent(item)
            if (parsed) return parsed
        }
        return null
    }

    const record = asRecord(content)
    if (!record) return null

    const imageUrl = pickFirstStringByPaths(record, [
        'image_url.url',
        'image_url',
        'url',
        'output_url',
        'result.url',
    ])
    if (imageUrl) {
        return {
            success: true,
            imageUrl,
        }
    }

    const base64 = pickFirstStringByPaths(record, [
        'image_base64',
        'b64_json',
        'base64',
    ])
    if (base64) {
        return {
            success: true,
            imageBase64: base64,
            imageUrl: normalizeImageDataUrl(base64),
        }
    }

    const text = pickFirstStringByPaths(record, [
        'text',
        'output_text',
        'content',
    ])
    if (text) {
        return parseImageFromMessageContent(text)
    }

    return null
}

function parseImageResult(response: unknown): GenerateResult {
    const directUrl = pickFirstStringByPaths(response, IMAGE_URL_PATHS)
    if (directUrl) {
        const parsedDirectUrl = parseImageFromMessageContent(directUrl)
        if (parsedDirectUrl) {
            return parsedDirectUrl
        }
    }

    const base64 = pickFirstStringByPaths(response, IMAGE_BASE64_PATHS)
    if (base64) {
        return {
            success: true,
            imageBase64: base64,
            imageUrl: normalizeImageDataUrl(base64),
        }
    }

    const html = pickFirstStringByPaths(response, IMAGE_HTML_PATHS)
    if (html) {
        const extractedUrl = extractUrlFromHtml(html)
        if (extractedUrl) {
            return {
                success: true,
                imageUrl: extractedUrl,
            }
        }
    }

    const messageContent = getByPath(response, 'choices.0.message.content')
    const parsedMessageContent = parseImageFromMessageContent(messageContent)
    if (parsedMessageContent) {
        return parsedMessageContent
    }

    const parsedWholeResponse = parseImageFromMessageContent(response)
    if (parsedWholeResponse) {
        return parsedWholeResponse
    }

    throw new Error('OPENAI_COMPATIBLE_IMAGE_RESULT_UNSUPPORTED: expected image url/base64/html response')
}

function normalizeReferenceImagesForEdit(referenceImages: string[]): string[] {
    const normalized: string[] = []
    for (let index = 0; index < referenceImages.length; index += 1) {
        const raw = referenceImages[index]
        if (typeof raw !== 'string') {
            throw new Error(`OPENAI_COMPATIBLE_IMAGE_REFERENCE_INVALID: referenceImages[${index}] must be string`)
        }

        const trimmed = raw.trim()
        if (!trimmed) {
            throw new Error(`OPENAI_COMPATIBLE_IMAGE_REFERENCE_INVALID: referenceImages[${index}] is empty`)
        }
        normalized.push(toFetchableUrl(trimmed))
    }
    return normalized
}

function normalizeVideoDataUrl(base64: string): string {
    if (base64.startsWith('data:video/')) return base64
    return `data:video/mp4;base64,${base64}`
}

const IMAGE_URL_PATHS: readonly string[] = [
    'data.0.url',
    'url',
    'image_url',
    'choices.0.message.image_url.url',
    'choices.0.message.image_url',
    'choices.0.message.content.0.image_url.url',
    'choices.0.message.content.0.image_url',
    'choices.0.message.content.0.url',
    'output.url',
    'output_url',
    'result.url',
    'result.image_url',
]

const IMAGE_BASE64_PATHS: readonly string[] = [
    'data.0.b64_json',
    'b64_json',
    'data.0.base64',
    'base64',
    'image_base64',
    'choices.0.message.image_base64',
    'choices.0.message.b64_json',
    'choices.0.message.content.0.image_base64',
    'choices.0.message.content.0.b64_json',
    'choices.0.message.content.0.base64',
]

const IMAGE_HTML_PATHS: readonly string[] = [
    'html',
    'output_html',
    'result.html',
    'data.0.html',
]

const VIDEO_URL_PATHS: readonly string[] = [
    'video_url',
    'url',
    'data',
    'choices.0.message.content',
    'choices.0.message.content.0.text',
    'output_url',
    'result.url',
    'result.video_url',
    'data.0.url',
    'data.0.video_url',
]

const VIDEO_BASE64_PATHS: readonly string[] = [
    'video_base64',
    'base64',
    'b64_json',
    'data.0.base64',
    'data.0.b64_json',
]

const VIDEO_HTML_PATHS: readonly string[] = [
    'html',
    'video_html',
    'output_html',
    'result.html',
    'data.0.html',
]

export class OpenAICompatibleImageGenerator extends BaseImageGenerator {
    private readonly modelId: string
    private readonly providerId: string

    constructor(modelId?: string, providerId?: string) {
        super()
        this.modelId = modelId || 'gpt-image-1'
        this.providerId = providerId || 'openai-compatible'
    }

    protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
        const { userId, prompt, referenceImages = [], options = {} } = params
        ensureAllowedOptionKeys(options, IMAGE_ALLOWED_OPTION_KEYS, 'OPENAI_COMPATIBLE_IMAGE')

        const providerConfig = await getProviderConfig(userId, this.providerId)
        if (!providerConfig.baseUrl) {
            throw new Error(`PROVIDER_BASE_URL_MISSING: ${this.providerId} (image)`)
        }

        const client = new OpenAI({
            baseURL: providerConfig.baseUrl,
            apiKey: providerConfig.apiKey,
        })

        const modelId = typeof options.modelId === 'string' && options.modelId.trim().length > 0
            ? options.modelId.trim()
            : this.modelId
        const size = resolveImageSize(options)
        const outputFormat = typeof options.outputFormat === 'string' && options.outputFormat.trim().length > 0
            ? options.outputFormat.trim().toLowerCase()
            : undefined

        const normalizedReferenceImages = normalizeReferenceImagesForEdit(referenceImages)
        const promptText = prompt.trim()
        const finalPrompt = promptText || 'Generate a high-quality image.'
        const content: UnknownRecord[] = [
            {
                type: 'text',
                text: finalPrompt,
            },
        ]
        for (const referenceImage of normalizedReferenceImages) {
            content.push({
                type: 'image_url',
                image_url: {
                    url: referenceImage,
                },
            })
        }

        const requestBody: Record<string, unknown> = {
            model: modelId,
            messages: [{
                role: 'user',
                content,
            }],
            stream: false,
            image_config: {
                response_format: 'b64_json',
                ...(size ? { size } : {}),
                ...(outputFormat ? { output_format: outputFormat } : {}),
            },
        }

        const response = await client.chat.completions.create(requestBody as never)
        return parseImageResult(response)
    }
}

export class OpenAICompatibleVideoGenerator extends BaseVideoGenerator {
    private readonly modelId: string
    private readonly providerId: string

    constructor(modelId?: string, providerId?: string) {
        super()
        this.modelId = modelId || 'sora-2'
        this.providerId = providerId || 'openai-compatible'
    }

    protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
        const { userId, imageUrl, prompt, options = {} } = params
        ensureAllowedOptionKeys(options, VIDEO_ALLOWED_OPTION_KEYS, 'OPENAI_COMPATIBLE_VIDEO')

        const providerConfig = await getProviderConfig(userId, this.providerId)
        if (!providerConfig.baseUrl) {
            throw new Error(`PROVIDER_BASE_URL_MISSING: ${this.providerId} (video)`)
        }

        const promptText = typeof prompt === 'string' ? prompt.trim() : ''

        const client = new OpenAI({
            baseURL: providerConfig.baseUrl,
            apiKey: providerConfig.apiKey,
        })

        const modelId = typeof options.modelId === 'string' && options.modelId.trim().length > 0
            ? options.modelId.trim()
            : this.modelId

        const requestBody: Record<string, unknown> = {
            model: modelId,
            messages: [],
            stream: false,
        }

        const finalPrompt = promptText || 'Generate a high-quality video.'
        const normalizedImageUrl = imageUrl ? toFetchableUrl(imageUrl) : ''
        if (normalizedImageUrl) {
            requestBody.messages = [{
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: finalPrompt,
                    },
                    {
                        type: 'image_url',
                        image_url: {
                            url: normalizedImageUrl,
                        },
                    },
                ],
            }]
        } else {
            requestBody.messages = [{
                role: 'user',
                content: finalPrompt,
            }]
        }

        const videoConfig: Record<string, unknown> = {}
        if (typeof options.aspectRatio === 'string' && options.aspectRatio.trim().length > 0) {
            videoConfig.aspect_ratio = options.aspectRatio.trim()
        }
        if (typeof options.duration === 'number' && Number.isFinite(options.duration)) {
            videoConfig.video_length = options.duration
        }
        if (typeof options.resolution === 'string' && options.resolution.trim().length > 0) {
            videoConfig.resolution_name = options.resolution.trim()
        }
        if (typeof options.preset === 'string' && options.preset.trim().length > 0) {
            videoConfig.preset = options.preset.trim()
        }

        if (Object.keys(videoConfig).length > 0) {
            requestBody.video_config = videoConfig
        }

        const response = await client.chat.completions.create(requestBody as never)

        const directUrl = pickFirstStringByPaths(response, VIDEO_URL_PATHS)
        if (directUrl) {
            const trimmedDirect = directUrl.trim()
            if (/^https?:\/\//i.test(trimmedDirect)) {
                return {
                    success: true,
                    videoUrl: trimmedDirect,
                }
            }

            const fromSse = extractUrlFromSsePayload(trimmedDirect)
            if (fromSse) {
                return {
                    success: true,
                    videoUrl: fromSse,
                }
            }

            const extractedInline = extractUrlFromHtml(trimmedDirect)
            if (extractedInline) {
                return {
                    success: true,
                    videoUrl: extractedInline,
                }
            }
            if (trimmedDirect.startsWith('data:video/')) {
                return {
                    success: true,
                    videoUrl: trimmedDirect,
                }
            }
        }

        const html = pickFirstStringByPaths(response, VIDEO_HTML_PATHS)
        if (html) {
            const extractedUrl = extractUrlFromHtml(html)
            if (extractedUrl) {
                return {
                    success: true,
                    videoUrl: extractedUrl,
                }
            }
        }

        const base64 = pickFirstStringByPaths(response, VIDEO_BASE64_PATHS)
        if (base64) {
            return {
                success: true,
                videoUrl: normalizeVideoDataUrl(base64),
            }
        }

        throw new Error('OPENAI_COMPATIBLE_VIDEO_RESULT_UNSUPPORTED: expected video url/html/base64 response')
    }
}
