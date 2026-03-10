import { describe, expect, it } from 'vitest'
import { buildJourneyGenerationStageConfig } from '@/lib/workspace/journey-generation-runtime'

describe('journey generation runtime', () => {
  it('applies manga lane defaults and keeps quickManga controls for story_to_script', () => {
    const config = buildJourneyGenerationStageConfig({
      context: {
        journeyType: 'manga_webtoon',
        entryIntent: 'manga_story_to_panels',
        sourceType: 'story_text',
      },
      stage: 'story_to_script',
      quickManga: {
        enabled: true,
        preset: 'action-battle',
        layout: 'vertical-scroll',
        colorMode: 'black-white',
      },
      quickMangaControls: {
        styleLock: {
          enabled: true,
          profile: 'line-consistent',
          strength: 0.8,
        },
        chapterContinuity: {
          mode: 'chapter-strict',
          chapterId: 'ch-11',
          conflictPolicy: 'prefer-chapter-context',
        },
      },
    })

    expect(config.temperature).toBe(0.66)
    expect(config.reasoningEffort).toBe('high')
    expect(config.quickManga.enabled).toBe(true)
    expect(config.quickMangaControls).toBeDefined()
    expect(config.meta).toEqual({
      runtimeLane: 'manga_webtoon',
      stageProfile: 'story_to_script',
      entryIntent: 'manga_story_to_panels',
      sourceType: 'story_text',
    })
  })

  it('forces quickManga disabled and strips controls for film lane', () => {
    const config = buildJourneyGenerationStageConfig({
      context: {
        journeyType: 'film_video',
        entryIntent: 'film_story_studio',
        sourceType: 'blank',
      },
      stage: 'script_to_storyboard',
      quickManga: {
        enabled: true,
        preset: 'auto',
        layout: 'auto',
        colorMode: 'auto',
      },
      quickMangaControls: {
        styleLock: {
          enabled: true,
          profile: 'auto',
          strength: 0.65,
        },
        chapterContinuity: {
          mode: 'off',
          chapterId: null,
          conflictPolicy: 'balanced',
        },
      },
    })

    expect(config.temperature).toBe(0.7)
    expect(config.reasoningEffort).toBe('medium')
    expect(config.quickManga.enabled).toBe(false)
    expect(config.quickMangaControls).toBeUndefined()
    expect(config.meta.runtimeLane).toBe('film_video')
  })
})
