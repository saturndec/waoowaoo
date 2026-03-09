import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'

describe('api specific - user API english error contract shape', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAuthMockState()
  })

  it('test-connection route returns stable error envelope and requestId for invalid payload', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')

    const route = await import('@/app/api/user/api-config/test-connection/route')

    const req = buildMockRequest({
      path: '/api/user/api-config/test-connection',
      method: 'POST',
      body: {
        provider: 'openai-compatible',
        baseUrl: 'https://proxy.example.com/v1',
        extraHeadersJson: '{invalid-json}',
      },
    })

    const res = await route.POST(req, { params: Promise.resolve({}) })
    const body = (await res.json()) as {
      success?: boolean
      requestId?: string
      error?: {
        code?: string
        message?: string
        messageKey?: string
        defaultMessage?: string
        retryable?: boolean
        category?: string
        userMessageKey?: string
        details?: Record<string, unknown>
      }
      code?: string
      message?: string
    }

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(typeof body.requestId).toBe('string')
    expect(body.error?.code).toBe('INVALID_PARAMS')
    expect(body.error?.message).toBe('extraHeadersJson must be a valid JSON object')
    expect(body.error?.retryable).toBe(false)
    expect(body.error?.category).toBe('VALIDATION')
    expect(body.error?.messageKey).toBe('errors.INVALID_PARAMS')
    expect(body.error?.defaultMessage).toBe('Invalid parameters')
    expect(body.error?.userMessageKey).toBe('errors.INVALID_PARAMS')
    expect(body.error?.details?.code).toBe('CONNECTION_EXTRA_HEADERS_JSON_INVALID')
    expect(body.error?.details?.field).toBe('extraHeadersJson')
    expect(body.code).toBe('INVALID_PARAMS')
    expect(body.message).toBe('extraHeadersJson must be a valid JSON object')
  })

  it('fetch-models route returns stable error envelope and requestId for unsupported provider', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')

    const route = await import('@/app/api/user/api-config/fetch-models/route')

    const req = buildMockRequest({
      path: '/api/user/api-config/fetch-models',
      method: 'POST',
      body: {
        providerId: 'openrouter:demo',
        baseUrl: 'https://proxy.example.com/v1',
      },
    })

    const res = await route.POST(req, { params: Promise.resolve({}) })
    const body = (await res.json()) as {
      success?: boolean
      requestId?: string
      error?: {
        code?: string
        message?: string
        messageKey?: string
        defaultMessage?: string
        details?: Record<string, unknown>
      }
      code?: string
      message?: string
    }

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(typeof body.requestId).toBe('string')
    expect(body.error?.code).toBe('INVALID_PARAMS')
    expect(body.error?.message).toBe('only openai-compatible is supported for fetch-models')
    expect(body.error?.messageKey).toBe('errors.INVALID_PARAMS')
    expect(body.error?.defaultMessage).toBe('Invalid parameters')
    expect(body.error?.details?.code).toBe('FETCH_MODELS_PROVIDER_UNSUPPORTED')
    expect(body.error?.details?.field).toBe('providerId')
    expect(body.code).toBe('INVALID_PARAMS')
    expect(body.message).toBe('only openai-compatible is supported for fetch-models')
  })
})
