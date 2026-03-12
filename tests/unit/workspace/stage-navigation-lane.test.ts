import { describe, expect, it } from 'vitest'
import { useWorkspaceStageNavigation } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageNavigation'

describe('useWorkspaceStageNavigation lane identity (VAT-132)', () => {
  const t = (key: string) => key

  it('keeps manga/webtoon lane wording and panels stage id', () => {
    const items = useWorkspaceStageNavigation({
      isAnyOperationRunning: false,
      episode: { novelText: 'story draft', voiceLines: [] },
      projectCharacterCount: 1,
      episodeStoryboards: [{ panels: [{ id: 'p1', videoUrl: 'https://example.com/video.mp4' } as any] }],
      journeyType: 'manga_webtoon',
      t,
    })

    expect(items.map((item) => item.id)).toEqual(['config', 'script', 'storyboard', 'panels', 'editor'])
    expect(items[0]?.label).toBe('stages.mangaKickoff')
    expect(items[3]?.label).toBe('stages.webtoonPanels')
    expect(items[3]?.status).toBe('ready')
  })

  it('keeps film/video lane wording and videos stage id', () => {
    const items = useWorkspaceStageNavigation({
      isAnyOperationRunning: false,
      episode: { novelText: 'story draft', voiceLines: [] },
      projectCharacterCount: 1,
      episodeStoryboards: [{ panels: [{ id: 'p1' } as any] }],
      journeyType: 'film_video',
      t,
    })

    expect(items.map((item) => item.id)).toEqual(['config', 'script', 'storyboard', 'videos', 'editor'])
    expect(items[0]?.label).toBe('stages.story')
    expect(items[3]?.label).toBe('stages.video')
  })
})
