import { describe, expect, it } from 'vitest'
import { normalizeAnyError } from '@/lib/errors/normalize'

describe('normalizeAnyError network termination mapping', () => {
  it('maps undici terminated TypeError to NETWORK_ERROR', () => {
    const normalized = normalizeAnyError(new TypeError('terminated'))
    expect(normalized.code).toBe('NETWORK_ERROR')
    expect(normalized.retryable).toBe(true)
  })

  it('maps socket hang up TypeError to NETWORK_ERROR', () => {
    const normalized = normalizeAnyError(new TypeError('socket hang up'))
    expect(normalized.code).toBe('NETWORK_ERROR')
    expect(normalized.retryable).toBe(true)
  })

  it('maps wrapped terminated message to NETWORK_ERROR', () => {
    const normalized = normalizeAnyError(new Error('exception TypeError: terminated'))
    expect(normalized.code).toBe('NETWORK_ERROR')
    expect(normalized.retryable).toBe(true)
  })

  it('maps challenge-like 403 to EXTERNAL_ERROR for retry', () => {
    const normalized = normalizeAnyError({
      status: 403,
      message: 'Cloudflare challenge required',
      type: 'challenge_required',
    })
    expect(normalized.code).toBe('EXTERNAL_ERROR')
    expect(normalized.retryable).toBe(true)
  })

  it('keeps normal 403 as FORBIDDEN', () => {
    const normalized = normalizeAnyError({
      status: 403,
      message: 'forbidden',
    })
    expect(normalized.code).toBe('FORBIDDEN')
    expect(normalized.retryable).toBe(false)
  })
})
