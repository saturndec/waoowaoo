import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() => vi.fn())
const chatCompletionsCreateMock = vi.hoisted(() => vi.fn())
const openAIConstructorMock = vi.hoisted(() => vi.fn(() => ({
  images: {
    generate: vi.fn(),
    edit: vi.fn(),
  },
  videos: {
    create: vi.fn(),
  },
  chat: {
    completions: {
      create: chatCompletionsCreateMock,
    },
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

describe('openai-compatible video sse parse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getProviderConfigMock.mockResolvedValue({
      id: 'openai-compatible:custom',
      name: 'OpenAI Compatible',
      apiKey: 'sk-test',
      baseUrl: 'https://example.com/v1',
    })
  })

  it('extracts clean video url from sse payload without swallowing next chunk text', async () => {
    const { OpenAICompatibleVideoGenerator } = await import('@/lib/generators/openai-compatible')
    const generator = new OpenAICompatibleVideoGenerator('grok-imagine-1.0-video', 'openai-compatible:custom')

    const ssePayload = [
      'data: {"id":"chunk-1","object":"chat.completion.chunk","choices":[{"delta":{"content":"正在生成视频中，当前进度100%\\\\n"}}]}',
      'data: {"id":"chunk-1","object":"chat.completion.chunk","choices":[{"delta":{"content":"http://10.144.144.8:40005/v1/files/video/users/u/generated/x/generated_video.mp4\\\\n"}}]}',
      'data: {"id":"chunk-1","object":"chat.completion.chunk","choices":[{"delta":{"content":"I generated a video with the prompt"}}]}',
      'data: [DONE]',
      '',
    ].join('\n\n')

    chatCompletionsCreateMock.mockResolvedValueOnce({
      data: ssePayload,
    })

    const result = await generator.generate({
      userId: 'user-1',
      imageUrl: '/api/files/panel.png',
      prompt: 'make a short cinematic video',
    })

    expect(result.success).toBe(true)
    expect(result.videoUrl).toBe('http://10.144.144.8:40005/v1/files/video/users/u/generated/x/generated_video.mp4')
  })

  it('extracts image url from sse payload string response', async () => {
    const { OpenAICompatibleImageGenerator } = await import('@/lib/generators/openai-compatible')
    const generator = new OpenAICompatibleImageGenerator('grok-imagine-1.0', 'openai-compatible:custom')

    const ssePayload = [
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"![image](https://newapi.example.com/v1/files/image/final.jpg)"},"finish_reason":"stop"}]}',
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[]}',
      'data: [DONE]',
      '',
    ].join('\n\n')

    chatCompletionsCreateMock.mockResolvedValueOnce(ssePayload)

    const result = await generator.generate({
      userId: 'user-1',
      prompt: 'generate location image',
    })

    expect(result.success).toBe(true)
    expect(result.imageUrl).toBe('https://newapi.example.com/v1/files/image/final.jpg')
  })
})
