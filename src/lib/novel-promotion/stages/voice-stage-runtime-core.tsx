'use client'

import { useCallback, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useProjectAssets } from '@/lib/query/hooks/useProjectAssets'
import { useEpisodeData } from '@/lib/query/hooks/useProjectData'
import {
  useAnalyzeProjectVoice,
  useCreateProjectVoiceLine,
  useDeleteProjectVoiceLine,
  useDownloadProjectVoices,
  useGenerateProjectVoice,
  useUpdateProjectVoiceLine,
  useUpdateSpeakerVoice,
} from '@/lib/query/hooks'
import VoiceLineList from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/voice-stage/VoiceLineList'
import VoiceControlPanel from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/voice-stage/VoiceControlPanel'
import SpeakerVoiceBindingDialog from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/voice/SpeakerVoiceBindingDialog'
import type { Character, VoiceStageShellProps } from './voice-stage-runtime/types'
import { useVoicePlayback } from './voice-stage-runtime/useVoicePlayback'
import { useVoiceLineEditorState } from './voice-stage-runtime/useVoiceLineEditorState'
import { useVoiceTaskState } from './voice-stage-runtime/useVoiceTaskState'
import { useBindablePanelOptions } from './voice-stage-runtime/useBindablePanelOptions'
import { useVoiceSpeakerState } from './voice-stage-runtime/useVoiceSpeakerState'
import { useVoiceStageDataLoader } from './voice-stage-runtime/useVoiceStageDataLoader'
import { useSpeakerAssetNavigation } from './voice-stage-runtime/useSpeakerAssetNavigation'
import { useVoiceGenerationActions } from './voice-stage-runtime/useVoiceGenerationActions'
import { useVoiceLineCrudActions } from './voice-stage-runtime/useVoiceLineCrudActions'
import { useVoiceRuntimeSync } from './voice-stage-runtime/useVoiceRuntimeSync'
import { useVoiceLineBindings } from './voice-stage-runtime/useVoiceLineBindings'

export type { VoiceStageShellProps } from './voice-stage-runtime/types'

