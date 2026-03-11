import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'

type UserPreferenceSnapshot = {
  customProviders: string | null
  customModels: string | null
  analysisModel?: string | null
  characterModel?: string | null
  locationModel?: string | null
  storyboardModel?: string | null
  editModel?: string | null
  videoModel?: string | null
  audioModel?: string | null
  lipSyncModel?: string | null
  capabilityDefaults?: string | null
  analysisConcurrency?: number | null
  imageConcurrency?: number | null
  videoConcurrency?: number | null
}

type SavedProvider = {
  id: string
  name: string
  baseUrl?: string
  apiKey?: string
  hidden?: boolean
  apiMode?: 'gemini-sdk' | 'openai-official'
  gatewayRoute?: 'official' | 'openai-compat'
}

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn<(...args: unknown[]) => Promise<UserPreferenceSnapshot | null>>(),
    upsert: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  },
}))

const encryptApiKeyMock = vi.hoisted(() => vi.fn((value: string) => `enc:${value}`))
const decryptApiKeyMock = vi.hoisted(() => vi.fn((value: string) => value.replace(/^enc:/, '')))
const getBillingModeMock = vi.hoisted(() => vi.fn(async () => 'OFF'))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/crypto-utils', () => ({
  encryptApiKey: encryptApiKeyMock,
  decryptApiKey: decryptApiKeyMock,
}))

vi.mock('@/lib/billing/mode', () => ({
  getBillingMode: getBillingModeMock,
}))

const routeContext = { params: Promise.resolve({}) }

function readSavedProvidersFromUpsert(): SavedProvider[] {
  const firstCall = prismaMock.userPreference.upsert.mock.calls[0]
  if (!firstCall) {
    throw new Error('expected prisma.userPreference.upsert to be called at least once')
  }

  const payload = firstCall[0] as { update?: { customProviders?: unknown } }
  const rawProviders = payload.update?.customProviders
  if (typeof rawProviders !== 'string') {
    throw new Error('expected update.customProviders to be a JSON string')
  }

  const parsed = JSON.parse(rawProviders) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('expected update.customProviders to parse as an array')
  }
  return parsed as SavedProvider[]
}

function readSavedModelsFromUpsert(): Array<Record<string, unknown>> {
  const firstCall = prismaMock.userPreference.upsert.mock.calls[0]
  if (!firstCall) {
    throw new Error('expected prisma.userPreference.upsert to be called at least once')
  }

  const payload = firstCall[0] as { update?: { customModels?: unknown } }
  const rawModels = payload.update?.customModels
  if (typeof rawModels !== 'string') {
    throw new Error('expected update.customModels to be a JSON string')
  }

  const parsed = JSON.parse(rawModels) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('expected update.customModels to parse as an array')
  }
  return parsed as Array<Record<string, unknown>>
}

