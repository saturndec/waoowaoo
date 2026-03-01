'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { CapabilitySelections, ModelCapabilities } from '@/lib/model-config-contract'
import type { VideoPricingTier } from '@/lib/model-pricing/video-tier'
import type { BatchVideoGenerationParams, VideoGenerationOptions } from './components/video'

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
  locale: string
  videoRatio: string | null | undefined
  artStyle: string | null | undefined
  videoModel: string | null | undefined
  capabilityOverrides: CapabilitySelections
  userVideoModels: WorkspaceStageVideoModelOption[]
  onNovelTextChange: (value: string) => Promise<void>
  onLocaleChange: (value: string) => Promise<void>
  onVideoRatioChange: (value: string) => Promise<void>
  onArtStyleChange: (value: string) => Promise<void>
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
