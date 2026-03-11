import { beforeEach, describe, expect, it, vi } from 'vitest'

const openAIState = vi.hoisted(() => ({
  modelList: vi.fn(async () => ({ data: [] })),
  create: vi.fn(async (payload: { model?: string }) => ({
    model: payload.model || 'gpt-4.1-mini',
    choices: [{ message: { content: '2' } }],
  })),
}))

const fetchMock = vi.hoisted(() =>
  vi.fn(async (input: unknown) => {
    const url = String(input)
    if (url.includes('/compatible-mode/v1/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'qwen-plus' }] }), { status: 200 })
    }
    if (url.endsWith('/v1/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'Qwen/Qwen3-32B' }] }), { status: 200 })
    }
    if (url.endsWith('/v1/user/info')) {
      return new Response(JSON.stringify({ data: { balance: '9.8000' } }), { status: 200 })
    }
    return new Response('not-found', { status: 404 })
  }),
)

vi.mock('openai', () => ({
  default: class OpenAI {
    models = {
      list: openAIState.modelList,
    }
    chat = {
      completions: {
        create: openAIState.create,
      },
    }
  },
}))

import { testLlmConnection } from '@/lib/user-api/llm-test-connection'

describe('llm test connection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('tests openai-compatible provider via openai-style endpoint', async () => {
    const result = await testLlmConnection({
      provider: 'openai-compatible',
      apiKey: 'oa-key',
      baseUrl: 'https://compat.example.com/v1',
      model: 'gpt-4.1-mini',
    })

    expect(result.provider).toBe('openai-compatible')
    expect(result.message).toBe('openai-compatible 连接成功')
    expect(result.model).toBe('gpt-4.1-mini')
    expect(result.answer).toBe('2')
    expect(openAIState.create).toHaveBeenCalledWith({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: '1+1等于几？只回答数字' }],
      max_tokens: 10,
      temperature: 0,
    })
  })

  it('tests grok-compatible provider via openai-style endpoint', async () => {
    const result = await testLlmConnection({
      provider: 'grok-compatible',
      apiKey: 'xai-key',
      baseUrl: 'https://api.x.ai/v1',
      model: 'grok-4-fast-reasoning',
    })

    expect(result.provider).toBe('grok-compatible')
    expect(result.message).toBe('grok-compatible 连接成功')
    expect(result.model).toBe('grok-4-fast-reasoning')
    expect(result.answer).toBe('2')
    expect(openAIState.create).toHaveBeenCalledWith({
      model: 'grok-4-fast-reasoning',
      messages: [{ role: 'user', content: '1+1等于几？只回答数字' }],
      max_tokens: 10,
      temperature: 0,
    })
  })

  it('requires baseUrl for gemini-compatible provider', async () => {
    await expect(testLlmConnection({
      provider: 'gemini-compatible',
      apiKey: 'gm-key',
    })).rejects.toThrow('自定义渠道需要提供 baseUrl')
  })

  it('tests bailian provider via zero-inference probe', async () => {
    const result = await testLlmConnection({
      provider: 'bailian',
      apiKey: 'bl-key',
    })

    expect(result.provider).toBe('bailian')
    expect(result.message).toBe('bailian 连接成功')
    expect(result.model).toBe('qwen-plus')
  })

  it('tests siliconflow provider via zero-inference probes', async () => {
    const result = await testLlmConnection({
      provider: 'siliconflow',
      apiKey: 'sf-key',
    })

    expect(result.provider).toBe('siliconflow')
    expect(result.message).toBe('siliconflow 连接成功')
    expect(result.model).toBe('Qwen/Qwen3-32B')
    expect(result.answer).toBe('balance=9.8000')
  })
})
