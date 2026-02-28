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
    if (sourceMatch?.[1]) return decodeHtmlAmp(sourceMatch[1])

    const videoMatch = html.match(/<video[^>]+src=["']([^"']+)["']/i)
    if (videoMatch?.[1]) return decodeHtmlAmp(videoMatch[1])

    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i)
    if (iframeMatch?.[1]) return decodeHtmlAmp(iframeMatch[1])

    const urlMatch = html.match(/https?:\/\/[^\s"'<>]+/i)
    if (urlMatch?.[0]) return decodeHtmlAmp(urlMatch[0])

    return null
}

function decodeHtmlAmp(value: string): string {
    return value.replace(/&amp;/g, '&').trim()
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
        case '3:2':
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

function mapAspectRatioToVideoSize(aspectRatio: string): string {
    switch (aspectRatio.trim()) {
        case '16:9':
            return '1792x1024'
        case '3:2':
            return '1536x1024'
        case '9:16':
            return '1024x1792'
        case '1:1':
            return '1024x1024'
        default:
            throw new Error(`OPENAI_COMPATIBLE_VIDEO_OPTION_VALUE_UNSUPPORTED: aspectRatio=${aspectRatio}`)
    }
}

function resolveVideoSize(options: Record<string, unknown>): string | undefined {
    const resolution = typeof options.resolution === 'string' ? options.resolution : undefined
    const aspectRatio = typeof options.aspectRatio === 'string' ? options.aspectRatio : undefined

    if (resolution) {
        return normalizeSize(resolution, 'resolution', 'OPENAI_COMPATIBLE_VIDEO')
    }

    if (aspectRatio) {
        return mapAspectRatioToVideoSize(aspectRatio)
    }

    return undefined
}

function normalizeImageDataUrl(base64: string): string {
    if (base64.startsWith('data:image/')) return base64
    return `data:image/png;base64,${base64}`
}

function normalizeVideoDataUrl(base64: string): string {
    if (base64.startsWith('data:video/')) return base64
    return `data:video/mp4;base64,${base64}`
}

const IMAGE_URL_PATHS: readonly string[] = [
    'data.0.url',
    'url',
    'image_url',
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

        if (referenceImages.length > 0) {
            throw new Error('OPENAI_COMPATIBLE_IMAGE_REFERENCE_UNSUPPORTED: referenceImages is not supported yet')
        }

        const providerConfig = await getProviderConfig(userId, this.providerId)
        if (!providerConfig.baseUrl) {
            throw new Error(`PROVIDER_BASE_URL_MISSING: ${this.providerId} (image)`)
        }

        const client = new OpenAI({
            baseURL: providerConfig.baseUrl,
            apiKey: providerConfig.apiKey,
        })

        const size = resolveImageSize(options)
        const outputFormat = typeof options.outputFormat === 'string' && options.outputFormat.trim().length > 0
            ? options.outputFormat.trim().toLowerCase()
            : undefined

        const requestBody: Record<string, unknown> = {
            model: this.modelId,
            prompt,
            response_format: 'b64_json',
            ...(size ? { size } : {}),
            ...(outputFormat ? { output_format: outputFormat } : {}),
        }

        const response = await client.images.generate(requestBody as never)

        const directUrl = pickFirstStringByPaths(response, IMAGE_URL_PATHS)
        if (directUrl) {
            return {
                success: true,
                imageUrl: directUrl,
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

        throw new Error('OPENAI_COMPATIBLE_IMAGE_RESULT_UNSUPPORTED: expected image url/base64/html response')
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
            prompt: promptText,
        }

        if (imageUrl) {
            requestBody.input_reference = toFetchableUrl(imageUrl)
            requestBody.image_url = toFetchableUrl(imageUrl)
        }

        const size = resolveVideoSize(options)
        if (size) {
            requestBody.size = size
        }

        if (typeof options.duration === 'number') {
            requestBody.seconds = String(options.duration)
            requestBody.duration = options.duration
        }

        if (typeof options.fps === 'number') {
            requestBody.fps = options.fps
        }

        if (typeof options.aspectRatio === 'string' && options.aspectRatio.trim().length > 0) {
            requestBody.aspect_ratio = options.aspectRatio.trim()
        }

        if (typeof options.resolution === 'string' && options.resolution.trim().length > 0) {
            requestBody.resolution = options.resolution.trim()
        }

        if (typeof options.generateAudio === 'boolean') {
            requestBody.generate_audio = options.generateAudio
        }

        if (typeof options.lastFrameImageUrl === 'string' && options.lastFrameImageUrl.trim().length > 0) {
            requestBody.last_frame_image_url = toFetchableUrl(options.lastFrameImageUrl.trim())
        }

        const response = await client.videos.create(requestBody as never)

        const directUrl = pickFirstStringByPaths(response, VIDEO_URL_PATHS)
        if (directUrl) {
            return {
                success: true,
                videoUrl: directUrl,
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