describe('api specific - user api-config PUT provider uniqueness', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAuthMockState()

    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: null,
      customModels: null,
    })
    prismaMock.userPreference.upsert.mockResolvedValue({ id: 'pref-1' })
    getBillingModeMock.mockResolvedValue('OFF')
  })

  it('allows multiple providers with the same api type when provider ids differ', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:oa-1', name: 'OpenAI A', baseUrl: 'https://oa-a.test', apiKey: 'oa-key-a' },
          { id: 'openai-compatible:oa-2', name: 'OpenAI B', baseUrl: 'https://oa-b.test', apiKey: 'oa-key-b' },
          { id: 'gemini-compatible:gm-1', name: 'Gemini A', baseUrl: 'https://gm-a.test', apiKey: 'gm-key-a' },
          { id: 'gemini-compatible:gm-2', name: 'Gemini B', baseUrl: 'https://gm-b.test', apiKey: 'gm-key-b' },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)
    expect(prismaMock.userPreference.upsert).toHaveBeenCalledTimes(1)

    const savedProviders = readSavedProvidersFromUpsert()
    expect(savedProviders.map((provider) => provider.id)).toEqual([
      'openai-compatible:oa-1',
      'openai-compatible:oa-2',
      'gemini-compatible:gm-1',
      'gemini-compatible:gm-2',
    ])
  })

  it('regression: preserves reordered providers array order when persisting', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'google', name: 'Google AI Studio', apiKey: 'google-key' },
          { id: 'ark', name: 'Volcengine Ark', apiKey: 'ark-key' },
          { id: 'openai-compatible:oa-2', name: 'OpenAI B', baseUrl: 'https://oa-b.test', apiKey: 'oa-key-b' },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)
    expect(prismaMock.userPreference.upsert).toHaveBeenCalledTimes(1)

    const savedProviders = readSavedProvidersFromUpsert()
    expect(savedProviders.map((provider) => provider.id)).toEqual([
      'google',
      'ark',
      'openai-compatible:oa-2',
    ])
  })

  it('persists provider hidden flag', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'google', name: 'Google AI Studio', apiKey: 'google-key', hidden: true },
          { id: 'ark', name: 'Volcengine Ark', apiKey: 'ark-key', hidden: false },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)

    const savedProviders = readSavedProvidersFromUpsert()
    const googleProvider = savedProviders.find((provider) => provider.id === 'google')
    const arkProvider = savedProviders.find((provider) => provider.id === 'ark')
    expect(googleProvider?.hidden).toBe(true)
    expect(arkProvider?.hidden).toBe(false)
  })

  it('rejects non-boolean provider hidden flag', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'google', name: 'Google AI Studio', apiKey: 'google-key', hidden: 'yes' },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('pins minimax provider baseUrl to official endpoint when baseUrl is omitted', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'minimax', name: 'MiniMax Hailuo', apiKey: 'mm-key' },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)

    const savedProviders = readSavedProvidersFromUpsert()
    expect(savedProviders).toHaveLength(1)
    expect(savedProviders[0]).toMatchObject({
      id: 'minimax',
      baseUrl: 'https://api.minimaxi.com/v1',
    })
  })

  it('rejects minimax provider custom baseUrl', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'minimax', name: 'MiniMax Hailuo', baseUrl: 'https://custom.minimax.proxy/v1', apiKey: 'mm-key' },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('keeps new provider apiKey empty instead of reusing another same-type provider apiKey', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: JSON.stringify([
        {
          id: 'openai-compatible:old',
          name: 'Old',
          baseUrl: 'https://old.test',
          apiKey: 'enc:legacy',
        },
      ] satisfies SavedProvider[]),
      customModels: null,
    })
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:old', name: 'Old', baseUrl: 'https://old.test' },
          { id: 'openai-compatible:new', name: 'New', baseUrl: 'https://new.test' },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)

    const savedProviders = readSavedProvidersFromUpsert()
    const oldProvider = savedProviders.find((provider) => provider.id === 'openai-compatible:old')
    const newProvider = savedProviders.find((provider) => provider.id === 'openai-compatible:new')

    expect(oldProvider?.apiKey).toBe('enc:legacy')
    expect(newProvider).toBeDefined()
    expect(Object.prototype.hasOwnProperty.call(newProvider as object, 'apiKey')).toBe(false)
  })

  it('rejects duplicated provider ids', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:dup', name: 'Provider A', baseUrl: 'https://a.test', apiKey: 'key-a' },
          { id: 'openai-compatible:dup', name: 'Provider B', baseUrl: 'https://b.test', apiKey: 'key-b' },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('rejects duplicated provider ids even when only case differs', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'OpenAI-Compatible:CaseDup', name: 'Provider A', baseUrl: 'https://a.test', apiKey: 'key-a' },
          { id: 'openai-compatible:casedup', name: 'Provider B', baseUrl: 'https://b.test', apiKey: 'key-b' },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('requires explicit provider id on models when multiple same-type providers exist', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:oa-1', name: 'OpenAI A', baseUrl: 'https://oa-a.test', apiKey: 'oa-key-a' },
          { id: 'openai-compatible:oa-2', name: 'OpenAI B', baseUrl: 'https://oa-b.test', apiKey: 'oa-key-b' },
        ],
        models: [
          {
            type: 'llm',
            provider: 'openai-compatible',
            modelId: 'gpt-4.1',
            modelKey: 'openai-compatible::gpt-4.1',
            name: 'GPT 4.1',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('accepts openai-compatible provider image/video models', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          {
            id: 'openai-compatible:oa-1',
            name: 'OpenAI Node',
            baseUrl: 'https://oa.test/v1',
            apiKey: 'oa-key',
            apiMode: 'openai-official',
          },
        ],
        models: [
          {
            type: 'image',
            provider: 'openai-compatible:oa-1',
            modelId: 'gpt-image-1',
            modelKey: 'openai-compatible:oa-1::gpt-image-1',
            name: 'Image Model',
          },
          {
            type: 'video',
            provider: 'openai-compatible:oa-1',
            modelId: 'sora-2',
            modelKey: 'openai-compatible:oa-1::sora-2',
            name: 'Video Model',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)
    expect(prismaMock.userPreference.upsert).toHaveBeenCalledTimes(1)
  })

  it('requires llmProtocol when adding a new openai-compatible llm model', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:oa-1', name: 'OpenAI Node', baseUrl: 'https://oa.test/v1', apiKey: 'oa-key' },
        ],
        models: [
          {
            type: 'llm',
            provider: 'openai-compatible:oa-1',
            modelId: 'gpt-4.1-mini',
            modelKey: 'openai-compatible:oa-1::gpt-4.1-mini',
            name: 'GPT 4.1 Mini',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('persists llmProtocol for openai-compatible llm models', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:oa-1', name: 'OpenAI Node', baseUrl: 'https://oa.test/v1', apiKey: 'oa-key' },
        ],
        models: [
          {
            type: 'llm',
            provider: 'openai-compatible:oa-1',
            modelId: 'gpt-4.1-mini',
            modelKey: 'openai-compatible:oa-1::gpt-4.1-mini',
            name: 'GPT 4.1 Mini',
            llmProtocol: 'responses',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)

    const savedModels = readSavedModelsFromUpsert()
    expect(savedModels).toHaveLength(1)
    expect(savedModels[0]?.llmProtocol).toBe('responses')
    expect(typeof savedModels[0]?.llmProtocolCheckedAt).toBe('string')
  })

  it('persists llmProtocol for grok-compatible llm models', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'grok-compatible:gk-1', name: 'Grok Node', baseUrl: 'https://api.x.ai/v1', apiKey: 'xai-key' },
        ],
        models: [
          {
            type: 'llm',
            provider: 'grok-compatible:gk-1',
            modelId: 'grok-4-fast-reasoning',
            modelKey: 'grok-compatible:gk-1::grok-4-fast-reasoning',
            name: 'Grok 4 Fast',
            llmProtocol: 'responses',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)

    const savedModels = readSavedModelsFromUpsert()
    expect(savedModels).toHaveLength(1)
    expect(savedModels[0]?.llmProtocol).toBe('responses')
    expect(typeof savedModels[0]?.llmProtocolCheckedAt).toBe('string')
  })

  it('rejects llmProtocol on non-openai-compatible or non-llm models', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'gemini-compatible:gm-1', name: 'Gemini Compat', baseUrl: 'https://gm.test', apiKey: 'gm-key' },
        ],
        models: [
          {
            type: 'llm',
            provider: 'gemini-compatible:gm-1',
            modelId: 'gemini-3-pro-preview',
            modelKey: 'gemini-compatible:gm-1::gemini-3-pro-preview',
            name: 'Gemini 3 Pro',
            llmProtocol: 'chat-completions',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('backfills historical openai-compatible llm models missing llmProtocol during PUT', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: JSON.stringify([
        { id: 'openai-compatible:oa-1', name: 'OpenAI Node', baseUrl: 'https://oa.test/v1', apiKey: 'enc:oa-key' },
      ]),
      customModels: JSON.stringify([
        {
          type: 'llm',
          provider: 'openai-compatible:oa-1',
          modelId: 'gpt-4.1-mini',
          modelKey: 'openai-compatible:oa-1::gpt-4.1-mini',
          name: 'GPT 4.1 Mini',
        },
      ]),
    })
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:oa-1', name: 'OpenAI Node', baseUrl: 'https://oa.test/v1' },
        ],
        models: [
          {
            type: 'llm',
            provider: 'openai-compatible:oa-1',
            modelId: 'gpt-4.1-mini',
            modelKey: 'openai-compatible:oa-1::gpt-4.1-mini',
            name: 'GPT 4.1 Mini',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)

    const savedModels = readSavedModelsFromUpsert()
    expect(savedModels).toHaveLength(1)
    expect(savedModels[0]?.llmProtocol).toBe('chat-completions')
    expect(typeof savedModels[0]?.llmProtocolCheckedAt).toBe('string')
  })

  it('rejects invalid custom pricing structure', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:oa-1', name: 'OpenAI Node', baseUrl: 'https://oa.test/v1', apiKey: 'oa-key' },
        ],
        models: [
          {
            type: 'image',
            provider: 'openai-compatible:oa-1',
            modelId: 'gpt-image-1',
            modelKey: 'openai-compatible:oa-1::gpt-image-1',
            name: 'Image Model',
            customPricing: {
              image: {
                basePrice: -1,
              },
            },
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('rejects custom pricing option mappings with unsupported capability values', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'ark', name: 'Volcengine Ark', apiKey: 'ark-key' },
        ],
        models: [
          {
            type: 'video',
            provider: 'ark',
            modelId: 'doubao-seedance-1-0-pro-fast-251015',
            modelKey: 'ark::doubao-seedance-1-0-pro-fast-251015',
            name: 'Ark Video',
            customPricing: {
              video: {
                basePrice: 0.5,
                optionPrices: {
                  resolution: {
                    '2k': 1.2,
                  },
                },
              },
            },
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
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

  it('defaults gemini-compatible provider to official route when apiMode is gemini-sdk', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          {
            id: 'gemini-compatible:gm-1',
            name: 'Gemini Official Mode',
            baseUrl: 'https://gm.test',
            apiKey: 'gm-key',
            apiMode: 'gemini-sdk',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)

    const savedProviders = readSavedProvidersFromUpsert()
    expect(savedProviders).toHaveLength(1)
    expect(savedProviders[0]?.gatewayRoute).toBe('official')
    expect(savedProviders[0]?.apiMode).toBe('gemini-sdk')
  })

  it('rejects gemini-compatible provider when apiMode is openai-official', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          {
            id: 'gemini-compatible:gm-1',
            name: 'Gemini OpenAI Mode',
            baseUrl: 'https://gm.test',
            apiKey: 'gm-key',
            apiMode: 'openai-official',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('rejects legacy litellm gatewayRoute value', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          {
            id: 'openai-compatible:oa-1',
            name: 'OpenAI Node',
            baseUrl: 'https://oa.test/v1',
            apiKey: 'oa-key',
            gatewayRoute: 'litellm',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('forces openai-compatible provider to openai-compat route', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          {
            id: 'openai-compatible:oa-1',
            name: 'OpenAI Node',
            baseUrl: 'https://oa.test/v1',
            apiKey: 'oa-key',
            apiMode: 'openai-official',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)

    const savedProviders = readSavedProvidersFromUpsert()
    expect(savedProviders).toHaveLength(1)
    expect(savedProviders[0]?.gatewayRoute).toBe('openai-compat')
  })

  it('forces grok-compatible provider to openai-compat route', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          {
            id: 'grok-compatible:gk-1',
            name: 'Grok Node',
            baseUrl: 'https://api.x.ai/v1',
            apiKey: 'xai-key',
            apiMode: 'openai-official',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)

    const savedProviders = readSavedProvidersFromUpsert()
    expect(savedProviders).toHaveLength(1)
    expect(savedProviders[0]?.gatewayRoute).toBe('openai-compat')
  })

  it('bailian provider always persists gatewayRoute as official', async () => {
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
            gatewayRoute: 'official',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)
    const savedProviders = readSavedProvidersFromUpsert()
    expect(savedProviders[0]?.gatewayRoute).toBe('official')
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
    expect(savedModels).toHaveLength(1)
    expect(savedModels[0]).toMatchObject({
      type: 'lipsync',
      provider: 'bailian',
      modelId: 'videoretalk',
      modelKey: 'bailian::videoretalk',
    })
  })

  it('siliconflow provider rejects litellm gatewayRoute', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          {
            id: 'siliconflow',
            name: 'SiliconFlow',
            apiKey: 'sf-key',
            gatewayRoute: 'litellm',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
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
    expect(prismaMock.userPreference.upsert).toHaveBeenCalledTimes(1)
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

  it('migrated bailian provider id is accepted and qwen is rejected', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const acceptedReq = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'bailian', name: 'Alibaba Bailian', apiKey: 'bl-key' },
        ],
      },
    })
    const acceptedRes = await route.PUT(acceptedReq, routeContext)
    expect(acceptedRes.status).toBe(200)

    vi.clearAllMocks()
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: null,
      customModels: null,
    })

    const rejectedReq = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'qwen', name: 'Qwen', apiKey: 'old-key' },
        ],
      },
    })
    const rejectedRes = await route.PUT(rejectedReq, routeContext)
    expect(rejectedRes.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('rejects compatMediaTemplate on non-openai-compatible media model', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'google', name: 'Google AI Studio', apiKey: 'google-key' },
        ],
        models: [
          {
            modelId: 'veo-3.1-fast-generate-preview',
            modelKey: 'google::veo-3.1-fast-generate-preview',
            name: 'Veo Fast',
            type: 'video',
            provider: 'google',
            compatMediaTemplate: {
              version: 1,
              mediaType: 'video',
              mode: 'sync',
              create: { method: 'POST', path: '/videos' },
              response: { outputUrlPath: '$.url' },
            },
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('backfills default compatMediaTemplate for openai-compatible image model when missing', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:oa-1', name: 'OpenAI Compat', baseUrl: 'https://compat.test/v1', apiKey: 'oa-key' },
        ],
        models: [
          {
            modelId: 'gpt-image-1',
            modelKey: 'openai-compatible:oa-1::gpt-image-1',
            name: 'Image One',
            type: 'image',
            provider: 'openai-compatible:oa-1',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)
    const savedModels = readSavedModelsFromUpsert()
    const savedModel = savedModels.find((item) => item.modelKey === 'openai-compatible:oa-1::gpt-image-1')
    expect(savedModel?.compatMediaTemplate).toMatchObject({
      version: 1,
      mediaType: 'image',
      mode: 'sync',
      create: {
        path: '/images/generations',
      },
    })
    expect(savedModel?.compatMediaTemplateSource).toBe('manual')
    expect(typeof savedModel?.compatMediaTemplateCheckedAt).toBe('string')
  })

  it('backfills grok default compatMediaTemplate for image model when missing', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'grok-compatible:gk-1', name: 'Grok Compat', baseUrl: 'https://api.x.ai/v1', apiKey: 'xai-key' },
        ],
        models: [
          {
            modelId: 'grok-2-image',
            modelKey: 'grok-compatible:gk-1::grok-2-image',
            name: 'Grok Image',
            type: 'image',
            provider: 'grok-compatible:gk-1',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)
    const savedModels = readSavedModelsFromUpsert()
    const savedModel = savedModels.find((item) => item.modelKey === 'grok-compatible:gk-1::grok-2-image')
    expect(savedModel?.compatMediaTemplate).toMatchObject({
      version: 1,
      mediaType: 'image',
      mode: 'sync',
      create: {
        path: '/images/generations',
      },
      operations: {
        edit: {
          create: {
            path: '/images/edits',
          },
        },
      },
    })
    expect(savedModel?.compatMediaTemplateSource).toBe('manual')
    expect(typeof savedModel?.compatMediaTemplateCheckedAt).toBe('string')
  })

  it('backfills grok default compatMediaTemplate for video model when missing', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'grok-compatible:gk-1', name: 'Grok Compat', baseUrl: 'https://api.x.ai/v1', apiKey: 'xai-key' },
        ],
        models: [
          {
            modelId: 'grok-imagine-video',
            modelKey: 'grok-compatible:gk-1::grok-imagine-video',
            name: 'Grok Video',
            type: 'video',
            provider: 'grok-compatible:gk-1',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)
    const savedModels = readSavedModelsFromUpsert()
    const savedModel = savedModels.find((item) => item.modelKey === 'grok-compatible:gk-1::grok-imagine-video')
    expect(savedModel?.compatMediaTemplate).toMatchObject({
      version: 1,
      mediaType: 'video',
      mode: 'async',
      create: {
        path: '/videos/generations',
      },
      status: {
        path: '/videos/{{task_id}}',
      },
      response: {
        taskIdPath: '$.request_id',
        statusPath: '$.status',
        outputUrlPath: '$.video.url',
      },
      polling: {
        doneStates: ['done'],
        failStates: ['failed', 'error', 'expired', 'canceled'],
      },
    })
    expect(savedModel?.compatMediaTemplateSource).toBe('manual')
    expect(typeof savedModel?.compatMediaTemplateCheckedAt).toBe('string')
  })

  it('backfills default compatMediaTemplate for openai-compatible video model when missing', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:oa-1', name: 'OpenAI Compat', baseUrl: 'https://compat.test/v1', apiKey: 'oa-key' },
        ],
        models: [
          {
            modelId: 'veo-2',
            modelKey: 'openai-compatible:oa-1::veo-2',
            name: 'Veo 2',
            type: 'video',
            provider: 'openai-compatible:oa-1',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)
    const savedModels = readSavedModelsFromUpsert()
    const savedModel = savedModels.find((item) => item.modelKey === 'openai-compatible:oa-1::veo-2')
    expect(savedModel?.compatMediaTemplate).toMatchObject({
      version: 1,
      mediaType: 'video',
      mode: 'async',
      create: {
        path: '/videos',
        contentType: 'multipart/form-data',
        multipartFileFields: ['input_reference'],
        bodyTemplate: {
          model: '{{model}}',
          prompt: '{{prompt}}',
          seconds: '{{duration}}',
          size: '{{size}}',
          input_reference: '{{image}}',
        },
      },
      status: {
        path: '/videos/{{task_id}}',
      },
      content: {
        path: '/videos/{{task_id}}/content',
      },
      response: {
        taskIdPath: '$.id',
        statusPath: '$.status',
      },
    })
    expect(savedModel?.compatMediaTemplateSource).toBe('manual')
    expect(typeof savedModel?.compatMediaTemplateCheckedAt).toBe('string')
  })

  it('keeps explicit compatMediaTemplate for openai-compatible video model', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:oa-1', name: 'OpenAI Compat', baseUrl: 'https://compat.test/v1', apiKey: 'oa-key' },
        ],
        models: [
          {
            modelId: 'veo3.1',
            modelKey: 'openai-compatible:oa-1::veo3.1',
            name: 'Veo 3.1',
            type: 'video',
            provider: 'openai-compatible:oa-1',
            compatMediaTemplate: {
              version: 1,
              mediaType: 'video',
              mode: 'async',
              create: {
                method: 'POST',
                path: '/v2/videos/generations',
                contentType: 'application/json',
                bodyTemplate: {
                  model: '{{model}}',
                  prompt: '{{prompt}}',
                },
              },
              status: {
                method: 'GET',
                path: '/v2/videos/generations/{{task_id}}',
              },
              response: {
                taskIdPath: '$.task_id',
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
            compatMediaTemplateSource: 'ai',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)
    const savedModels = readSavedModelsFromUpsert()
    const savedModel = savedModels.find((item) => item.modelKey === 'openai-compatible:oa-1::veo3.1')
    expect(savedModel?.compatMediaTemplate).toMatchObject({
      mediaType: 'video',
      mode: 'async',
      create: {
        path: '/v2/videos/generations',
      },
    })
    expect(savedModel?.compatMediaTemplateSource).toBe('ai')
  })
})
