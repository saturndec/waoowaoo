import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() => vi.fn())
const imagesGenerateMock = vi.hoisted(() => vi.fn())
const videosCreateMock = vi.hoisted(() => vi.fn())
const openAIConstructorMock = vi.hoisted(() => vi.fn(() => ({
  images: {
    generate: imagesGenerateMock,
  },
  videos: {
    create: videosCreateMock,
  },
})))

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
  getProviderKey: (providerId?: string) => {
    if (!providerId) return ''
    const colonIndex = providerId.indexOf(':')
    return colonIndex === -1 ? providerId : providerId.slice(0, colonIndex)
  },
}))

vi.mock('openai', () => ({
  default: openAIConstructorMock,
}))

describe('openai-compatible media generators via factory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getProviderConfigMock.mockResolvedValue({
      id: 'openai-compatible:custom',
      name: 'OpenAI Compatible',
      apiKey: 'sk-test',
      baseUrl: 'https://example.com/v1',
    })
  })

  it('createImageGenerator should return openai-compatible image generator', async () => {
    const { createImageGenerator } = await import('@/lib/generators/factory')

    const generator = createImageGenerator('openai-compatible:custom', 'gpt-image-1')

    expect(generator.constructor.name).toBe('OpenAICompatibleImageGenerator')
  })

  it('createVideoGenerator should return openai-compatible video generator', async () => {
    const { createVideoGenerator } = await import('@/lib/generators/factory')

    const generator = createVideoGenerator('openai-compatible:custom')

    expect(generator.constructor.name).toBe('OpenAICompatibleVideoGenerator')
  })

  it('openai-compatible image generator should parse url/base64 response', async () => {
    const { OpenAICompatibleImageGenerator } = await import('@/lib/generators/openai-compatible')
    const generator = new OpenAICompatibleImageGenerator('gpt-image-1', 'openai-compatible:custom')

    imagesGenerateMock.mockResolvedValueOnce({
      data: [{ url: 'https://cdn.example.com/image-a.png' }],
    })

    const urlResult = await generator.generate({
      userId: 'user-1',
      prompt: 'draw a castle',
      options: { aspectRatio: '1:1' },
    })

    expect(urlResult.success).toBe(true)
    expect(urlResult.imageUrl).toBe('https://cdn.example.com/image-a.png')
    expect(imagesGenerateMock).toHaveBeenLastCalledWith(expect.objectContaining({
      model: 'gpt-image-1',
      prompt: 'draw a castle',
      size: '1024x1024',
      response_format: 'b64_json',
    }))

    imagesGenerateMock.mockResolvedValueOnce({
      data: [{ url: 'https://cdn.example.com/image-3-2.png' }],
    })

    const ratioResult = await generator.generate({
      userId: 'user-1',
      prompt: 'draw a character portrait',
      options: { aspectRatio: '3:2' },
    })

    expect(ratioResult.success).toBe(true)
    expect(ratioResult.imageUrl).toBe('https://cdn.example.com/image-3-2.png')
    expect(imagesGenerateMock).toHaveBeenLastCalledWith(expect.objectContaining({
      model: 'gpt-image-1',
      prompt: 'draw a character portrait',
      size: '1792x1024',
      response_format: 'b64_json',
    }))

    imagesGenerateMock.mockResolvedValueOnce({
      data: [{ b64_json: 'ZmFrZS1iYXNlNjQ=' }],
    })

    const base64Result = await generator.generate({
      userId: 'user-1',
      prompt: 'draw a forest',
    })

    expect(base64Result.success).toBe(true)
    expect(base64Result.imageBase64).toBe('ZmFrZS1iYXNlNjQ=')
    expect(base64Result.imageUrl).toBe('data:image/png;base64,ZmFrZS1iYXNlNjQ=')
  })

  it('openai-compatible video generator should parse html/url response', async () => {
    const { OpenAICompatibleVideoGenerator } = await import('@/lib/generators/openai-compatible')
    const generator = new OpenAICompatibleVideoGenerator('sora-2', 'openai-compatible:custom')

    videosCreateMock.mockResolvedValueOnce({
      html: '<video controls src="https://cdn.example.com/video-a.mp4"></video>',
    })

    const htmlResult = await generator.generate({
      userId: 'user-1',
      imageUrl: '/api/files/panel.png',
      prompt: 'make a short cinematic video',
      options: {
        duration: 4,
        aspectRatio: '16:9',
      },
    })

    expect(htmlResult.success).toBe(true)
    expect(htmlResult.videoUrl).toBe('https://cdn.example.com/video-a.mp4')
    expect(videosCreateMock).toHaveBeenLastCalledWith(expect.objectContaining({
      model: 'sora-2',
      prompt: 'make a short cinematic video',
      input_reference: 'http://localhost:3000/api/files/panel.png',
      image_url: 'http://localhost:3000/api/files/panel.png',
      seconds: '4',
      size: '1792x1024',
      aspect_ratio: '16:9',
    }))

    videosCreateMock.mockResolvedValueOnce({
      video_url: 'https://cdn.example.com/video-b.mp4',
    })

    const urlResult = await generator.generate({
      userId: 'user-1',
      imageUrl: 'https://cdn.example.com/panel.png',
      prompt: 'make another cinematic video',
    })

    expect(urlResult.success).toBe(true)
    expect(urlResult.videoUrl).toBe('https://cdn.example.com/video-b.mp4')
  })

  it('openai-compatible video generator should map 3:2 aspect ratio to video size', async () => {
    const { OpenAICompatibleVideoGenerator } = await import('@/lib/generators/openai-compatible')
    const generator = new OpenAICompatibleVideoGenerator('sora-2', 'openai-compatible:custom')

    videosCreateMock.mockResolvedValueOnce({
      video_url: 'https://cdn.example.com/video-3-2.mp4',
    })

    const result = await generator.generate({
      userId: 'user-1',
      imageUrl: 'https://cdn.example.com/character.png',
      prompt: 'generate character intro video',
      options: {
        aspectRatio: '3:2',
      },
    })

    expect(result.success).toBe(true)
    expect(result.videoUrl).toBe('https://cdn.example.com/video-3-2.mp4')
    expect(videosCreateMock).toHaveBeenLastCalledWith(expect.objectContaining({
      model: 'sora-2',
      prompt: 'generate character intro video',
      input_reference: 'https://cdn.example.com/character.png',
      image_url: 'https://cdn.example.com/character.png',
      size: '1536x1024',
      aspect_ratio: '3:2',
    }))
  })
})
