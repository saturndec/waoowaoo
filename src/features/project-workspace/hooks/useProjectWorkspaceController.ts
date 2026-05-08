'use client'

import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { useWorkspaceProvider } from '../WorkspaceProvider'
import { useWorkspaceUserModels } from './useWorkspaceUserModels'
import { useWorkspaceExecution } from './useWorkspaceExecution'
import { useWorkspaceVideoActions } from './useWorkspaceVideoActions'
import { useWorkspaceAssetLibraryShell } from './useWorkspaceAssetLibraryShell'
import { useWorkspaceProjectSnapshot } from './useWorkspaceProjectSnapshot'
import { useWorkspaceModalEscape } from './useWorkspaceModalEscape'
import { useWorkspaceRuntime } from './useWorkspaceRuntime'
import { useWorkspaceConfigActions } from './useWorkspaceConfigActions'
import { useWorkspaceImageActions } from './useWorkspaceImageActions'
import { buildWorkspaceControllerViewModel } from './workspace-controller-view-model'
import type { ProjectWorkspaceProps } from '../types'
import { useRouter } from '@/i18n/navigation'
import { useGenerateProjectEditScriptAssets } from '@/lib/query/hooks'

export function useProjectWorkspaceController({
  project,
  projectId,
  episodeId,
  episode,
}: ProjectWorkspaceProps) {
  const t = useTranslations('projectWorkflow')
  const te = useTranslations('errors')
  const tc = useTranslations('common')

  const searchParams = useSearchParams()
  const router = useRouter()
  const { onRefresh } = useWorkspaceProvider()

  const projectSnapshot = useWorkspaceProjectSnapshot({ project, episode })

  const assetsLoading = false
  const assetsLoadingState = assetsLoading
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'process',
      resource: 'image',
      hasOutput: false,
    })
    : null

  useEffect(() => {
    _ulogInfo(
      '[ProjectWorkspace] project prop 更新, characters:',
      project?.characters?.length,
    )
  }, [project])

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isWorldContextModalOpen, setIsWorldContextModalOpen] = useState(false)

  const assetLibrary = useWorkspaceAssetLibraryShell({
    searchParams,
    router,
    onRefresh,
  })

  useWorkspaceModalEscape({
    isAssetLibraryOpen: assetLibrary.isAssetLibraryOpen,
    closeAssetLibrary: assetLibrary.closeAssetLibrary,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    isWorldContextModalOpen,
    setIsWorldContextModalOpen,
  })

  const configActions = useWorkspaceConfigActions({
    projectId,
    episodeId,
  })

  const rebuildState = {
    showRebuildConfirm: false,
    rebuildConfirmTitle: '',
    rebuildConfirmMessage: '',
    handleCancelRebuildConfirm: () => undefined,
    handleAcceptRebuildConfirm: () => undefined,
  }

  const userModels = useWorkspaceUserModels()

  const execution = useWorkspaceExecution({
    projectId,
    episodeId,
    analysisModel: projectSnapshot.analysisModel,
    novelText: projectSnapshot.novelText,
    t,
    onRefresh,
    onOpenAssetLibrary: assetLibrary.openAssetLibrary,
  })

  const videoActions = useWorkspaceVideoActions({
    projectId,
    episodeId,
    t,
  })
  const imageActions = useWorkspaceImageActions({
    projectId,
    episodeId,
  })
  const generateEditAssets = useGenerateProjectEditScriptAssets(projectId)
  const handleGenerateEditAssets = async (editScriptId: string) => {
    if (!episodeId) throw new Error('Episode ID is required')
    await generateEditAssets.mutateAsync({ episodeId, editScriptId })
    await onRefresh({ mode: 'full' })
  }

  const workspaceRuntime = useWorkspaceRuntime({
    assetsLoading,
    isSubmittingTTS: execution.isSubmittingTTS,
    isTransitioning: execution.isTransitioning,
    isConfirmingAssets: execution.isConfirmingAssets,
    isStartingPlan: false,
    videoRatio: projectSnapshot.videoRatio,
    artStyle: projectSnapshot.artStyle,
    visualStylePresetSource: projectSnapshot.visualStylePresetSource,
    visualStylePresetId: projectSnapshot.visualStylePresetId,
    directorStylePresetSource: projectSnapshot.directorStylePresetSource,
    directorStylePresetId: projectSnapshot.directorStylePresetId,
    videoModel: projectSnapshot.videoModel,
    capabilityOverrides: projectSnapshot.capabilityOverrides,
    userVideoModels: userModels.userVideoModels || [],
    handleUpdateEpisode: configActions.handleUpdateEpisode,
    handleUpdateConfig: configActions.handleUpdateConfig,
    onRequestAssistantPlan: execution.requestAssistantPlan,
    handleUpdateClip: videoActions.handleUpdateClip,
    openAssetLibrary: assetLibrary.openAssetLibrary,
    handleGeneratePanelImage: imageActions.handleGeneratePanelImage,
    handleGenerateVideo: videoActions.handleGenerateVideo,
    handleGenerateAllVideos: videoActions.handleGenerateAllVideos,
    handleGenerateEditAssets,
    handleUpdateVideoPrompt: videoActions.handleUpdateVideoPrompt,
    handleUpdatePanelVideoModel: videoActions.handleUpdatePanelVideoModel,
  })

  const uiState = {
    onRefresh,
    assetsLoading,
    assetsLoadingState,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    isWorldContextModalOpen,
    setIsWorldContextModalOpen,
    isAssetLibraryOpen: assetLibrary.isAssetLibraryOpen,
    assetLibraryFocusCharacterId: assetLibrary.assetLibraryFocusCharacterId,
    assetLibraryFocusRequestId: assetLibrary.assetLibraryFocusRequestId,
    triggerGlobalAnalyzeOnOpen: assetLibrary.triggerGlobalAnalyzeOnOpen,
    setTriggerGlobalAnalyzeOnOpen: assetLibrary.setTriggerGlobalAnalyzeOnOpen,
    openAssetLibrary: assetLibrary.openAssetLibrary,
    closeAssetLibrary: assetLibrary.closeAssetLibrary,
    userModelsForSettings: userModels.userModelsForSettings,
    userVideoModels: userModels.userVideoModels || [],
    userModelsLoaded: userModels.userModelsLoaded,
  }

  const executionState = {
    isSubmittingTTS: execution.isSubmittingTTS,
    isAssetAnalysisRunning: execution.isAssetAnalysisRunning,
    isConfirmingAssets: execution.isConfirmingAssets,
    isTransitioning: execution.isTransitioning,
    isStartingPlan: false,
    transitionProgress: execution.transitionProgress,
    handleGenerateTTS: execution.handleGenerateTTS,
    handleAnalyzeAssets: execution.handleAnalyzeAssets,
    requestAssistantPlan: execution.requestAssistantPlan,
    showCreatingToast: execution.showCreatingToast,
  }

  const videoState = {
    handleGenerateVideo: videoActions.handleGenerateVideo,
    handleGenerateAllVideos: videoActions.handleGenerateAllVideos,
    handleUpdateVideoPrompt: videoActions.handleUpdateVideoPrompt,
    handleUpdatePanelVideoModel: videoActions.handleUpdatePanelVideoModel,
    handleUpdateClip: videoActions.handleUpdateClip,
  }

  const actionsState = {
    handleUpdateConfig: configActions.handleUpdateConfig,
    handleUpdateEpisode: configActions.handleUpdateEpisode,
  }

  return buildWorkspaceControllerViewModel({
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
  })
}
