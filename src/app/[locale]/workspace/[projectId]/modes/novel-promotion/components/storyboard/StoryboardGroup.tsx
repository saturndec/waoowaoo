'use client'
import { useTranslations } from 'next-intl'

import { useCallback, useMemo } from 'react'
import ScreenplayDisplay from './ScreenplayDisplay'
import { StoryboardPanel } from './hooks/useStoryboardState'
import StoryboardGroupHeader from './StoryboardGroupHeader'
import StoryboardGroupActions from './StoryboardGroupActions'
import StoryboardPanelList from './StoryboardPanelList'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import TaskStatusOverlay from '@/components/task/TaskStatusOverlay'
import { useStoryboardGroupTaskErrors } from './hooks/useStoryboardGroupTaskErrors'
import { useStoryboardInsertVariantRuntime } from './hooks/useStoryboardInsertVariantRuntime'
import StoryboardGroupFailedAlert from './StoryboardGroupFailedAlert'
import StoryboardGroupDialogs from './StoryboardGroupDialogs'
import type { StoryboardGroupProps } from './StoryboardGroup.types'
import { AppIcon } from '@/components/ui/icons'

export default function StoryboardGroup({
  storyboard,
  clip,
  sbIndex,
  totalStoryboards,
  textPanels,
  storyboardStartIndex,
  videoRatio,
  isExpanded,
  isSubmittingStoryboardTask,
  isSelectingCandidate,
  isSubmittingStoryboardTextTask,
  hasAnyImage,
  failedError,
  savingPanels,
  deletingPanelIds,
  saveStateByPanel,
  hasUnsavedByPanel,
  modifyingPanels,
  submittingPanelImageIds,
  onToggleExpand,
  onMoveUp,
  onMoveDown,
  onRegenerateText,
  onAddPanel,
  onDeleteStoryboard,
  onGenerateAllIndividually,
  onPreviewImage,
  onCloseError,
  getPanelEditData,
  onPanelUpdate,
  onPanelDelete,
  onOpenCharacterPicker,
  onOpenLocationPicker,
  onRemoveCharacter,
  onRemoveLocation,
  onRetryPanelSave,
  onRegeneratePanelImage,
  onOpenEditModal,
  onOpenAIDataModal,
  getPanelCandidates,
  onSelectPanelCandidateIndex,
  onConfirmPanelCandidate,
  onCancelPanelCandidate,
  formatClipTitle,
  movingClipId,
  onInsertPanel,
  insertingAfterPanelId,
  projectId,
  episodeId,
  onPanelVariant,
  submittingVariantPanelId,
}: StoryboardGroupProps) {
  const t = useTranslations('storyboard')

  const {
    insertModalOpen,
    insertAfterPanel,
    nextPanelForInsert,
    variantModalPanel,
    handleOpenInsertModal,
    handleCloseInsertModal,
    handleInsert,
    handleOpenVariantModal,
    handleCloseVariantModal,
    handleVariant,
  } = useStoryboardInsertVariantRuntime({
    storyboardId: storyboard.id,
    textPanels,
    onInsertPanel,
    onPanelVariant,
  })

  const {
    panelTaskErrorMap,
    clearPanelTaskError,
  } = useStoryboardGroupTaskErrors({
    projectId,
    episodeId,
  })

  const isPanelTaskRunning = useCallback(
    (panel: StoryboardPanel) => {
      const taskIntent = (panel as StoryboardPanel & { imageTaskIntent?: string }).imageTaskIntent
      if (taskIntent === 'modify') return false

      const isTaskRunning = Boolean((panel as StoryboardPanel & { imageTaskRunning?: boolean }).imageTaskRunning)
      const isSubmitting = submittingPanelImageIds.has(panel.id)
      if (isTaskRunning || isSubmitting) return true

      const taskError = panelTaskErrorMap.get(panel.id)
      if (taskError) return false

      return false
    },
    [panelTaskErrorMap, submittingPanelImageIds],
  )

  const currentRunningCount = textPanels.filter(isPanelTaskRunning).length
  const pendingCount = textPanels.filter((panel) => !panel.imageUrl && !isPanelTaskRunning(panel)).length

  const groupOverlayState = useMemo(() => {
    if (!isSubmittingStoryboardTask && !isSelectingCandidate) return null
    return resolveTaskPresentationState({
      phase: 'processing',
      intent: isSelectingCandidate ? 'process' : hasAnyImage ? 'regenerate' : 'generate',
      resource: 'image',
      hasOutput: hasAnyImage,
    })
  }, [hasAnyImage, isSelectingCandidate, isSubmittingStoryboardTask])

  const handleRegeneratePanelImage = useCallback(
    (panelId: string, count?: number, force?: boolean) => {
      clearPanelTaskError(panelId)
      onRegeneratePanelImage(panelId, count, force)
    },
    [clearPanelTaskError, onRegeneratePanelImage],
  )

  return (
    <div className={`glass-surface-elevated p-6 relative ${failedError ? 'border-2 border-[var(--glass-stroke-danger)] bg-[var(--glass-danger-ring)]' : ''}`}>
      {failedError && (
        <StoryboardGroupFailedAlert
          failedError={failedError}
          title={t('fixes.groupFailedTitle')}
          closeTitle={t('common.cancel')}
          onClose={onCloseError}
        />
      )}

      {(isSubmittingStoryboardTask || isSelectingCandidate) && (
        <TaskStatusOverlay
          state={groupOverlayState}
          className="z-10 rounded-lg bg-[var(--glass-bg-surface-modal)]/90"
        />
      )}

      <div className="mb-4 pb-2 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <StoryboardGroupHeader
          clip={clip}
          sbIndex={sbIndex}
          totalStoryboards={totalStoryboards}
          movingClipId={movingClipId}
          storyboardClipId={storyboard.clipId}
          formatClipTitle={formatClipTitle}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
        <StoryboardGroupActions
          hasAnyImage={hasAnyImage}
          isSubmittingStoryboardTask={isSubmittingStoryboardTask}
          isSubmittingStoryboardTextTask={isSubmittingStoryboardTextTask}
          currentRunningCount={currentRunningCount}
          pendingCount={pendingCount}
          onRegenerateText={onRegenerateText}
          onGenerateAllIndividually={onGenerateAllIndividually}
          onAddPanel={onAddPanel}
          onDeleteStoryboard={onDeleteStoryboard}
        />
      </div>

      {clip && (
        <div className="mb-4">
          <button
            onClick={onToggleExpand}
            className="glass-btn-base glass-btn-soft rounded-xl px-3 py-2 text-sm"
          >
            <AppIcon name="chevronRightMd" className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            <span>{clip.screenplay ? t('panel.stylePrompt') : t('panel.sourceText')}</span>
          </button>
          {isExpanded && (
            <div className="mt-2 glass-surface-soft p-2">
              {clip.screenplay ? (
                <ScreenplayDisplay screenplay={clip.screenplay} originalContent={clip.content} />
              ) : (
                <div className="whitespace-pre-wrap p-3 text-sm text-[var(--glass-text-secondary)]">
                  {clip.content}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <StoryboardPanelList
        storyboardId={storyboard.id}
        textPanels={textPanels}
        storyboardStartIndex={storyboardStartIndex}
        videoRatio={videoRatio}
        isSubmittingStoryboardTextTask={isSubmittingStoryboardTextTask}
        savingPanels={savingPanels}
        deletingPanelIds={deletingPanelIds}
        saveStateByPanel={saveStateByPanel}
        hasUnsavedByPanel={hasUnsavedByPanel}
        modifyingPanels={modifyingPanels}
        panelTaskErrorMap={panelTaskErrorMap}
        isPanelTaskRunning={isPanelTaskRunning}
        getPanelEditData={getPanelEditData}
        getPanelCandidates={getPanelCandidates}
        onPanelUpdate={onPanelUpdate}
        onPanelDelete={onPanelDelete}
        onOpenCharacterPicker={onOpenCharacterPicker}
        onOpenLocationPicker={onOpenLocationPicker}
        onRemoveCharacter={onRemoveCharacter}
        onRemoveLocation={onRemoveLocation}
        onRetryPanelSave={onRetryPanelSave}
        onRegeneratePanelImage={handleRegeneratePanelImage}
        onOpenEditModal={onOpenEditModal}
        onOpenAIDataModal={onOpenAIDataModal}
        onSelectPanelCandidateIndex={onSelectPanelCandidateIndex}
        onConfirmPanelCandidate={onConfirmPanelCandidate}
        onCancelPanelCandidate={onCancelPanelCandidate}
        onClearPanelTaskError={clearPanelTaskError}
        onPreviewImage={onPreviewImage}
        onInsertAfter={handleOpenInsertModal}
        onVariant={handleOpenVariantModal}
        isInsertDisabled={(panelId) =>
          isSubmittingStoryboardTextTask ||
          insertingAfterPanelId === panelId ||
          submittingVariantPanelId === panelId
        }
      />

      <StoryboardGroupDialogs
        insertAfterPanel={insertAfterPanel}
        nextPanelForInsert={nextPanelForInsert}
        insertModalOpen={insertModalOpen}
        insertingAfterPanelId={insertingAfterPanelId}
        onCloseInsertModal={handleCloseInsertModal}
        onInsert={handleInsert}
        variantModalPanel={variantModalPanel}
        projectId={projectId}
        submittingVariantPanelId={submittingVariantPanelId}
        onCloseVariantModal={handleCloseVariantModal}
        onVariant={handleVariant}
      />
    </div>
  )
}
