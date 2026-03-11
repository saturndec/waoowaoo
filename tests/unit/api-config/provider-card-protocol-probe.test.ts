import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CustomModel } from '@/app/[locale]/profile/components/api-config/types'
import {
  probeModelLlmProtocolViaApi,
  shouldProbeModelLlmProtocol,
  shouldReprobeModelLlmProtocol,
} from '@/app/[locale]/profile/components/api-config/provider-card/hooks/useProviderCardState'

describe('api-config provider-card protocol probe helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('only probes openai-compat llm models', () => {
    expect(shouldProbeModelLlmProtocol({ providerId: 'openai-compatible:oa-1', modelType: 'llm' })).toBe(true)
    expect(shouldProbeModelLlmProtocol({ providerId: 'grok-compatible:gk-1', modelType: 'llm' })).toBe(true)
    expect(shouldProbeModelLlmProtocol({ providerId: 'openai-compatible:oa-1', modelType: 'image' })).toBe(false)
    expect(shouldProbeModelLlmProtocol({ providerId: 'gemini-compatible:gm-1', modelType: 'llm' })).toBe(false)
  })

  it('re-probes only when modelId/provider changed on openai-compatible llm', () => {
    const originalModel: CustomModel = {
      modelId: 'gpt-4.1-mini',
      modelKey: 'openai-compatible:oa-1::gpt-4.1-mini',
      name: 'GPT 4.1 Mini',
      type: 'llm',
      provider: 'openai-compatible:oa-1',
      llmProtocol: 'chat-completions',
      llmProtocolCheckedAt: '2026-01-01T00:00:00.000Z',
      price: 0,
      enabled: true,
    }

    expect(shouldReprobeModelLlmProtocol({
      providerId: 'openai-compatible:oa-1',
      originalModel,
      nextModelId: 'gpt-4.1-mini',
    })).toBe(false)

    expect(shouldReprobeModelLlmProtocol({
      providerId: 'openai-compatible:oa-1',
      originalModel,
      nextModelId: 'gpt-4.1',
    })).toBe(true)

    expect(shouldReprobeModelLlmProtocol({
      providerId: 'gemini-compatible:gm-1',
      originalModel,
      nextModelId: 'gpt-4.1',
    })).toBe(false)
  })

  it('parses successful probe response payload', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      protocol: 'responses',
      checkedAt: '2026-03-05T10:00:00.000Z',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await probeModelLlmProtocolViaApi({
      providerId: 'openai-compatible:oa-1',
      modelId: 'gpt-4.1-mini',
    })

    expect(result).toEqual({
      llmProtocol: 'responses',
      llmProtocolCheckedAt: '2026-03-05T10:00:00.000Z',
    })
  })

  it('throws probe failure code on unsuccessful probe response', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: false,
      code: 'PROBE_INCONCLUSIVE',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(probeModelLlmProtocolViaApi({
      providerId: 'openai-compatible:oa-1',
      modelId: 'gpt-4.1-mini',
    })).rejects.toThrow('PROBE_INCONCLUSIVE')
  })
})
