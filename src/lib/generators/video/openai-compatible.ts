import OpenAI, { toFile } from 'openai'
import { BaseVideoGenerator, type GenerateResult, type VideoGenerateParams } from '../base'
import { getProviderConfig } from '@/lib/api-config'
import { imageUrlToBase64 } from '@/lib/cos'

type OpenAIVideoSize = '720x1280' | '1280x720' | '1024x1792' | '1792x1024'
type OpenAIVideoSeconds = '4' | '8' | '12'

function parseDataUrl(value: string): { mimeType: string; base64: string } | null {
  const marker = ';base64,'
  const markerIndex = value.indexOf(marker)
  if (!value.startsWith('data:') || markerIndex === -1) return null
  const mimeType = value.slice(5, markerIndex)
  const base64 = value.slice(markerIndex + marker.length)
  if (!mimeType || !base64) return null
  return { mimeType, base64 }
}

function normalizeDuration(value: unknown): OpenAIVideoSeconds | undefined {
  if (value === 4 || value === '4') return '4'
  if (value === 8 || value === '8') return '8'
  if (value === 12 || value === '12') return '12'
  if (value === undefined) return undefined
  throw new Error(`OPENAI_VIDEO_DURATION_UNSUPPORTED: ${String(value)}`)
}

function normalizeModel(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'sora-2'
  if (typeof value !== 'string') {
    throw new Error(`OPENAI_VIDEO_MODEL_INVALID: ${String(value)}`)
  }
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('OPENAI_VIDEO_MODEL_INVALID: empty model id')
  }
  return trimmed
}

function normalizeSize(value: unknown, aspectRatio: unknown): OpenAIVideoSize | undefined {
  if (value === '720x1280' || value === '1280x720' || value === '1024x1792' || value === '1792x1024') {
    return value
  }

  if (value === '720p') {
    return aspectRatio === '9:16' ? '720x1280' : '1280x720'
  }
  if (value === '1080p') {
    return aspectRatio === '9:16' ? '1024x1792' : '1792x1024'
  }

  if (value === undefined) return undefined
  throw new Error(`OPENAI_VIDEO_SIZE_UNSUPPORTED: ${String(value)}`)
}

function resolveFinalSize(options: Record<string, unknown>): OpenAIVideoSize | undefined {
  const rawSize = options.size
  const rawResolution = options.resolution
  const normalizedSize = rawSize === undefined ? undefined : normalizeSize(rawSize, options.aspectRatio)
  const normalizedResolution = rawResolution === undefined ? undefined : normalizeSize(rawResolution, options.aspectRatio)
  if (normalizedSize && normalizedResolution && normalizedSize !== normalizedResolution) {
    throw new Error('OPENAI_VIDEO_SIZE_CONFLICT: size and resolution must match')
  }
  return normalizedSize || normalizedResolution
}

function encodeProviderId(providerId: string): string {
  return Buffer.from(providerId, 'utf8').toString('base64url')
}

async function toUploadFileFromImageUrl(imageUrl: string): Promise<File> {
  const base64DataUrl = imageUrl.startsWith('data:') ? imageUrl : await imageUrlToBase64(imageUrl)
  const parsed = parseDataUrl(base64DataUrl)
  if (!parsed) {
    throw new Error('OPENAI_VIDEO_INPUT_REFERENCE_INVALID')
  }
  const bytes = Buffer.from(parsed.base64, 'base64')
  return await toFile(bytes, 'input-reference.png', { type: parsed.mimeType })
}

export class OpenAICompatibleVideoGenerator extends BaseVideoGenerator {
  private readonly providerId?: string

  constructor(providerId?: string) {
    super()
    this.providerId = providerId
  }

  protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
    const { userId, imageUrl, prompt = '', options = {} } = params
    const providerId = this.providerId || 'openai-compatible'
    const config = await getProviderConfig(userId, providerId)
    if (!config.baseUrl) {
      throw new Error(`PROVIDER_BASE_URL_MISSING: ${config.id}`)
    }

    const allowedOptionKeys = new Set([
      'provider',
      'modelId',
      'modelKey',
      'duration',
      'resolution',
      'aspectRatio',
      'size',
    ])
    for (const [key, value] of Object.entries(options)) {
      if (value === undefined) continue
      if (!allowedOptionKeys.has(key)) {
        throw new Error(`OPENAI_COMPATIBLE_VIDEO_OPTION_UNSUPPORTED: ${key}`)
      }
    }

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    })
    const model = normalizeModel(options.modelId)
    const seconds = normalizeDuration(options.duration)
    const size = resolveFinalSize(options)
    const inputReference = imageUrl ? await toUploadFileFromImageUrl(imageUrl) : undefined
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) {
      throw new Error('OPENAI_VIDEO_PROMPT_REQUIRED')
    }

    const requestPayload = {
      prompt: trimmedPrompt,
      model,
      ...(seconds ? { seconds } : {}),
      ...(size ? { size } : {}),
      ...(inputReference ? { input_reference: inputReference } : {}),
    }
    // OpenAI-compatible gateways can expose custom model ids while keeping official request protocol.
    const response = await client.videos.create(
      requestPayload as Parameters<typeof client.videos.create>[0],
    )

    if (!response.id || typeof response.id !== 'string') {
      throw new Error('OPENAI_VIDEO_CREATE_INVALID_RESPONSE: missing video id')
    }

    const providerToken = encodeProviderId(config.id)
    return {
      success: true,
      async: true,
      requestId: response.id,
      externalId: `OPENAI:VIDEO:${providerToken}:${response.id}`,
    }
  }
}
