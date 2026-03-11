import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveOpenAICompatClientConfigMock = vi.hoisted(() =>
  vi.fn(async (_userId: string, providerId: string) => ({
    providerId,
    baseUrl: 'https://compat.example.com/v1',
    apiKey: 'sk-test',
  })),
)

vi.mock('@/lib/model-gateway/openai-compat/common', () => ({
  resolveOpenAICompatClientConfig: resolveOpenAICompatClientConfigMock,
}))

import { probeModelLlmProtocol } from '@/lib/user-api/model-llm-protocol-probe'

describe('user-api model llm protocol probe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns responses protocol when responses endpoint succeeds', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'resp_1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await probeModelLlmProtocol({
      userId: 'user-1',
      providerId: 'openai-compatible:node-1',
      modelId: 'gpt-4.1-mini',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.protocol).toBe('responses')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstCall = fetchMock.mock.calls[0] as unknown[] | undefined
    expect(String(firstCall?.[0])).toBe('https://compat.example.com/v1/responses')
  })

  it('supports grok-compatible providers in the same probe chain', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'resp_1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await probeModelLlmProtocol({
      userId: 'user-1',
      providerId: 'grok-compatible:gk-1',
      modelId: 'grok-4-fast-reasoning',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.protocol).toBe('responses')
    expect(resolveOpenAICompatClientConfigMock).toHaveBeenCalledWith('user-1', 'grok-compatible:gk-1')
  })

  it('returns chat-completions when responses is unsupported and chat succeeds', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url.endsWith('/responses')) return new Response('not found', { status: 404 })
      if (url.endsWith('/chat/completions')) return new Response(JSON.stringify({ id: 'chatcmpl_1' }), { status: 200 })
      return new Response('unexpected', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await probeModelLlmProtocol({
      userId: 'user-1',
      providerId: 'openai-compatible:node-1',
      modelId: 'gpt-4.1-mini',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.protocol).toBe('chat-completions')
    expect(result.traces.map((trace) => trace.endpoint)).toEqual(['responses', 'chat-completions'])
  })

  it('returns chat-completions when responses is rate limited but chat succeeds', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url.endsWith('/responses')) return new Response('rate limit', { status: 429 })
      if (url.endsWith('/chat/completions')) return new Response(JSON.stringify({ id: 'chatcmpl_1' }), { status: 200 })
      return new Response('unexpected', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await probeModelLlmProtocol({
      userId: 'user-1',
      providerId: 'openai-compatible:node-1',
      modelId: 'gpt-4.1-mini',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.protocol).toBe('chat-completions')
    expect(result.traces[0]?.status).toBe(429)
    expect(result.traces[1]?.status).toBe(200)
  })

  it('treats responses 5xx with not-implemented style message as unsupported', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url.endsWith('/responses')) {
        return new Response(JSON.stringify({
          error: {
            message: 'not implemented (request id: x)',
            code: 'local:convert_request_failed',
          },
        }), { status: 500 })
      }
      if (url.endsWith('/chat/completions')) {
        return new Response(JSON.stringify({ id: 'chatcmpl_1' }), { status: 200 })
      }
      return new Response('unexpected', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await probeModelLlmProtocol({
      userId: 'user-1',
      providerId: 'openai-compatible:node-1',
      modelId: 'gpt-4.1-mini',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.protocol).toBe('chat-completions')
  })

  it('treats responses 400 with unsupported keywords as unsupported', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url.endsWith('/responses')) {
        return new Response(JSON.stringify({ error: { message: 'unknown endpoint /responses' } }), { status: 400 })
      }
      if (url.endsWith('/chat/completions')) {
        return new Response(JSON.stringify({ id: 'chatcmpl_1' }), { status: 200 })
      }
      return new Response('unexpected', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await probeModelLlmProtocol({
      userId: 'user-1',
      providerId: 'openai-compatible:node-1',
      modelId: 'gpt-4.1-mini',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.protocol).toBe('chat-completions')
  })

  it('returns chat-completions when responses 422 has no unsupported keywords but chat succeeds', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url.endsWith('/responses')) {
        return new Response(JSON.stringify({ error: { message: 'invalid payload' } }), { status: 422 })
      }
      if (url.endsWith('/chat/completions')) {
        return new Response(JSON.stringify({ id: 'chatcmpl_1' }), { status: 200 })
      }
      return new Response('unexpected', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await probeModelLlmProtocol({
      userId: 'user-1',
      providerId: 'openai-compatible:node-1',
      modelId: 'gpt-4.1-mini',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.protocol).toBe('chat-completions')
    expect(result.traces[0]?.status).toBe(422)
    expect(result.traces[1]?.status).toBe(200)
  })

  it('returns auth failure when responses and chat both return 401', async () => {
    const fetchMock = vi.fn(async () => new Response('unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await probeModelLlmProtocol({
      userId: 'user-1',
      providerId: 'openai-compatible:node-1',
      modelId: 'gpt-4.1-mini',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('PROBE_AUTH_FAILED')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns chat-completions when responses auth fails but chat succeeds', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url.endsWith('/responses')) return new Response('unauthorized', { status: 401 })
      if (url.endsWith('/chat/completions')) return new Response(JSON.stringify({ id: 'chatcmpl_1' }), { status: 200 })
      return new Response('unexpected', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await probeModelLlmProtocol({
      userId: 'user-1',
      providerId: 'openai-compatible:node-1',
      modelId: 'gpt-4.1-mini',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.protocol).toBe('chat-completions')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
