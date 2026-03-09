import { describe, expect, it } from 'vitest'
import { resolveTaskErrorMessage, resolveTaskErrorSummary } from '@/lib/task/error-message'

describe('task error message normalization', () => {
  it('maps TASK_CANCELLED to unified cancelled message', () => {
    const summary = resolveTaskErrorSummary({
      errorCode: 'TASK_CANCELLED',
      errorMessage: 'whatever',
    })
    expect(summary.cancelled).toBe(true)
    expect(summary.code).toBe('CONFLICT')
    expect(summary.message).toBe('Task cancelled by user')
    expect(summary.messageKey).toBe('errors.CONFLICT')
    expect(summary.defaultMessage).toBe('Conflict')
  })

  it('keeps cancelled semantics from normalized task error details', () => {
    const summary = resolveTaskErrorSummary({
      error: {
        code: 'CONFLICT',
        message: 'Task cancelled by user',
        details: { cancelled: true, originalCode: 'TASK_CANCELLED' },
      },
    })
    expect(summary.cancelled).toBe(true)
    expect(summary.code).toBe('CONFLICT')
    expect(summary.message).toBe('Task cancelled by user')
    expect(summary.messageKey).toBe('errors.CONFLICT')
  })

  it('extracts nested error message from payload', () => {
    const summary = resolveTaskErrorSummary({
      error: {
        code: 'EXTERNAL_ERROR',
        details: {
          message: 'provider failed',
        },
      },
    }, 'fallback')
    expect(summary.message).toBe('provider failed')
    expect(summary.messageKey).toBe('errors.EXTERNAL_ERROR')
    const message = resolveTaskErrorMessage({
      error: {
        details: {
          message: 'provider failed',
        },
      },
    }, 'fallback')
    expect(message).toBe('provider failed')
  })

  it('supports flat error/details string payload', () => {
    expect(resolveTaskErrorMessage({
      error: 'provider failed',
    }, 'fallback')).toBe('provider failed')

    expect(resolveTaskErrorMessage({
      details: 'provider failed',
    }, 'fallback')).toBe('provider failed')
  })

  it('uses fallback when payload has no structured error', () => {
    expect(resolveTaskErrorMessage({}, 'fallback')).toBe('fallback')
  })

  it('recognizes cancelled semantics from message-only payload', () => {
    const summary = resolveTaskErrorSummary({
      message: 'Task cancelled by user',
    })
    expect(summary.cancelled).toBe(true)
    expect(summary.message).toBe('Task cancelled by user')
  })
})
