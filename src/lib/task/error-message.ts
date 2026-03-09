import { normalizeTaskError } from '@/lib/errors/normalize'
import { isKnownErrorCode, type UnifiedErrorCode } from '@/lib/errors/codes'
import { buildErrorMessageContract } from '@/lib/errors/contract'
import { getUserMessageByCode } from '@/lib/errors/user-messages'

export type TaskErrorSummary = {
  code: string | null
  message: string
  messageKey: string | null
  defaultMessage: string | null
  cancelled: boolean
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function looksCancelledMessage(value: string | null): boolean {
  if (!value) return false
  const lower = value.toLowerCase()
  return (
    lower.includes('task cancelled') ||
    lower.includes('task canceled') ||
    lower.includes('cancelled by user') ||
    lower.includes('canceled by user') ||
    lower.includes('任务已取消')
  )
}

export function resolveTaskErrorSummary(payload: unknown, fallbackMessage = 'Task failed'): TaskErrorSummary {
  const source = asObject(payload) || {}
  const sourceError = asObject(source.error) || {}
  const sourceErrorDetails = asObject(sourceError.details)
  const sourceDetails = asObject(source.details)

  const code =
    asString(sourceError.code) ||
    asString(source.errorCode) ||
    asString(source.code)

  const message =
    asString(sourceError.message) ||
    asString(sourceErrorDetails?.message) ||
    asString(source.error) ||
    asString(sourceDetails?.message) ||
    asString(source.details) ||
    asString(source.errorMessage) ||
    asString(source.message)

  const normalized = normalizeTaskError(code, message, sourceErrorDetails)
  const normalizedDetails = asObject(normalized?.details)
  const stage = asString(source.stage)
  const normalizedMessage = asString(normalized?.message)

  const cancelled =
    asBoolean(source.cancelled) ||
    asBoolean(source.canceled) ||
    asBoolean(sourceError.cancelled) ||
    asBoolean(sourceError.canceled) ||
    asBoolean(sourceErrorDetails?.cancelled) ||
    asBoolean(sourceErrorDetails?.canceled) ||
    asBoolean(normalizedDetails?.cancelled) ||
    asBoolean(normalizedDetails?.canceled) ||
    stage === 'cancelled' ||
    code === 'TASK_CANCELLED' ||
    asString(normalizedDetails?.originalCode) === 'TASK_CANCELLED' ||
    looksCancelledMessage(normalizedMessage) ||
    looksCancelledMessage(message)

  if (cancelled) {
    const cancelledContract = buildErrorMessageContract({
      code: 'CONFLICT',
      message: 'Task cancelled by user',
    })
    return {
      code: normalized?.code || 'CONFLICT',
      message: cancelledContract.message,
      messageKey: cancelledContract.messageKey,
      defaultMessage: cancelledContract.defaultMessage,
      cancelled: true,
    }
  }

  const resolvedCode = normalized?.code || (isKnownErrorCode(code) ? (code as UnifiedErrorCode) : null)
  const contract = resolvedCode
    ? buildErrorMessageContract({
      code: resolvedCode,
      message: normalizedMessage || message || undefined,
      messageKey: sourceError.messageKey,
      userMessageKey: sourceError.userMessageKey || sourceError.messageKey,
    })
    : null

  const userFriendlyMessage =
    normalized?.code && isKnownErrorCode(normalized.code)
      ? getUserMessageByCode(normalized.code as UnifiedErrorCode)
      : null

  return {
    code: normalized?.code || code || null,
    message: message || userFriendlyMessage || contract?.message || normalizedMessage || fallbackMessage,
    messageKey: contract?.messageKey || null,
    defaultMessage: contract?.defaultMessage || null,
    cancelled: false,
  }
}

export function resolveTaskErrorMessage(payload: unknown, fallbackMessage = 'Task failed') {
  return resolveTaskErrorSummary(payload, fallbackMessage).message
}
