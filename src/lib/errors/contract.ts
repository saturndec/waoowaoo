import {
  getErrorSpec,
  isKnownErrorCode,
  resolveUnifiedErrorCode,
  type ErrorCategory,
  type UnifiedErrorCode,
} from './codes'

export const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/
export const ERROR_MESSAGE_KEY_PREFIX = 'errors.'
export const ERROR_MESSAGE_KEY_PATTERN = /^errors\.[A-Z][A-Z0-9_]*$/

export type ErrorMessageContract = {
  code: UnifiedErrorCode
  message: string
  messageKey: string
  defaultMessage: string
  retryable: boolean
  category: ErrorCategory
}

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function toErrorMessageKey(code: UnifiedErrorCode): string {
  return `${ERROR_MESSAGE_KEY_PREFIX}${code}`
}

export function isValidErrorMessageKey(messageKey: unknown): messageKey is string {
  return typeof messageKey === 'string' && ERROR_MESSAGE_KEY_PATTERN.test(messageKey)
}

export function parseErrorCodeFromMessageKey(messageKey: unknown): UnifiedErrorCode | null {
  if (!isValidErrorMessageKey(messageKey)) return null
  const rawCode = messageKey.slice(ERROR_MESSAGE_KEY_PREFIX.length)
  return isKnownErrorCode(rawCode) ? rawCode : null
}

export function normalizeErrorMessageKey(input: {
  code: UnifiedErrorCode
  messageKey?: unknown
  userMessageKey?: unknown
}): string {
  const fromMessageKey = parseErrorCodeFromMessageKey(input.messageKey)
  if (fromMessageKey) return toErrorMessageKey(fromMessageKey)

  const fromUserMessageKey = parseErrorCodeFromMessageKey(input.userMessageKey)
  if (fromUserMessageKey) return toErrorMessageKey(fromUserMessageKey)

  return toErrorMessageKey(input.code)
}

export function buildErrorMessageContract(input: {
  code: UnifiedErrorCode
  message?: unknown
  messageKey?: unknown
  userMessageKey?: unknown
}): ErrorMessageContract {
  const spec = getErrorSpec(input.code)
  const message = trimString(input.message) || spec.defaultMessage
  const messageKey = normalizeErrorMessageKey({
    code: input.code,
    messageKey: input.messageKey,
    userMessageKey: input.userMessageKey,
  })

  return {
    code: input.code,
    message,
    messageKey,
    defaultMessage: spec.defaultMessage,
    retryable: spec.retryable,
    category: spec.category,
  }
}

export function parseUnifiedErrorCode(value: unknown): UnifiedErrorCode | null {
  if (isKnownErrorCode(value)) return value
  if (typeof value !== 'string') return null
  return resolveUnifiedErrorCode(value)
}
