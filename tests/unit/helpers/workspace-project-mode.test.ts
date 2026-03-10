import { describe, expect, it } from 'vitest'
import {
  buildProjectEntryUrl,
  defaultEntryIntentByJourney,
  mapEntryModeToJourneyType,
  mapJourneyTypeToEntryMode,
  mapJourneyTypeToProjectMode,
  resolveProjectModeCompatibility,
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
      projectMode: 'story',
      journeyType: 'film_video',
      entryIntent: 'film_story_studio',
      sourceType: undefined,
      sourceContent: undefined,
    })
  })

  it('maps manga project creation payload to the same backend mode with explicit projectMode', () => {
    expect(
      toProjectCreatePayload({
        name: ' Manga launch ',
        description: ' quick start ',
        entryMode: 'manga',
        journeyType: 'manga_webtoon',
        entryIntent: 'manga_quickstart',
      }),
    ).toEqual({
      name: 'Manga launch',
      description: 'quick start',
      mode: 'novel-promotion',
      projectMode: 'manga',
      journeyType: 'manga_webtoon',
      entryIntent: 'manga_quickstart',
      sourceType: undefined,
      sourceContent: undefined,
    })
  })

  it('keeps sourceType/sourceContent in create payload for onboarding runtime context bridge', () => {
    expect(
      toProjectCreatePayload({
        name: '  Story source payload  ',
        description: '  has source  ',
        entryMode: 'story',
        sourceType: 'story_text',
        sourceContent: '  Once upon a midnight dreary  ',
      }),
    ).toEqual({
      name: 'Story source payload',
      description: 'has source',
      mode: 'novel-promotion',
      projectMode: 'story',
      journeyType: 'film_video',
      entryIntent: 'film_story_studio',
      sourceType: 'story_text',
      sourceContent: 'Once upon a midnight dreary',
    })
  })

  it('builds manga entry url that jumps directly to script stage with quick manga enabled', () => {
    expect(buildProjectEntryUrl('project-123', 'manga')).toBe('/workspace/project-123?stage=script&quickManga=1')
  })

  it('maps journeyType to compatibility projectMode deterministically', () => {
    expect(mapJourneyTypeToProjectMode('film_video')).toBe('story')
    expect(mapJourneyTypeToProjectMode('manga_webtoon')).toBe('manga')
  })

  it('maps journeyType to entryMode for runtime adapter bridge', () => {
    expect(mapJourneyTypeToEntryMode('film_video')).toBe('story')
    expect(mapJourneyTypeToEntryMode('manga_webtoon')).toBe('manga')
  })

  it('maps entry mode to neutral journey type deterministically', () => {
    expect(mapEntryModeToJourneyType('story')).toBe('film_video')
    expect(mapEntryModeToJourneyType('manga')).toBe('manga_webtoon')
  })

  it('derives default entry intent from journey type', () => {
    expect(defaultEntryIntentByJourney('film_video')).toBe('film_story_studio')
    expect(defaultEntryIntentByJourney('manga_webtoon')).toBe('manga_quickstart')
  })

  it('prefers explicit projectMode over journeyType for backward compatibility', () => {
    expect(
      resolveProjectModeCompatibility({
        projectMode: 'story',
        journeyType: 'manga_webtoon',
      }),
    ).toBe('story')
  })

  it('falls back to journeyType mapping when projectMode is missing', () => {
    expect(
      resolveProjectModeCompatibility({
        journeyType: 'manga_webtoon',
      }),
    ).toBe('manga')
    expect(
      resolveProjectModeCompatibility({
        journeyType: 'film_video',
      }),
    ).toBe('story')
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
