'use client'

import { useMemo } from 'react'
import type { WorkspaceStageRuntimeValue } from '../WorkspaceStageRuntimeContext'
import type { CapabilitySelections, ModelCapabilities } from '@/lib/model-config-contract'
import type { VideoPricingTier } from '@/lib/model-pricing/video-tier'
import type { BatchVideoGenerationParams, VideoGenerationOptions } from '../components/video'
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

interface UseWorkspaceStageRuntimeParams {
  assetsLoading: boolean
  isSubmittingTTS: boolean
  isTransitioning: boolean
  isConfirmingAssets: boolean
  videoRatio: string | undefined
  artStyle: string | undefined
  quickMangaEnabled: boolean
  quickMangaPreset: QuickMangaPreset
  quickMangaLayout: QuickMangaLayout
  quickMangaColorMode: QuickMangaColorMode
  quickMangaPanelTemplateId: string | null
  quickMangaStyleLockEnabled: boolean
  quickMangaStyleLockProfile: QuickMangaStyleLockProfile
  quickMangaStyleLockStrength: number
  quickMangaChapterContinuityMode: QuickMangaContinuityMode
  quickMangaChapterId: string | null
  quickMangaConflictPolicy: QuickMangaContinuityConflictPolicy
  selectedCharacterStrategy: 'consistency-first' | 'emotion-first' | 'dynamic-action'
  selectedEnvironmentId: 'city-night-neon' | 'forest-mist-dawn' | 'interior-cinematic'
  videoModel: string | undefined
  journeyType: 'film_video' | 'manga_webtoon'
  projectName: string
  capabilityOverrides: CapabilitySelections
  userVideoModels: Array<{
    value: string
    label: string
    provider?: string
    providerName?: string
    capabilities?: ModelCapabilities
    videoPricingTiers?: VideoPricingTier[]
  }> | undefined
  handleUpdateEpisode: (key: string, value: unknown) => Promise<void>
  handleUpdateConfig: (key: string, value: unknown) => Promise<void>
  onQuickMangaEnabledChange: (enabled: boolean) => Promise<void>
  onQuickMangaPresetChange: (value: QuickMangaPreset) => Promise<void>
  onQuickMangaLayoutChange: (value: QuickMangaLayout) => Promise<void>
  onQuickMangaColorModeChange: (value: QuickMangaColorMode) => Promise<void>
  onQuickMangaPanelTemplateChange: (templateId: string | null) => Promise<void>
  onQuickMangaStyleLockEnabledChange: (enabled: boolean) => Promise<void>
  onQuickMangaStyleLockProfileChange: (value: QuickMangaStyleLockProfile) => Promise<void>
  onQuickMangaStyleLockStrengthChange: (value: number) => Promise<void>
  onQuickMangaChapterContinuityModeChange: (value: QuickMangaContinuityMode) => Promise<void>
  onQuickMangaChapterIdChange: (value: string | null) => Promise<void>
  onQuickMangaConflictPolicyChange: (value: QuickMangaContinuityConflictPolicy) => Promise<void>
  onCharacterStrategyChange: (value: 'consistency-first' | 'emotion-first' | 'dynamic-action') => Promise<void>
  onEnvironmentChange: (value: 'city-night-neon' | 'forest-mist-dawn' | 'interior-cinematic') => Promise<void>
  onGenerateDemoSampleAssets: () => Promise<{ mode: 'real' | 'fallback' | 'mixed'; realTriggered: number; fallbackApplied: number }>
  demoSampleAssetsPending: boolean
  runWithRebuildConfirm: (action: 'storyToScript' | 'scriptToStoryboard', operation: () => Promise<void>) => Promise<void>
  runStoryToScriptFlow: () => Promise<void>
  runScriptToStoryboardFlow: () => Promise<void>
  handleUpdateClip: (clipId: string, updates: Record<string, unknown>) => Promise<void>
  openAssetLibrary: (characterId?: string | null, refreshAssets?: boolean) => void
  handleStageChange: (stage: string) => void
  handleGenerateVideo: (
    storyboardId: string,
    panelIndex: number,
    videoModel?: string,
    firstLastFrame?: {
      lastFrameStoryboardId: string
      lastFramePanelIndex: number
      flModel: string
      customPrompt?: string
    },
    generationOptions?: VideoGenerationOptions,
    panelId?: string,
  ) => Promise<void>
  handleGenerateAllVideos: (options?: BatchVideoGenerationParams) => Promise<void>
  handleUpdateVideoPrompt: (
    storyboardId: string,
    panelIndex: number,
    value: string,
    field?: 'videoPrompt' | 'firstLastFramePrompt',
  ) => Promise<void>
  handleUpdatePanelVideoModel: (storyboardId: string, panelIndex: number, model: string) => Promise<void>
}

