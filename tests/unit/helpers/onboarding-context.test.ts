import { describe, expect, it } from 'vitest'
import {
  buildWorkspaceOnboardingContext,
  mergeWorkspaceOnboardingContextIntoCapabilityOverrides,
  readWorkspaceOnboardingContextFromCapabilityOverrides,
} from '@/lib/workspace/onboarding-context'

describe('workspace onboarding context helpers', () => {
  it('builds normalized onboarding context with trimmed source content', () => {
    const context = buildWorkspaceOnboardingContext({
      journeyType: 'manga_webtoon',
      entryIntent: 'manga_story_to_panels',
      sourceType: 'story_text',
      sourceContent: '  sample story text  ',
    })

    expect(context).toMatchObject({
      journeyType: 'manga_webtoon',
      entryIntent: 'manga_story_to_panels',
      sourceType: 'story_text',
      sourceContent: 'sample story text',
    })
    expect(typeof context.capturedAt).toBe('string')
  })

  it('drops source content when source type is blank', () => {
    const context = buildWorkspaceOnboardingContext({
      journeyType: 'film_video',
      entryIntent: 'film_story_studio',
      sourceType: 'blank',
      sourceContent: 'should be ignored',
    })

    expect(context.sourceType).toBe('blank')
    expect(context.sourceContent).toBeUndefined()
  })

  it('merges context into capability overrides and reads it back', () => {
    const context = buildWorkspaceOnboardingContext({
      journeyType: 'manga_webtoon',
      entryIntent: 'manga_quickstart',
      sourceType: 'import_script',
      sourceContent: 'Panel 1: Intro',
    })

    const merged = mergeWorkspaceOnboardingContextIntoCapabilityOverrides({
      existingCapabilityOverrides: JSON.stringify({
        'model-a': { quality: 'high' },
      }),
      onboardingContext: context,
    })

    const parsed = JSON.parse(merged)
    expect(parsed['model-a']).toEqual({ quality: 'high' })

    const restored = readWorkspaceOnboardingContextFromCapabilityOverrides(merged)
    expect(restored).toMatchObject({
      journeyType: 'manga_webtoon',
      entryIntent: 'manga_quickstart',
      sourceType: 'import_script',
      sourceContent: 'Panel 1: Intro',
    })
  })

  it('returns null when context payload is missing', () => {
    expect(readWorkspaceOnboardingContextFromCapabilityOverrides(null)).toBeNull()
    expect(readWorkspaceOnboardingContextFromCapabilityOverrides('{}')).toBeNull()
  })
})
