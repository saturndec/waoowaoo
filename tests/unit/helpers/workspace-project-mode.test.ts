import { describe, expect, it } from 'vitest'
import {
  buildProjectEntryUrl,
  toProjectCreatePayload,
} from '@/lib/workspace/project-mode'
import { shouldEnableQuickMangaFromSearchParams } from '@/lib/workspace/quick-manga-entry'

describe('workspace project mode helpers', () => {
  it('maps story project creation payload to novel-promotion without implicit mode fork', () => {
    expect(
      toProjectCreatePayload({
        name: '  Story launch  ',
        description: '  baseline flow  ',
        entryMode: 'story',
      }),
    ).toEqual({
      name: 'Story launch',
      description: 'baseline flow',
      mode: 'novel-promotion',
    })
  })

  it('builds manga entry url that jumps directly to script stage with quick manga enabled', () => {
    expect(buildProjectEntryUrl('project-123', 'manga')).toBe('/workspace/project-123?stage=script&quickManga=1')
  })

  it('keeps story entry url on default workspace route', () => {
    expect(buildProjectEntryUrl('project-123', 'story')).toBe('/workspace/project-123')
  })

  it('enables quick manga only when the explicit query param is present', () => {
    expect(shouldEnableQuickMangaFromSearchParams(new URLSearchParams('quickManga=1'))).toBe(true)
    expect(shouldEnableQuickMangaFromSearchParams(new URLSearchParams('quickManga=0'))).toBe(false)
    expect(shouldEnableQuickMangaFromSearchParams(new URLSearchParams('stage=script'))).toBe(false)
  })
})
