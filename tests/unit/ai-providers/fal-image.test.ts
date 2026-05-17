import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'fal',
  name: 'fal',
  apiKey: 'fal-key',
  gatewayRoute: 'official' as const,
})))

const normalizeToBase64ForGenerationMock = vi.hoisted(() => vi.fn(async (url: string) => (
  `data:image/png;base64,normalized-${Buffer.from(url).toString('base64')}`
)))

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/user-api/runtime-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

vi.mock('@/lib/media/outbound-image', () => ({
  normalizeToBase64ForGeneration: normalizeToBase64ForGenerationMock,
}))

import { executeFalImageGeneration } from '@/lib/ai-providers/fal/image'

function readSubmittedJson(): unknown {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
  return JSON.parse(String(init?.body || '{}')) as unknown
}

describe('fal image generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ request_id: 'req-1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  it('submits GPT Image 2 text-to-image with fal image_size and quality fields', async () => {
    const result = await executeFalImageGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'gpt-image-2',
        modelKey: 'fal::gpt-image-2',
        variantSubKind: 'official',
      },
      prompt: 'draw a poster',
      options: {
        aspectRatio: '9:16',
        outputFormat: 'webp',
        quality: 'medium',
      },
    })

    expect(fetchMock).toHaveBeenCalledWith('https://queue.fal.run/openai/gpt-image-2', expect.objectContaining({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Key fal-key',
      },
    }))
    expect(readSubmittedJson()).toEqual({
      prompt: 'draw a poster',
      num_images: 1,
      output_format: 'webp',
      image_size: 'portrait_16_9',
      quality: 'medium',
    })
    expect(result).toMatchObject({
      success: true,
      async: true,
      requestId: 'req-1',
      endpoint: 'openai/gpt-image-2',
      externalId: 'FAL:IMAGE:openai/gpt-image-2:req-1',
    })
  })

  it('submits GPT Image 2 edits to the edit endpoint with normalized image urls and auto image size', async () => {
    await executeFalImageGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'gpt-image-2',
        modelKey: 'fal::gpt-image-2',
        variantSubKind: 'official',
      },
      prompt: 'change the jacket color',
      options: {
        referenceImages: ['https://example.com/input.png'],
        resolution: 'auto',
      },
    })

    expect(fetchMock).toHaveBeenCalledWith('https://queue.fal.run/openai/gpt-image-2/edit', expect.objectContaining({
      method: 'POST',
    }))
    expect(normalizeToBase64ForGenerationMock).toHaveBeenCalledWith('https://example.com/input.png')
    expect(readSubmittedJson()).toEqual({
      prompt: 'change the jacket color',
      num_images: 1,
      output_format: 'png',
      image_size: 'auto',
      image_urls: ['data:image/png;base64,normalized-aHR0cHM6Ly9leGFtcGxlLmNvbS9pbnB1dC5wbmc='],
    })
  })

  it('maps unsupported GPT Image 2 aspect ratios to custom image_size dimensions', async () => {
    await executeFalImageGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'gpt-image-2',
        modelKey: 'fal::gpt-image-2',
        variantSubKind: 'official',
      },
      prompt: 'draw a character sheet',
      options: {
        aspectRatio: '3:2',
      },
    })

    expect(readSubmittedJson()).toEqual({
      prompt: 'draw a character sheet',
      num_images: 1,
      output_format: 'png',
      image_size: { width: 1536, height: 1024 },
    })
  })
})
