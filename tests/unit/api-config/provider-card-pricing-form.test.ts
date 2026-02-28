import { describe, expect, it } from 'vitest'
import {
  getAddableModelTypesForProvider,
  getVisibleModelTypesForProvider,
} from '@/app/[locale]/profile/components/api-config/provider-card/ProviderAdvancedFields'
import { buildCustomPricingFromModelForm } from '@/app/[locale]/profile/components/api-config/provider-card/hooks/useProviderCardState'

describe('provider card pricing form behavior', () => {
  it('allows openai-compatible provider to add llm/image/video', () => {
    expect(getAddableModelTypesForProvider('openai-compatible:oa-1')).toEqual(['llm', 'image', 'video'])
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
})
