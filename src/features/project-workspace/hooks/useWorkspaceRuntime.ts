'use client'

import { useMemo } from 'react'
import type { WorkspaceRuntimeValue } from '../WorkspaceRuntimeContext'
import type { CapabilitySelections, ModelCapabilities } from '@/lib/ai-registry/types'
import { VideoPricingTier } from '@/lib/ai-registry/video-capabilities'
import type { BatchVideoGenerationParams, VideoGenerationOptions } from '../components/video'

interface UseWorkspaceRuntimeParams {
  assetsLoading: boolean
  isSubmittingTTS: boolean
  isTransitioning: boolean
  isConfirmingAssets: boolean
  isStartingPlan: boolean
  videoRatio: string | undefined
  artStyle: string | undefined
  visualStylePresetSource: string | undefined
  visualStylePresetId: string | undefined
  directorStylePresetSource: string | undefined
  directorStylePresetId: string | undefined
  videoModel: string | undefined
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
  onRequestAssistantPlan: () => Promise<void>
  handleUpdateClip: (clipId: string, updates: Record<string, unknown>) => Promise<void>
  openAssetLibrary: (characterId?: string | null, refreshAssets?: boolean) => void
  handleGeneratePanelImage: (panelId: string, count?: number) => Promise<void>
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
  handleRenderFinalVideo: () => Promise<void>
  handleGenerateEditAssets: (editScriptId: string, requirementId?: string) => Promise<void>
  handleGenerateEditStoryboard: (editScriptId: string) => Promise<void>
  handleUpdateVideoPrompt: (
    storyboardId: string,
    panelIndex: number,
    value: string,
    field?: 'videoPrompt' | 'firstLastFramePrompt',
  ) => Promise<void>
  handleUpdatePanelVideoModel: (storyboardId: string, panelIndex: number, model: string) => Promise<void>
}

export function useWorkspaceRuntime({
  assetsLoading,
  isSubmittingTTS,
  isTransitioning,
  isConfirmingAssets,
  isStartingPlan,
  videoRatio,
  artStyle,
  visualStylePresetSource,
  visualStylePresetId,
  directorStylePresetSource,
  directorStylePresetId,
  videoModel,
  capabilityOverrides,
  userVideoModels,
  handleUpdateEpisode,
  handleUpdateConfig,
  onRequestAssistantPlan,
  handleUpdateClip,
  openAssetLibrary,
  handleGeneratePanelImage,
  handleGenerateVideo,
  handleGenerateAllVideos,
  handleRenderFinalVideo,
  handleGenerateEditAssets,
  handleGenerateEditStoryboard,
  handleUpdateVideoPrompt,
  handleUpdatePanelVideoModel,
}: UseWorkspaceRuntimeParams) {
  const resolvedUserVideoModels = useMemo(
    () => userVideoModels || [],
    [userVideoModels],
  )

  return useMemo<WorkspaceRuntimeValue>(() => ({
    assetsLoading,
    isSubmittingTTS,
    isTransitioning,
    isConfirmingAssets,
    isStartingPlan,
    videoRatio,
    artStyle,
    visualStylePresetSource,
    visualStylePresetId,
    directorStylePresetSource,
    directorStylePresetId,
    videoModel,
    capabilityOverrides,
    userVideoModels: resolvedUserVideoModels,
    onNovelTextChange: (value) => handleUpdateEpisode('novelText', value),
    onVideoRatioChange: (value) => handleUpdateConfig('videoRatio', value),
    onArtStyleChange: (value) => handleUpdateConfig('artStyle', value),
    onVisualStylePresetChange: (value) => handleUpdateConfig('visualStylePreset', value),
    onDirectorStylePresetRefChange: (value) => handleUpdateConfig('directorStylePreset', value),
    onDirectorStylePresetChange: (value) => handleUpdateConfig('directorStylePresetId', value),
    onRequestAssistantPlan,
    onClipUpdate: (clipId, data) => {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('onClipUpdate requires a plain object payload')
      }
      return handleUpdateClip(clipId, data as Record<string, unknown>)
    },
    onOpenAssetLibrary: () => openAssetLibrary(),
    onGeneratePanelImage: handleGeneratePanelImage,
    onGenerateVideo: handleGenerateVideo,
    onGenerateAllVideos: handleGenerateAllVideos,
    onRenderFinalVideo: handleRenderFinalVideo,
    onGenerateEditAssets: handleGenerateEditAssets,
    onGenerateEditStoryboard: handleGenerateEditStoryboard,
    onUpdateVideoPrompt: handleUpdateVideoPrompt,
    onUpdatePanelVideoModel: handleUpdatePanelVideoModel,
    onOpenAssetLibraryForCharacter: (characterId, refreshAssets) => openAssetLibrary(characterId, refreshAssets),
  }), [
    artStyle,
    visualStylePresetSource,
    visualStylePresetId,
    directorStylePresetSource,
    directorStylePresetId,
    assetsLoading,
    handleGenerateAllVideos,
    handleRenderFinalVideo,
    handleGenerateEditAssets,
    handleGenerateEditStoryboard,
    handleGeneratePanelImage,
    handleGenerateVideo,
    handleUpdateClip,
    handleUpdateConfig,
    handleUpdateEpisode,
    handleUpdatePanelVideoModel,
    handleUpdateVideoPrompt,
    isConfirmingAssets,
    isStartingPlan,
    isSubmittingTTS,
    isTransitioning,
    openAssetLibrary,
    onRequestAssistantPlan,
    resolvedUserVideoModels,
    capabilityOverrides,
    videoModel,
    videoRatio,
  ])
}