export function useWorkspaceStageRuntime({
  assetsLoading,
  isSubmittingTTS,
  isTransitioning,
  isConfirmingAssets,
  videoRatio,
  artStyle,
  quickMangaEnabled,
  quickMangaPreset,
  quickMangaLayout,
  quickMangaColorMode,
  quickMangaPanelTemplateId,
  quickMangaStyleLockEnabled,
  quickMangaStyleLockProfile,
  quickMangaStyleLockStrength,
  quickMangaChapterContinuityMode,
  quickMangaChapterId,
  quickMangaConflictPolicy,
  selectedCharacterStrategy,
  selectedEnvironmentId,
  videoModel,
  journeyType,
  projectName,
  capabilityOverrides,
  userVideoModels,
  handleUpdateEpisode,
  handleUpdateConfig,
  onQuickMangaEnabledChange,
  onQuickMangaPresetChange,
  onQuickMangaLayoutChange,
  onQuickMangaColorModeChange,
  onQuickMangaPanelTemplateChange,
  onQuickMangaStyleLockEnabledChange,
  onQuickMangaStyleLockProfileChange,
  onQuickMangaStyleLockStrengthChange,
  onQuickMangaChapterContinuityModeChange,
  onQuickMangaChapterIdChange,
  onQuickMangaConflictPolicyChange,
  onCharacterStrategyChange,
  onEnvironmentChange,
  onGenerateDemoSampleAssets,
  demoSampleAssetsPending,
  runWithRebuildConfirm,
  runStoryToScriptFlow,
  runScriptToStoryboardFlow,
  handleUpdateClip,
  openAssetLibrary,
  handleStageChange,
  handleGenerateVideo,
  handleGenerateAllVideos,
  handleUpdateVideoPrompt,
  handleUpdatePanelVideoModel,
}: UseWorkspaceStageRuntimeParams) {
  const resolvedUserVideoModels = useMemo(
    () => userVideoModels || [],
    [userVideoModels],
  )

  return useMemo<WorkspaceStageRuntimeValue>(() => ({
    assetsLoading,
    isSubmittingTTS,
    isTransitioning,
    isConfirmingAssets,
    videoRatio,
    artStyle,
    videoModel,
    journeyType,
    projectName,
    capabilityOverrides,
    userVideoModels: resolvedUserVideoModels,
    onNovelTextChange: (value) => handleUpdateEpisode('novelText', value),
    quickMangaEnabled,
    quickMangaPreset,
    quickMangaLayout,
    quickMangaColorMode,
    quickMangaPanelTemplateId,
    quickMangaStyleLockEnabled,
    quickMangaStyleLockProfile,
    quickMangaStyleLockStrength,
    quickMangaChapterContinuityMode,
    quickMangaChapterId,
    quickMangaConflictPolicy,
    onQuickMangaEnabledChange,
    onQuickMangaPresetChange,
    onQuickMangaLayoutChange,
    onQuickMangaColorModeChange,
    onQuickMangaPanelTemplateChange,
    onQuickMangaStyleLockEnabledChange,
    onQuickMangaStyleLockProfileChange,
    onQuickMangaStyleLockStrengthChange,
    onQuickMangaChapterContinuityModeChange,
    onQuickMangaChapterIdChange,
    onQuickMangaConflictPolicyChange,
    selectedCharacterStrategy,
    selectedEnvironmentId,
    onVideoRatioChange: (value) => handleUpdateConfig('videoRatio', value),
    onArtStyleChange: (value) => handleUpdateConfig('artStyle', value),
    onCharacterStrategyChange,
    onEnvironmentChange,
    onGenerateDemoSampleAssets,
    demoSampleAssetsPending,
    onRunStoryToScript: () => runWithRebuildConfirm('storyToScript', runStoryToScriptFlow),
    onClipUpdate: (clipId, data) => {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('onClipUpdate requires a plain object payload')
      }
      return handleUpdateClip(clipId, data as Record<string, unknown>)
    },
    onOpenAssetLibrary: () => openAssetLibrary(),
    onRunScriptToStoryboard: () => runWithRebuildConfirm('scriptToStoryboard', runScriptToStoryboardFlow),
    onStageChange: handleStageChange,
    onGenerateVideo: handleGenerateVideo,
    onGenerateAllVideos: handleGenerateAllVideos,
    onUpdateVideoPrompt: handleUpdateVideoPrompt,
    onUpdatePanelVideoModel: handleUpdatePanelVideoModel,
    onOpenAssetLibraryForCharacter: (characterId, refreshAssets) => openAssetLibrary(characterId, refreshAssets),
  }), [
    artStyle,
    assetsLoading,
    capabilityOverrides,
    handleGenerateAllVideos,
    handleGenerateVideo,
    handleStageChange,
    handleUpdateClip,
    handleUpdateConfig,
    handleUpdateEpisode,
    handleUpdatePanelVideoModel,
    handleUpdateVideoPrompt,
    isConfirmingAssets,
    isSubmittingTTS,
    isTransitioning,
    onQuickMangaChapterContinuityModeChange,
    onQuickMangaChapterIdChange,
    onQuickMangaColorModeChange,
    onQuickMangaConflictPolicyChange,
    onQuickMangaEnabledChange,
    onCharacterStrategyChange,
    onEnvironmentChange,
    onGenerateDemoSampleAssets,
    demoSampleAssetsPending,
    onQuickMangaLayoutChange,
    onQuickMangaPanelTemplateChange,
    onQuickMangaPresetChange,
    onQuickMangaStyleLockEnabledChange,
    onQuickMangaStyleLockProfileChange,
    onQuickMangaStyleLockStrengthChange,
    openAssetLibrary,
    journeyType,
    projectName,
    quickMangaChapterContinuityMode,
    quickMangaChapterId,
    quickMangaColorMode,
    quickMangaConflictPolicy,
    quickMangaEnabled,
    quickMangaLayout,
    quickMangaPanelTemplateId,
    selectedCharacterStrategy,
    selectedEnvironmentId,
    quickMangaPreset,
    quickMangaStyleLockEnabled,
    quickMangaStyleLockProfile,
    quickMangaStyleLockStrength,
    resolvedUserVideoModels,
    runScriptToStoryboardFlow,
    runStoryToScriptFlow,
    runWithRebuildConfirm,
    videoModel,
    videoRatio,
  ])
}
