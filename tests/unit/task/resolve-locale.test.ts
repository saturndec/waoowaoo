import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import {
  resolveTaskLocale,
  resolveTaskLocaleFromBody,
  resolveRequiredTaskLocale,
} from '@/lib/task/resolve-locale'

function requestWith(
  opts: { url?: string; referer?: string; origin?: string; acceptLanguage?: string } = {},
): NextRequest {
  const url = opts.url ?? 'https://example.com/api/analyze'
  const headers = new Headers()
  if (opts.referer) headers.set('referer', opts.referer)
  if (opts.origin) headers.set('origin', opts.origin)
  if (opts.acceptLanguage) headers.set('accept-language', opts.acceptLanguage)
  return new NextRequest(url, { headers })
}

describe('resolveTaskLocaleFromBody', () => {
  it('body.meta.locale 存在时返回对应 locale', () => {
    expect(resolveTaskLocaleFromBody({ meta: { locale: 'zh' } })).toBe('zh')
    expect(resolveTaskLocaleFromBody({ meta: { locale: 'en' } })).toBe('en')
  })

  it('body.locale 存在时返回对应 locale', () => {
    expect(resolveTaskLocaleFromBody({ locale: 'zh' })).toBe('zh')
    expect(resolveTaskLocaleFromBody({ locale: 'en' })).toBe('en')
  })

  it('body 无 locale 时返回 null', () => {
    expect(resolveTaskLocaleFromBody({})).toBeNull()
    expect(resolveTaskLocaleFromBody({ episodeId: 'ep1' })).toBeNull()
  })
})

describe('resolveTaskLocale', () => {
  it('body 有 meta.locale 时优先用 body，忽略 Referer 和 Accept-Language', () => {
    const req = requestWith({
      referer: 'https://10.235.25.16:1443/en/workspace/',
      acceptLanguage: 'en-US,en;q=0.9',
    })
    expect(resolveTaskLocale(req, { meta: { locale: 'zh' } })).toBe('zh')
  })

  it('body 无 locale 且 Referer 路径含 /zh/ 时用 zh（URL 含 zh 时 select_location 用 zh 的回归）', () => {
    const req = requestWith({
      referer: 'https://10.235.25.16:1443/zh/workspace/',
      acceptLanguage: 'en-US,en;q=0.9',
    })
    expect(resolveTaskLocale(req, { episodeId: 'ep1', async: true })).toBe('zh')
  })

  it('body 无 locale 且 Referer 路径含 /en/ 时用 en', () => {
    const req = requestWith({
      referer: 'https://10.235.25.16:1443/en/workspace/',
      acceptLanguage: 'zh-CN,zh;q=0.9',
    })
    expect(resolveTaskLocale(req, {})).toBe('en')
  })

  it('无 Referer 时用 Origin URL 的 path 解析（部分客户端会带 path）', () => {
    const req = requestWith({
      origin: 'https://10.235.25.16:1443/zh/workspace',
    })
    expect(resolveTaskLocale(req, {})).toBe('zh')
  })

  it('body 与 Referer 都无 locale 时回退到 Accept-Language', () => {
    const req = requestWith({
      acceptLanguage: 'en-US,en;q=0.9,zh;q=0.8',
    })
    expect(resolveTaskLocale(req, {})).toBe('en')
  })

  it('仅 Accept-Language 为 zh 时返回 zh', () => {
    const req = requestWith({
      acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8',
    })
    expect(resolveTaskLocale(req, {})).toBe('zh')
  })

  it('全部无有效 locale 时返回 null', () => {
    const req = requestWith({})
    expect(resolveTaskLocale(req, {})).toBeNull()
  })
})

describe('resolveRequiredTaskLocale', () => {
  it('解析到 locale 时返回该值', () => {
    const req = requestWith({ referer: 'https://a/zh/workspace/' })
    expect(resolveRequiredTaskLocale(req, {})).toBe('zh')
  })

  it('解析不到 locale 时抛出 ApiError TASK_LOCALE_REQUIRED', () => {
    const req = requestWith({})
    expect(() => resolveRequiredTaskLocale(req, {})).toThrow('meta.locale')
  })
})
