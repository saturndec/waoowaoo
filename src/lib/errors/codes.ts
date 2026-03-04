export const ERROR_CATEGORY = {
  AUTH: 'AUTH',
  BILLING: 'BILLING',
  CONTENT: 'CONTENT',
  PROVIDER: 'PROVIDER',
  SYSTEM: 'SYSTEM',
  VALIDATION: 'VALIDATION',
} as const

export type ErrorCategory = (typeof ERROR_CATEGORY)[keyof typeof ERROR_CATEGORY]

export const ERROR_CATALOG = {
  UNAUTHORIZED: {
    httpStatus: 401,
    retryable: false,
    category: ERROR_CATEGORY.AUTH,
    userMessageKey: 'errors.UNAUTHORIZED',
    defaultMessage: 'Unauthorized',
  },
  FORBIDDEN: {
    httpStatus: 403,
    retryable: false,
    category: ERROR_CATEGORY.AUTH,
    userMessageKey: 'errors.FORBIDDEN',
    defaultMessage: 'Forbidden',
  },
  NOT_FOUND: {
    httpStatus: 404,
    retryable: false,
    category: ERROR_CATEGORY.VALIDATION,
    userMessageKey: 'errors.NOT_FOUND',
    defaultMessage: 'Resource not found',
  },
  INVALID_PARAMS: {
    httpStatus: 400,
    retryable: false,
    category: ERROR_CATEGORY.VALIDATION,
    userMessageKey: 'errors.INVALID_PARAMS',
    defaultMessage: 'Invalid parameters',
  },
  MISSING_CONFIG: {
    httpStatus: 400,
    retryable: false,
    category: ERROR_CATEGORY.VALIDATION,
    userMessageKey: 'errors.MISSING_CONFIG',
    defaultMessage: 'Missing required configuration',
  },
  CONFLICT: {
    httpStatus: 409,
    retryable: false,
    category: ERROR_CATEGORY.VALIDATION,
    userMessageKey: 'errors.CONFLICT',
    defaultMessage: 'Conflict',
  },
  TASK_NOT_READY: {
    httpStatus: 202,
    retryable: true,
    category: ERROR_CATEGORY.SYSTEM,
    userMessageKey: 'errors.TASK_NOT_READY',
    defaultMessage: 'Task is not ready',
  },
  NO_RESULT: {
    httpStatus: 404,
    retryable: false,
    category: ERROR_CATEGORY.SYSTEM,
    userMessageKey: 'errors.NO_RESULT',
    defaultMessage: 'No task result',
  },
  RATE_LIMIT: {
    httpStatus: 429,
    retryable: true,
    category: ERROR_CATEGORY.PROVIDER,
    userMessageKey: 'errors.RATE_LIMIT',
    defaultMessage: 'Rate limit exceeded',
  },
  QUOTA_EXCEEDED: {
    httpStatus: 429,
    retryable: true,
    category: ERROR_CATEGORY.PROVIDER,
    userMessageKey: 'errors.QUOTA_EXCEEDED',
    defaultMessage: 'Quota exceeded',
  },
  EXTERNAL_ERROR: {
    httpStatus: 502,
    retryable: true,
    category: ERROR_CATEGORY.PROVIDER,
    userMessageKey: 'errors.EXTERNAL_ERROR',
    defaultMessage: 'External service failed',
  },
  NETWORK_ERROR: {
    httpStatus: 502,
    retryable: true,
    category: ERROR_CATEGORY.PROVIDER,
    userMessageKey: 'errors.NETWORK_ERROR',
    defaultMessage: 'Network request failed',
  },
  INSUFFICIENT_BALANCE: {
    httpStatus: 402,
    retryable: false,
    category: ERROR_CATEGORY.BILLING,
    userMessageKey: 'errors.INSUFFICIENT_BALANCE',
    defaultMessage: 'Insufficient balance',
  },
  SENSITIVE_CONTENT: {
    httpStatus: 422,
    retryable: false,
    category: ERROR_CATEGORY.CONTENT,
    userMessageKey: 'errors.SENSITIVE_CONTENT',
    defaultMessage: 'Sensitive content detected',
  },
  GENERATION_TIMEOUT: {
    httpStatus: 504,
    retryable: true,
    category: ERROR_CATEGORY.PROVIDER,
    userMessageKey: 'errors.GENERATION_TIMEOUT',
    defaultMessage: 'Generation timed out',
  },
  GENERATION_FAILED: {
    httpStatus: 500,
    retryable: true,
    category: ERROR_CATEGORY.PROVIDER,
    userMessageKey: 'errors.GENERATION_FAILED',
    defaultMessage: 'Generation failed',
  },
  WATCHDOG_TIMEOUT: {
    httpStatus: 500,
    retryable: true,
    category: ERROR_CATEGORY.SYSTEM,
    userMessageKey: 'errors.WATCHDOG_TIMEOUT',
    defaultMessage: 'Task heartbeat timeout',
  },
  QUEUE_STUCK_TIMEOUT: {
    httpStatus: 500,
    retryable: true,
    category: ERROR_CATEGORY.SYSTEM,
    userMessageKey: 'errors.QUEUE_STUCK_TIMEOUT',
    defaultMessage: 'Task queued timeout',
  },
  WORKER_EXECUTION_ERROR: {
    httpStatus: 500,
    retryable: true,
    category: ERROR_CATEGORY.SYSTEM,
    userMessageKey: 'errors.WORKER_EXECUTION_ERROR',
    defaultMessage: 'Worker execution failed',
  },
  WORKER_UNAVAILABLE: {
    httpStatus: 503,
    retryable: true,
    category: ERROR_CATEGORY.SYSTEM,
    userMessageKey: 'errors.WORKER_UNAVAILABLE',
    defaultMessage: 'No active worker available',
  },
  INTERNAL_ERROR: {
    httpStatus: 500,
    retryable: false,
    category: ERROR_CATEGORY.SYSTEM,
    userMessageKey: 'errors.INTERNAL_ERROR',
    defaultMessage: 'Internal server error',
  },
} as const

export type UnifiedErrorCode = keyof typeof ERROR_CATALOG

export const DEFAULT_ERROR_CODE: UnifiedErrorCode = 'INTERNAL_ERROR'

export const LEGACY_ERROR_CODE_ALIASES: Record<string, UnifiedErrorCode> = {
  OPERATION_FAILED: 'INTERNAL_ERROR',
}

export function isKnownErrorCode(code: unknown): code is UnifiedErrorCode {
  return typeof code === 'string' && code in ERROR_CATALOG
}

export function resolveUnifiedErrorCode(code: unknown): UnifiedErrorCode | null {
  if (isKnownErrorCode(code)) return code
  if (typeof code !== 'string') return null
  const normalized = code.trim().toUpperCase()
  return LEGACY_ERROR_CODE_ALIASES[normalized] || null
}

export function getErrorSpec(code: UnifiedErrorCode) {
  return ERROR_CATALOG[code]
}
