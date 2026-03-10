'use client'

import { useMemo } from 'react'
import type { NovelPromotionWorkspaceProps } from '../types'
import type { CapabilitySelections } from '@/lib/model-config-contract'
import type {
  QuickMangaColorMode,
  QuickMangaLayout,
  QuickMangaPreset,
} from '@/lib/novel-promotion/quick-manga'
import type {
  QuickMangaContinuityConflictPolicy,
  QuickMangaContinuityMode,
  QuickMangaStyleLockProfile,
} from '@/lib/novel-promotion/quick-manga-contract'

function parseCapabilitySelections(raw: unknown): CapabilitySelections {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as CapabilitySelections
  }
  if (typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as CapabilitySelections
  } catch {
    return {}
  }
}

export function useWorkspaceProjectSnapshot({
  project,
  episode,
  urlStage,
}: Pick<NovelPromotionWorkspaceProps, 'project' | 'episode' | 'urlStage'>) {
  return useMemo(() => {
    const projectData = project.novelPromotionData
    const capabilityOverrides = parseCapabilitySelections(projectData?.capabilityOverrides)
    const journeyType: 'film_video' | 'manga_webtoon' =
      projectData?.onboardingContext?.journeyType === 'manga_webtoon'
        ? 'manga_webtoon'
        : 'film_video'
    const entryIntent = projectData?.onboardingContext?.entryIntent
    const sourceType = projectData?.onboardingContext?.sourceType

    return {
      projectData,
      projectCharacters: projectData?.characters || [],
      projectLocations: projectData?.locations || [],
      episodeStoryboards: episode?.storyboards || [],
      currentStage: urlStage === 'editor' ? 'videos' : (urlStage || 'config'),
      globalAssetText: projectData?.globalAssetText || '',
      novelText: episode?.novelText || '',
      analysisModel: projectData?.analysisModel,
      characterModel: projectData?.characterModel,
      locationModel: projectData?.locationModel,
      storyboardModel: projectData?.storyboardModel,
      editModel: projectData?.editModel,
      videoModel: projectData?.videoModel,
      journeyType,
      entryIntent,
      sourceType,
      projectName: project.name,
      videoRatio: projectData?.videoRatio,
      capabilityOverrides,
      ttsRate: projectData?.ttsRate,
      artStyle: projectData?.artStyle,
      quickMangaEnabled: false,
      quickMangaPreset: 'auto' as QuickMangaPreset,
      quickMangaLayout: 'auto' as QuickMangaLayout,
      quickMangaColorMode: 'auto' as QuickMangaColorMode,
      quickMangaStyleLockEnabled: false,
      quickMangaStyleLockProfile: 'auto' as QuickMangaStyleLockProfile,
      quickMangaStyleLockStrength: 0.65,
      quickMangaChapterContinuityMode: 'off' as QuickMangaContinuityMode,
      quickMangaChapterId: null as string | null,
      quickMangaConflictPolicy: 'balanced' as QuickMangaContinuityConflictPolicy,
    }
  }, [episode?.novelText, episode?.storyboards, project.name, project.novelPromotionData, urlStage])
}
