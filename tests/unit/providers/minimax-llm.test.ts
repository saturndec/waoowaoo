import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resetOfficialModelRegistryForTest,
} from '@/lib/providers/official/model-registry'
import { completeMiniMaxLlm } from '@/lib/providers/minimax/llm'
import { ensureMiniMaxCatalogRegistered, resetMiniMaxCatalogForTest } from '@/lib/providers/minimax/catalog'

// Mock OpenAI
vi.mock('openai', () => {
  const mockCreate = vi.fn().mockResolvedValue({
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 1234567890,
    model: 'MiniMax-M2.5',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'Hello! How can I help you?',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 8,
      total_tokens: 18,
    },
  })

  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  }
})

describe('minimax llm', () => {
  beforeEach(() => {
    resetOfficialModelRegistryForTest()
    resetMiniMaxCatalogForTest()
    ensureMiniMaxCatalogRegistered()
  })

  it('completes a chat request with MiniMax-M2.5', async () => {
    const result = await completeMiniMaxLlm({
      modelId: 'MiniMax-M2.5',
      messages: [{ role: 'user', content: 'Hello' }],
      apiKey: 'test-api-key',
    })

    expect(result.choices[0].message.content).toBe('Hello! How can I help you?')
    expect(result.model).toBe('MiniMax-M2.5')
  })

  it('completes a chat request with MiniMax-M2.5-highspeed', async () => {
    const result = await completeMiniMaxLlm({
      modelId: 'MiniMax-M2.5-highspeed',
      messages: [{ role: 'user', content: 'Hello' }],
      apiKey: 'test-api-key',
    })

    expect(result.choices[0].message.content).toBe('Hello! How can I help you?')
  })

  it('throws MODEL_NOT_REGISTERED for unregistered model', async () => {
    await expect(
      completeMiniMaxLlm({
        modelId: 'unknown-model',
        messages: [{ role: 'user', content: 'Hello' }],
        apiKey: 'test-api-key',
      }),
    ).rejects.toThrow(/MODEL_NOT_REGISTERED/)
  })

  it('uses default base URL when not provided', async () => {
    const OpenAI = (await import('openai')).default

    await completeMiniMaxLlm({
      modelId: 'MiniMax-M2.5',
      messages: [{ role: 'user', content: 'Hello' }],
      apiKey: 'test-api-key',
    })

    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.minimaxi.com/v1',
        apiKey: 'test-api-key',
      }),
    )
  })

  it('uses custom base URL when provided', async () => {
    const OpenAI = (await import('openai')).default

    await completeMiniMaxLlm({
      modelId: 'MiniMax-M2.5',
      messages: [{ role: 'user', content: 'Hello' }],
      apiKey: 'test-api-key',
      baseUrl: 'https://api.minimax.io/v1',
    })

    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.minimax.io/v1',
        apiKey: 'test-api-key',
      }),
    )
  })
})
