import { describe, expect, it } from 'vitest'
import {
  getAddableModelTypesForProvider,
  getVisibleModelTypesForProvider,
  shouldShowOpenAICompatVideoHint,
} from '@/app/[locale]/profile/components/api-config/provider-card/ProviderAdvancedFields'
import {
  buildCustomPricingFromModelForm,
  buildProviderConnectionPayload,
} from '@/app/[locale]/profile/components/api-config/provider-card/hooks/useProviderCardState'

describe('provider card pricing form behavior', () => {
  it('allows openai-compatible provider to add llm/image/video', () => {
    expect(getAddableModelTypesForProvider('openai-compatible:oa-1')).toEqual(['llm', 'image', 'video'])
  })

  it('allows grok-compatible provider to add llm/image/video', () => {
    expect(getAddableModelTypesForProvider('grok-compatible:gk-1')).toEqual(['llm', 'image', 'video'])
  })

  it('shows llm/image/video tabs by default for openai-compatible even with only image models', () => {
    const visible = getVisibleModelTypesForProvider(
      'openai-compatible:oa-1',
      {
        image: [
          {
            modelId: 'gpt-image-1',
            modelKey: 'openai-compatible:oa-1::gpt-image-1',
            name: 'Image',
            type: 'image',
            provider: 'openai-compatible:oa-1',
            price: 0,
            enabled: true,
          },
        ],
      },
    )

    expect(visible).toEqual(['llm', 'image', 'video'])
  })

  it('shows the openai-compatible video hint only for openai-compatible video add forms', () => {
    expect(shouldShowOpenAICompatVideoHint('openai-compatible:oa-1', 'video')).toBe(true)
    expect(shouldShowOpenAICompatVideoHint('openai-compatible:oa-1', 'image')).toBe(false)
    expect(shouldShowOpenAICompatVideoHint('gemini-compatible:gm-1', 'video')).toBe(false)
    expect(shouldShowOpenAICompatVideoHint('ark', 'video')).toBe(false)
  })

  it('keeps payload without customPricing when pricing toggle is off', () => {
    const result = buildCustomPricingFromModelForm(
      'image',
      {
        name: 'Image',
        modelId: 'gpt-image-1',
        enableCustomPricing: false,
        basePrice: '0.8',
      },
      { needsCustomPricing: true },
    )

    expect(result).toEqual({ ok: true })
  })

  it('builds llm customPricing payload when pricing toggle is on', () => {
    const result = buildCustomPricingFromModelForm(
      'llm',
      {
        name: 'GPT',
        modelId: 'gpt-4.1',
        enableCustomPricing: true,
        priceInput: '2.5',
        priceOutput: '8',
      },
      { needsCustomPricing: true },
    )

    expect(result).toEqual({
      ok: true,
      customPricing: {
        llm: {
          inputPerMillion: 2.5,
          outputPerMillion: 8,
        },
      },
    })
  })

  it('builds media customPricing payload with option prices when enabled', () => {
    const result = buildCustomPricingFromModelForm(
      'video',
      {
        name: 'Sora',
        modelId: 'sora-2',
        enableCustomPricing: true,
        basePrice: '0.9',
        optionPricesJson: '{"resolution":{"720x1280":0.1},"duration":{"8":0.4}}',
      },
      { needsCustomPricing: true },
    )

    expect(result).toEqual({
      ok: true,
      customPricing: {
        video: {
          basePrice: 0.9,
          optionPrices: {
            resolution: {
              '720x1280': 0.1,
            },
            duration: {
              '8': 0.4,
            },
          },
        },
      },
    })
  })

  it('rejects invalid media optionPrices JSON when enabled', () => {
    const result = buildCustomPricingFromModelForm(
      'image',
      {
        name: 'Image',
        modelId: 'gpt-image-1',
        enableCustomPricing: true,
        basePrice: '0.3',
        optionPricesJson: '{"resolution":{"1024x1024":"free"}}',
      },
      { needsCustomPricing: true },
    )

    expect(result).toEqual({ ok: false, reason: 'invalid' })
  })

  it('bugfix: includes baseUrl for openai-compatible provider connection test payload', () => {
    const payload = buildProviderConnectionPayload({
      providerKey: 'openai-compatible',
      apiKey: ' sk-test ',
      baseUrl: ' https://api.openai-proxy.example/v1 ',
    })

    expect(payload).toEqual({
      apiType: 'openai-compatible',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai-proxy.example/v1',
    })
  })

  it('includes baseUrl for grok-compatible provider connection test payload', () => {
    const payload = buildProviderConnectionPayload({
      providerKey: 'grok-compatible',
      apiKey: ' xai-key ',
      baseUrl: ' https://api.x.ai/v1 ',
    })

    expect(payload).toEqual({
      apiType: 'grok-compatible',
      apiKey: 'xai-key',
      baseUrl: 'https://api.x.ai/v1',
    })
  })

  it('omits baseUrl for non-compatible provider connection test payload', () => {
    const payload = buildProviderConnectionPayload({
      providerKey: 'ark',
      apiKey: ' ark-key ',
      baseUrl: ' https://ignored.example/v1 ',
    })

    expect(payload).toEqual({
      apiType: 'ark',
      apiKey: 'ark-key',
    })
  })

  it('includes llmModel in provider connection test payload when configured', () => {
    const payload = buildProviderConnectionPayload({
      providerKey: 'openai-compatible',
      apiKey: ' sk-test ',
      baseUrl: ' https://compat.example.com/v1 ',
      llmModel: ' gpt-4.1-mini ',
    })

    expect(payload).toEqual({
      apiType: 'openai-compatible',
      apiKey: 'sk-test',
      baseUrl: 'https://compat.example.com/v1',
      llmModel: 'gpt-4.1-mini',
    })
  })
})
