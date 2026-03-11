'use client'

import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
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
import { shouldEnableQuickMangaFromSearchParams } from '@/lib/workspace/quick-manga-entry'
import { resolveQuickMangaEnabledForRuntimeLane } from '@/lib/workspace/quick-manga-editor-flow'
import {
  readQuickMangaSessionPreference,
  writeQuickMangaSessionPreference,
} from '@/lib/workspace/quick-manga-session'

const VAT121_VISUAL_DIRECTION_STORAGE_KEY = 'vat121.visual-direction.v1'

type CharacterStrategyId = 'consistency-first' | 'emotion-first' | 'dynamic-action'
type EnvironmentPresetId = 'city-night-neon' | 'forest-mist-dawn' | 'interior-cinematic'

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
  const { onRefresh } = useWorkspaceProvider()

  const projectSnapshot = useWorkspaceProjectSnapshot({ project, episode, urlStage })
  const { currentStage, episodeStoryboards, ...projectSection } = projectSnapshot

  const quickMangaDefaults = useMemo(() => ({
    enabled: false,
    preset: 'auto' as QuickMangaPreset,
    layout: 'auto' as QuickMangaLayout,
    colorMode: 'auto' as QuickMangaColorMode,
    panelTemplateId: null as string | null,
    controls: {
      panelTemplateId: null as string | null,
      styleLock: {
        enabled: false,
        profile: 'auto' as QuickMangaStyleLockProfile,
        strength: 0.65,
      },
      chapterContinuity: {
        mode: 'off' as QuickMangaContinuityMode,
        chapterId: null as string | null,
        conflictPolicy: 'balanced' as QuickMangaContinuityConflictPolicy,
      },
    },
  }), [])
  const [quickManga, setQuickManga] = useState(quickMangaDefaults)
  const initialCharacterStrategy: CharacterStrategyId =
    projectSnapshot.selectedCharacterStrategy === 'emotion-first' || projectSnapshot.selectedCharacterStrategy === 'dynamic-action'
      ? projectSnapshot.selectedCharacterStrategy
      : 'consistency-first'
  const initialEnvironmentId: EnvironmentPresetId =
    projectSnapshot.selectedEnvironmentId === 'forest-mist-dawn' || projectSnapshot.selectedEnvironmentId === 'interior-cinematic'
      ? projectSnapshot.selectedEnvironmentId
      : 'city-night-neon'
  const [selectedCharacterStrategy, setSelectedCharacterStrategy] = useState<CharacterStrategyId>(initialCharacterStrategy)
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentPresetId>(initialEnvironmentId)
  const [demoSampleAssetsPending, setDemoSampleAssetsPending] = useState(false)

  useEffect(() => {
    const enabledFromEntry = shouldEnableQuickMangaFromSearchParams(searchParams)
    const sessionPreference = readQuickMangaSessionPreference()

    setQuickManga((prev) => {
      const nextEnabled = resolveQuickMangaEnabledForRuntimeLane({
        journeyType: projectSnapshot.journeyType,
        currentEnabled: prev.enabled,
        enabledFromEntry,
        sessionPreference,
      })

      if (prev.enabled === nextEnabled) return prev
      return { ...prev, enabled: nextEnabled }
    })
  }, [projectSnapshot.journeyType, searchParams])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(VAT121_VISUAL_DIRECTION_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<{
        selectedCharacterStrategy: CharacterStrategyId
        selectedEnvironmentId: EnvironmentPresetId
      }>
      if (parsed.selectedCharacterStrategy === 'emotion-first' || parsed.selectedCharacterStrategy === 'dynamic-action' || parsed.selectedCharacterStrategy === 'consistency-first') {
        setSelectedCharacterStrategy(parsed.selectedCharacterStrategy)
      }
      if (parsed.selectedEnvironmentId === 'forest-mist-dawn' || parsed.selectedEnvironmentId === 'interior-cinematic' || parsed.selectedEnvironmentId === 'city-night-neon') {
        setSelectedEnvironmentId(parsed.selectedEnvironmentId)
      }
    } catch {
      // ignore malformed local cache
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(VAT121_VISUAL_DIRECTION_STORAGE_KEY, JSON.stringify({
      selectedCharacterStrategy,
      selectedEnvironmentId,
    }))
  }, [selectedCharacterStrategy, selectedEnvironmentId])

  const handleQuickMangaEnabledChange = useCallback(async (enabled: boolean) => {
    writeQuickMangaSessionPreference(enabled)
    setQuickManga((prev) => ({ ...prev, enabled }))
  }, [])

  const handleQuickMangaPresetChange = useCallback(async (value: QuickMangaPreset) => {
    setQuickManga((prev) => ({ ...prev, preset: value }))
  }, [])

  const handleQuickMangaLayoutChange = useCallback(async (value: QuickMangaLayout) => {
    setQuickManga((prev) => ({ ...prev, layout: value }))
  }, [])

  const handleQuickMangaColorModeChange = useCallback(async (value: QuickMangaColorMode) => {
    setQuickManga((prev) => ({ ...prev, colorMode: value }))
  }, [])

  const handleQuickMangaPanelTemplateChange = useCallback(async (templateId: string | null) => {
    setQuickManga((prev) => {
      const resolved = typeof templateId === 'string' && templateId.trim() ? templateId.trim() : null
      return {
        ...prev,
        panelTemplateId: resolved,
        controls: {
          ...prev.controls,
          panelTemplateId: resolved,
        },
      }
    })
  }, [])

  const handleQuickMangaStyleLockEnabledChange = useCallback(async (enabled: boolean) => {
    setQuickManga((prev) => ({
      ...prev,
      controls: {
        ...prev.controls,
        styleLock: {
          ...prev.controls.styleLock,
          enabled,
        },
      },
    }))
  }, [])

  const handleQuickMangaStyleLockProfileChange = useCallback(async (value: QuickMangaStyleLockProfile) => {
    setQuickManga((prev) => ({
      ...prev,
      controls: {
        ...prev.controls,
        styleLock: {
          ...prev.controls.styleLock,
          profile: value,
        },
      },
    }))
  }, [])

  const handleQuickMangaStyleLockStrengthChange = useCallback(async (value: number) => {
    setQuickManga((prev) => {
      const clamped = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : prev.controls.styleLock.strength
      return {
        ...prev,
        controls: {
          ...prev.controls,
          styleLock: {
            ...prev.controls.styleLock,
            strength: Math.round(clamped * 100) / 100,
          },
        },
      }
    })
  }, [])

  const handleQuickMangaChapterContinuityModeChange = useCallback(async (value: QuickMangaContinuityMode) => {
    setQuickManga((prev) => ({
      ...prev,
      controls: {
        ...prev.controls,
        chapterContinuity: {
          ...prev.controls.chapterContinuity,
          mode: value,
        },
      },
    }))
  }, [])

  const handleQuickMangaChapterIdChange = useCallback(async (value: string | null) => {
    setQuickManga((prev) => ({
      ...prev,
      controls: {
        ...prev.controls,
        chapterContinuity: {
          ...prev.controls.chapterContinuity,
          chapterId: typeof value === 'string' && value.trim() ? value.trim() : null,
        },
      },
    }))
  }, [])

  const handleQuickMangaConflictPolicyChange = useCallback(async (value: QuickMangaContinuityConflictPolicy) => {
    setQuickManga((prev) => ({
      ...prev,
      controls: {
        ...prev.controls,
        chapterContinuity: {
          ...prev.controls.chapterContinuity,
          conflictPolicy: value,
        },
      },
    }))
  }, [])

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

  const handleCharacterStrategyChange = useCallback(async (value: CharacterStrategyId) => {
    setSelectedCharacterStrategy(value)
    await configActions.handleUpdateConfig('selectedCharacterStrategy', value)
  }, [configActions])

  const handleEnvironmentChange = useCallback(async (value: EnvironmentPresetId) => {
    setSelectedEnvironmentId(value)
    await configActions.handleUpdateConfig('selectedEnvironmentId', value)
  }, [configActions])

  const handleGenerateDemoSampleAssets = useCallback(async () => {
    if (demoSampleAssetsPending) {
      return { mode: 'fallback' as const, realTriggered: 0, fallbackApplied: 0 }
    }

    setDemoSampleAssetsPending(true)
    try {
      const response = await fetch(`/api/novel-promotion/${projectId}/demo-sample-assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          journeyType: projectSnapshot.journeyType,
          artStyle: projectSnapshot.artStyle,
          selectedCharacterStrategy,
          selectedEnvironmentId,
          locale: 'vi',
          source: 'vat121-novel-input',
        }),
      })

      const payload = await response.json().catch(() => ({})) as {
        success?: boolean
        mode?: 'real' | 'fallback' | 'mixed'
        realTriggered?: number
        fallbackApplied?: number
        error?: { message?: string }
        message?: string
      }

      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error?.message || payload.message || 'Không tạo được demo sample assets')
      }

      const mode = payload.mode || 'fallback'
      const realTriggered = Number(payload.realTriggered || 0)
      const fallbackApplied = Number(payload.fallbackApplied || 0)

      await onRefresh({ mode: 'assets' })

      if (mode === 'real') {
        _ulogInfo(`[VAT-121] sample assets real triggered=${realTriggered}`)
      } else if (mode === 'mixed') {
        _ulogInfo(`[VAT-121] sample assets mixed real=${realTriggered} fallback=${fallbackApplied}`)
      } else {
        _ulogInfo(`[VAT-121] sample assets fallback=${fallbackApplied}`)
      }

      return {
        mode,
        realTriggered,
        fallbackApplied,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không tạo được demo sample assets'
      _ulogInfo(`[VAT-121] sample assets failed: ${message}`)
      return {
        mode: 'fallback' as const,
        realTriggered: 0,
        fallbackApplied: 0,
      }
    } finally {
      setDemoSampleAssetsPending(false)
    }
  }, [demoSampleAssetsPending, onRefresh, projectId, projectSnapshot.artStyle, projectSnapshot.journeyType, selectedCharacterStrategy, selectedEnvironmentId])

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
    quickManga,
    journeyType: projectSnapshot.journeyType,
    entryIntent: projectSnapshot.entryIntent,
    sourceType: projectSnapshot.sourceType,
    artStyle: projectSnapshot.artStyle,
    selectedCharacterStrategy,
    selectedEnvironmentId,
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
    journeyType: projectSnapshot.journeyType,
    t,
  })

  const stageRuntime = useWorkspaceStageRuntime({
    assetsLoading,
    isSubmittingTTS: execution.isSubmittingTTS,
    isTransitioning: execution.isTransitioning,
    isConfirmingAssets: execution.isConfirmingAssets,
    videoRatio: projectSnapshot.videoRatio,
    artStyle: projectSnapshot.artStyle,
    quickMangaEnabled: quickManga.enabled,
    quickMangaPreset: quickManga.preset,
    quickMangaLayout: quickManga.layout,
    quickMangaColorMode: quickManga.colorMode,
    quickMangaPanelTemplateId: quickManga.panelTemplateId,
    quickMangaStyleLockEnabled: quickManga.controls.styleLock.enabled,
    quickMangaStyleLockProfile: quickManga.controls.styleLock.profile,
    quickMangaStyleLockStrength: quickManga.controls.styleLock.strength,
    quickMangaChapterContinuityMode: quickManga.controls.chapterContinuity.mode,
    quickMangaChapterId: quickManga.controls.chapterContinuity.chapterId,
    quickMangaConflictPolicy: quickManga.controls.chapterContinuity.conflictPolicy,
    selectedCharacterStrategy,
    selectedEnvironmentId,
    videoModel: projectSnapshot.videoModel,
    journeyType: projectSnapshot.journeyType,
    projectName: projectSnapshot.projectName,
    capabilityOverrides: projectSnapshot.capabilityOverrides,
    userVideoModels: userModels.userVideoModels || [],
    handleUpdateEpisode: configActions.handleUpdateEpisode,
    handleUpdateConfig: configActions.handleUpdateConfig,
    onQuickMangaEnabledChange: handleQuickMangaEnabledChange,
    onQuickMangaPresetChange: handleQuickMangaPresetChange,
    onQuickMangaLayoutChange: handleQuickMangaLayoutChange,
    onQuickMangaColorModeChange: handleQuickMangaColorModeChange,
    onQuickMangaPanelTemplateChange: handleQuickMangaPanelTemplateChange,
    onQuickMangaStyleLockEnabledChange: handleQuickMangaStyleLockEnabledChange,
    onQuickMangaStyleLockProfileChange: handleQuickMangaStyleLockProfileChange,
    onQuickMangaStyleLockStrengthChange: handleQuickMangaStyleLockStrengthChange,
    onQuickMangaChapterContinuityModeChange: handleQuickMangaChapterContinuityModeChange,
    onQuickMangaChapterIdChange: handleQuickMangaChapterIdChange,
    onQuickMangaConflictPolicyChange: handleQuickMangaConflictPolicyChange,
    onCharacterStrategyChange: handleCharacterStrategyChange,
    onEnvironmentChange: handleEnvironmentChange,
    onGenerateDemoSampleAssets: handleGenerateDemoSampleAssets,
    demoSampleAssetsPending,
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
    projectSnapshot: {
      ...projectSection,
      selectedCharacterStrategy,
      selectedEnvironmentId,
    },
    uiState,
    stageNavState,
    rebuildState,
    executionState,
    videoState,
    stageRuntime,
    actionsState,
  })
}
