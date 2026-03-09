import { describe, expect, it } from 'vitest'
import {
  buildErrorMessageContract,
  isValidErrorMessageKey,
  normalizeErrorMessageKey,
  parseErrorCodeFromMessageKey,
  toErrorMessageKey,
} from '@/lib/errors/contract'

describe('errors contract schema + naming convention', () => {
  it('builds english contract envelope fields from code', () => {
    const contract = buildErrorMessageContract({
      code: 'INVALID_PARAMS',
      message: 'baseUrl is required',
    })

    expect(contract).toEqual({
      code: 'INVALID_PARAMS',
      message: 'baseUrl is required',
      messageKey: 'errors.INVALID_PARAMS',
      defaultMessage: 'Invalid parameters',
      retryable: false,
      category: 'VALIDATION',
    })
  })

  it('normalizes legacy userMessageKey to messageKey', () => {
    const key = normalizeErrorMessageKey({
      code: 'NOT_FOUND',
      userMessageKey: 'errors.NOT_FOUND',
    })

    expect(key).toBe('errors.NOT_FOUND')
  })

  it('enforces messageKey naming convention and rejects invalid key', () => {
    expect(isValidErrorMessageKey('errors.INVALID_PARAMS')).toBe(true)
    expect(isValidErrorMessageKey('Errors.INVALID_PARAMS')).toBe(false)
    expect(isValidErrorMessageKey('errors.invalid_params')).toBe(false)
  })

  it('round-trips code <-> messageKey for known unified error codes', () => {
    const key = toErrorMessageKey('CONFLICT')
    expect(key).toBe('errors.CONFLICT')
    expect(parseErrorCodeFromMessageKey(key)).toBe('CONFLICT')
    expect(parseErrorCodeFromMessageKey('errors.UNKNOWN_CODE')).toBeNull()
  })
})
