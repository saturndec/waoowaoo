import { createScopedLogger } from '@/lib/logging/core'
import { getProviderConfig } from '@/lib/user-api/runtime-config'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { buildFalQueueUrl } from '@/lib/ai-providers/fal/base-url'
import { requireSelectedModelId } from '@/lib/ai-providers/shared/model-selection'
import {
  FAL_GPT_IMAGE_2_IMAGE_SIZES,
  FAL_GPT_IMAGE_2_MODEL_ID,
} from '@/lib/ai-providers/fal/models'
import {
  OPENAI_IMAGE_OUTPUT_FORMATS,
  OPENAI_OFFICIAL_IMAGE_QUALITIES,
} from '@/lib/ai-providers/shared/openai-image'
import type { AiProviderImageExecutionContext, GenerateResult } from '@/lib/ai-providers/runtime-types'

type FalImageOptions = NonNullable<AiProviderImageExecutionContext['options']>
type FalGptImage2ImageSizePreset = typeof FAL_GPT_IMAGE_2_IMAGE_SIZES[number]
type FalGptImage2ImageSize = FalGptImage2ImageSizePreset | { width: number; height: number }

type FalImageSubmitBody = {
  prompt: string
  num_images: number
  output_format: string
  aspect_ratio?: string
  resolution?: string
  image_size?: FalGptImage2ImageSize
  quality?: string
  image_urls?: string[]
}

const FAL_IMAGE_ENDPOINTS: Record<string, { base: string; edit: string }> = {
  banana: { base: 'fal-ai/nano-banana-pro', edit: 'fal-ai/nano-banana-pro/edit' },
  'banana-2': { base: 'fal-ai/nano-banana-2', edit: 'fal-ai/nano-banana-2/edit' },
  [FAL_GPT_IMAGE_2_MODEL_ID]: { base: 'openai/gpt-image-2', edit: 'openai/gpt-image-2/edit' },
}

const FAL_GPT_IMAGE_2_IMAGE_SIZE_PRESETS = new Set<string>(FAL_GPT_IMAGE_2_IMAGE_SIZES)
const FAL_IMAGE_OUTPUT_FORMATS = new Set<string>(OPENAI_IMAGE_OUTPUT_FORMATS)
const FAL_GPT_IMAGE_2_QUALITIES = new Set<string>(OPENAI_OFFICIAL_IMAGE_QUALITIES)

