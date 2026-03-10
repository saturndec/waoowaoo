import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  buildStarterProjectName,
  getStarterTemplatesByMode,
  resolveEntryIntentFromTemplate,
} from '@/lib/workspace/onboarding-templates'

type WorkspaceMessages = {
  starterTemplates?: {
    title?: string
    subtitle?: string
    story?: Record<string, { title?: string; desc?: string }>
    manga?: Record<string, { title?: string; desc?: string }>
  }
}

function readWorkspaceLocale(locale: 'en' | 'vi' | 'zh' | 'ko'): WorkspaceMessages {
  const filePath = path.join(process.cwd(), 'messages', locale, 'workspace.json')
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw) as WorkspaceMessages
}

describe('manga onboarding template gallery (VAT-106)', () => {
  it('keeps Manga terminology consistent on onboarding entry labels across locales', () => {
    for (const locale of ['en', 'vi', 'zh', 'ko'] as const) {
      const messages = readWorkspaceLocale(locale) as WorkspaceMessages & {
        projectTypeMangaTitle?: string
        projectTypeMangaDesc?: string
      }
      expect(messages.projectTypeMangaTitle).toContain('Manga')
      expect(messages.projectTypeMangaDesc).toContain('Manga')
    }
  })

  it('provides at least 3 approved Manga starter templates', () => {
    const templates = getStarterTemplatesByMode('manga')
    expect(templates.length).toBeGreaterThanOrEqual(3)
  })

  it('keeps starter template copy keys available in all workspace locales', () => {
    const templates = [
      ...getStarterTemplatesByMode('story'),
      ...getStarterTemplatesByMode('manga'),
    ]

    for (const locale of ['en', 'vi', 'zh', 'ko'] as const) {
      const messages = readWorkspaceLocale(locale)
      expect(messages.starterTemplates?.title).toBeTruthy()
      expect(messages.starterTemplates?.subtitle).toBeTruthy()

      for (const template of templates) {
        const pathParts = template.titleKey.split('.')
        // starterTemplates.<mode>.<template>.title
        const section = messages.starterTemplates?.[pathParts[1] as 'story' | 'manga']
        const item = section?.[pathParts[2]]
        expect(item?.title).toBeTruthy()
        expect(item?.desc).toBeTruthy()
      }
    }
  })

  it('builds starter project name with date suffix for onboarding quick start', () => {
    const name = buildStarterProjectName('Manga Action Battle')
    expect(name).toMatch(/^Manga Action Battle \d{2}-\d{2}$/)
  })

  it('maps template selection to entryIntent semantics, with compatibility fallback', () => {
    expect(resolveEntryIntentFromTemplate({ entryMode: 'manga', templateId: 'manga-action-battle' })).toBe('manga_story_to_panels')
    expect(resolveEntryIntentFromTemplate({ entryMode: 'story', templateId: 'story-social-ad' })).toBe('video_ad_short')
    expect(resolveEntryIntentFromTemplate({ entryMode: 'story', templateId: 'unknown-template' })).toBe('film_story_studio')
    expect(resolveEntryIntentFromTemplate({ entryMode: 'manga' })).toBe('manga_quickstart')
  })
})
