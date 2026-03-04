import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  mockUnauthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'

const listOpenAICompatibleModelsMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/user-api/openai-compatible-models', () => ({
  listOpenAICompatibleModels: listOpenAICompatibleModelsMock,
}))

describe('api specific - openai-compatible-models POST', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAuthMockState()
  })

  it('认证通过时返回模型列表', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    listOpenAICompatibleModelsMock.mockResolvedValueOnce([
      { modelId: 'gpt-4.1', name: 'gpt-4.1' },
      { modelId: 'gpt-4o-mini', name: 'gpt-4o-mini' },
    ])

    const route = await import('@/app/api/user/api-config/openai-compatible-models/route')
    const req = buildMockRequest({
      path: '/api/user/api-config/openai-compatible-models',
      method: 'POST',
      body: {
        providerId: 'openai-compatible:oa-1',
        apiKey: 'sk-test',
        baseUrl: 'https://example.com/v1',
      },
    })

    const res = await route.POST(req)
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(listOpenAICompatibleModelsMock).toHaveBeenCalledWith({
      apiKey: 'sk-test',
      baseUrl: 'https://example.com/v1',
    })
    expect(payload.models).toEqual([
      { modelId: 'gpt-4.1', name: 'gpt-4.1' },
      { modelId: 'gpt-4o-mini', name: 'gpt-4o-mini' },
    ])
  })

  it('providerId 非 openai-compatible 时返回 400', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/openai-compatible-models/route')

    const req = buildMockRequest({
      path: '/api/user/api-config/openai-compatible-models',
      method: 'POST',
      body: {
        providerId: 'gemini-compatible:gm-1',
        apiKey: 'gm-key',
        baseUrl: 'https://example.com',
      },
    })

    const res = await route.POST(req)
    expect(res.status).toBe(400)
    expect(listOpenAICompatibleModelsMock).not.toHaveBeenCalled()
  })

  it('未认证时返回 401', async () => {
    installAuthMocks()
    mockUnauthenticated()
    const route = await import('@/app/api/user/api-config/openai-compatible-models/route')

    const req = buildMockRequest({
      path: '/api/user/api-config/openai-compatible-models',
      method: 'POST',
      body: {
        providerId: 'openai-compatible:oa-1',
        apiKey: 'sk-test',
        baseUrl: 'https://example.com/v1',
      },
    })

    const res = await route.POST(req)
    expect(res.status).toBe(401)
    expect(listOpenAICompatibleModelsMock).not.toHaveBeenCalled()
  })

  it('上游超时错误映射为 502', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    listOpenAICompatibleModelsMock.mockRejectedValueOnce(new Error('OPENAI_COMPATIBLE_FETCH_TIMEOUT'))
    const route = await import('@/app/api/user/api-config/openai-compatible-models/route')

    const req = buildMockRequest({
      path: '/api/user/api-config/openai-compatible-models',
      method: 'POST',
      body: {
        providerId: 'openai-compatible:oa-1',
        apiKey: 'sk-test',
        baseUrl: 'https://example.com/v1',
      },
    })

    const res = await route.POST(req)
    const payload = await res.json()
    expect(res.status).toBe(502)
    expect(payload.error?.code).toBe('EXTERNAL_ERROR')
    expect(payload.error?.message).toContain('模型列表获取超时')
  })
})
