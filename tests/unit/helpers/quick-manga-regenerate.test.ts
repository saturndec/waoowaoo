import { describe, expect, it } from 'vitest'
import {
  buildQuickMangaContinuityContext,
  buildQuickMangaPayloadFromHistory,
  resolveQuickMangaRegenerateStoryContent,
} from '@/lib/novel-promotion/quick-manga-regenerate'

describe('quick manga regenerate helpers', () => {
  it('prefers previous content and marks fallback false', () => {
    const resolved = resolveQuickMangaRegenerateStoryContent({
      previousContent: ' previous content ',
      fallbackContent: 'fallback',
    })

    expect(resolved).toEqual({
      content: 'previous content',
      fallbackUsed: false,
    })
  })

  it('uses fallback content when previous content missing', () => {
    const resolved = resolveQuickMangaRegenerateStoryContent({
      previousContent: '   ',
      fallbackContent: ' fallback ',
    })

    expect(resolved).toEqual({
      content: 'fallback',
      fallbackUsed: true,
    })
  })

  it('normalizes regenerate payload to strict quick manga option enums', () => {
    const payload = buildQuickMangaPayloadFromHistory({
      options: {
        enabled: true,
        preset: 'invalid-preset',
        layout: 'vertical-scroll',
        colorMode: 'invalid-color-mode',
        style: '  manga-ink  ',
      },
    })

    expect(payload).toEqual({
      enabled: true,
      preset: 'auto',
      layout: 'vertical-scroll',
      colorMode: 'auto',
      style: 'manga-ink',
    })
  })

  it('builds continuity context from history source', () => {
    const continuity = buildQuickMangaContinuityContext({
      source: {
        runId: 'run-1',
        stage: 'story-to-script',
        options: {
          enabled: true,
          preset: 'action-battle',
          layout: 'cinematic',
          colorMode: 'black-white',
          style: 'ink',
        },
      },
      fallbackContentUsed: true,
    })

    expect(continuity).toEqual({
      sourceRunId: 'run-1',
      sourceStage: 'story-to-script',
      shortcut: 'history-regenerate',
      fallbackContentUsed: true,
      reusedOptions: {
        preset: 'action-battle',
        layout: 'cinematic',
        colorMode: 'black-white',
        style: 'ink',
      },
    })
  })
})
