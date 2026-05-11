'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { CapabilitySelections, ModelCapabilities } from '@/lib/ai-registry/types'
import { VideoPricingTier } from '@/lib/ai-registry/video-capabilities'
import type { BatchVideoGenerationParams, VideoGenerationOptions } from './components/video'

export interface WorkspaceVideoModelOption {
  value: string
  label: string
  provider?: string
  providerName?: string
  capabilities?: ModelCapabilities
  videoPricingTiers?: VideoPricingTier[]
}

export interface WorkspaceRuntimeValue {
  assetsLoading: boolean
  isSubmittingTTS: boolean
  isTransitioning: boolean
  isConfirmingAssets: boolean
  isStartingPlan: boolean
  videoRatio: string | null | undefined
  artStyle: string | null | undefined
  visualStylePresetSource: string | null | undefined
  visualStylePresetId: string | null | undefined
  directorStylePresetSource: string | null | undefined
  directorStylePresetId: string | null | undefined
  videoModel: string | null | undefined
  capabilityOverrides: CapabilitySelections
  userVideoModels: WorkspaceVideoModelOption[]
  onNovelTextChange: (value: string) => Promise<void>
  onVideoRatioChange: (value: string) => Promise<void>
  onArtStyleChange: (value: string) => Promise<void>
  onVisualStylePresetChange: (value: { presetSource: 'system' | 'user'; presetId: string }) => Promise<void>
  onDirectorStylePresetRefChange: (value: { presetSource: 'system' | 'user'; presetId: string } | null) => Promise<void>
  onDirectorStylePresetChange: (value: string) => Promise<void>
  onRequestAssistantPlan: () => Promise<void>
  onClipUpdate: (clipId: string, data: unknown) => Promise<void>
  onOpenAssetLibrary: () => void
  onGeneratePanelImage: (panelId: string, count?: number) => Promise<void>
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
  onRenderFinalVideo: () => Promise<void>
  onGenerateEditAssets: (editScriptId: string, requirementId?: string) => Promise<void>
  onGenerateEditStoryboard: (editScriptId: string) => Promise<void>
  onUpdateVideoPrompt: (
    storyboardId: string,
    panelIndex: number,
    value: string,
    field?: 'videoPrompt' | 'firstLastFramePrompt',
  ) => Promise<void>
  onUpdatePanelVideoModel: (storyboardId: string, panelIndex: number, model: string) => Promise<void>
  onOpenAssetLibraryForCharacter: (characterId?: string | null, refreshAssets?: boolean) => void
}

const WorkspaceRuntimeContext = createContext<WorkspaceRuntimeValue | null>(null)

interface WorkspaceRuntimeProviderProps {
  value: WorkspaceRuntimeValue
  children: ReactNode
}

export function WorkspaceRuntimeProvider({ value, children }: WorkspaceRuntimeProviderProps) {
  return (
    <WorkspaceRuntimeContext.Provider value={value}>
      {children}
    </WorkspaceRuntimeContext.Provider>
  )
}

export function useWorkspaceRuntime() {
  const context = useContext(WorkspaceRuntimeContext)
  if (!context) {
    throw new Error('useWorkspaceRuntime must be used within WorkspaceRuntimeProvider')
  }
  return context
}
