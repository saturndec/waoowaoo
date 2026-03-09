import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { resolveTaskErrorSummary } from '@/lib/task/error-message'

/** 从当前页面 URL 提取 locale 前缀（/zh|en|vi|ko/...），默认 zh */
export function getPageLocale(): string {
  if (typeof window === 'undefined') return 'zh'
  const match = window.location.pathname.match(/^\/(zh|en|vi|ko)(\/|$)/)
  return match?.[1] ?? 'zh'
}

/** 将 Accept-Language 注入到 RequestInit，已有则不覆盖 */
function mergeLocaleHeader(init?: RequestInit): RequestInit {
  const locale = getPageLocale()
  const headers = new Headers(init?.headers)
  if (!headers.has('Accept-Language')) {
    headers.set('Accept-Language', locale)
  }
  return { ...init, headers }
}

export type MutationRequestError = Error & {
  status?: number
  payload?: Record<string, unknown>
  detail?: string
  code?: string | null
  messageKey?: string | null
  defaultMessage?: string | null
}

async function parseJsonSafe(response: Response): Promise<Record<string, unknown>> {
  const data = await response.json().catch(() => ({}))
  if (data && typeof data === 'object') return data as Record<string, unknown>
  return {}
}

function createRequestError(
  status: number,
  payload: Record<string, unknown>,
  fallbackMessage: string,
): MutationRequestError {
  const summary = resolveTaskErrorSummary(payload, fallbackMessage)
  const error = new Error(summary.message) as MutationRequestError
  error.status = status
  error.payload = payload
  error.code = summary.code
  error.messageKey = summary.messageKey
  error.defaultMessage = summary.defaultMessage
  if (typeof payload.detail === 'string') {
    error.detail = payload.detail
  }
  return error
}

export async function requestJsonWithError<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackMessage: string,
): Promise<T> {
  const response = await fetch(input, mergeLocaleHeader(init))
  const data = await parseJsonSafe(response)
  if (!response.ok) {
    throw createRequestError(response.status, data, fallbackMessage)
  }
  return data as T
}

export async function requestVoidWithError(
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackMessage: string,
): Promise<void> {
  const response = await fetch(input, mergeLocaleHeader(init))
  if (response.ok) return
  const data = await parseJsonSafe(response)
  throw createRequestError(response.status, data, fallbackMessage)
}

export async function requestTaskResponseWithError(
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackMessage: string,
): Promise<Response> {
  const response = await fetch(input, mergeLocaleHeader(init))
  if (response.ok) return response
  const data = await parseJsonSafe(response)
  throw createRequestError(response.status, data, fallbackMessage)
}

export async function requestBlobWithError(
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackMessage: string,
): Promise<Blob> {
  const response = await fetch(input, mergeLocaleHeader(init))
  if (response.ok) {
    return await response.blob()
  }

  const data = await parseJsonSafe(response)
  throw createRequestError(response.status, data, fallbackMessage)
}

export async function invalidateQueryTemplates(
  queryClient: QueryClient,
  templates: QueryKey[],
): Promise<void> {
  await Promise.all(
    templates.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}
