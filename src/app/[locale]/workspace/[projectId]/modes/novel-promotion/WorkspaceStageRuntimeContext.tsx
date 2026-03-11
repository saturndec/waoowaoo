'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { CapabilitySelections, ModelCapabilities } from '@/lib/model-config-contract'
import type { VideoPricingTier } from '@/lib/model-pricing/video-tier'
import type { BatchVideoGenerationParams, VideoGenerationOptions } from './components/video'
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

export interface WorkspaceStageVideoModelOption {
  value: string
  label: string
  provider?: string
  providerName?: string
  capabilities?: ModelCapabilities
  videoPricingTiers?: VideoPricingTier[]
}

export interface WorkspaceStageRuntimeValue {
  assetsLoading: boolean
  isSubmittingTTS: boolean
  isTransitioning: boolean
  isConfirmingAssets: boolean
  videoRatio: string | null | undefined
  artStyle: string | null | undefined
  videoModel: string | null | undefined
  journeyType: 'film_video' | 'manga_webtoon'
  projectName: string
  capabilityOverrides: CapabilitySelections
  userVideoModels: WorkspaceStageVideoModelOption[]
  onNovelTextChange: (value: string) => Promise<void>
  quickMangaEnabled: boolean
  quickMangaPreset: QuickMangaPreset
  quickMangaLayout: QuickMangaLayout
  quickMangaColorMode: QuickMangaColorMode
  quickMangaPanelTemplateId: string | null
  quickMangaStyleLockEnabled: boolean
  onQuickMangaPanelTemplateChange: (templateId: string | null) => Promise<void>
  quickMangaStyleLockProfile: QuickMangaStyleLockProfile
  quickMangaStyleLockStrength: number
  quickMangaChapterContinuityMode: QuickMangaContinuityMode
  quickMangaChapterId: string | null
  quickMangaConflictPolicy: QuickMangaContinuityConflictPolicy
  onQuickMangaEnabledChange: (enabled: boolean) => Promise<void>
  onQuickMangaPresetChange: (value: QuickMangaPreset) => Promise<void>
  onQuickMangaLayoutChange: (value: QuickMangaLayout) => Promise<void>
  onQuickMangaColorModeChange: (value: QuickMangaColorMode) => Promise<void>
  onQuickMangaStyleLockEnabledChange: (enabled: boolean) => Promise<void>
  onQuickMangaStyleLockProfileChange: (value: QuickMangaStyleLockProfile) => Promise<void>
  onQuickMangaStyleLockStrengthChange: (value: number) => Promise<void>
  onQuickMangaChapterContinuityModeChange: (value: QuickMangaContinuityMode) => Promise<void>
  onQuickMangaChapterIdChange: (value: string | null) => Promise<void>
  onQuickMangaConflictPolicyChange: (value: QuickMangaContinuityConflictPolicy) => Promise<void>
  onVideoRatioChange: (value: string) => Promise<void>
  onArtStyleChange: (value: string) => Promise<void>
  selectedCharacterStrategy: 'consistency-first' | 'emotion-first' | 'dynamic-action'
  selectedEnvironmentId: 'city-night-neon' | 'forest-mist-dawn' | 'interior-cinematic'
  onCharacterStrategyChange: (value: 'consistency-first' | 'emotion-first' | 'dynamic-action') => Promise<void>
  onEnvironmentChange: (value: 'city-night-neon' | 'forest-mist-dawn' | 'interior-cinematic') => Promise<void>
  onGenerateDemoSampleAssets: () => Promise<{ mode: 'real' | 'fallback' | 'mixed'; realTriggered: number; fallbackApplied: number }>
  demoSampleAssetsPending: boolean
  onRunStoryToScript: () => Promise<void>
  onClipUpdate: (clipId: string, data: unknown) => Promise<void>
  onOpenAssetLibrary: () => void
  onRunScriptToStoryboard: () => Promise<void>
  onStageChange: (stage: string) => void
  onGenerateVideo: (
    storyboardId: string,
    panelIndex: number,
    model?: string,
    firstLastFrame?: {
      lastFrameStoryboardId: string
      lastFramePanelIndex: number
      flModel: string
      customPrompt?: string
    },
    generationOptions?: VideoGenerationOptions,
    panelId?: string,
  ) => Promise<void>
  onGenerateAllVideos: (options?: BatchVideoGenerationParams) => Promise<void>
  onUpdateVideoPrompt: (
    storyboardId: string,
    panelIndex: number,
    value: string,
    field?: 'videoPrompt' | 'firstLastFramePrompt',
  ) => Promise<void>
  onUpdatePanelVideoModel: (storyboardId: string, panelIndex: number, model: string) => Promise<void>
  onOpenAssetLibraryForCharacter: (characterId?: string | null, refreshAssets?: boolean) => void
}

const WorkspaceStageRuntimeContext = createContext<WorkspaceStageRuntimeValue | null>(null)

interface WorkspaceStageRuntimeProviderProps {
  value: WorkspaceStageRuntimeValue
  children: ReactNode
}

export function WorkspaceStageRuntimeProvider({ value, children }: WorkspaceStageRuntimeProviderProps) {
  return (
    <WorkspaceStageRuntimeContext.Provider value={value}>
      {children}
    </WorkspaceStageRuntimeContext.Provider>
  )
}

export function useWorkspaceStageRuntime() {
  const context = useContext(WorkspaceStageRuntimeContext)
  if (!context) {
    throw new Error('useWorkspaceStageRuntime must be used within WorkspaceStageRuntimeProvider')
  }
  return context
}
