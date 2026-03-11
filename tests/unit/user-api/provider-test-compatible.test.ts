import { beforeEach, describe, expect, it, vi } from 'vitest'

const openAIState = vi.hoisted(() => ({
  create: vi.fn(async () => ({
    choices: [{ message: { content: 'pong' } }],
  })),
}))

const fetchMock = vi.hoisted(() =>
  vi.fn<typeof fetch>(async () => new Response('not-found', { status: 404 })),
)

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: openAIState.create,
      },
    }
  },
}))

import { testProviderConnection } from '@/lib/user-api/provider-test'

describe('provider test connection compatible probes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('asks user to configure llm when free probes are unsupported', async () => {
    const result = await testProviderConnection({
      apiType: 'openai-compatible',
      baseUrl: 'https://compat.example.com/v1',
      apiKey: 'compat-key',
    })

    expect(result.success).toBe(false)
    expect(result.steps[0]?.name).toBe('models')
    expect(result.steps[0]?.status).toBe('skip')
    expect(result.steps[1]?.name).toBe('credits')
    expect(result.steps[1]?.status).toBe('skip')
    expect(result.steps[2]).toEqual({
      name: 'textGen',
      status: 'fail',
      message: 'No free probe endpoint detected. Please configure an LLM model first, then retry / 未发现可用的免费探测接口，请先配置 LLM 模型后再测试',
    })
  })

  it('falls back to configured llm test when free probes are unsupported', async () => {
    const result = await testProviderConnection({
      apiType: 'openai-compatible',
      baseUrl: 'https://compat.example.com/v1',
      apiKey: 'compat-key',
      llmModel: 'gpt-4.1-mini',
    })

    expect(result.success).toBe(true)
    expect(result.steps[0]?.status).toBe('skip')
    expect(result.steps[1]?.status).toBe('skip')
    expect(result.steps[2]).toEqual({
      name: 'textGen',
      status: 'pass',
      model: 'gpt-4.1-mini',
      message: 'Response: pong',
    })
    expect(openAIState.create).toHaveBeenCalledWith({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 20,
      temperature: 0,
    })
  })

  it('marks success when any free probe endpoint passes', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'm1' }, { id: 'm2' }] }), { status: 200 })
      }
      return new Response('not-found', { status: 404 })
    })

    const result = await testProviderConnection({
      apiType: 'gemini-compatible',
      baseUrl: 'https://compat.example.com',
      apiKey: 'compat-key',
    })

    expect(result.success).toBe(true)
    expect(result.steps[0]).toMatchObject({
      name: 'models',
      status: 'pass',
      message: 'Found 2 models',
    })
    expect(result.steps[1]?.name).toBe('credits')
    expect(result.steps[1]?.status).toBe('skip')
    expect(result.steps.length).toBe(2)
  })

  it('supports grok-compatible with the same compatible probe path strategy', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'grok-4' }] }), { status: 200 })
      }
      return new Response('not-found', { status: 404 })
    })

    const result = await testProviderConnection({
      apiType: 'grok-compatible',
      baseUrl: 'https://api.x.ai',
      apiKey: 'xai-key',
    })

    expect(result.success).toBe(true)
    expect(result.steps[0]).toMatchObject({
      name: 'models',
      status: 'pass',
      message: 'Found 1 models',
    })
    expect(result.steps[1]?.status).toBe('skip')
  })
})
