import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveConfigMock = vi.hoisted(() => vi.fn(async () => ({
  providerId: 'openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0',
  baseUrl: 'https://compat.example.com/v1',
  apiKey: 'sk-test',
})))

vi.mock('@/lib/model-gateway/openai-compat/common', () => ({
  resolveOpenAICompatClientConfig: resolveConfigMock,
  sanitizeTemplateOptions: (options?: Record<string, unknown>) => {
    if (!options) return undefined
    const sanitized: Record<string, unknown> = {}
    for (const [key, rawValue] of Object.entries(options)) {
      if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim()
        if (!trimmed) continue
        sanitized[key] = trimmed
        continue
      }
      sanitized[key] = rawValue
    }
    return Object.keys(sanitized).length > 0 ? sanitized : undefined
  },
}))

import { generateVideoViaOpenAICompatTemplate } from '@/lib/model-gateway/openai-compat/template-video'

describe('openai-compat template video externalId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('encodes compact modelId token for OCOMPAT externalId', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      id: 'veo3.1-fast:1772734762-6TuDIS8Vvr',
      status: 'pending',
    }), { status: 200 })) as unknown as typeof fetch

    const result = await generateVideoViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0',
      modelId: 'veo3.1-fast',
      modelKey: 'openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0::veo3.1-fast',
      imageUrl: 'https://example.com/seed.png',
      prompt: 'animate this image',
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'video',
        mode: 'async',
        create: {
          method: 'POST',
          path: '/video/create',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
          },
        },
        status: {
          method: 'GET',
          path: '/video/query?id={{task_id}}',
        },
        response: {
          taskIdPath: '$.id',
          statusPath: '$.status',
        },
        polling: {
          intervalMs: 5000,
          timeoutMs: 600000,
          doneStates: ['completed'],
          failStates: ['failed'],
        },
      },
    })

    expect(result.success).toBe(true)
    expect(result.async).toBe(true)
    expect(result.externalId).toContain(':u_33331fb0-2806-4da6-85ff-cd2433b587d0:')
    expect(result.externalId).toContain(`:${Buffer.from('veo3.1-fast', 'utf8').toString('base64url')}:`)
    expect(result.externalId).not.toContain(Buffer.from('openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0::veo3.1-fast', 'utf8').toString('base64url'))
    expect(result.externalId!.length).toBeLessThanOrEqual(128)
  })

  it('strips empty string options from template payload', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      request_id: 'rq_123',
      status: 'pending',
    }), { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await generateVideoViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0',
      modelId: 'grok-video-1',
      modelKey: 'openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0::grok-video-1',
      imageUrl: 'https://example.com/seed.png',
      prompt: 'animate this image',
      profile: 'openai-compatible',
      options: {
        resolution: '   ',
        aspectRatio: ' 16:9 ',
      },
      template: {
        version: 1,
        mediaType: 'video',
        mode: 'async',
        create: {
          method: 'POST',
          path: '/videos/generations',
          contentType: 'application/json',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
            image: { url: '{{image}}' },
            resolution: '{{resolution}}',
            aspect_ratio: '{{aspect_ratio}}',
          },
        },
        status: {
          method: 'GET',
          path: '/videos/{{task_id}}',
        },
        response: {
          taskIdPath: '$.request_id',
          statusPath: '$.status',
        },
        polling: {
          intervalMs: 5000,
          timeoutMs: 600000,
          doneStates: ['completed'],
          failStates: ['failed'],
        },
      },
    })

    expect(result.success).toBe(true)
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(requestInit).toBeTruthy()
    const parsedBody = JSON.parse(String(requestInit?.body))
    expect(parsedBody.resolution).toBeUndefined()
    expect(parsedBody.aspect_ratio).toBe('16:9')
  })
})
