import { getErrorSpec, resolveUnifiedErrorCode, type UnifiedErrorCode } from './errors/codes'
import { normalizeAnyError } from './errors/normalize'

export const ERROR_CODES = {
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  OPERATION_FAILED: 'INTERNAL_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]

type ApiErrorPayload = {
  success?: boolean
  code?: string
  message?: string
  error?:
    | string
    | {
        code?: string
        message?: string
        messageKey?: string
        defaultMessage?: string
        retryable?: boolean
        category?: string
        userMessageKey?: string
        details?: Record<string, unknown>
      }
}

type ParsedApiErrorPayload = {
  code?: string
  message?: string
  details?: Record<string, unknown>
}

function toUnifiedErrorCode(code: ErrorCode | UnifiedErrorCode): UnifiedErrorCode {
  const resolved = resolveUnifiedErrorCode(code)
  return resolved || ERROR_CODES.OPERATION_FAILED
}

function parseApiErrorPayload(payload: ApiErrorPayload | null): ParsedApiErrorPayload {
  if (!payload) return {}

  const objectError = typeof payload.error === 'object' && payload.error ? payload.error : null
  const stringError = typeof payload.error === 'string' ? payload.error : null

  return {
    code: objectError?.code || payload.code || undefined,
    message: objectError?.message || payload.message || stringError || undefined,
    details: objectError?.details || undefined,
  }
}

async function readApiErrorPayload(res: Response): Promise<ApiErrorPayload | null> {
  try {
    return (await res.json()) as ApiErrorPayload
  } catch {
    return null
  }
}

export async function handleApiError(
  res: Response,
  fallbackCode: ErrorCode = ERROR_CODES.OPERATION_FAILED,
): Promise<never> {
  const payload = await readApiErrorPayload(res)
  const parsed = parseApiErrorPayload(payload)

  if (res.status === getErrorSpec('INSUFFICIENT_BALANCE').httpStatus) {
    throw new Error(ERROR_CODES.INSUFFICIENT_BALANCE)
  }

  const normalized = normalizeAnyError(
    {
      code: parsed.code,
      message: parsed.message,
      details: parsed.details,
      status: res.status,
    },
    {
      context: 'api',
      fallbackCode: toUnifiedErrorCode(fallbackCode),
    },
  )

  throw new Error(normalized.code)
}

export async function checkApiResponse(
  res: Response,
  fallbackCode: ErrorCode = ERROR_CODES.OPERATION_FAILED,
): Promise<void> {
  if (res.ok) return
  await handleApiError(res, fallbackCode)
}

export function isInsufficientBalanceError(error: Error): boolean {
  return error.message === ERROR_CODES.INSUFFICIENT_BALANCE
}
