'use client'

import type { UserModelsPayload } from './useWorkspaceUserModels'
import type { WorkspaceStageRuntimeValue } from '../WorkspaceStageRuntimeContext'
import type { TaskPresentationState } from '@/lib/task/presentation'
import type { BatchVideoGenerationParams, VideoGenerationOptions } from '../components/video'
import type { CapabilitySelections } from '@/lib/model-config-contract'
import type { VideoPricingTier } from '@/lib/model-pricing/video-tier'
import type {
  useScriptToStoryboardRunStream,
  useStoryToScriptRunStream,
} from '@/lib/query/hooks'

type StoryToScriptStreamState = ReturnType<typeof useStoryToScriptRunStream>
type ScriptToStoryboardStreamState = ReturnType<typeof useScriptToStoryboardRunStream>

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
  videoRatio: string | undefined
  capabilityOverrides: CapabilitySelections
  ttsRate: string | number | undefined
  artStyle: string | undefined
  selectedCharacterStrategy: 'consistency-first' | 'emotion-first' | 'dynamic-action'
  selectedEnvironmentId: 'city-night-neon' | 'forest-mist-dawn' | 'interior-cinematic'
  quickMangaEnabled: boolean
  quickMangaPreset: 'auto' | 'action-battle' | 'romance-drama' | 'slice-of-life' | 'comedy-4koma'
  quickMangaLayout: 'auto' | 'cinematic' | 'four-koma' | 'vertical-scroll' | 'splash-focus'
  quickMangaColorMode: 'auto' | 'full-color' | 'black-white' | 'limited-palette'
  quickMangaPanelTemplateId: string | null
  quickMangaStyleLockEnabled: boolean
  quickMangaStyleLockProfile: 'auto' | 'line-consistent' | 'ink-contrast' | 'soft-tones'
  quickMangaStyleLockStrength: number
  quickMangaChapterContinuityMode: 'off' | 'chapter-strict' | 'chapter-flex'
  quickMangaChapterId: string | null
  quickMangaConflictPolicy: 'balanced' | 'prefer-style-lock' | 'prefer-chapter-context'
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
  stageNavState: {
    currentStage: string
    capsuleNavItems: Array<{
      id: string
      label: string
      icon: string
      status: 'empty' | 'active' | 'processing' | 'ready'
      disabled?: boolean
      disabledLabel?: string
    }>
    handleStageChange: (stage: string) => void
  }
  rebuildState: {
    showRebuildConfirm: boolean
    rebuildConfirmTitle: string
    rebuildConfirmMessage: string
    runWithRebuildConfirm: (action: 'storyToScript' | 'scriptToStoryboard', operation: () => Promise<void>) => Promise<void>
    handleCancelRebuildConfirm: () => void
    handleAcceptRebuildConfirm: () => void
  }
  executionState: {
    isSubmittingTTS: boolean
    isAssetAnalysisRunning: boolean
    isConfirmingAssets: boolean
    isTransitioning: boolean
    transitionProgress: { step?: string; total?: number; current?: number }
    storyToScriptConsoleMinimized: boolean
    setStoryToScriptConsoleMinimized: (minimized: boolean) => void
    scriptToStoryboardConsoleMinimized: boolean
    setScriptToStoryboardConsoleMinimized: (minimized: boolean) => void
    storyToScriptStream: StoryToScriptStreamState
    scriptToStoryboardStream: ScriptToStoryboardStreamState
    handleGenerateTTS: () => Promise<void>
    handleAnalyzeAssets: () => Promise<void>
    runStoryToScriptFlow: () => Promise<void>
    runScriptToStoryboardFlow: () => Promise<void>
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
      field?: 'videoPrompt' | 'firstLastFramePrompt',
    ) => Promise<void>
    handleUpdatePanelVideoModel: (storyboardId: string, panelIndex: number, model: string) => Promise<void>
    handleUpdateClip: (clipId: string, updates: Record<string, unknown>) => Promise<void>
  }
  stageRuntime: WorkspaceStageRuntimeValue
  actionsState: {
    handleUpdateConfig: (key: string, value: unknown) => Promise<void>
    handleUpdateEpisode: (key: string, value: unknown) => Promise<void>
  }
}

export function buildWorkspaceControllerViewModel({
  t,
  tc,
  te,
  projectSnapshot,
  uiState,
  stageNavState,
  rebuildState,
  executionState,
  videoState,
  stageRuntime,
  actionsState,
}: BuildWorkspaceControllerViewModelParams) {
  return {
    i18n: { t, tc, te },
    project: projectSnapshot,
    ui: uiState,
    stageNav: stageNavState,
    rebuild: rebuildState,
    execution: executionState,
    video: videoState,
    runtime: { stageRuntime },
    actions: actionsState,
  }
}