export function useVoiceStageRuntime({
  projectId,
  episodeId,
  onBack,
  embedded = false,
  onVoiceLineClick,
  onVoiceLinesChanged,
  onOpenAssetLibraryForCharacter,
}: VoiceStageShellProps) {
  const t = useTranslations('voice')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  if (!pathname) {
    throw new Error('VoiceStage requires a non-null pathname')
  }
  if (!searchParams) {
    throw new Error('VoiceStage requires searchParams')
  }
  const { data: assets } = useProjectAssets(projectId)
  const { data: episodeData } = useEpisodeData(projectId, episodeId)
  const analyzeVoiceMutation = useAnalyzeProjectVoice(projectId)
  const generateVoiceMutation = useGenerateProjectVoice(projectId)
  const createVoiceLineMutation = useCreateProjectVoiceLine(projectId)
  const updateVoiceLineMutation = useUpdateProjectVoiceLine(projectId)
  const deleteVoiceLineMutation = useDeleteProjectVoiceLine(projectId)
  const downloadVoicesMutation = useDownloadProjectVoices(projectId)
  const updateSpeakerVoiceMutation = useUpdateSpeakerVoice(projectId)
  const characters: Character[] = useMemo(() => (assets?.characters ?? []) as Character[], [assets?.characters])
  const {
    voiceLines,
    setVoiceLines,
    speakerVoices,
    projectSpeakers,
    loading,
    loadData,
  } = useVoiceStageDataLoader({
    projectId,
    episodeId,
  })
  const notifyVoiceLinesChanged = useCallback(() => {
    onVoiceLinesChanged?.()
  }, [onVoiceLinesChanged])
  const {
    speakerCharacterMap,
    speakerStats,
    speakers,
    speakerOptions,
    matchCharacterBySpeaker,
    getSpeakerVoiceUrl,
    linesWithVoice,
    linesWithAudio,
    allSpeakersHaveVoice,
  } = useVoiceSpeakerState({
    characters,
    voiceLines,
    projectSpeakers,
    speakerVoices,
  })
  const bindablePanelOptions = useBindablePanelOptions({
    episodeData,
    t: (key, values) => t(key, values as never),
  })
  const {
    isLineEditorOpen,
    isSavingLineEditor,
    editingLineId,
    editingContent,
    editingSpeaker,
    editingMatchedPanelId,
    savingLineEditorState,
    setIsSavingLineEditor,
    setEditingContent,
    setEditingSpeaker,
    setEditingMatchedPanelId,
    handleStartAdd,
    handleStartEdit,
    handleCancelEdit,
  } = useVoiceLineEditorState({
    speakerOptions,
  })
  const { playingLineId, handleTogglePlayAudio } = useVoicePlayback()
  const [submittingVoiceLineIds, setSubmittingVoiceLineIds] = useState<Set<string>>(new Set())
  const { voiceStatusStateByLineId, activeVoiceTaskLineIds, runningLineIds } = useVoiceTaskState({
    projectId,
    voiceLines,
    submittingVoiceLineIds,
  })
  useVoiceRuntimeSync({
    loadData,
    voiceLines,
    activeVoiceTaskLineIds,
    submittingVoiceLineIds,
    setSubmittingVoiceLineIds,
  })
  const { handleOpenAssetLibraryForSpeaker } = useSpeakerAssetNavigation({
    episodeId,
    pathname,
    router,
    searchParams,
    onOpenAssetLibraryForCharacter,
    matchCharacterBySpeaker,
  })
  const {
    analyzing,
    isBatchSubmittingAll,
    isDownloading,
    handleAnalyze,
    handleGenerateLine,
    handleGenerateAll,
    handleDownloadAll,
  } = useVoiceGenerationActions({
    episodeId,
    t: (key) => t(key as never),
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
  })
  const {
    getBoundPanelIdForLine,
    handleStartEditLine,
    handleLocatePanel,
    handleDownloadSingle,
  } = useVoiceLineBindings({
    bindablePanelOptions,
    onVoiceLineClick,
    handleStartEdit,
  })
  const {
    handleSaveEdit,
    handleDeleteLine,
    handleDeleteAudio,
    handleSaveEmotionSettings,
  } = useVoiceLineCrudActions({
    episodeId,
    t: (key, values) => t(key as never, values as never),
    voiceLines,
    editingLineId,
    editingContent,
    editingSpeaker,
    editingMatchedPanelId,
    setVoiceLines,
    setSubmittingVoiceLineIds,
    setIsSavingLineEditor,
    getBoundPanelIdForLine,
    handleCancelEdit,
    notifyVoiceLinesChanged,
    createVoiceLineMutation,
    updateVoiceLineMutation,
    deleteVoiceLineMutation,
  })

  // ─── 内联音色绑定弹窗状态 ───────────────────────────
  const [inlineBindingSpeaker, setInlineBindingSpeaker] = useState<string | null>(null)

  const handleOpenInlineBinding = useCallback((speaker: string) => {
    setInlineBindingSpeaker(speaker)
  }, [])

  const handleCloseInlineBinding = useCallback(() => {
    setInlineBindingSpeaker(null)
  }, [])

  /**
   * 判断发言人是否有匹配的项目角色
   * 有匹配角色 → 跳转资产中心；无匹配 → 打开内联绑定弹窗
   */
  const hasSpeakerCharacter = useCallback((speaker: string): boolean => {
    return !!matchCharacterBySpeaker(speaker)
  }, [matchCharacterBySpeaker])

  /**
   * 内联绑定完成后的回调：将音色信息写入 episode.speakerVoices
   */
  const handleInlineVoiceBound = useCallback(async (
    speaker: string,
    audioUrl: string,
    voiceType: string,
    voiceId?: string,
  ) => {
    try {
      await updateSpeakerVoiceMutation.mutateAsync({
        episodeId,
        speaker,
        audioUrl,
        voiceType,
        voiceId,
      })
      // 重新加载数据以刷新 speakerVoices
      await loadData()
    } catch {
      // 处理后的错误会被 mutation 的 onError 捕获
    }
    setInlineBindingSpeaker(null)
  }, [episodeId, loadData, updateSpeakerVoiceMutation])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <>
      <VoiceControlPanel
        embedded={embedded}
        onBack={onBack}
        analyzing={analyzing}
        isBatchSubmittingAll={isBatchSubmittingAll}
        isDownloading={isDownloading}
        runningLineCount={runningLineIds.size}
        allSpeakersHaveVoice={allSpeakersHaveVoice}
        totalLines={voiceLines.length}
        linesWithVoice={linesWithVoice}
        linesWithAudio={linesWithAudio}
        speakers={speakers}
        speakerStats={speakerStats}
        isLineEditorOpen={isLineEditorOpen}
        isSavingLineEditor={isSavingLineEditor}
        editingLineId={editingLineId}
        editingContent={editingContent}
        editingSpeaker={editingSpeaker}
        editingMatchedPanelId={editingMatchedPanelId}
        speakerOptions={speakerOptions}
        bindablePanelOptions={bindablePanelOptions}
        savingLineEditorState={savingLineEditorState}
        onAnalyze={handleAnalyze}
        onGenerateAll={handleGenerateAll}
        onDownloadAll={handleDownloadAll}
        onStartAdd={handleStartAdd}
        onOpenAssetLibraryForSpeaker={handleOpenAssetLibraryForSpeaker}
        onOpenInlineBinding={handleOpenInlineBinding}
        hasSpeakerCharacter={hasSpeakerCharacter}
        onCancelEdit={handleCancelEdit}
        onSaveEdit={handleSaveEdit}
        onEditingContentChange={setEditingContent}
        onEditingSpeakerChange={setEditingSpeaker}
        onEditingMatchedPanelIdChange={setEditingMatchedPanelId}
        getSpeakerVoiceUrl={getSpeakerVoiceUrl}
      >
        <VoiceLineList
          voiceLines={voiceLines}
          runningLineIds={runningLineIds}
          voiceStatusStateByLineId={voiceStatusStateByLineId}
          playingLineId={playingLineId}
          analyzing={analyzing}
          getSpeakerVoiceUrl={getSpeakerVoiceUrl}
          onTogglePlayAudio={handleTogglePlayAudio}
          onDownloadSingle={handleDownloadSingle}
          onGenerateLine={handleGenerateLine}
          onStartEdit={handleStartEditLine}
          onLocatePanel={handleLocatePanel}
          onDeleteLine={handleDeleteLine}
          onDeleteAudio={handleDeleteAudio}
          onSaveEmotionSettings={handleSaveEmotionSettings}
          onAnalyze={handleAnalyze}
        />
      </VoiceControlPanel>

      {/* 内联音色绑定弹窗 */}
      <SpeakerVoiceBindingDialog
        isOpen={!!inlineBindingSpeaker}
        speaker={inlineBindingSpeaker ?? ''}
        projectId={projectId}
        episodeId={episodeId}
        onClose={handleCloseInlineBinding}
        onBound={handleInlineVoiceBound}
      />
    </>
  )
}
