import { describe, expect, it } from 'vitest'
import { PRESET_MODELS, PRESET_PROVIDERS } from '@/app/[locale]/profile/components/api-config/types'

describe('api-config minimax preset', () => {
  it('uses official minimax baseUrl in preset provider', () => {
    const minimaxProvider = PRESET_PROVIDERS.find((provider) => provider.id === 'minimax')
    expect(minimaxProvider).toBeDefined()
    expect(minimaxProvider?.baseUrl).toBe('https://api.minimaxi.com/v1')
  })

  it('includes all required minimax official llm preset models', () => {
    const minimaxLlmModelIds = PRESET_MODELS
      .filter((model) => model.provider === 'minimax' && model.type === 'llm')
      .map((model) => model.modelId)

    expect(minimaxLlmModelIds).toContain('MiniMax-M2.5')
    expect(minimaxLlmModelIds).toContain('MiniMax-M2.5-highspeed')
    expect(minimaxLlmModelIds).toContain('MiniMax-M2.1')
    expect(minimaxLlmModelIds).toContain('MiniMax-M2.1-highspeed')
    expect(minimaxLlmModelIds).toContain('MiniMax-M2')
  })

  it('includes all required minimax official video preset models', () => {
    const minimaxVideoModelIds = PRESET_MODELS
      .filter((model) => model.provider === 'minimax' && model.type === 'video')
      .map((model) => model.modelId)

    expect(minimaxVideoModelIds).toContain('minimax-hailuo-2.3')
    expect(minimaxVideoModelIds).toContain('minimax-hailuo-2.3-fast')
    expect(minimaxVideoModelIds).toContain('minimax-hailuo-02')
    expect(minimaxVideoModelIds).toContain('t2v-01')
    expect(minimaxVideoModelIds).toContain('t2v-01-director')
    expect(minimaxVideoModelIds).toContain('s2v-01')
  })

  it('includes all required minimax official audio preset models', () => {
    const minimaxAudioModelIds = PRESET_MODELS
      .filter((model) => model.provider === 'minimax' && model.type === 'audio')
      .map((model) => model.modelId)

    expect(minimaxAudioModelIds).toContain('speech-2.8-hd')
    expect(minimaxAudioModelIds).toContain('speech-2.8-turbo')
    expect(minimaxAudioModelIds).toContain('speech-2.6-hd')
    expect(minimaxAudioModelIds).toContain('speech-2.6-turbo')
    expect(minimaxAudioModelIds).toContain('speech-02-hd')
    expect(minimaxAudioModelIds).toContain('speech-02-turbo')
  })

  it('includes all required minimax official image preset models', () => {
    const minimaxImageModelIds = PRESET_MODELS
      .filter((model) => model.provider === 'minimax' && model.type === 'image')
      .map((model) => model.modelId)

    expect(minimaxImageModelIds).toContain('image-01')
    expect(minimaxImageModelIds).toContain('image-01-live')
  })
})
