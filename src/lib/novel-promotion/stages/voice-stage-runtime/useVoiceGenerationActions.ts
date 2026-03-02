'use client'

import { useCallback, useState } from 'react'
import { shouldShowError } from '@/lib/error-utils'
import { getErrorMessage, getErrorStatus } from './utils'
import type { Character, SpeakerVoiceEntry, VoiceLine } from './types'

interface MutationLike<TInput = unknown, TOutput = unknown> {
  mutateAsync: (input: TInput) => Promise<TOutput>
}

interface UseVoiceGenerationActionsParams {
  episodeId: string
  t: (key: string) => string
  voiceLines: VoiceLine[]
  linesWithAudio: number
  speakerCharacterMap: Record<string, Character>
  speakerVoices: Record<string, SpeakerVoiceEntry>
  analyzeVoiceMutation: MutationLike<{ episodeId: string }>
  generateVoiceMutation: MutationLike<{ episodeId: string; lineId?: string; all?: boolean }, {
    success?: boolean
    error?: string
    async?: boolean
    taskId?: string
    taskIds?: string[]
  }>
  downloadVoicesMutation: MutationLike<{ episodeId: string }, Blob>
  loadData: () => Promise<void>
  notifyVoiceLinesChanged: () => void
  setSubmittingVoiceLineIds: React.Dispatch<React.SetStateAction<Set<string>>>
}

export function useVoiceGenerationActions({
  episodeId,
  t,
  voiceLines,
  linesWithAudio,
  speakerCharacterMap,
  speakerVoices,
  analyzeVoiceMutation,
  generateVoiceMutation,
  downloadVoicesMutation,
  loadData,
  notifyVoiceLinesChanged,
  setSubmittingVoiceLineIds,
}: UseVoiceGenerationActionsParams) {
  const [analyzing, setAnalyzing] = useState(false)
  const [isBatchSubmittingAll, setIsBatchSubmittingAll] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true)
    try {
      await analyzeVoiceMutation.mutateAsync({ episodeId })
      await loadData()
      notifyVoiceLinesChanged()
    } catch (error: unknown) {
      if (shouldShowError(error)) {
        alert(`${t('errors.analyzeFailed')}: ${getErrorMessage(error)}`)
      }
    } finally {
      setAnalyzing(false)
    }
  }, [analyzeVoiceMutation, episodeId, loadData, notifyVoiceLinesChanged, t])

  const handleGenerateLine = useCallback(async (lineId: string) => {
    setSubmittingVoiceLineIds((prev) => new Set(prev).add(lineId))
    let handoffToTaskState = false

    try {
      const data = await generateVoiceMutation.mutateAsync({ episodeId, lineId })
      if (!data?.success) {
        throw new Error(data?.error || t('errors.generateFailed'))
      }
      if (data?.async && data?.taskId) {
        handoffToTaskState = true
      }
      notifyVoiceLinesChanged()
    } catch (error: unknown) {
      if (getErrorStatus(error) === 402) {
        alert(`${t('alerts.insufficientBalance')}\n\n${getErrorMessage(error) || t('alerts.insufficientBalanceMsg')}`)
        return
      }
      if (shouldShowError(error)) {
        alert(`${t('errors.generateFailed')}: ${getErrorMessage(error)}`)
      }
    } finally {
      if (handoffToTaskState) return
      setSubmittingVoiceLineIds((prev) => {
        if (!prev.has(lineId)) return prev
        const next = new Set(prev)
        next.delete(lineId)
        return next
      })
    }
  }, [episodeId, generateVoiceMutation, notifyVoiceLinesChanged, setSubmittingVoiceLineIds, t])

  const handleGenerateAll = useCallback(async () => {
    const linesToGenerate = voiceLines.filter((line) => {
      if (line.audioUrl) return false
      const character = speakerCharacterMap[line.speaker]
      const speakerVoice = speakerVoices[line.speaker]
      return (
        !!character?.voiceId
        || !!character?.customVoiceUrl
        || !!speakerVoice?.voiceId
        || !!speakerVoice?.audioUrl
      )
    })

    if (linesToGenerate.length === 0) {
      alert(t('alerts.noLinesToGenerate'))
      return
    }

    setIsBatchSubmittingAll(true)
    const lineIds = linesToGenerate.map((line) => line.id)
    setSubmittingVoiceLineIds((prev) => new Set([...prev, ...lineIds]))
    let handoffToTaskState = false

    try {
      const data = await generateVoiceMutation.mutateAsync({ episodeId, all: true })
      if (!Array.isArray(data.taskIds) || data.taskIds.length === 0) {
        setSubmittingVoiceLineIds((prev) => {
          const next = new Set(prev)
          for (const lineId of lineIds) next.delete(lineId)
          return next
        })
        alert(t('alerts.noLinesToGenerate'))
        return
      }

      handoffToTaskState = true
      notifyVoiceLinesChanged()
    } catch (error: unknown) {
      if (getErrorStatus(error) === 402) {
        alert(`${t('alerts.insufficientBalance')}\n\n${getErrorMessage(error) || t('alerts.insufficientBalanceMsg')}`)
        return
      }
      if (shouldShowError(error)) {
        alert(`${t('errors.batchFailed')}: ${getErrorMessage(error)}`)
      }
    } finally {
      setIsBatchSubmittingAll(false)
      if (handoffToTaskState) return
      setSubmittingVoiceLineIds((prev) => {
        const next = new Set(prev)
        for (const lineId of lineIds) next.delete(lineId)
        return next
      })
    }
  }, [
    episodeId,
    generateVoiceMutation,
    notifyVoiceLinesChanged,
    setSubmittingVoiceLineIds,
    speakerCharacterMap,
    speakerVoices,
    t,
    voiceLines,
  ])

  const handleDownloadAll = useCallback(async () => {
    if (linesWithAudio === 0) return

    setIsDownloading(true)
    try {
      const blob = await downloadVoicesMutation.mutateAsync({ episodeId })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `配音_${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(anchor)
      anchor.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(anchor)
    } catch (error: unknown) {
      if (shouldShowError(error)) {
        alert(`${t('errors.downloadFailed')}: ${getErrorMessage(error)}`)
      }
    } finally {
      setIsDownloading(false)
    }
  }, [downloadVoicesMutation, episodeId, linesWithAudio, t])

  return {
    analyzing,
    isBatchSubmittingAll,
    isDownloading,
    handleAnalyze,
    handleGenerateLine,
    handleGenerateAll,
    handleDownloadAll,
  }
}
