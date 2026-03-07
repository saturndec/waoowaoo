'use client'

import { useMemo } from 'react'
import { NovelPromotionPanel } from '@/types/project'
import { StoryboardPanel } from './hooks/useStoryboardState'
import { PanelEditData } from '../PanelEditForm'
import { ASPECT_RATIO_CONFIGS } from '@/lib/constants'
import PanelCard from './PanelCard'
import type { PanelSaveState } from './hooks/usePanelCrudActions'

interface StoryboardPanelListProps {
  storyboardId: string
  textPanels: StoryboardPanel[]
  storyboardStartIndex: number
  videoRatio: string
  isSubmittingStoryboardTextTask: boolean
  savingPanels: Set<string>
  deletingPanelIds: Set<string>
  saveStateByPanel: Record<string, PanelSaveState>
  hasUnsavedByPanel: Set<string>
  modifyingPanels: Set<string>
  panelTaskErrorMap: Map<string, { taskId: string; message: string }>
  isPanelTaskRunning: (panel: StoryboardPanel) => boolean
  getPanelEditData: (panel: StoryboardPanel) => PanelEditData
  getPanelCandidates: (panel: NovelPromotionPanel) => { candidates: string[]; selectedIndex: number } | null
  onPanelUpdate: (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => void
  onPanelDelete: (panelId: string) => void
  onOpenCharacterPicker: (panelId: string) => void
  onOpenLocationPicker: (panelId: string) => void
  onRemoveCharacter: (panel: StoryboardPanel, index: number) => void
  onRemoveLocation: (panel: StoryboardPanel) => void
  onRetryPanelSave: (panelId: string) => void
  onRegeneratePanelImage: (panelId: string, count?: number, force?: boolean) => void
  onOpenEditModal: (panelIndex: number) => void
  onOpenAIDataModal: (panelIndex: number) => void
  onSelectPanelCandidateIndex: (panelId: string, index: number) => void
  onConfirmPanelCandidate: (panelId: string, imageUrl: string) => Promise<void>
  onCancelPanelCandidate: (panelId: string) => void
  onClearPanelTaskError: (panelId: string) => void
  onPreviewImage: (url: string) => void
  onInsertAfter: (panelIndex: number) => void
  onVariant: (panelIndex: number) => void
  isInsertDisabled: (panelId: string) => boolean
}

export default function StoryboardPanelList({
  storyboardId,
  textPanels,
  storyboardStartIndex,
  videoRatio,
  isSubmittingStoryboardTextTask,
  savingPanels,
  deletingPanelIds,
  saveStateByPanel,
  hasUnsavedByPanel,
  modifyingPanels,
  panelTaskErrorMap,
  isPanelTaskRunning,
  getPanelEditData,
  getPanelCandidates,
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
  onSelectPanelCandidateIndex,
  onConfirmPanelCandidate,
  onCancelPanelCandidate,
  onClearPanelTaskError,
  onPreviewImage,
  onInsertAfter,
  onVariant,
  isInsertDisabled,
}: StoryboardPanelListProps) {
  const displayImages = useMemo(() => textPanels.map((panel) => panel.imageUrl || null), [textPanels])
  const isVertical = ASPECT_RATIO_CONFIGS[videoRatio]?.isVertical ?? false

  return (
    <div className={`grid gap-4 ${isVertical ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'} ${isSubmittingStoryboardTextTask ? 'opacity-50 pointer-events-none' : ''}`}>
      {textPanels.map((panel, index) => {
        const imageUrl = displayImages[index]
        const globalPanelNumber = storyboardStartIndex + index + 1
        const isPanelModifying =
          modifyingPanels.has(panel.id) ||
          Boolean(
            (panel as StoryboardPanel & { imageTaskRunning?: boolean; imageTaskIntent?: string }).imageTaskRunning &&
            (panel as StoryboardPanel & { imageTaskIntent?: string }).imageTaskIntent === 'modify',
          )
        const isPanelDeleting = deletingPanelIds.has(panel.id)
        const panelSaveState = saveStateByPanel[panel.id]
        const isPanelSaving = savingPanels.has(panel.id) || panelSaveState?.status === 'saving'
        const hasUnsavedChanges = hasUnsavedByPanel.has(panel.id) || panelSaveState?.status === 'error'
        const panelSaveError = panelSaveState?.errorMessage || null
        const panelTaskRunning = isPanelTaskRunning(panel)
        const taskError = panelTaskErrorMap.get(panel.id)
        const panelFailedError = taskError?.message || null
        const panelData = getPanelEditData(panel)
        const panelCandidateData = getPanelCandidates(panel as unknown as NovelPromotionPanel)

        return (
          <div
            key={panel.id || index}
            className="relative group/panel"
            style={{ zIndex: textPanels.length - index }}
          >
            <PanelCard
              panel={panel}
              panelData={panelData}
              imageUrl={imageUrl}
              globalPanelNumber={globalPanelNumber}
              storyboardId={storyboardId}
              videoRatio={videoRatio}
              isSaving={isPanelSaving}
              hasUnsavedChanges={hasUnsavedChanges}
              saveErrorMessage={panelSaveError}
              isDeleting={isPanelDeleting}
              isModifying={isPanelModifying}
              isSubmittingPanelImageTask={panelTaskRunning}
              failedError={panelFailedError}
              candidateData={panelCandidateData}
              onUpdate={(updates) => onPanelUpdate(panel.id, panel, updates)}
              onDelete={() => onPanelDelete(panel.id)}
              onOpenCharacterPicker={() => onOpenCharacterPicker(panel.id)}
              onOpenLocationPicker={() => onOpenLocationPicker(panel.id)}
              onRetrySave={() => onRetryPanelSave(panel.id)}
              onRemoveCharacter={(characterIndex) => onRemoveCharacter(panel, characterIndex)}
              onRemoveLocation={() => onRemoveLocation(panel)}
              onRegeneratePanelImage={onRegeneratePanelImage}
              onOpenEditModal={() => onOpenEditModal(index)}
              onOpenAIDataModal={() => onOpenAIDataModal(index)}
              onSelectCandidateIndex={onSelectPanelCandidateIndex}
              onConfirmCandidate={onConfirmPanelCandidate}
              onCancelCandidate={onCancelPanelCandidate}
              onClearError={() => onClearPanelTaskError(panel.id)}
              onPreviewImage={onPreviewImage}
              onInsertAfter={() => onInsertAfter(index)}
              onVariant={() => onVariant(index)}
              isInsertDisabled={isInsertDisabled(panel.id)}
            />
          </div>
        )
      })}
    </div>
  )
}
