import type { MediaOptionSchemaConfig } from '@/lib/ai-providers/shared/media-option-schema-config'
import type { AiOptionSchema } from '@/lib/ai-registry/types'
import {
  buildMediaOptionSchema,
  createFalVideoObjectValidator,
  enumValidator,
  integerRangeValidator,
  nonEmptyStringValidator,
  type MediaModality,
} from '@/lib/ai-providers/shared/option-schema'
import {
  OPENAI_IMAGE_OUTPUT_FORMATS,
  OPENAI_OFFICIAL_IMAGE_QUALITIES,
} from '@/lib/ai-providers/shared/openai-image'

export const FAL_GPT_IMAGE_2_MODEL_ID = 'gpt-image-2'
export const FAL_IMAGE_RESOLUTIONS = ['1K', '2K', '4K'] as const
export const FAL_GPT_IMAGE_2_IMAGE_SIZES = [
  'auto',
  'square_hd',
  'square',
  'portrait_4_3',
  'portrait_16_9',
  'landscape_4_3',
  'landscape_16_9',
] as const

export const FAL_VIDEO_MODEL_IDS = new Set([
  'fal-wan25',
  'fal-veo31',
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
  'fal-ai/kling-video/v3/standard/image-to-video',
  'fal-ai/kling-video/v3/pro/image-to-video',
])

export const FAL_BUILTIN_CAPABILITY_CATALOG_ENTRIES = [
  {
    modelType: 'image',
    provider: 'fal',
    modelId: 'banana-2',
    capabilities: { image: { resolutionOptions: ['1K', '2K', '4K'] } },
  },
  {
    modelType: 'image',
    provider: 'fal',
    modelId: FAL_GPT_IMAGE_2_MODEL_ID,
    capabilities: { image: { resolutionOptions: [...FAL_GPT_IMAGE_2_IMAGE_SIZES] } },
  },
  {
    modelType: 'video',
    provider: 'fal',
    modelId: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    capabilities: { video: { generationModeOptions: ['normal'], durationOptions: [5, 10], firstlastframe: false, supportGenerateAudio: false } },
  },
  {
    modelType: 'video',
    provider: 'fal',
    modelId: 'fal-ai/kling-video/v3/standard/image-to-video',
    capabilities: {
      video: {
        generationModeOptions: ['normal'],
        durationOptions: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        firstlastframe: false,
        supportGenerateAudio: false,
      },
    },
  },
  {
    modelType: 'video',
    provider: 'fal',
    modelId: 'fal-ai/kling-video/v3/pro/image-to-video',
    capabilities: {
      video: {
        generationModeOptions: ['normal'],
        durationOptions: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        firstlastframe: false,
        supportGenerateAudio: false,
      },
    },
  },
] as const

export const FAL_DEFAULT_VOICE_MODEL_KEY = 'fal::fal-ai/index-tts-2/text-to-speech'
export const FAL_DEFAULT_LIPSYNC_MODEL_KEY = 'fal::fal-ai/kling-video/lipsync/audio-to-video'

