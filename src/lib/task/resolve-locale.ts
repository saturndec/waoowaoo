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
  // 优先读取前端显式传递的自定义头
  const appLocale = request.headers.get('x-app-locale') || ''
  if (appLocale) {
    const resolved = normalizeCandidate(appLocale)
    if (resolved) return resolved
  }

  // 读取 next-intl 设置的 NEXT_LOCALE cookie（跟随用户在网站上选择的语言）
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value || ''
  if (cookieLocale) {
    const resolved = normalizeCandidate(cookieLocale)
    if (resolved) return resolved
  }

  // 最后 fallback 到浏览器 Accept-Language
  const raw = request.headers.get('accept-language') || ''
  if (!raw) return null
  const first = raw.split(',')[0]?.trim() || ''
  if (!first) return null
  return normalizeCandidate(first)
}

export function resolveTaskLocaleFromBody(body?: unknown): Locale | null {
  return readLocaleFromPayload(body)
}

export function resolveTaskLocale(request: NextRequest, body?: unknown): Locale | null {
  const payloadLocale = resolveTaskLocaleFromBody(body)
  if (payloadLocale) return payloadLocale
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
