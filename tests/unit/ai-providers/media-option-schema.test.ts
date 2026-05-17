import { describe, expect, it, vi } from 'vitest'
import { validateAiOptions } from '@/lib/ai-exec/normalize'
import { arkAdapter } from '@/lib/ai-providers/ark/adapter'
import { falAdapter } from '@/lib/ai-providers/fal/adapter'
import { googleAdapter } from '@/lib/ai-providers/google/adapter'
import { minimaxAdapter } from '@/lib/ai-providers/minimax/adapter'
import { openAiAdapter } from '@/lib/ai-providers/openai/adapter'
import { openAiCompatibleAdapter } from '@/lib/ai-providers/openai-compatible/adapter'
import { normalizeGeminiImageSize } from '@/lib/ai-providers/shared/google-image-helpers'
import { viduAdapter } from '@/lib/ai-providers/vidu/adapter'
import type { AiVariantDescriptor } from '@/lib/ai-registry/types'

vi.mock('@/lib/ai-registry/capabilities-catalog', () => ({
  resolveBuiltinCapabilitiesByModelKey: vi.fn(() => ({})),
}))

function mediaSelection(input: {
  provider: string
  modelId: string
  modelKey: string
  compatMode?: 'sync' | 'async'
}) {
  return {
    provider: input.provider,
    modelId: input.modelId,
    modelKey: input.modelKey,
    variantSubKind: input.compatMode ? 'user-template' as const : 'official' as const,
    ...(input.compatMode
      ? { variantData: { compatMediaTemplate: { mode: input.compatMode } } }
      : {}),
  }
}

function validateDescriptorOptions(input: {
  schema: AiVariantDescriptor['optionSchema']
  options: Record<string, unknown> | undefined
  context?: string
}) {
  validateAiOptions({
    schema: input.schema,
    options: input.options,
    context: input.context || 'unit',
  })
}

describe('media adapter option schema', () => {
  it('normalizes Gemini 3.1 0.5K image size to the provider 512 value', () => {
    expect(normalizeGeminiImageSize('0.5K')).toBe('512')
    expect(normalizeGeminiImageSize('1K')).toBe('1K')
  })

  it('rejects Ark image requests before generator when aspect ratio or size is missing', () => {
    const descriptor = arkAdapter.image?.describe(mediaSelection({
      provider: 'ark',
      modelId: 'doubao-seedream-4-5-251128',
      modelKey: 'ark::doubao-seedream-4-5-251128',
    }))
    expect(descriptor).toBeDefined()

    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: { resolution: '4K' },
      context: 'image:ark::doubao-seedream-4-5-251128',
    })).toThrow('AI_OPTION_REQUIRED:image:ark::doubao-seedream-4-5-251128:aspectRatio_or_size')
  })

  it('rejects provider-specific invalid Ark image values from descriptor schema', () => {
    const descriptor = arkAdapter.image?.describe(mediaSelection({
      provider: 'ark',
      modelId: 'doubao-seedream-4-5-251128',
      modelKey: 'ark::doubao-seedream-4-5-251128',
    }))
    expect(descriptor).toBeDefined()

    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: { aspectRatio: '5:4', resolution: '2K' },
    })).toThrow('AI_OPTION_INVALID:unit:aspectRatio:unsupported_value=5:4')
  })

  it('rejects provider-specific invalid Fal image resolution from descriptor schema', () => {
    const descriptor = falAdapter.image?.describe(mediaSelection({
      provider: 'fal',
      modelId: 'banana',
      modelKey: 'fal::banana',
    }))
    expect(descriptor).toBeDefined()

    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: { aspectRatio: '16:9', resolution: '8K' },
    })).toThrow('AI_OPTION_INVALID:unit:resolution:unsupported_value=8K')
  })

  it('validates Fal GPT Image 2 image size and quality options before provider execution', () => {
    const descriptor = falAdapter.image?.describe(mediaSelection({
      provider: 'fal',
      modelId: 'gpt-image-2',
      modelKey: 'fal::gpt-image-2',
    }))
    expect(descriptor).toBeDefined()

    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: {
        resolution: 'landscape_16_9',
        quality: 'medium',
        outputFormat: 'webp',
      },
    })).not.toThrow()
    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: { resolution: '4K' },
      context: 'fal-gpt-image-2',
    })).toThrow('AI_OPTION_INVALID:fal-gpt-image-2:resolution:unsupported_value=4K')
    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: { quality: 'standard' },
      context: 'fal-gpt-image-2',
    })).toThrow('AI_OPTION_INVALID:fal-gpt-image-2:quality:unsupported_value=standard')
  })

  it('validates Google Lyria music generation options before provider execution', () => {
    const descriptor = googleAdapter.music?.describe(mediaSelection({
      provider: 'google',
      modelId: 'lyria-3-clip-preview',
      modelKey: 'google::lyria-3-clip-preview',
    }))
    expect(descriptor).toBeDefined()

    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: {
        durationSeconds: 30,
        vocalMode: 'instrumental',
        genre: 'cinematic tension',
        mood: 'urgent',
        bpm: 128,
        outputFormat: 'mp3',
      },
    })).not.toThrow()
    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: { durationSeconds: 30, vocalMode: 'spoken', bpm: 128 },
      context: 'music:google::lyria-3-clip-preview',
    })).toThrow('AI_OPTION_INVALID:music:google::lyria-3-clip-preview:vocalMode:unsupported_value=spoken')
    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: { durationSeconds: 30, vocalMode: 'instrumental', bpm: 500 },
      context: 'music:google::lyria-3-clip-preview',
    })).toThrow('AI_OPTION_INVALID:music:google::lyria-3-clip-preview:bpm:max=300')
  })

  it('allows same OpenAI compatible image size and resolution but rejects conflicts', () => {
    const descriptor = openAiCompatibleAdapter.image?.describe(mediaSelection({
      provider: 'openai-compatible:oa-1',
      modelId: 'gpt-image-1',
      modelKey: 'openai-compatible:oa-1::gpt-image-1',
      compatMode: 'sync',
    }))
    expect(descriptor).toBeDefined()

    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: { size: '1024x1024', resolution: '1024x1024', outputFormat: 'png' },
    })).not.toThrow()
    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: { size: '1024x1024', resolution: '1536x1024' },
    })).toThrow('AI_OPTION_CONFLICT:unit:size_and_resolution_must_match')
  })

  it('validates official OpenAI image-2 options without enabling OpenAI-compatible response format', () => {
    const descriptor = openAiAdapter.image?.describe(mediaSelection({
      provider: 'openai',
      modelId: 'gpt-image-2',
      modelKey: 'openai::gpt-image-2',
    }))
    expect(descriptor).toBeDefined()

    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: {
        resolution: '1536x1024',
        quality: 'medium',
        outputFormat: 'webp',
        outputCompression: 80,
      },
    })).not.toThrow()
    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: { responseFormat: 'url' },
      context: 'openai-image-2',
    })).toThrow('AI_OPTION_INVALID:openai-image-2:responseFormat_unsupported')
  })

  it('rejects Ark video duration outside model descriptor bounds', () => {
    const descriptor = arkAdapter.video?.describe(mediaSelection({
      provider: 'ark',
      modelId: 'doubao-seedance-2-0-260128',
      modelKey: 'ark::doubao-seedance-2-0-260128',
    }))
    expect(descriptor).toBeDefined()

    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: { duration: 3, resolution: '1080p' },
    })).toThrow('AI_OPTION_INVALID:unit:duration:min=4')
  })
})

