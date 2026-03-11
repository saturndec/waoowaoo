import { beforeEach, describe, expect, it, vi } from 'vitest'

const generateVideoViaOpenAICompatMock = vi.hoisted(() =>
  vi.fn(async () => ({ success: true, async: true, requestId: 'vid_123' })),
)

vi.mock('@/lib/model-gateway', () => ({
  generateVideoViaOpenAICompat: generateVideoViaOpenAICompatMock,
}))

import { OpenAICompatibleVideoGenerator } from '@/lib/generators/video/openai-compatible'

describe('OpenAICompatibleVideoGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards video generation request to model-gateway openai-compatible profile', async () => {
    const generator = new OpenAICompatibleVideoGenerator('openai-compatible:oa-1')
    const result = await generator.generate({
      userId: 'user-1',
      imageUrl: 'https://example.com/seed.png',
      prompt: 'animate this character',
      options: {
        modelId: 'sora-2',
        duration: 8,
        resolution: '720p',
      },
    })

    expect(result).toEqual({
      success: true,
      async: true,
      requestId: 'vid_123',
    })
    expect(generateVideoViaOpenAICompatMock).toHaveBeenCalledWith({
      userId: 'user-1',
      providerId: 'openai-compatible:oa-1',
      modelId: 'sora-2',
      imageUrl: 'https://example.com/seed.png',
      prompt: 'animate this character',
      options: {
        modelId: 'sora-2',
        duration: 8,
        resolution: '720p',
      },
      profile: 'openai-compatible',
    })
  })

  it('uses default provider key when providerId is omitted', async () => {
    const generator = new OpenAICompatibleVideoGenerator()
    await generator.generate({
      userId: 'user-1',
      imageUrl: 'https://example.com/seed.png',
    })

    expect(generateVideoViaOpenAICompatMock).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'openai-compatible',
      profile: 'openai-compatible',
    }))
  })

  it('accepts grok-compatible provider id while keeping openai-compatible profile', async () => {
    const generator = new OpenAICompatibleVideoGenerator('grok-compatible:gk-1')
    await generator.generate({
      userId: 'user-1',
      imageUrl: 'https://example.com/seed.png',
      options: {
        modelId: 'grok-video-1',
      },
    })

    expect(generateVideoViaOpenAICompatMock).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'grok-compatible:gk-1',
      modelId: 'grok-video-1',
      profile: 'openai-compatible',
    }))
  })
})
