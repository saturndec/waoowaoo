import { beforeEach, describe, expect, it, vi } from 'vitest'

const openAIState = vi.hoisted(() => ({
  create: vi.fn(),
  toFile: vi.fn(async () => ({ name: 'reference-file' })),
}))

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'openai-compatible:oa-1',
  apiKey: 'oa-key',
  baseUrl: 'https://oa.test/v1',
})))

const imageUrlToBase64Mock = vi.hoisted(() => vi.fn(async () => 'data:image/png;base64,QQ=='))

vi.mock('openai', () => ({
  default: class OpenAI {
    videos = {
      create: openAIState.create,
    }
  },
  toFile: openAIState.toFile,
}))

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

vi.mock('@/lib/cos', () => ({
  imageUrlToBase64: imageUrlToBase64Mock,
}))

import { OpenAICompatibleVideoGenerator } from '@/lib/generators/video/openai-compatible'

describe('OpenAICompatibleVideoGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getProviderConfigMock.mockResolvedValue({
      id: 'openai-compatible:oa-1',
      apiKey: 'oa-key',
      baseUrl: 'https://oa.test/v1',
    })
  })

  it('submits official videos.create payload and returns OPENAI externalId', async () => {
    openAIState.create.mockResolvedValueOnce({ id: 'vid_123' })

    const generator = new OpenAICompatibleVideoGenerator('openai-compatible:oa-1')
    const result = await generator.generate({
      userId: 'user-1',
      imageUrl: 'https://example.com/seed.png',
      prompt: 'animate this character',
      options: {
        modelId: 'sora-2',
        duration: 8,
        resolution: '720p',
        aspectRatio: '16:9',
      },
    })

    expect(result.success).toBe(true)
    expect(result.async).toBe(true)
    expect(result.requestId).toBe('vid_123')

    const expectedProviderToken = Buffer.from('openai-compatible:oa-1', 'utf8').toString('base64url')
    expect(result.externalId).toBe(`OPENAI:VIDEO:${expectedProviderToken}:vid_123`)

    const createCall = openAIState.create.mock.calls[0]
    expect(createCall).toBeTruthy()
    if (!createCall) {
      throw new Error('videos.create should be called')
    }

    expect(createCall[0]).toMatchObject({
      prompt: 'animate this character',
      model: 'sora-2',
      seconds: '8',
      size: '1280x720',
    })
    expect((createCall[0] as { input_reference?: unknown }).input_reference).toBeDefined()
  })

  it('allows custom model ids for openai-compatible gateways', async () => {
    openAIState.create.mockResolvedValueOnce({ id: 'vid_custom' })

    const generator = new OpenAICompatibleVideoGenerator('openai-compatible:oa-1')
    const result = await generator.generate({
      userId: 'user-1',
      imageUrl: 'https://example.com/seed.png',
      prompt: 'animate',
      options: {
        modelId: 'veo_3_1-fast-4K',
      },
    })

    expect(result.success).toBe(true)
    const createCall = openAIState.create.mock.calls.at(0)
    expect(createCall).toBeTruthy()
    if (!createCall) {
      throw new Error('videos.create should be called')
    }
    expect((createCall[0] as { model?: string }).model).toBe('veo_3_1-fast-4K')
  })

  it('maps 3:2 to landscape size explicitly', async () => {
    openAIState.create.mockResolvedValueOnce({ id: 'vid_32' })

    const generator = new OpenAICompatibleVideoGenerator('openai-compatible:oa-1')
    const result = await generator.generate({
      userId: 'user-1',
      imageUrl: 'https://example.com/seed.png',
      prompt: 'animate',
      options: {
        resolution: '1080p',
        aspectRatio: '3:2',
      },
    })

    expect(result.success).toBe(true)
    const createCall = openAIState.create.mock.calls.at(0)
    expect(createCall).toBeTruthy()
    if (!createCall) {
      throw new Error('videos.create should be called')
    }
    expect((createCall[0] as { size?: string }).size).toBe('1792x1024')
  })

  it('maps 2:3 to portrait size explicitly', async () => {
    openAIState.create.mockResolvedValueOnce({ id: 'vid_23' })

    const generator = new OpenAICompatibleVideoGenerator('openai-compatible:oa-1')
    const result = await generator.generate({
      userId: 'user-1',
      imageUrl: 'https://example.com/seed.png',
      prompt: 'animate',
      options: {
        resolution: '720p',
        aspectRatio: '2:3',
      },
    })

    expect(result.success).toBe(true)
    const createCall = openAIState.create.mock.calls.at(0)
    expect(createCall).toBeTruthy()
    if (!createCall) {
      throw new Error('videos.create should be called')
    }
    expect((createCall[0] as { size?: string }).size).toBe('720x1280')
  })

  it('fails explicitly on unsupported aspect ratios', async () => {
    const generator = new OpenAICompatibleVideoGenerator('openai-compatible:oa-1')
    const result = await generator.generate({
      userId: 'user-1',
      imageUrl: 'https://example.com/seed.png',
      prompt: 'animate',
      options: {
        resolution: '720p',
        aspectRatio: '5:4',
      },
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('OPENAI_VIDEO_ASPECT_RATIO_UNSUPPORTED')
  })
})
