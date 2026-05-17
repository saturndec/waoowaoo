'use client'

import type { UserModelsPayload } from './useWorkspaceUserModels'
import type { WorkspaceRuntimeValue } from '../WorkspaceRuntimeContext'
import type { TaskPresentationState } from '@/lib/task/presentation'
import type { BatchVideoGenerationParams, VideoGenerationOptions } from '../components/video'
import type { CapabilitySelections } from '@/lib/ai-registry/types'
import { VideoPricingTier } from '@/lib/ai-registry/video-capabilities'

interface ProjectSnapshotInput {
  projectData: unknown
  projectCharacters: unknown[]
  projectLocations: unknown[]
  globalAssetText: string
  novelText: string
  analysisModel: string | undefined
  characterModel: string | undefined
  locationModel: string | undefined
  storyboardModel: string | undefined
  editModel: string | undefined
  videoModel: string | undefined
  singleShotVideoModel: string | undefined
  sequenceVideoModel: string | undefined
  audioModel: string | undefined
  musicModel: string | undefined
  videoRatio: string | undefined
  capabilityOverrides: CapabilitySelections
  artStyle: string | undefined
  visualStylePresetSource: string | undefined
  visualStylePresetId: string | undefined
  directorStylePresetSource: string | undefined
  directorStylePresetId: string | undefined
}

interface BuildWorkspaceControllerViewModelParams {
  t: (key: string, values?: Record<string, string | number | Date>) => string
  tc: (key: string, values?: Record<string, string | number | Date>) => string
  te: (key: string, values?: Record<string, string | number | Date>) => string
  projectSnapshot: ProjectSnapshotInput
  uiState: {
    onRefresh: (options?: { mode?: 'full' | 'light' | 'assets' }) => Promise<void>
    assetsLoading: boolean
    assetsLoadingState: TaskPresentationState | null
    isSettingsModalOpen: boolean
    setIsSettingsModalOpen: (open: boolean) => void
    isWorldContextModalOpen: boolean
    setIsWorldContextModalOpen: (open: boolean) => void
    isAssetLibraryOpen: boolean
    assetLibraryFocusCharacterId: string | null
    assetLibraryFocusRequestId: number
    triggerGlobalAnalyzeOnOpen: boolean
    setTriggerGlobalAnalyzeOnOpen: (value: boolean) => void
    openAssetLibrary: (characterId?: string | null, refreshAssets?: boolean) => void
    closeAssetLibrary: () => void
    userModelsForSettings: UserModelsPayload | null
    userVideoModels: Array<{
      value: string
      label: string
      capabilities?: UserModelsPayload['video'][number]['capabilities']
      videoPricingTiers?: VideoPricingTier[]
    }>
    userModelsLoaded: boolean
  }
  rebuildState: {
    showRebuildConfirm: boolean
    rebuildConfirmTitle: string
    rebuildConfirmMessage: string
    handleCancelRebuildConfirm: () => void
    handleAcceptRebuildConfirm: () => void
  }
  executionState: {
    isSubmittingTTS: boolean
    isAssetAnalysisRunning: boolean
    isConfirmingAssets: boolean
    isTransitioning: boolean
    isStartingPlan: boolean
    transitionProgress: { step?: string; total?: number; current?: number }
    handleGenerateTTS: () => Promise<void>
    handleAnalyzeAssets: () => Promise<void>
    requestAssistantPlan: () => Promise<void>
    showCreatingToast: boolean
  }
  videoState: {
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
      field?: 'imagePrompt' | 'videoPrompt' | 'firstLastFramePrompt',
    ) => Promise<void>
    handleUpdatePanelVideoModel: (storyboardId: string, panelIndex: number, model: string) => Promise<void>
    handleUpdateClip: (clipId: string, updates: Record<string, unknown>) => Promise<void>
  }
  workspaceRuntime: WorkspaceRuntimeValue
  actionsState: {
    handleUpdateConfig: (key: string, value: unknown) => Promise<void>
    handleUpdateConfigPatch: (patch: Record<string, unknown>) => Promise<void>
    handleUpdateEpisode: (key: string, value: unknown) => Promise<void>
  }
}

export function buildWorkspaceControllerViewModel({
  t,
  tc,
  te,
  projectSnapshot,
  uiState,
  rebuildState,
  executionState,
  videoState,
  workspaceRuntime,
  actionsState,
}: BuildWorkspaceControllerViewModelParams) {
  return {
    i18n: { t, tc, te },
    project: projectSnapshot,
    ui: uiState,
    rebuild: rebuildState,
    execution: executionState,
    video: videoState,
    runtime: { workspaceRuntime },
    actions: actionsState,
  }
}