function assertAllowedFalImageOptions(options: FalImageOptions) {
  const allowedOptionKeys = new Set([
    'provider',
    'modelId',
    'modelKey',
    'aspectRatio',
    'resolution',
    'outputFormat',
    'size',
    'quality',
    'referenceImages',
  ])
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (!allowedOptionKeys.has(key)) {
      throw new Error(`FAL_IMAGE_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

function readOptionalStringOption(value: unknown, optionName: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`FAL_IMAGE_OPTION_INVALID: ${optionName}`)
  }
  return value.trim()
}

function assertFalImageOutputFormat(outputFormat: string): void {
  if (!FAL_IMAGE_OUTPUT_FORMATS.has(outputFormat)) {
    throw new Error(`FAL_IMAGE_OPTION_VALUE_UNSUPPORTED: outputFormat=${outputFormat}`)
  }
}

function normalizeFalGptImage2Quality(value: unknown): string | undefined {
  const quality = readOptionalStringOption(value, 'quality')
  if (!quality) return undefined
  if (!FAL_GPT_IMAGE_2_QUALITIES.has(quality)) {
    throw new Error(`FAL_IMAGE_OPTION_VALUE_UNSUPPORTED: quality=${quality}`)
  }
  return quality
}

function resolveFalGptImage2RawSize(options: FalImageOptions): string | undefined {
  const size = readOptionalStringOption(options.size, 'size')
  const resolution = readOptionalStringOption(options.resolution, 'resolution')
  if (size && resolution && size !== resolution) {
    throw new Error('FAL_IMAGE_OPTION_CONFLICT: size and resolution must match')
  }
  return size || resolution
}

function parseDimensionSize(value: string): { width: number; height: number } | null {
  const match = /^(\d+)x(\d+)$/.exec(value)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null
  if (width <= 0 || height <= 0) return null
  if (width % 16 !== 0 || height % 16 !== 0) {
    throw new Error(`FAL_IMAGE_OPTION_VALUE_UNSUPPORTED: image_size=${value}`)
  }
  return { width, height }
}

function normalizeFalGptImage2ImageSize(value: string): FalGptImage2ImageSize {
  if (FAL_GPT_IMAGE_2_IMAGE_SIZE_PRESETS.has(value)) {
    return value as FalGptImage2ImageSizePreset
  }
  const dimensions = parseDimensionSize(value)
  if (dimensions) return dimensions
  throw new Error(`FAL_IMAGE_OPTION_VALUE_UNSUPPORTED: image_size=${value}`)
}

function roundToMultipleOf16(value: number): number {
  return Math.max(16, Math.round(value / 16) * 16)
}

function readAspectRatioValue(aspectRatio: string): number {
  const trimmed = aspectRatio.trim()
  const [rawWidth, rawHeight] = trimmed.split(':')
  if (!rawWidth || !rawHeight) {
    throw new Error(`FAL_IMAGE_OPTION_VALUE_UNSUPPORTED: aspectRatio=${aspectRatio}`)
  }
  const width = Number(rawWidth)
  const height = Number(rawHeight)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`FAL_IMAGE_OPTION_VALUE_UNSUPPORTED: aspectRatio=${aspectRatio}`)
  }
  const ratio = width / height
  if (ratio > 3 || ratio < 1 / 3) {
    throw new Error(`FAL_IMAGE_OPTION_VALUE_UNSUPPORTED: aspectRatio=${aspectRatio}`)
  }
  return ratio
}

function imageSizeFromAspectRatio(aspectRatio: string): FalGptImage2ImageSize {
  const ratio = readAspectRatioValue(aspectRatio)
  if (Math.abs(ratio - 1) < 0.001) return 'square_hd'
  if (Math.abs(ratio - (4 / 3)) < 0.001) return 'landscape_4_3'
  if (Math.abs(ratio - (3 / 4)) < 0.001) return 'portrait_4_3'
  if (Math.abs(ratio - (16 / 9)) < 0.001) return 'landscape_16_9'
  if (Math.abs(ratio - (9 / 16)) < 0.001) return 'portrait_16_9'

  if (ratio >= 1) {
    return { width: roundToMultipleOf16(1024 * ratio), height: 1024 }
  }
  return { width: 1024, height: roundToMultipleOf16(1024 / ratio) }
}

function resolveFalGptImage2ImageSize(options: FalImageOptions, hasReferenceImages: boolean): FalGptImage2ImageSize | undefined {
  const rawSize = resolveFalGptImage2RawSize(options)
  if (hasReferenceImages) {
    return rawSize && rawSize !== 'auto' ? normalizeFalGptImage2ImageSize(rawSize) : 'auto'
  }
  const aspectRatio = readOptionalStringOption(options.aspectRatio, 'aspectRatio')
  if (rawSize && rawSize !== 'auto') return normalizeFalGptImage2ImageSize(rawSize)
  if (aspectRatio) return imageSizeFromAspectRatio(aspectRatio)
  return rawSize === 'auto' ? 'auto' : undefined
}

function buildFalImageSubmitBody(input: {
  modelId: string
  prompt: string
  options: FalImageOptions
  hasReferenceImages: boolean
  outputFormat: string
}): FalImageSubmitBody {
  const body: FalImageSubmitBody = {
    prompt: input.prompt,
    num_images: 1,
    output_format: input.outputFormat,
  }

  if (input.modelId === FAL_GPT_IMAGE_2_MODEL_ID) {
    const imageSize = resolveFalGptImage2ImageSize(input.options, input.hasReferenceImages)
    const quality = normalizeFalGptImage2Quality(input.options.quality)
    if (imageSize) body.image_size = imageSize
    if (quality) body.quality = quality
    return body
  }

  if (input.options.quality !== undefined || input.options.size !== undefined) {
    const key = input.options.quality !== undefined ? 'quality' : 'size'
    throw new Error(`FAL_IMAGE_OPTION_UNSUPPORTED: ${key}`)
  }
  if (input.options.aspectRatio) body.aspect_ratio = input.options.aspectRatio
  if (input.options.resolution) body.resolution = input.options.resolution
  return body
}

export async function executeFalImageGeneration(input: AiProviderImageExecutionContext): Promise<GenerateResult> {
  const { apiKey } = await getProviderConfig(input.userId, input.selection.provider)

  const referenceImages = input.options?.referenceImages || []
  const options: FalImageOptions = input.options ?? {}
  assertAllowedFalImageOptions(options)

  const aspectRatio = options.aspectRatio
  const resolution = options.resolution
  const outputFormat = options.outputFormat ?? 'png'
  assertFalImageOutputFormat(outputFormat)
  const modelId = requireSelectedModelId(input.selection, 'fal:image')

  if (
    modelId !== FAL_GPT_IMAGE_2_MODEL_ID
    && resolution !== undefined
    && resolution !== '1K'
    && resolution !== '2K'
    && resolution !== '4K'
  ) {
    throw new Error(`FAL_IMAGE_OPTION_VALUE_UNSUPPORTED: resolution=${resolution}`)
  }

  const hasReferenceImages = referenceImages.length > 0
  const endpointConfig = FAL_IMAGE_ENDPOINTS[modelId]
  if (!endpointConfig) {
    throw new Error(`FAL_IMAGE_MODEL_UNSUPPORTED: ${modelId}`)
  }
  const endpoint = hasReferenceImages ? endpointConfig.edit : endpointConfig.base

  const logger = createScopedLogger({ module: 'worker.fal-image', action: 'fal_image_generate' })
  logger.info({
    message: 'FAL image generation request',
    details: {
      modelId,
      endpoint,
      referenceImagesCount: referenceImages.length,
      hasReferenceImages,
      resolution: resolution ?? null,
      aspectRatio: aspectRatio ?? null,
      referenceImageUrls: referenceImages.map((u) => u.substring(0, 100)),
    },
  })

  const body = buildFalImageSubmitBody({
    modelId,
    prompt: input.prompt,
    options,
    hasReferenceImages,
    outputFormat,
  })

  if (hasReferenceImages) {
    const dataUrls = await Promise.all(
      referenceImages.map(async (url) => (url.startsWith('data:') ? url : await normalizeToBase64ForGeneration(url))),
    )
    body.image_urls = dataUrls
    logger.info({
      message: 'FAL image reference images converted',
      details: {
        count: referenceImages.length,
        sizes: dataUrls.map((d) => `${Math.round(d.length / 1024)}KB`),
      },
    })
  }

  const submitResponse = await fetch(buildFalQueueUrl(endpoint), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text()
    throw new Error(`FAL 提交失败 (${submitResponse.status}): ${errorText}`)
  }

  const submitData = (await submitResponse.json()) as { request_id?: unknown }
  const requestId = typeof submitData.request_id === 'string' ? submitData.request_id : ''
  if (!requestId) {
    throw new Error('FAL 未返回 request_id')
  }

  return {
    success: true,
    async: true,
    requestId,
    endpoint,
    externalId: `FAL:IMAGE:${endpoint}:${requestId}`,
  }
}
