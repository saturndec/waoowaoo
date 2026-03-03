import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}))

const billingModeMock = vi.hoisted(() => ({
  getBillingMode: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/billing/mode', () => ({
  getBillingMode: billingModeMock.getBillingMode,
}))

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireUserAuth: async () => ({
    session: {
      user: { id: 'user-fallback-pricing' },
    },
  }),
}))

describe('api specific - user api-config PUT fallback pricing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    billingModeMock.getBillingMode.mockResolvedValue('ENFORCE')
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: null,
      customModels: null,
    })
    prismaMock.userPreference.upsert.mockResolvedValue({
      userId: 'user-fallback-pricing',
    })
  })

  it('allows saving default model when built-in pricing is missing by using fallback pricing policy', async () => {
    const mod = await import('@/app/api/user/api-config/route')
    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        defaultModels: {
          videoModel: 'unknown-provider::unknown-model',
        },
      },
    })

    const res = await mod.PUT(req, { params: Promise.resolve({}) })
    const body = await res.json() as { success?: boolean; error?: { code?: string } }
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(prismaMock.userPreference.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-fallback-pricing' },
      update: expect.objectContaining({
        videoModel: 'unknown-provider::unknown-model',
      }),
      create: expect.objectContaining({
        userId: 'user-fallback-pricing',
        videoModel: 'unknown-provider::unknown-model',
      }),
    }))
  })

  it('bugfix: rejects gemini-compatible provider baseUrl when endpoint path is provided', async () => {
    const mod = await import('@/app/api/user/api-config/route')
    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          {
            id: 'gemini-compatible:provider-1',
            name: 'Gemini Compatible Provider',
            baseUrl: 'https://api.example.com/v1/images/generations',
            apiKey: 'gemini-key',
          },
        ],
      },
    })

    const res = await mod.PUT(req, { params: Promise.resolve({}) })
    const body = await res.json() as { code?: string; message?: string }
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_PARAMS')
    expect(body.message).toContain('Gemini 兼容 Base URL')
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })
})
