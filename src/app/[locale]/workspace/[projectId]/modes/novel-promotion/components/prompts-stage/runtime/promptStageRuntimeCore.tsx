'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import { ART_STYLES } from '@/lib/constants'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { useAiModifyProjectShotPrompt } from '@/lib/query/hooks'
import type { NovelPromotionShot } from '@/types/project'
import type { PromptsStageShellProps } from './promptStageRuntime.types'
import { usePromptEditorRuntime } from './hooks/usePromptEditorRuntime'
import { usePromptAppendFlow } from './hooks/usePromptAppendFlow'

export type {
  PromptsStageShellProps,
  LocationAssetWithImages,
} from './promptStageRuntime.types'
export {
  getErrorMessage,
  parseImagePrompt,
} from './promptStageRuntime.utils'

export function usePromptStageActions({
  projectId,
  shots,
  viewMode,
  onViewModeChange,
  onGenerateImage,
  onGenerateAllImages,
  isBatchSubmitting = false,
  onBack,
  onNext,
  onUpdatePrompt,
  artStyle,
  assetLibraryCharacters,
  assetLibraryLocations,
  onAppendContent,
}: PromptsStageShellProps) {
  const t = useTranslations('storyboard')
  const aiModifyShotPrompt = useAiModifyProjectShotPrompt(projectId)

  const isShotTaskRunning = useCallback((shot: NovelPromotionShot) => {
    return Boolean((shot as NovelPromotionShot & { imageTaskRunning?: boolean }).imageTaskRunning)
  }, [])

  const styleLabel = ART_STYLES.find((style) => style.value === artStyle)?.label || t('prompts.customStyle')
  const runningCount = shots.filter((shot) => isShotTaskRunning(shot)).length
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const editorRuntime = usePromptEditorRuntime({
    onUpdatePrompt,
    onGenerateImage,
    aiModifyShotPrompt,
    t: (key, values) => t(key as never, values as never),
  })

  const appendFlow = usePromptAppendFlow({
    onAppendContent,
    t: (key, values) => t(key as never, values as never),
  })

  const isAnyTaskRunning = runningCount > 0 || isBatchSubmitting

  const getGenerateButtonToneClass = (shot: NovelPromotionShot) => {
    if (shot.imageUrl) return 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
    if (isShotTaskRunning(shot)) return 'border border-border bg-muted/50 hover:bg-muted'
    return 'bg-primary text-primary-foreground hover:bg-primary/90'
  }

  const getShotRunningState = useCallback((shot: NovelPromotionShot) => {
    if (!isShotTaskRunning(shot)) return null
    return resolveTaskPresentationState({
      phase: 'processing',
      intent: shot.imageUrl ? 'regenerate' : 'generate',
      resource: 'image',
      hasOutput: !!shot.imageUrl,
    })
  }, [isShotTaskRunning])

  const batchTaskRunningState = useMemo(() => {
    if (!isAnyTaskRunning) return null
    return resolveTaskPresentationState({
      phase: 'processing',
      intent: 'generate',
      resource: 'image',
      hasOutput: true,
    })
  }, [isAnyTaskRunning])

  return {
    shots,
    viewMode,
    onViewModeChange,
    onGenerateImage,
    onGenerateAllImages,
    isBatchSubmitting,
    onBack,
    onNext,
    onAppendContent,
    assetLibraryCharacters,
    assetLibraryLocations,
    styleLabel,
    runningCount,
    isAnyTaskRunning,
    previewImage,
    setPreviewImage,

    editingPrompt: editorRuntime.editingPrompt,
    editValue: editorRuntime.editValue,
    aiModifyInstruction: editorRuntime.aiModifyInstruction,
    selectedAssets: editorRuntime.selectedAssets,
    showAssetPicker: editorRuntime.showAssetPicker,
    aiModifyingShots: editorRuntime.aiModifyingShots,
    textareaRef: editorRuntime.textareaRef,
    shotExtraAssets: editorRuntime.shotExtraAssets,

    appendContent: appendFlow.appendContent,
    isAppending: appendFlow.isAppending,
    appendTaskRunningState: appendFlow.appendTaskRunningState,

    getGenerateButtonToneClass,
    getShotRunningState,
    batchTaskRunningState,
    isShotTaskRunning,

    handleStartEdit: editorRuntime.handleStartEdit,
    handleSaveEdit: editorRuntime.handleSaveEdit,
    handleCancelEdit: editorRuntime.handleCancelEdit,
    handleModifyInstructionChange: editorRuntime.handleModifyInstructionChange,
    handleSelectAsset: editorRuntime.handleSelectAsset,
    handleAiModify: editorRuntime.handleAiModify,
    handleEditValueChange: editorRuntime.handleEditValueChange,
    handleRemoveSelectedAsset: editorRuntime.handleRemoveSelectedAsset,

    setAppendContent: appendFlow.setAppendContent,
    handleAppendSubmit: appendFlow.handleAppendSubmit,
  }
}

export type PromptStageRuntime = ReturnType<typeof usePromptStageActions>
