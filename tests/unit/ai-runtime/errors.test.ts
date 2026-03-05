import { describe, expect, it } from 'vitest'
import { toAiRuntimeError } from '@/lib/ai-runtime/errors'

describe('toAiRuntimeError', () => {
  it('maps LLM_EMPTY_RESPONSE marker to EMPTY_RESPONSE and retryable=true', () => {
    const err = toAiRuntimeError(new Error('LLM_EMPTY_RESPONSE: provider::model 返回空内容'))
    expect(err.code).toBe('EMPTY_RESPONSE')
    expect(err.retryable).toBe(true)
  })

  it('maps channel empty response marker to EMPTY_RESPONSE', () => {
    const err = toAiRuntimeError(new Error('channel:empty_response'))
    expect(err.code).toBe('EMPTY_RESPONSE')
  })
})
