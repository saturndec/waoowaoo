import { describe, expect, it } from 'vitest'
import {
  resolveQuickMangaEnabledForRuntimeLane,
  resolveQuickMangaEnabledFromEntryAndSession,
} from '@/lib/workspace/quick-manga-editor-flow'

describe('quick manga editor flow regression (VAT-89)', () => {
  it('forces enabled when opened from explicit quickManga entry param', () => {
    const resolved = resolveQuickMangaEnabledFromEntryAndSession({
      currentEnabled: false,
      enabledFromEntry: true,
      sessionPreference: false,
    })

    expect(resolved).toBe(true)
  })

  it('respects persisted session preference when no quickManga entry param is present', () => {
    const resolved = resolveQuickMangaEnabledFromEntryAndSession({
      currentEnabled: true,
      enabledFromEntry: false,
      sessionPreference: false,
    })

    expect(resolved).toBe(false)
  })

  it('keeps current runtime state when there is no entry param and no session preference', () => {
    const enabled = resolveQuickMangaEnabledFromEntryAndSession({
      currentEnabled: true,
      enabledFromEntry: false,
      sessionPreference: null,
    })
    const disabled = resolveQuickMangaEnabledFromEntryAndSession({
      currentEnabled: false,
      enabledFromEntry: false,
      sessionPreference: null,
    })

    expect(enabled).toBe(true)
    expect(disabled).toBe(false)
  })

  it('defaults quick manga ON for manga lane when there is no explicit entry/session override', () => {
    const resolved = resolveQuickMangaEnabledForRuntimeLane({
      journeyType: 'manga_webtoon',
      currentEnabled: false,
      enabledFromEntry: false,
      sessionPreference: null,
    })

    expect(resolved).toBe(true)
  })

  it('keeps quick manga OFF baseline for film lane when there is no explicit entry/session override', () => {
    const resolved = resolveQuickMangaEnabledForRuntimeLane({
      journeyType: 'film_video',
      currentEnabled: false,
      enabledFromEntry: false,
      sessionPreference: null,
    })

    expect(resolved).toBe(false)
  })
})