export const FAL_API_CONFIG_CATALOG_MODELS = [
  { modelId: 'banana', name: 'Banana Pro', type: 'image', provider: 'fal' },
  { modelId: 'banana-2', name: 'Banana 2', type: 'image', provider: 'fal' },
  { modelId: FAL_GPT_IMAGE_2_MODEL_ID, name: 'GPT Image 2', type: 'image', provider: 'fal' },
  { modelId: 'fal-wan25', name: 'Wan 2.6', type: 'video', provider: 'fal' },
  { modelId: 'fal-veo31', name: 'Veo 3.1', type: 'video', provider: 'fal' },
  { modelId: 'fal-sora2', name: 'Sora 2', type: 'video', provider: 'fal' },
  { modelId: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', name: 'Kling 2.5 Turbo Pro', type: 'video', provider: 'fal' },
  { modelId: 'fal-ai/kling-video/v3/standard/image-to-video', name: 'Kling 3 Standard', type: 'video', provider: 'fal' },
  { modelId: 'fal-ai/kling-video/v3/pro/image-to-video', name: 'Kling 3 Pro', type: 'video', provider: 'fal' },
  { modelId: 'fal-ai/index-tts-2/text-to-speech', name: 'IndexTTS 2', type: 'audio', provider: 'fal' },
  { modelId: 'fal-ai/kling-video/lipsync/audio-to-video', name: 'Kling Lip Sync', type: 'lipsync', provider: 'fal' },
] as const

function falFlatPricing(flatAmount: number) {
  return { mode: 'flat' as const, flatAmount }
}

function falDurationPricing(tiers: ReadonlyArray<readonly [duration: number, amount: number]>) {
  return {
    mode: 'capability' as const,
    tiers: tiers.map(([duration, amount]) => ({ when: { duration }, amount })),
  }
}

export const FAL_BUILTIN_PRICING_CATALOG_ENTRIES = [
  { apiType: 'image', provider: 'fal', modelId: 'banana', pricing: falFlatPricing(0.9648) },
  {
    apiType: 'image',
    provider: 'fal',
    modelId: 'banana-2',
    pricing: {
      mode: 'capability',
      tiers: [
        { when: { resolution: '1K' }, amount: 0.576 },
        { when: { resolution: '2K' }, amount: 0.864 },
        { when: { resolution: '4K' }, amount: 1.152 },
      ],
    },
  },
  { apiType: 'video', provider: 'fal', modelId: 'fal-wan25', pricing: falFlatPricing(1.8) },
  { apiType: 'video', provider: 'fal', modelId: 'fal-veo31', pricing: falFlatPricing(2.88) },
  { apiType: 'video', provider: 'fal', modelId: 'fal-kling25', pricing: falFlatPricing(2.16) },
  { apiType: 'video', provider: 'fal', modelId: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', pricing: falDurationPricing([[5, 0.35], [10, 0.7]]) },
  {
    apiType: 'video',
    provider: 'fal',
    modelId: 'fal-ai/kling-video/v3/standard/image-to-video',
    pricing: falDurationPricing([[3, 0.504], [4, 0.672], [5, 0.84], [6, 1.008], [7, 1.176], [8, 1.344], [9, 1.512], [10, 1.68], [11, 1.848], [12, 2.016], [13, 2.184], [14, 2.352], [15, 2.52]]),
  },
  {
    apiType: 'video',
    provider: 'fal',
    modelId: 'fal-ai/kling-video/v3/pro/image-to-video',
    pricing: falDurationPricing([[3, 0.672], [4, 0.896], [5, 1.12], [6, 1.344], [7, 1.568], [8, 1.792], [9, 2.016], [10, 2.24], [11, 2.464], [12, 2.688], [13, 2.912], [14, 3.136], [15, 3.36]]),
  },
  { apiType: 'voice', provider: 'fal', modelId: 'fal-ai/index-tts-2/text-to-speech', pricing: falFlatPricing(0.0144) },
  { apiType: 'lip-sync', provider: 'fal', modelId: 'fal-ai/kling-video/lipsync/audio-to-video', pricing: falFlatPricing(0.5) },
] as const

export const FAL_IMAGE_OPTION_SCHEMA_CONFIG = {
  validators: {
    resolution: { kind: 'enum', values: FAL_IMAGE_RESOLUTIONS },
  },
} satisfies MediaOptionSchemaConfig

export const FAL_VIDEO_OPTION_SCHEMA_CONFIG = {
  objectValidatorKind: 'falVideoModel',
  validators: {
    duration: { kind: 'integer', min: 1 },
    aspectRatio: { kind: 'nonEmptyString' },
    resolution: { kind: 'nonEmptyString' },
  },
} satisfies MediaOptionSchemaConfig

export function resolveFalOptionSchema(modality: MediaModality, modelId: string): AiOptionSchema {
  if (modality === 'image') {
    if (modelId === FAL_GPT_IMAGE_2_MODEL_ID) {
      return buildMediaOptionSchema('image', {
        validators: {
          resolution: enumValidator(FAL_GPT_IMAGE_2_IMAGE_SIZES),
          outputFormat: enumValidator(OPENAI_IMAGE_OUTPUT_FORMATS),
          quality: enumValidator(OPENAI_OFFICIAL_IMAGE_QUALITIES),
        },
      })
    }
    return buildMediaOptionSchema('image', {
      ...FAL_IMAGE_OPTION_SCHEMA_CONFIG,
      validators: {
        resolution: enumValidator(FAL_IMAGE_RESOLUTIONS),
        outputFormat: enumValidator(OPENAI_IMAGE_OUTPUT_FORMATS),
      },
    })
  }
  if (modality === 'video') {
    return buildMediaOptionSchema('video', {
      ...FAL_VIDEO_OPTION_SCHEMA_CONFIG,
      validators: {
        duration: integerRangeValidator({ min: 1 }),
        aspectRatio: nonEmptyStringValidator(),
        resolution: nonEmptyStringValidator(),
      },
      objectValidators: [createFalVideoObjectValidator(modelId, FAL_VIDEO_MODEL_IDS)],
    })
  }
  return buildMediaOptionSchema('audio')
}
