'use client'

import { useCallback, useMemo, useState } from 'react'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import {
  useAnalyzeProjectAssets,
  useScriptToStoryboardRunStream,
  useStoryToScriptRunStream,
} from '@/lib/query/hooks'

interface UseWorkspaceExecutionParams {
  projectId: string
  episodeId?: string
  analysisModel?: string | null
  novelText: string
  locale: string
  t: (key: string) => string
  onRefresh: (options?: { scope?: string; mode?: string }) => Promise<void>
  onUpdateConfig: (key: string, value: unknown) => Promise<void>
  onStageChange: (stage: string) => void
  onOpenAssetLibrary: (focusCharacterId?: string | null, refreshAssets?: boolean) => void
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
  locale,
  t,
  onRefresh,
  onUpdateConfig,
  onStageChange,
  onOpenAssetLibrary,
}: UseWorkspaceExecutionParams) {
  const analyzeProjectAssetsMutation = useAnalyzeProjectAssets(projectId)

  const [isSubmittingTTS] = useState(false)
  const [isAssetAnalysisRunning, setIsAssetAnalysisRunning] = useState(false)
  const [isConfirmingAssets, setIsConfirmingAssets] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [transitionProgress, setTransitionProgress] = useState({ message: '', step: '' })
  const [storyToScriptConsoleMinimized, setStoryToScriptConsoleMinimized] = useState(false)
  const [scriptToStoryboardConsoleMinimized, setScriptToStoryboardConsoleMinimized] = useState(false)

  const storyToScriptStream = useStoryToScriptRunStream({ projectId, episodeId, locale })
  const scriptToStoryboardStream = useScriptToStoryboardRunStream({ projectId, episodeId, locale })

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

    try {
      setIsTransitioning(true)
      setStoryToScriptConsoleMinimized(false)

      await onUpdateConfig('workflowMode', 'agent')
      setTransitionProgress({ message: t('execution.storyToScriptRunning'), step: 'streaming' })
      const runResult = await storyToScriptStream.run({
        episodeId,
        content: storyContent,
        model: analysisModel || undefined,
        temperature: 0.7,
        reasoning: true,
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
  }, [analysisModel, episodeId, novelText, onOpenAssetLibrary, onRefresh, onStageChange, onUpdateConfig, storyToScriptStream, t])

  const runScriptToStoryboardFlow = useCallback(async () => {
    if (!episodeId) {
      alert(t('execution.selectEpisode'))
      return
    }

    try {
      setScriptToStoryboardConsoleMinimized(false)
      setIsConfirmingAssets(true)
      setTransitionProgress({ message: t('execution.scriptToStoryboardRunning'), step: 'streaming' })
      const runResult = await scriptToStoryboardStream.run({
        episodeId,
        model: analysisModel || undefined,
        temperature: 0.7,
        reasoning: true,
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
  }, [analysisModel, episodeId, onRefresh, onStageChange, scriptToStoryboardStream, t])

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
    showCreatingToast,
  }
}
