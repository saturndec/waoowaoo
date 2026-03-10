'use client'

import { useCallback, useMemo, useState } from 'react'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import {
  useAnalyzeProjectAssets,
  useScriptToStoryboardRunStream,
  useStoryToScriptRunStream,
  useQuickMangaHistory,
} from '@/lib/query/hooks'
import { buildQuickMangaStoryInput, type QuickMangaOptions } from '@/lib/novel-promotion/quick-manga'
import { buildJourneyGenerationStageConfig } from '@/lib/workspace/journey-generation-runtime'
import type { ProductEntryIntent } from '@/lib/workspace/project-mode'
import type { OnboardingSourceType } from '@/lib/workspace/onboarding-context'
import type { QuickMangaGenerationControls } from '@/lib/novel-promotion/quick-manga-contract'
import {
  buildQuickMangaContinuityContext,
  buildQuickMangaGenerationControlsFromHistory,
  buildQuickMangaPayloadFromHistory,
  resolveQuickMangaRegenerateStoryContent,
} from '@/lib/novel-promotion/quick-manga-regenerate'
import type { QuickMangaHistoryItem } from '@/lib/query/hooks/useQuickMangaHistory'

interface UseWorkspaceExecutionParams {
  projectId: string
  episodeId?: string
  analysisModel?: string | null
  novelText: string
  quickManga: QuickMangaOptions & {
    controls: QuickMangaGenerationControls
  }
  journeyType: 'film_video' | 'manga_webtoon'
  entryIntent?: ProductEntryIntent
  sourceType?: OnboardingSourceType
  artStyle?: string | null
  t: (key: string) => string
  onRefresh: (options?: { scope?: string; mode?: string }) => Promise<void>
  onUpdateConfig: (key: string, value: unknown) => Promise<void>
  onStageChange: (stage: string) => void
  onOpenAssetLibrary: (focusCharacterId?: string | null, refreshAssets?: boolean) => void
  onQuickMangaRegenerate?: (history: QuickMangaHistoryItem) => Promise<void>
}

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.name === 'AbortError' || err.message === 'Failed to fetch'
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export function useWorkspaceExecution({
  projectId,
  episodeId,
  analysisModel,
  novelText,
  quickManga,
  journeyType,
  entryIntent,
  sourceType,
  artStyle,
  t,
  onRefresh,
  onUpdateConfig,
  onStageChange,
  onOpenAssetLibrary,
  onQuickMangaRegenerate,
}: UseWorkspaceExecutionParams) {
  const analyzeProjectAssetsMutation = useAnalyzeProjectAssets(projectId)

  const [isSubmittingTTS] = useState(false)
  const [isAssetAnalysisRunning, setIsAssetAnalysisRunning] = useState(false)
  const [isConfirmingAssets, setIsConfirmingAssets] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [transitionProgress, setTransitionProgress] = useState({ message: '', step: '' })
  const [storyToScriptConsoleMinimized, setStoryToScriptConsoleMinimized] = useState(false)
  const [scriptToStoryboardConsoleMinimized, setScriptToStoryboardConsoleMinimized] = useState(false)

  const storyToScriptStream = useStoryToScriptRunStream({ projectId, episodeId })
  const scriptToStoryboardStream = useScriptToStoryboardRunStream({ projectId, episodeId })
  const quickMangaHistoryQuery = useQuickMangaHistory({
    projectId,
    status: 'all',
    limit: 20,
    enabled: quickManga.enabled,
  })

  const handleGenerateTTS = useCallback(async () => {
    _ulogInfo('[NovelPromotionWorkspace] TTS is disabled, skip generate request')
  }, [])

  const handleAnalyzeAssets = useCallback(async () => {
    if (!episodeId) return
    if (isAssetAnalysisRunning) {
      _ulogInfo('[WorkspaceExecution] asset analysis already running, skip duplicate trigger')
      return
    }

    try {
      setIsAssetAnalysisRunning(true)
      await analyzeProjectAssetsMutation.mutateAsync({ episodeId })
      await onRefresh({ scope: 'assets' })
    } catch (err: unknown) {
      if (isAbortError(err)) {
        _ulogInfo(t('execution.requestAborted'))
        return
      }
      alert(`${t('execution.analysisFailed')}: ${getErrorMessage(err)}`)
    } finally {
      setIsAssetAnalysisRunning(false)
    }
  }, [analyzeProjectAssetsMutation, episodeId, isAssetAnalysisRunning, onRefresh, t])

  const runStoryToScriptFlow = useCallback(async () => {
    if (!episodeId) {
      alert(t('execution.selectEpisode'))
      return
    }

    const storyContent = (novelText || '').trim()
    if (!storyContent) {
      alert(`${t('execution.prepareFailed')}: ${t('execution.fillContentFirst')}`)
      return
    }

    const stageConfig = buildJourneyGenerationStageConfig({
      context: {
        journeyType,
        entryIntent,
        sourceType,
      },
      stage: 'story_to_script',
      quickManga,
      quickMangaControls: quickManga.controls,
    })

    const mergedStoryContent = buildQuickMangaStoryInput({
      storyContent,
      options: stageConfig.quickManga,
      artStyle,
    })

    try {
      setIsTransitioning(true)
      setStoryToScriptConsoleMinimized(false)

      await onUpdateConfig('workflowMode', 'agent')
      setTransitionProgress({ message: t('execution.storyToScriptRunning'), step: 'streaming' })
      const runResult = await storyToScriptStream.run({
        episodeId,
        content: mergedStoryContent,
        model: analysisModel || undefined,
        temperature: stageConfig.temperature,
        reasoning: stageConfig.reasoning,
        reasoningEffort: stageConfig.reasoningEffort,
        quickManga: stageConfig.quickManga,
        quickMangaControls: stageConfig.quickMangaControls,
        runtimeLane: stageConfig.meta.runtimeLane,
        stageProfile: stageConfig.meta.stageProfile,
        entryIntent: stageConfig.meta.entryIntent,
        sourceType: stageConfig.meta.sourceType,
      })
      if (runResult.status !== 'completed') {
        throw new Error(runResult.errorMessage || t('execution.storyToScriptFailed'))
      }

      await onRefresh()
      onStageChange('script')
      onOpenAssetLibrary()
    } catch (err: unknown) {
      if (isAbortError(err) || (err instanceof Error && err.message === 'aborted')) {
        _ulogInfo(t('execution.requestAborted'))
        return
      }
      const rawMessage = getErrorMessage(err)
      const friendlyMessage = rawMessage.startsWith('task stream timeout')
        ? t('execution.taskStreamTimeout')
        : rawMessage
      alert(`${t('execution.prepareFailed')}: ${friendlyMessage}`)
    } finally {
      setIsTransitioning(false)
      setTransitionProgress({ message: '', step: '' })
    }
  }, [analysisModel, artStyle, entryIntent, episodeId, journeyType, novelText, onOpenAssetLibrary, onRefresh, onStageChange, onUpdateConfig, quickManga, sourceType, storyToScriptStream, t])

  const runScriptToStoryboardFlow = useCallback(async () => {
    if (!episodeId) {
      alert(t('execution.selectEpisode'))
      return
    }

    try {
      setScriptToStoryboardConsoleMinimized(false)
      setIsConfirmingAssets(true)
      setTransitionProgress({ message: t('execution.scriptToStoryboardRunning'), step: 'streaming' })
      const stageConfig = buildJourneyGenerationStageConfig({
        context: {
          journeyType,
          entryIntent,
          sourceType,
        },
        stage: 'script_to_storyboard',
        quickManga,
        quickMangaControls: quickManga.controls,
      })

      const runResult = await scriptToStoryboardStream.run({
        episodeId,
        model: analysisModel || undefined,
        temperature: stageConfig.temperature,
        reasoning: stageConfig.reasoning,
        reasoningEffort: stageConfig.reasoningEffort,
        quickManga: stageConfig.quickManga,
        quickMangaControls: stageConfig.quickMangaControls,
        runtimeLane: stageConfig.meta.runtimeLane,
        stageProfile: stageConfig.meta.stageProfile,
        entryIntent: stageConfig.meta.entryIntent,
        sourceType: stageConfig.meta.sourceType,
      })
      if (runResult.status !== 'completed') {
        throw new Error(runResult.errorMessage || t('execution.scriptToStoryboardFailed'))
      }

      await onRefresh()
      onStageChange('storyboard')
    } catch (err: unknown) {
      if (isAbortError(err)) {
        _ulogInfo(t('execution.requestAborted'))
        return
      }
      alert(`${t('execution.generationFailed')}: ${getErrorMessage(err).startsWith('task stream timeout') ? t('execution.taskStreamTimeout') : getErrorMessage(err)}`)
    } finally {
      setIsConfirmingAssets(false)
      setTransitionProgress({ message: '', step: '' })
    }
  }, [analysisModel, entryIntent, episodeId, journeyType, onRefresh, onStageChange, quickManga, scriptToStoryboardStream, sourceType, t])

  const runQuickMangaRegenerateFlow = useCallback(async (history: QuickMangaHistoryItem) => {
    if (!episodeId) {
      alert(t('execution.selectEpisode'))
      return
    }

    if (!history?.options?.enabled) {
      alert(t('storyInput.manga.regenerate.invalidSource'))
      return
    }

    const previousRun = quickMangaHistoryQuery.data?.find((item) => item.runId === history.runId)

    const resolvedContent = resolveQuickMangaRegenerateStoryContent({
      previousContent: previousRun?.preview.inputSnippet || history.preview.inputSnippet,
      fallbackContent: novelText,
    })

    if (!resolvedContent) {
      alert(t('storyInput.manga.regenerate.missingContent'))
      return
    }

    const continuityContext = buildQuickMangaContinuityContext({
      source: history,
      fallbackContentUsed: resolvedContent.fallbackUsed,
    })

    const quickMangaPayload = buildQuickMangaPayloadFromHistory(history)
    const quickMangaControls = buildQuickMangaGenerationControlsFromHistory(history)

    const mergedStoryContent = buildQuickMangaStoryInput({
      storyContent: resolvedContent.content,
      options: quickMangaPayload,
      artStyle: quickMangaPayload.style,
    })

    try {
      setIsTransitioning(true)
      setStoryToScriptConsoleMinimized(false)
      setTransitionProgress({ message: t('execution.storyToScriptRunning'), step: 'streaming' })

      const runResult = await storyToScriptStream.run({
        episodeId,
        content: mergedStoryContent,
        model: analysisModel || undefined,
        temperature: 0.7,
        reasoning: true,
        quickManga: quickMangaPayload,
        quickMangaControls,
        continuity: continuityContext,
      })

      if (runResult.status !== 'completed') {
        throw new Error(runResult.errorMessage || t('storyInput.manga.regenerate.failed'))
      }

      await onQuickMangaRegenerate?.(history)
      await onRefresh()
      onStageChange('script')
    } catch (err: unknown) {
      const message = isAbortError(err)
        ? t('execution.requestAborted')
        : getErrorMessage(err)
      alert(`${t('storyInput.manga.regenerate.failed')}: ${message}`)
    } finally {
      setIsTransitioning(false)
      setTransitionProgress({ message: '', step: '' })
    }
  }, [
    analysisModel,
    episodeId,
    novelText,
    onQuickMangaRegenerate,
    onRefresh,
    onStageChange,
    quickMangaHistoryQuery.data,
    storyToScriptStream,
    t,
  ])

  const showCreatingToast = useMemo(() => (
    storyToScriptStream.isRunning ||
    storyToScriptStream.isRecoveredRunning ||
    scriptToStoryboardStream.isRunning ||
    scriptToStoryboardStream.isRecoveredRunning ||
    isTransitioning ||
    isConfirmingAssets
  ), [
    isConfirmingAssets,
    isTransitioning,
    scriptToStoryboardStream.isRecoveredRunning,
    scriptToStoryboardStream.isRunning,
    storyToScriptStream.isRecoveredRunning,
    storyToScriptStream.isRunning,
  ])

  return {
    isSubmittingTTS,
    isAssetAnalysisRunning,
    isConfirmingAssets,
    isTransitioning,
    transitionProgress,
    storyToScriptConsoleMinimized,
    setStoryToScriptConsoleMinimized,
    scriptToStoryboardConsoleMinimized,
    setScriptToStoryboardConsoleMinimized,
    storyToScriptStream,
    scriptToStoryboardStream,
    handleGenerateTTS,
    handleAnalyzeAssets,
    runStoryToScriptFlow,
    runScriptToStoryboardFlow,
    runQuickMangaRegenerateFlow,
    showCreatingToast,
  }
}
