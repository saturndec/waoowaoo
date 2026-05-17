import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'
import {
  getBillingModeMock,
  prismaMock,
  readSavedModelsFromUpsert,
  resetUserApiConfigMocks,
  routeContext,
} from '../helpers/user-api-config-contract'

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/crypto-utils', () => ({
  encryptApiKey: vi.fn((value: string) => `enc:${value}`),
  decryptApiKey: vi.fn((value: string) => value.replace(/^enc:/, '')),
}))

vi.mock('@/lib/billing/mode', () => ({
  getBillingMode: getBillingModeMock,
}))

describe('api specific - user api-config persistence', () => {
  beforeEach(() => {
    resetAuthMockState()
    resetUserApiConfigMocks()
  })

  it('maps legacy customPricing input/output to llm pricing on GET', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: JSON.stringify([
        { id: 'openai-compatible:oa-1', name: 'OpenAI', baseUrl: 'https://oa.test/v1', apiKey: 'enc:key' },
      ]),
      customModels: JSON.stringify([
        {
          type: 'llm',
          provider: 'openai-compatible:oa-1',
          modelId: 'gpt-4.1-mini',
          modelKey: 'openai-compatible:oa-1::gpt-4.1-mini',
          name: 'GPT',
          customPricing: {
            input: 2.5,
            output: 5.5,
          },
        },
      ]),
    })
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'GET',
    })

    const res = await route.GET(req, routeContext)
    expect(res.status).toBe(200)
    const json = await res.json() as { models?: Array<{ customPricing?: { llm?: { inputPerMillion?: number; outputPerMillion?: number } } }> }
    const model = Array.isArray(json.models) ? json.models[0] : null
    expect(model?.customPricing?.llm?.inputPerMillion).toBe(2.5)
    expect(model?.customPricing?.llm?.outputPerMillion).toBe(5.5)
  })

  it('returns server-driven catalog with provider and model capabilities on GET', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'GET',
    })

    const res = await route.GET(req, routeContext)
    expect(res.status).toBe(200)
    const json = await res.json() as {
      catalog?: {
        providers?: Array<{ id?: string; name?: string; baseUrl?: string }>
        models?: Array<{
          provider?: string
          modelId?: string
          type?: string
          name?: string
          capabilities?: { image?: { resolutionOptions?: string[] } }
        }>
      }
    }

    expect(json.catalog?.providers?.some((provider) => (
      provider.id === 'openrouter'
      && provider.name === 'OpenRouter'
      && provider.baseUrl === 'https://openrouter.ai/api/v1'
    ))).toBe(true)
    expect(json.catalog?.models?.some((model) => (
      model.provider === 'fal'
      && model.modelId === 'banana-2'
      && model.type === 'image'
      && model.name === 'Banana 2'
      && model.capabilities?.image?.resolutionOptions?.includes('4K') === true
    ))).toBe(true)
    expect(json.catalog?.models?.some((model) => (
      model.provider === 'fal'
      && model.modelId === 'gpt-image-2'
      && model.type === 'image'
      && model.name === 'GPT Image 2'
      && model.capabilities?.image?.resolutionOptions?.includes('landscape_16_9') === true
    ))).toBe(true)
  })

  it('accepts bailian lipsync models and persists them', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          {
            id: 'bailian',
            name: 'Alibaba Bailian',
            apiKey: 'bl-key',
          },
        ],
        models: [
          {
            type: 'lipsync',
            provider: 'bailian',
            modelId: 'videoretalk',
            modelKey: 'bailian::videoretalk',
            name: 'VideoRetalk Lip Sync',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)

    const savedModels = readSavedModelsFromUpsert()
    expect(savedModels[0]).toMatchObject({
      type: 'lipsync',
      provider: 'bailian',
      modelId: 'videoretalk',
      modelKey: 'bailian::videoretalk',
    })
  })

  it('allows bailian default model in ENFORCE mode without built-in pricing entry', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    getBillingModeMock.mockResolvedValue('ENFORCE')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'bailian', name: 'Alibaba Bailian', apiKey: 'bl-key' },
        ],
        models: [
          {
            type: 'llm',
            provider: 'bailian',
            modelId: 'qwen3.5-flash',
            modelKey: 'bailian::qwen3.5-flash',
            name: 'Qwen 3.5 Flash',
          },
        ],
        defaultModels: {
          analysisModel: 'bailian::qwen3.5-flash',
        },
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)
    const firstCall = prismaMock.userPreference.upsert.mock.calls[0]?.[0] as {
      update?: { analysisModel?: unknown }
    }
    expect(firstCall?.update?.analysisModel).toBe('bailian::qwen3.5-flash')
  })

  it('allows bailian lipsync model in ENFORCE mode', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    getBillingModeMock.mockResolvedValue('ENFORCE')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'bailian', name: 'Alibaba Bailian', apiKey: 'bl-key' },
        ],
        models: [
          {
            type: 'lipsync',
            provider: 'bailian',
            modelId: 'videoretalk',
            modelKey: 'bailian::videoretalk',
            name: 'VideoRetalk Lip Sync',
          },
        ],
        defaultModels: {
          lipSyncModel: 'bailian::videoretalk',
        },
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)
    const firstCall = prismaMock.userPreference.upsert.mock.calls[0]?.[0] as {
      update?: { lipSyncModel?: unknown }
    }
    expect(firstCall?.update?.lipSyncModel).toBe('bailian::videoretalk')
  })

  it('saves default audio model in user preference', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        defaultModels: {
          audioModel: 'bailian::qwen3-tts-vd-2026-01-26',
        },
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)
    const firstCall = prismaMock.userPreference.upsert.mock.calls[0]?.[0] as {
      update?: { audioModel?: unknown }
    }
    expect(firstCall?.update?.audioModel).toBe('bailian::qwen3-tts-vd-2026-01-26')
  })

  it('keeps bailian model and default model in GET sanitize flow under ENFORCE mode', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    getBillingModeMock.mockResolvedValue('ENFORCE')
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: JSON.stringify([
        { id: 'bailian', name: 'Alibaba Bailian', apiKey: 'enc:bl-key', gatewayRoute: 'official' },
      ]),
      customModels: JSON.stringify([
        {
          type: 'llm',
          provider: 'bailian',
          modelId: 'qwen3.5-flash',
          modelKey: 'bailian::qwen3.5-flash',
          name: 'Qwen 3.5 Flash',
        },
      ]),
      analysisModel: 'bailian::qwen3.5-flash',
    })
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'GET',
    })

    const res = await route.GET(req, routeContext)
    expect(res.status).toBe(200)
    const json = await res.json() as {
      defaultModels?: { analysisModel?: string }
      models?: Array<{ modelKey?: string }>
    }
    expect(json.defaultModels?.analysisModel).toBe('bailian::qwen3.5-flash')
    expect(json.models?.some((model) => model.modelKey === 'bailian::qwen3.5-flash')).toBe(true)
  })

  it('clears stale default image model in GET when enabled image models use another key', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: JSON.stringify([
        { id: 'gemini-compatible:gm-1', name: 'Gemini Compat', apiKey: 'enc:gm-key' },
      ]),
      customModels: JSON.stringify([
        {
          type: 'image',
          provider: 'gemini-compatible:gm-1',
          modelId: 'gemini-3-pro-image-preview',
          modelKey: 'gemini-compatible:gm-1::gemini-3-pro-image-preview',
          name: 'Banana Pro',
        },
      ]),
      characterModel: 'openai-compatible:old::gemini-3-pro-image-preview',
    })
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'GET',
    })

    const res = await route.GET(req, routeContext)
    expect(res.status).toBe(200)
    const json = await res.json() as {
      defaultModels?: { characterModel?: string }
    }
    expect(json.defaultModels?.characterModel).toBe('')
  })

  it('accepts workflow concurrency payload and returns normalized values on GET', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const putReq = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        workflowConcurrency: {
          analysis: 3,
          image: 4,
          video: 6,
        },
      },
    })
    const putRes = await route.PUT(putReq, routeContext)
    expect(putRes.status).toBe(200)
    const upsertPayload = prismaMock.userPreference.upsert.mock.calls[0]?.[0] as {
      update: {
        analysisConcurrency?: number
        imageConcurrency?: number
        videoConcurrency?: number
      }
    }
    expect(upsertPayload.update.analysisConcurrency).toBe(3)
    expect(upsertPayload.update.imageConcurrency).toBe(4)
    expect(upsertPayload.update.videoConcurrency).toBe(6)

    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      customProviders: null,
      customModels: null,
      analysisConcurrency: 5,
      imageConcurrency: 7,
      videoConcurrency: 9,
    })
    const getReq = buildMockRequest({
      path: '/api/user/api-config',
      method: 'GET',
    })
    const getRes = await route.GET(getReq, routeContext)
    expect(getRes.status).toBe(200)
    const payload = await getRes.json() as {
      workflowConcurrency?: {
        analysis: number
        image: number
        video: number
      }
    }
    expect(payload.workflowConcurrency).toEqual({
      analysis: 5,
      image: 7,
      video: 9,
    })
  })
})
