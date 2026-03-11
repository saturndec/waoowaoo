import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'openai-compatible:oa-1',
  apiKey: 'sk-test',
  baseUrl: 'https://compat.example.com/v1',
})))
const getUserModelsMock = vi.hoisted(() =>
  vi.fn<typeof import('@/lib/api-config').getUserModels>(async () => []),
)

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
  getUserModels: getUserModelsMock,
}))

import { pollAsyncTask } from '@/lib/async-poll'

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

describe('async poll ocompat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn() as unknown as typeof fetch
  })

  it('returns completed with output url when async status reaches done', async () => {
    getUserModelsMock.mockResolvedValueOnce([
      {
        modelKey: 'openai-compatible:oa-1::veo3.1',
        modelId: 'veo3.1',
        name: 'Veo 3.1',
        type: 'video',
        provider: 'openai-compatible:oa-1',
        price: 0,
        compatMediaTemplate: {
          version: 1,
          mediaType: 'video',
          mode: 'async',
          create: { method: 'POST', path: '/v2/videos/generations' },
          status: { method: 'GET', path: '/v2/videos/generations/{{task_id}}' },
          response: {
            statusPath: '$.status',
            outputUrlPath: '$.video_url',
          },
          polling: {
            intervalMs: 3000,
            timeoutMs: 180000,
            doneStates: ['succeeded'],
            failStates: ['failed'],
          },
        },
      },
    ])
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 'succeeded',
      video_url: 'https://cdn.test/video.mp4',
    }), { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await pollAsyncTask(
      `OCOMPAT:VIDEO:${encode('openai-compatible:oa-1')}:${encode('openai-compatible:oa-1::veo3.1')}:task_1`,
      'user-1',
    )

    expect(result).toEqual({
      status: 'completed',
      resultUrl: 'https://cdn.test/video.mp4',
      videoUrl: 'https://cdn.test/video.mp4',
    })
  })

  it('falls back to nested video.url when configured outputUrlPath does not match', async () => {
    getUserModelsMock.mockResolvedValueOnce([
      {
        modelKey: 'grok-compatible:gk-1::grok-imagine-video',
        modelId: 'grok-imagine-video',
        name: 'Grok Imagine Video',
        type: 'video',
        provider: 'grok-compatible:gk-1',
        price: 0,
        compatMediaTemplate: {
          version: 1,
          mediaType: 'video',
          mode: 'async',
          create: { method: 'POST', path: '/videos/generations' },
          status: { method: 'GET', path: '/videos/{{task_id}}' },
          response: {
            statusPath: '$.status',
            outputUrlPath: '$.output_url',
          },
          polling: {
            intervalMs: 3000,
            timeoutMs: 180000,
            doneStates: ['done'],
            failStates: ['expired'],
          },
        },
      },
    ])

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 'done',
      video: {
        url: 'https://cdn.x.ai/video.mp4',
      },
    }), { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await pollAsyncTask(
      `OCOMPAT:VIDEO:${encode('grok-compatible:gk-1')}:${encode('grok-compatible:gk-1::grok-imagine-video')}:task_grok`,
      'user-1',
    )

    expect(result).toEqual({
      status: 'completed',
      resultUrl: 'https://cdn.x.ai/video.mp4',
      videoUrl: 'https://cdn.x.ai/video.mp4',
    })
  })

  it('uses content endpoint when output url is missing', async () => {
    getUserModelsMock.mockResolvedValueOnce([
      {
        modelKey: 'openai-compatible:oa-1::veo3.1',
        modelId: 'veo3.1',
        name: 'Veo 3.1',
        type: 'video',
        provider: 'openai-compatible:oa-1',
        price: 0,
        compatMediaTemplate: {
          version: 1,
          mediaType: 'video',
          mode: 'async',
          create: { method: 'POST', path: '/v2/videos/generations' },
          status: { method: 'GET', path: '/v2/videos/generations/{{task_id}}' },
          content: { method: 'GET', path: '/v2/videos/generations/{{task_id}}/content' },
          response: {
            statusPath: '$.status',
          },
          polling: {
            intervalMs: 3000,
            timeoutMs: 180000,
            doneStates: ['succeeded'],
            failStates: ['failed'],
          },
        },
      },
    ])
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 'succeeded',
    }), { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await pollAsyncTask(
      `OCOMPAT:VIDEO:${encode('openai-compatible:oa-1')}:${encode('openai-compatible:oa-1::veo3.1')}:task_2`,
      'user-1',
    )

    expect(result.status).toBe('completed')
    expect(result.videoUrl).toBe('https://compat.example.com/v1/v2/videos/generations/task_2/content')
    expect(result.downloadHeaders).toEqual({
      Authorization: 'Bearer sk-test',
    })
  })

  it('accepts compact OCOMPAT token encoded from modelId', async () => {
    const providerUuid = '33331fb0-2806-4da6-85ff-cd2433b587d0'
    getUserModelsMock.mockResolvedValueOnce([
      {
        modelKey: `openai-compatible:${providerUuid}::veo3.1-fast`,
        modelId: 'veo3.1-fast',
        name: 'Veo 3.1 Fast',
        type: 'video',
        provider: `openai-compatible:${providerUuid}`,
        price: 0,
        compatMediaTemplate: {
          version: 1,
          mediaType: 'video',
          mode: 'async',
          create: { method: 'POST', path: '/video/create' },
          status: { method: 'GET', path: '/video/query?id={{task_id}}' },
          response: {
            statusPath: '$.status',
            outputUrlPath: '$.video_url',
          },
          polling: {
            intervalMs: 3000,
            timeoutMs: 180000,
            doneStates: ['completed'],
            failStates: ['failed'],
          },
        },
      },
    ])
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 'completed',
      video_url: 'https://cdn.test/video-fast.mp4',
    }), { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await pollAsyncTask(
      `OCOMPAT:VIDEO:u_${providerUuid}:${encode('veo3.1-fast')}:task_3`,
      'user-1',
    )

    expect(result).toEqual({
      status: 'completed',
      resultUrl: 'https://cdn.test/video-fast.mp4',
      videoUrl: 'https://cdn.test/video-fast.mp4',
    })
  })
})
