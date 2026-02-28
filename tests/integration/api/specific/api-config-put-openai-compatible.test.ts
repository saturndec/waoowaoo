import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}))

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireUserAuth: async () => ({
    session: {
      user: {
        id: 'user-openai-compatible',
      },
    },
  }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/crypto-utils', () => ({
  encryptApiKey: (value: string) => `enc:${value}`,
  decryptApiKey: (value: string) => value,
}))

vi.mock('@/lib/billing/mode', () => ({
  getBillingMode: async () => 'ENFORCE',
}))

const OPENAI_COMPATIBLE_PROVIDER_ID = 'openai-compatible:custom'

function createModel(type: 'llm' | 'image' | 'video' | 'audio', modelId: string) {
  const provider = OPENAI_COMPATIBLE_PROVIDER_ID
  return {
    modelId,
    modelKey: `${provider}::${modelId}`,
    name: `${type}-${modelId}`,
    type,
    provider,
    price: 0,
    customPricing: {
      input: 1,
      output: 2,
    },
  }
}

describe('api specific - api-config PUT openai-compatible model types', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: null,
      customModels: null,
    })
    prismaMock.userPreference.upsert.mockResolvedValue({
      userId: 'user-openai-compatible',
    })
  })

  it('accepts custom-priced openai-compatible llm as default analysis model', async () => {
    const mod = await import('@/app/api/user/api-config/route')
    const defaultAnalysisModelKey = `${OPENAI_COMPATIBLE_PROVIDER_ID}::gpt-4o-mini`
    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [{
          id: OPENAI_COMPATIBLE_PROVIDER_ID,
          name: 'OpenAI Compatible Custom',
          baseUrl: 'https://example.com/v1',
          apiKey: 'sk-test',
        }],
        models: [
          createModel('llm', 'gpt-4o-mini'),
          createModel('image', 'gpt-image-1'),
          createModel('video', 'video-model-1'),
          createModel('audio', 'tts-model-1'),
        ],
        defaultModels: {
          analysisModel: defaultAnalysisModelKey,
        },
      },
    })

    const response = await mod.PUT(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(prismaMock.userPreference.upsert).toHaveBeenCalledTimes(1)

    const upsertArgs = prismaMock.userPreference.upsert.mock.calls[0]?.[0] as {
      update: { customModels?: string; customProviders?: string }
      create: { customModels?: string; customProviders?: string }
    }
    expect(upsertArgs).toBeDefined()

    const savedModelsRaw = upsertArgs.update.customModels ?? upsertArgs.create.customModels
    expect(typeof savedModelsRaw).toBe('string')
    const savedModels = JSON.parse(savedModelsRaw as string) as Array<{ type: string }>
    expect(savedModels.map((item) => item.type)).toEqual(['llm', 'image', 'video', 'audio'])
  })

  it('keeps default analysis model when model is custom-priced and not in builtin catalog', async () => {
    const mod = await import('@/app/api/user/api-config/route')
    const defaultAnalysisModelKey = `${OPENAI_COMPATIBLE_PROVIDER_ID}::grok-4.20-beta`

    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      customModels: JSON.stringify([
        createModel('llm', 'grok-4.20-beta'),
      ]),
      customProviders: JSON.stringify([
        {
          id: OPENAI_COMPATIBLE_PROVIDER_ID,
          name: 'OpenAI Compatible Custom',
          baseUrl: 'https://example.com/v1',
          apiKey: 'enc:sk-test',
        },
      ]),
      analysisModel: defaultAnalysisModelKey,
      characterModel: '',
      locationModel: '',
      storyboardModel: '',
      editModel: '',
      videoModel: '',
      lipSyncModel: '',
      capabilityDefaults: '{}',
    })

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'GET',
    })
    const response = await mod.GET(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.defaultModels.analysisModel).toBe(defaultAnalysisModelKey)
  })
})