describe('media adapter video option schema', () => {
  it('allows Ark Seedance video reference images before provider execution', () => {
    const descriptor = arkAdapter.video?.describe(mediaSelection({
      provider: 'ark',
      modelId: 'doubao-seedance-2-0-fast-260128',
      modelKey: 'ark::doubao-seedance-2-0-fast-260128',
    }))
    expect(descriptor).toBeDefined()

    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: {
        prompt: 'continuous segment prompt',
        duration: 5,
        resolution: '720p',
        aspectRatio: '9:16',
        generateAudio: true,
        referenceImages: ['https://example.com/character.png', 'https://example.com/location.png'],
      },
      context: 'video:ark::doubao-seedance-2-0-fast-260128',
    })).not.toThrow()
  })

  it('rejects MiniMax invalid duration/resolution combinations before generator', () => {
    const descriptor = minimaxAdapter.video?.describe(mediaSelection({
      provider: 'minimax',
      modelId: 'minimax-hailuo-2.3',
      modelKey: 'minimax::minimax-hailuo-2.3',
    }))
    expect(descriptor).toBeDefined()

    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: { duration: 10, resolution: '1080P' },
    })).toThrow('AI_OPTION_INVALID:unit:duration=10_for_resolution=1080P_in_minimax-hailuo-2.3')
  })

  it('rejects MiniMax first-last-frame mode for models that do not support it', () => {
    const descriptor = minimaxAdapter.video?.describe(mediaSelection({
      provider: 'minimax',
      modelId: 'minimax-hailuo-2.3',
      modelKey: 'minimax::minimax-hailuo-2.3',
    }))
    expect(descriptor).toBeDefined()

    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: { generationMode: 'firstlastframe', lastFrameImageUrl: 'https://example.com/last.png' },
    })).toThrow('AI_OPTION_INVALID:unit:generationMode=firstlastframe_for_minimax-hailuo-2.3')
  })

  it('rejects Vidu invalid duration/resolution combinations from descriptor schema', () => {
    const descriptor = viduAdapter.video?.describe(mediaSelection({
      provider: 'vidu',
      modelId: 'vidu2.0',
      modelKey: 'vidu::vidu2.0',
    }))
    expect(descriptor).toBeDefined()

    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: { duration: 8, resolution: '1080p' },
    })).toThrow('AI_OPTION_INVALID:unit:resolution=1080p')
  })

  it('rejects Vidu audioType unless audio generation is explicitly enabled', () => {
    const descriptor = viduAdapter.video?.describe(mediaSelection({
      provider: 'vidu',
      modelId: 'viduq2-turbo',
      modelKey: 'vidu::viduq2-turbo',
    }))
    expect(descriptor).toBeDefined()

    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: { audioType: 'all' },
    })).toThrow('AI_OPTION_INVALID:unit:audioType_requires_generateAudio')
  })

  it('rejects OpenAI-compatible video size and resolution conflicts from descriptor schema', () => {
    const descriptor = openAiCompatibleAdapter.video?.describe(mediaSelection({
      provider: 'openai-compatible:oa-1',
      modelId: 'sora-2',
      modelKey: 'openai-compatible:oa-1::sora-2',
      compatMode: 'async',
    }))
    expect(descriptor).toBeDefined()

    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: { size: '720p', resolution: '1080p' },
    })).toThrow('AI_OPTION_INVALID:unit:size_and_resolution_must_match')
  })

  it('rejects unknown Fal video models from descriptor schema', () => {
    const descriptor = falAdapter.video?.describe(mediaSelection({
      provider: 'fal',
      modelId: 'unknown-fal-video',
      modelKey: 'fal::unknown-fal-video',
    }))
    expect(descriptor).toBeDefined()

    expect(() => validateDescriptorOptions({
      schema: descriptor!.optionSchema,
      options: {},
    })).toThrow('AI_OPTION_INVALID:unit:modelId=unknown-fal-video')
  })
})
