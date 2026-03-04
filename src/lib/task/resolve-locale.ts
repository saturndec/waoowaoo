import type { NextRequest } from 'next/server'
import { ApiError } from '@/lib/api-errors'
import { locales, type Locale } from '@/i18n/routing'

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeCandidate(raw: string): Locale | null {
  const normalized = raw.trim().toLowerCase()
  if (!normalized) return null

  for (const locale of locales) {
    if (normalized === locale || normalized.startsWith(`${locale}-`)) {
      return locale
    }
  }
  return null
}

function readLocaleFromPayload(body?: unknown): Locale | null {
  const payload = toObject(body)
  const meta = toObject(payload.meta)
  const candidates: unknown[] = [meta.locale, payload.locale]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const locale = normalizeCandidate(candidate)
    if (locale) return locale
  }
  return null
}

function readLocaleFromHeader(request: NextRequest): Locale | null {
  const raw = request.headers.get('accept-language') || ''
  if (!raw) return null
  const first = raw.split(',')[0]?.trim() || ''
  if (!first) return null
  return normalizeCandidate(first)
}

/** 从 Referer 的路径中解析 locale（如 https://host/zh/workspace/... → zh） */
function readLocaleFromReferer(request: NextRequest): Locale | null {
  const referer = request.headers.get('referer') || request.headers.get('origin') || ''
  if (!referer) return null
  try {
    const pathname = new URL(referer).pathname
    const match = pathname.match(/^\/(zh|en)(\/|$)/)
    const segment = match?.[1]
    if (segment) return normalizeCandidate(segment)
  } catch {
    // invalid URL
  }
  return null
}

export function resolveTaskLocaleFromBody(body?: unknown): Locale | null {
  return readLocaleFromPayload(body)
}

export function resolveTaskLocale(request: NextRequest, body?: unknown): Locale | null {
  const payloadLocale = resolveTaskLocaleFromBody(body)
  if (payloadLocale) return payloadLocale
  const refererLocale = readLocaleFromReferer(request)
  if (refererLocale) return refererLocale
  return readLocaleFromHeader(request)
}

export function resolveRequiredTaskLocale(request: NextRequest, body?: unknown): Locale {
  const locale = resolveTaskLocale(request, body)
  if (!locale) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'TASK_LOCALE_REQUIRED',
      field: 'meta.locale',
    })
  }
  return locale
}
