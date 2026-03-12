import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

type StoryInputMangaMessages = {
  storyInput?: {
    manga?: {
      description?: string
      history?: {
        description?: string
      }
      layout?: {
        options?: {
          cinematic?: string
        }
      }
    }
    runtimeLane?: {
      manga?: {
        videoRatio?: string
        visualStyle?: string
        moreConfig?: string
      }
    }
  }
}

function readLocale(locale: 'en' | 'vi' | 'ko' | 'zh'): StoryInputMangaMessages {
  const filePath = path.join(process.cwd(), 'messages', locale, 'novel-promotion.json')
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw) as StoryInputMangaMessages
}

describe('manga vocabulary pass regression (VAT-134)', () => {
  it('keeps manga lane helper text free from video-like wording in EN/VI/KO/ZH', () => {
    for (const locale of ['en', 'vi', 'ko', 'zh'] as const) {
      const messages = readLocale(locale)
      const values = [
        messages.storyInput?.manga?.description ?? '',
        messages.storyInput?.manga?.history?.description ?? '',
        messages.storyInput?.runtimeLane?.manga?.moreConfig ?? '',
      ]

      for (const value of values) {
        const lowered = value.toLowerCase()
        expect(lowered).not.toContain('video')
        expect(lowered).not.toContain('clip')
      }
    }
  })

  it('uses panel-reading vocabulary for manga runtime lane labels across locales', () => {
    const en = readLocale('en')
    const vi = readLocale('vi')
    const ko = readLocale('ko')
    const zh = readLocale('zh')

    expect(en.storyInput?.runtimeLane?.manga?.videoRatio).toBe('Reading Layout')
    expect(en.storyInput?.runtimeLane?.manga?.visualStyle).toBe('Line / Ink Style')

    expect(vi.storyInput?.runtimeLane?.manga?.videoRatio).toBe('Bố cục đọc')
    expect(vi.storyInput?.runtimeLane?.manga?.visualStyle).toBe('Phong cách nét / mực')

    expect(ko.storyInput?.runtimeLane?.manga?.videoRatio).toBe('읽기 레이아웃')
    expect(ko.storyInput?.runtimeLane?.manga?.visualStyle).toBe('라인 / 잉크 스타일')

    expect(zh.storyInput?.runtimeLane?.manga?.videoRatio).toBe('阅读布局')
    expect(zh.storyInput?.runtimeLane?.manga?.visualStyle).toBe('线稿 / 墨色风格')
  })

  it('keeps cinematic option wording panel-first in EN/VI/KO/ZH manga layout options', () => {
    const en = readLocale('en')
    const vi = readLocale('vi')
    const ko = readLocale('ko')
    const zh = readLocale('zh')

    expect(en.storyInput?.manga?.layout?.options?.cinematic).toBe('Dynamic Panel Flow')
    expect(vi.storyInput?.manga?.layout?.options?.cinematic).toBe('Nhịp khung động')
    expect(ko.storyInput?.manga?.layout?.options?.cinematic).toBe('시네마틱 패널')
    expect(zh.storyInput?.manga?.layout?.options?.cinematic).toBe('电影式分镜')
  })
})
