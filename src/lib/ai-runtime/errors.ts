import { normalizeAnyError } from '@/lib/errors/normalize'
import type { AiRuntimeError, AiRuntimeErrorCode } from './types'

function toCode(value: string): AiRuntimeErrorCode {
  if (value === 'NETWORK_ERROR') return 'NETWORK_ERROR'
  if (value === 'RATE_LIMIT') return 'RATE_LIMIT'
  if (value === 'GENERATION_TIMEOUT') return 'TIMEOUT'
  if (value === 'SENSITIVE_CONTENT') return 'SENSITIVE_CONTENT'
  if (value === 'PARSING_ERROR') return 'PARSE_ERROR'
  return 'INTERNAL_ERROR'
}

function inferEmptyResponse(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('stream_empty')
    || normalized.includes('empty response')
    || normalized.includes('no meaningful content')
    || normalized.includes('channel:empty_response')
}

export function toAiRuntimeError(input: unknown): AiRuntimeError {
  const normalized = normalizeAnyError(input, { context: 'worker' })
  const message = normalized.message || 'AI request failed'
  const isEmptyResponse = inferEmptyResponse(message)
  const code = isEmptyResponse
    ? 'EMPTY_RESPONSE'
    : toCode(normalized.code)

  const error = new Error(message) as AiRuntimeError
  error.code = code
  error.retryable = code === 'EMPTY_RESPONSE' ? true : normalized.retryable
  error.provider = normalized.provider || null
  error.cause = input
  return error
}
