'use client'

import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter, useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { useWorkspaceProvider } from '../WorkspaceProvider'
import { useRebuildConfirm } from './useRebuildConfirm'
import { useWorkspaceUserModels } from './useWorkspaceUserModels'
import { useWorkspaceExecution } from './useWorkspaceExecution'
import { useWorkspaceVideoActions } from './useWorkspaceVideoActions'
import { useWorkspaceAssetLibraryShell } from './useWorkspaceAssetLibraryShell'
import { useWorkspaceStageNavigation } from './useWorkspaceStageNavigation'
import { useWorkspaceProjectSnapshot } from './useWorkspaceProjectSnapshot'
import { useWorkspaceModalEscape } from './useWorkspaceModalEscape'
import { useWorkspaceStageRuntime } from './useWorkspaceStageRuntime'
import { useWorkspaceConfigActions } from './useWorkspaceConfigActions'
import { buildWorkspaceControllerViewModel } from './workspace-controller-view-model'
import type { NovelPromotionWorkspaceProps } from '../types'

export function useNovelPromotionWorkspaceController({
  project,
  projectId,
  episodeId,
  episode,
  urlStage,
  onStageChange,
}: NovelPromotionWorkspaceProps) {
  const t = useTranslations('novelPromotion')
  const te = useTranslations('errors')
  const tc = useTranslations('common')

  const searchParams = useSearchParams()
  const router = useRouter()
  const params = useParams<{ locale?: string }>()
  const { onRefresh } = useWorkspaceProvider()

  const locale = params?.locale ?? 'zh'

  const projectSnapshot = useWorkspaceProjectSnapshot({ project, episode, urlStage })
  const { currentStage, episodeStoryboards, ...projectSection } = projectSnapshot

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
      '[NovelPromotionWorkspace] project prop 更新, characters:',
      project?.novelPromotionData?.characters?.length,
    )
  }, [project])

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isWorldContextModalOpen, setIsWorldContextModalOpen] = useState(false)

  const assetLibrary = useWorkspaceAssetLibraryShell({
    currentStage,
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
    onStageChange,
  })

  const rebuildState = useRebuildConfirm({
    episodeId,
    episodeStoryboards: episode?.storyboards,
    getProjectStoryboardStats: configActions.getProjectStoryboardStats,
    t,
  })

  const userModels = useWorkspaceUserModels()

  const execution = useWorkspaceExecution({
    projectId,
    episodeId,
    analysisModel: projectSnapshot.analysisModel,
    novelText: projectSnapshot.novelText,
    locale,
    t,
    onRefresh,
    onUpdateConfig: configActions.handleUpdateConfig,
    onStageChange: configActions.handleStageChange,
    onOpenAssetLibrary: assetLibrary.openAssetLibrary,
  })

  const videoActions = useWorkspaceVideoActions({
    projectId,
    episodeId,
    t,
  })

  const isAnyOperationRunning =
    execution.isSubmittingTTS ||
    execution.isAssetAnalysisRunning ||
    execution.isConfirmingAssets ||
    execution.isTransitioning ||
    execution.storyToScriptStream.isRunning ||
    execution.scriptToStoryboardStream.isRunning

  const capsuleNavItems = useWorkspaceStageNavigation({
    isAnyOperationRunning,
    episode,
    projectCharacterCount: projectSnapshot.projectCharacters.length,
    episodeStoryboards,
    t,
  })

  const stageRuntime = useWorkspaceStageRuntime({
    assetsLoading,
    isSubmittingTTS: execution.isSubmittingTTS,
    isTransitioning: execution.isTransitioning,
    isConfirmingAssets: execution.isConfirmingAssets,
    locale,
    videoRatio: projectSnapshot.videoRatio,
    artStyle: projectSnapshot.artStyle,
    videoModel: projectSnapshot.videoModel,
    capabilityOverrides: projectSnapshot.capabilityOverrides,
    userVideoModels: userModels.userVideoModels || [],
    handleUpdateEpisode: configActions.handleUpdateEpisode,
    handleUpdateConfig: configActions.handleUpdateConfig,
    runWithRebuildConfirm: rebuildState.runWithRebuildConfirm,
    runStoryToScriptFlow: execution.runStoryToScriptFlow,
    runScriptToStoryboardFlow: execution.runScriptToStoryboardFlow,
    handleUpdateClip: videoActions.handleUpdateClip,
    openAssetLibrary: assetLibrary.openAssetLibrary,
    handleStageChange: configActions.handleStageChange,
    handleGenerateVideo: videoActions.handleGenerateVideo,
    handleGenerateAllVideos: videoActions.handleGenerateAllVideos,
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

  const stageNavState = {
    currentStage,
    capsuleNavItems,
    handleStageChange: configActions.handleStageChange,
  }

  const executionState = {
    isSubmittingTTS: execution.isSubmittingTTS,
    isAssetAnalysisRunning: execution.isAssetAnalysisRunning,
    isConfirmingAssets: execution.isConfirmingAssets,
    isTransitioning: execution.isTransitioning,
    transitionProgress: execution.transitionProgress,
    storyToScriptConsoleMinimized: execution.storyToScriptConsoleMinimized,
    setStoryToScriptConsoleMinimized: execution.setStoryToScriptConsoleMinimized,
    scriptToStoryboardConsoleMinimized: execution.scriptToStoryboardConsoleMinimized,
    setScriptToStoryboardConsoleMinimized: execution.setScriptToStoryboardConsoleMinimized,
    storyToScriptStream: execution.storyToScriptStream,
    scriptToStoryboardStream: execution.scriptToStoryboardStream,
    handleGenerateTTS: execution.handleGenerateTTS,
    handleAnalyzeAssets: execution.handleAnalyzeAssets,
    runStoryToScriptFlow: execution.runStoryToScriptFlow,
    runScriptToStoryboardFlow: execution.runScriptToStoryboardFlow,
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
    projectSnapshot: projectSection,
    uiState,
    stageNavState,
    rebuildState,
    executionState,
    videoState,
    stageRuntime,
    actionsState,
  })
}
