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
}

type SavedProvider = {
  id: string
  name: string
  baseUrl?: string
  apiKey?: string
  apiMode?: 'gemini-sdk' | 'openai-official'
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

    const res = await route.PUT(req)
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

    const res = await route.PUT(req)
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

    const res = await route.PUT(req)
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

    const res = await route.PUT(req)
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

    const res = await route.PUT(req)
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

    const res = await route.PUT(req)
    expect(res.status).toBe(200)
    expect(prismaMock.userPreference.upsert).toHaveBeenCalledTimes(1)
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

    const res = await route.PUT(req)
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

    const res = await route.PUT(req)
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

    const res = await route.GET(req)
    expect(res.status).toBe(200)
    const json = await res.json() as { models?: Array<{ customPricing?: { llm?: { inputPerMillion?: number; outputPerMillion?: number } } }> }
    const model = Array.isArray(json.models) ? json.models[0] : null
    expect(model?.customPricing?.llm?.inputPerMillion).toBe(2.5)
    expect(model?.customPricing?.llm?.outputPerMillion).toBe(5.5)
  })
})
