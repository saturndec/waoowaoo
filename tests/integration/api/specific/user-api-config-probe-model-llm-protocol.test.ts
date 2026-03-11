import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'

const probeModelLlmProtocolMock = vi.hoisted(() =>
  vi.fn(async () => ({
    success: true,
    protocol: 'responses' as const,
    checkedAt: '2026-03-05T00:00:00.000Z',
    traces: [],
  })),
)

vi.mock('@/lib/user-api/model-llm-protocol-probe', () => ({
  probeModelLlmProtocol: probeModelLlmProtocolMock,
}))

describe('api specific - user api-config probe model llm protocol', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAuthMockState()
  })

  it('probes protocol for openai-compatible provider/model', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/probe-model-llm-protocol/route')

    const req = buildMockRequest({
      path: '/api/user/api-config/probe-model-llm-protocol',
      method: 'POST',
      body: {
        providerId: 'openai-compatible:node-1',
        modelId: 'gpt-4.1-mini',
      },
    })

    const res = await route.POST(req, routeContext)
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean; protocol?: string }
    expect(body.success).toBe(true)
    expect(body.protocol).toBe('responses')
    expect(probeModelLlmProtocolMock).toHaveBeenCalledWith({
      userId: 'user-1',
      providerId: 'openai-compatible:node-1',
      modelId: 'gpt-4.1-mini',
    })
  })

  it('probes protocol for grok-compatible provider/model', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/probe-model-llm-protocol/route')

    const req = buildMockRequest({
      path: '/api/user/api-config/probe-model-llm-protocol',
      method: 'POST',
      body: {
        providerId: 'grok-compatible:gk-1',
        modelId: 'grok-4-fast-reasoning',
      },
    })

    const res = await route.POST(req, routeContext)
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean; protocol?: string }
    expect(body.success).toBe(true)
    expect(body.protocol).toBe('responses')
    expect(probeModelLlmProtocolMock).toHaveBeenCalledWith({
      userId: 'user-1',
      providerId: 'grok-compatible:gk-1',
      modelId: 'grok-4-fast-reasoning',
    })
  })

  it('rejects non-openai-compat provider ids', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/probe-model-llm-protocol/route')

    const req = buildMockRequest({
      path: '/api/user/api-config/probe-model-llm-protocol',
      method: 'POST',
      body: {
        providerId: 'gemini-compatible:node-1',
        modelId: 'gemini-3-pro-preview',
      },
    })

    const res = await route.POST(req, routeContext)
    expect(res.status).toBe(400)
    expect(probeModelLlmProtocolMock).not.toHaveBeenCalled()
  })

  it('rejects invalid body payload', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/probe-model-llm-protocol/route')

    const req = buildMockRequest({
      path: '/api/user/api-config/probe-model-llm-protocol',
      method: 'POST',
      body: {
        providerId: 'openai-compatible:node-1',
        modelId: '',
      },
    })

    const res = await route.POST(req, routeContext)
    expect(res.status).toBe(400)
    expect(probeModelLlmProtocolMock).not.toHaveBeenCalled()
  })
})
