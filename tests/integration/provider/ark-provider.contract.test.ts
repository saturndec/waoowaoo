import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { arkCreateVideoTask, executeArkVideoGeneration } from '@/lib/ai-providers/ark/video'
import { querySeedanceVideoStatus } from '@/lib/ai-providers/ark/poll'

const runtimeConfigMock = vi.hoisted(() => ({
  getProviderConfig: vi.fn(async () => ({ apiKey: 'ark-key' })),
}))

const outboundImageMock = vi.hoisted(() => ({
  normalizeToBase64ForGeneration: vi.fn(async (url: string) => `normalized:${url}`),
}))

vi.mock('@/lib/user-api/runtime-config', () => runtimeConfigMock)
vi.mock('@/lib/media/outbound-image', () => outboundImageMock)

describe('provider contract - ark seedance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('submits Seedance 2.0 multimodal create payload with official request fields', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'cgt-task-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await arkCreateVideoTask({
      model: 'doubao-seedance-2-0-260128',
      content: [
        { type: 'text', text: 'reference 视频1 的运镜，参考音频1 的节奏' },
        { type: 'image_url', image_url: { url: 'https://example.com/first.png' }, role: 'reference_image' },
        { type: 'video_url', video_url: { url: 'https://example.com/ref.mp4' }, role: 'reference_video' },
        { type: 'audio_url', audio_url: { url: 'https://example.com/ref.mp3' }, role: 'reference_audio' },
      ],
      resolution: '720p',
      ratio: '16:9',
      duration: 15,
      generate_audio: true,
      watermark: true,
      tools: [{ type: 'web_search' }],
    }, {
      apiKey: 'ark-key',
      maxRetries: 1,
      timeoutMs: 1000,
      logPrefix: '[Ark Test]',
    })

    expect(result.id).toBe('cgt-task-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeTruthy()
    const [url, init] = firstCall as unknown as [string, RequestInit]
    expect(url).toBe('https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ark-key',
    })
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'doubao-seedance-2-0-260128',
      content: [
        { type: 'text', text: 'reference 视频1 的运镜，参考音频1 的节奏' },
        { type: 'image_url', image_url: { url: 'https://example.com/first.png' }, role: 'reference_image' },
        { type: 'video_url', video_url: { url: 'https://example.com/ref.mp4' }, role: 'reference_video' },
        { type: 'audio_url', audio_url: { url: 'https://example.com/ref.mp3' }, role: 'reference_audio' },
      ],
      resolution: '720p',
      ratio: '16:9',
      duration: 15,
      generate_audio: true,
      watermark: true,
      tools: [{ type: 'web_search' }],
    })
  })

  it('executes Seedance video generation with referenceImages as reference_image content', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'cgt-task-ref-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await executeArkVideoGeneration({
      userId: 'user-1',
      selection: {
        provider: 'ark',
        modelId: 'doubao-seedance-2-0-fast-260128',
        modelKey: 'ark::doubao-seedance-2-0-fast-260128',
        variantSubKind: 'official',
      },
      imageUrl: 'https://example.com/first.png',
      options: {
        prompt: 'continuous segment prompt',
        duration: 5,
        resolution: '720p',
        aspectRatio: '9:16',
        generateAudio: true,
        referenceImages: ['https://example.com/character.png', 'https://example.com/location.png'],
      },
    })

    expect(result).toEqual(expect.objectContaining({
      success: true,
      async: true,
      requestId: 'cgt-task-ref-1',
      externalId: 'ARK:VIDEO:cgt-task-ref-1',
    }))
    expect(outboundImageMock.normalizeToBase64ForGeneration).toHaveBeenCalledTimes(3)
    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeTruthy()
    const [, init] = firstCall as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'doubao-seedance-2-0-fast-260128',
      content: [
        { type: 'text', text: 'continuous segment prompt' },
        { type: 'image_url', image_url: { url: 'normalized:https://example.com/first.png' } },
        { type: 'image_url', image_url: { url: 'normalized:https://example.com/character.png' }, role: 'reference_image' },
        { type: 'image_url', image_url: { url: 'normalized:https://example.com/location.png' }, role: 'reference_image' },
      ],
      resolution: '720p',
      ratio: '9:16',
      duration: 5,
      generate_audio: true,
    })
  })

  it('reads Ark task usage.total_tokens from status query', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 'succeeded',
      content: {
        video_url: 'https://example.com/result.mp4',
      },
      usage: {
        total_tokens: 108000,
        completion_tokens: 108000,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await querySeedanceVideoStatus('cgt-task-2', 'ark-key')

    expect(result).toEqual({
      status: 'completed',
      videoUrl: 'https://example.com/result.mp4',
      actualVideoTokens: 108000,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/cgt-task-2',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ark-key',
        },
        cache: 'no-store',
      },
    )
  })
})
