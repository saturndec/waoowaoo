import { describe, expect, it } from 'vitest'
import {
  buildJourneyRuntimeEntryUrl,
  resolveJourneyEntryIntent,
  toJourneyProjectCreatePayload,
} from '@/lib/workspace/journey-runtime-adapter'

describe('journey runtime adapter', () => {
  it('maps manga journey + blank source to manga_quickstart intent', () => {
    expect(resolveJourneyEntryIntent({
      journeyType: 'manga_webtoon',
      entryMode: 'manga',
      sourceType: 'blank',
    })).toBe('manga_quickstart')
  })

  it('maps manga journey + story source to manga_story_to_panels intent', () => {
    expect(resolveJourneyEntryIntent({
      journeyType: 'manga_webtoon',
      entryMode: 'manga',
      sourceType: 'story_text',
    })).toBe('manga_story_to_panels')
  })

  it('keeps story template semantics for film/video lane', () => {
    expect(resolveJourneyEntryIntent({
      journeyType: 'film_video',
      entryMode: 'story',
      sourceType: 'blank',
      templateId: 'story-social-ad',
    })).toBe('video_ad_short')
  })

  it('produces compatibility create payload with journey contract', () => {
    expect(toJourneyProjectCreatePayload({
      name: '  New Manga Project ',
      description: '  hello ',
      entryMode: 'manga',
      sourceType: 'story_text',
      sourceContent: 'abc',
      starterTemplateId: 'manga-action-battle',
    })).toEqual({
      name: 'New Manga Project',
      description: 'hello',
      mode: 'novel-promotion',
      projectMode: 'manga',
      journeyType: 'manga_webtoon',
      entryIntent: 'manga_story_to_panels',
      sourceType: 'story_text',
      sourceContent: 'abc',
    })
  })

  it('builds runtime entry url with quickManga bridge for manga journey', () => {
    expect(buildJourneyRuntimeEntryUrl({ projectId: 'project-1', journeyType: 'manga_webtoon' }))
      .toBe('/workspace/project-1?stage=script&quickManga=1')
  })

  it('builds runtime entry url without quickManga bridge for film/video journey', () => {
    expect(buildJourneyRuntimeEntryUrl({ projectId: 'project-2', journeyType: 'film_video' }))
      .toBe('/workspace/project-2')
  })
})
