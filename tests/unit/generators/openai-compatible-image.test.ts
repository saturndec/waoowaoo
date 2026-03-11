import { beforeEach, describe, expect, it, vi } from 'vitest'

const generateImageViaOpenAICompatMock = vi.hoisted(() =>
  vi.fn(async () => ({ success: true, imageUrl: 'https://example.com/image.png' })),
)

vi.mock('@/lib/model-gateway', () => ({
  generateImageViaOpenAICompat: generateImageViaOpenAICompatMock,
}))

import { OpenAICompatibleImageGenerator } from '@/lib/generators/image/openai-compatible'

describe('OpenAICompatibleImageGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards image generation request to model-gateway openai-compatible profile', async () => {
    const generator = new OpenAICompatibleImageGenerator('gpt-image-1', 'openai-compatible:oa-1')
    const result = await generator.generate({
      userId: 'user-1',
      prompt: 'draw a lighthouse',
      referenceImages: ['https://example.com/ref.png'],
      options: {
        size: '1024x1024',
      },
    })

    expect(result).toEqual({
      success: true,
      imageUrl: 'https://example.com/image.png',
    })
    expect(generateImageViaOpenAICompatMock).toHaveBeenCalledWith({
      userId: 'user-1',
      providerId: 'openai-compatible:oa-1',
      modelId: 'gpt-image-1',
      prompt: 'draw a lighthouse',
      referenceImages: ['https://example.com/ref.png'],
      options: {
        size: '1024x1024',
      },
      profile: 'openai-compatible',
    })
  })

  it('uses default provider key when providerId is omitted', async () => {
    const generator = new OpenAICompatibleImageGenerator('gpt-image-1')
    await generator.generate({
      userId: 'user-1',
      prompt: 'draw cat',
    })

    expect(generateImageViaOpenAICompatMock).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'openai-compatible',
      modelId: 'gpt-image-1',
      profile: 'openai-compatible',
    }))
  })

  it('accepts grok-compatible provider id while keeping openai-compatible profile', async () => {
    const generator = new OpenAICompatibleImageGenerator('grok-2-image', 'grok-compatible:gk-1')
    await generator.generate({
      userId: 'user-1',
      prompt: 'draw',
    })

    expect(generateImageViaOpenAICompatMock).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'grok-compatible:gk-1',
      modelId: 'grok-2-image',
      profile: 'openai-compatible',
    }))
  })
})
