'use client'

import { useTranslations } from 'next-intl'
import { NovelPromotionClip, NovelPromotionPanel, NovelPromotionStoryboard } from '@/types/project'
import StoryboardGroup from './StoryboardGroup'
import { StoryboardPanel } from './hooks/useStoryboardState'
import { PanelEditData } from '../PanelEditForm'
import { VariantData, VariantOptions } from './hooks/usePanelVariant'
import type { PanelSaveState } from './hooks/usePanelCrudActions'
import { AppIcon } from '@/components/ui/icons'

interface StoryboardCanvasProps {
  sortedStoryboards: NovelPromotionStoryboard[]
  videoRatio: string
  expandedClips: Set<string>
  submittingStoryboardIds: Set<string>
  selectingCandidateIds: Set<string>
  submittingStoryboardTextIds: Set<string>
  savingPanels: Set<string>
  deletingPanelIds: Set<string>
  saveStateByPanel: Record<string, PanelSaveState>
  hasUnsavedByPanel: Set<string>
  modifyingPanels: Set<string>
  submittingPanelImageIds: Set<string>
  movingClipId: string | null
  insertingAfterPanelId: string | null
  submittingVariantPanelId: string | null
  projectId: string
  episodeId: string
  storyboardStartIndex: Record<string, number>
  getClipInfo: (clipId: string) => NovelPromotionClip | undefined
  getTextPanels: (storyboard: NovelPromotionStoryboard) => StoryboardPanel[]
  getPanelEditData: (panel: StoryboardPanel) => PanelEditData
  formatClipTitle: (clip: NovelPromotionClip | undefined) => string
  onToggleExpandedClip: (storyboardId: string) => void
  onMoveStoryboardGroup: (clipId: string, direction: 'up' | 'down') => Promise<void>
  onRegenerateStoryboardText: (storyboardId: string) => Promise<void>
  onAddPanel: (storyboardId: string) => Promise<void>
  onDeleteStoryboard: (storyboardId: string, panelCount: number) => Promise<void>
  onGenerateAllIndividually: (storyboardId: string) => Promise<void>
  onPreviewImage: (url: string) => void
  onCloseStoryboardError: (storyboardId: string) => void
  onPanelUpdate: (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => void
  onPanelDelete: (
    panelId: string,
    storyboardId: string,
    setLocalStoryboards: React.Dispatch<React.SetStateAction<NovelPromotionStoryboard[]>>,
  ) => Promise<void>
  onOpenCharacterPicker: (panelId: string) => void
  onOpenLocationPicker: (panelId: string) => void
  onRemoveCharacter: (panel: StoryboardPanel, index: number, storyboardId: string) => void
  onRemoveLocation: (panel: StoryboardPanel, storyboardId: string) => void
  onRetryPanelSave: (panelId: string) => void
  onRegeneratePanelImage: (panelId: string, count?: number, force?: boolean) => void
  onOpenEditModal: (storyboardId: string, panelIndex: number) => void
  onOpenAIDataModal: (storyboardId: string, panelIndex: number) => void
  getPanelCandidates: (panel: NovelPromotionPanel) => { candidates: string[]; selectedIndex: number } | null
  onSelectPanelCandidateIndex: (panelId: string, index: number) => void
  onConfirmPanelCandidate: (panelId: string, imageUrl: string) => Promise<void>
  onCancelPanelCandidate: (panelId: string) => void
  onInsertPanel: (storyboardId: string, insertAfterPanelId: string, userInput: string) => Promise<void>
  onPanelVariant: (
    sourcePanelId: string,
    storyboardId: string,
    insertAfterPanelId: string,
    variant: VariantData,
    options: VariantOptions,
  ) => Promise<void>
  addStoryboardGroup: (insertIndex: number) => Promise<void>
  addingStoryboardGroup: boolean
  setLocalStoryboards: React.Dispatch<React.SetStateAction<NovelPromotionStoryboard[]>>
}

export default function StoryboardCanvas({
  sortedStoryboards,
  videoRatio,
  expandedClips,
  submittingStoryboardIds,
  selectingCandidateIds,
  submittingStoryboardTextIds,
  savingPanels,
  deletingPanelIds,
  saveStateByPanel,
  hasUnsavedByPanel,
  modifyingPanels,
  submittingPanelImageIds,
  movingClipId,
  insertingAfterPanelId,
  submittingVariantPanelId,
  projectId,
  episodeId,
  storyboardStartIndex,
  getClipInfo,
  getTextPanels,
  getPanelEditData,
  formatClipTitle,
  onToggleExpandedClip,
  onMoveStoryboardGroup,
  onRegenerateStoryboardText,
  onAddPanel,
  onDeleteStoryboard,
  onGenerateAllIndividually,
  onPreviewImage,
  onCloseStoryboardError,
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
  onInsertPanel,
  onPanelVariant,
  addStoryboardGroup,
  addingStoryboardGroup,
  setLocalStoryboards,
}: StoryboardCanvasProps) {
  const t = useTranslations('storyboard')
  if (sortedStoryboards.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>{t('canvas.emptyTitle')}</p>
        <p className="text-sm mt-2">{t('canvas.emptyDescription')}</p>
      </div>
    )
  }

  return (
    <>
      {sortedStoryboards.map((storyboard, sbIndex) => {
        const clip = getClipInfo(storyboard.clipId)
        const textPanels = getTextPanels(storyboard)
        const isSubmittingStoryboardTask = submittingStoryboardIds.has(storyboard.id)
        const isSelectingCandidate = selectingCandidateIds.has(storyboard.id)
        const isSubmittingStoryboardTextTask = submittingStoryboardTextIds.has(storyboard.id)
        const hasAnyImage = textPanels.some((panel) => panel.imageUrl)
        const failedError = storyboard.lastError ?? null

        return (
          <div key={storyboard.id}>
            <StoryboardGroup
              storyboard={storyboard}
              clip={clip}
              sbIndex={sbIndex}
              totalStoryboards={sortedStoryboards.length}
              textPanels={textPanels}
              storyboardStartIndex={storyboardStartIndex[storyboard.id]}
              videoRatio={videoRatio}
              isExpanded={expandedClips.has(storyboard.id)}
              isSubmittingStoryboardTask={isSubmittingStoryboardTask}
              isSelectingCandidate={isSelectingCandidate}
              isSubmittingStoryboardTextTask={isSubmittingStoryboardTextTask}
              hasAnyImage={hasAnyImage}
              failedError={failedError}
              savingPanels={savingPanels}
              deletingPanelIds={deletingPanelIds}
              saveStateByPanel={saveStateByPanel}
              hasUnsavedByPanel={hasUnsavedByPanel}
              modifyingPanels={modifyingPanels}
              submittingPanelImageIds={submittingPanelImageIds}
              onToggleExpand={() => onToggleExpandedClip(storyboard.id)}
              onMoveUp={() => onMoveStoryboardGroup(storyboard.clipId, 'up')}
              onMoveDown={() => onMoveStoryboardGroup(storyboard.clipId, 'down')}
              onRegenerateText={() => onRegenerateStoryboardText(storyboard.id)}
              onAddPanel={() => onAddPanel(storyboard.id)}
              onDeleteStoryboard={() => onDeleteStoryboard(storyboard.id, textPanels.length)}
              onGenerateAllIndividually={() => onGenerateAllIndividually(storyboard.id)}
              onPreviewImage={onPreviewImage}
              onCloseError={() => onCloseStoryboardError(storyboard.id)}
              getPanelEditData={getPanelEditData}
              onPanelUpdate={onPanelUpdate}
              onPanelDelete={(panelId) => onPanelDelete(panelId, storyboard.id, setLocalStoryboards)}
              onOpenCharacterPicker={onOpenCharacterPicker}
              onOpenLocationPicker={onOpenLocationPicker}
              onRemoveCharacter={(panel, index) => onRemoveCharacter(panel, index, storyboard.id)}
              onRemoveLocation={(panel) => onRemoveLocation(panel, storyboard.id)}
              onRetryPanelSave={onRetryPanelSave}
              onRegeneratePanelImage={onRegeneratePanelImage}
              onOpenEditModal={(panelIndex) => onOpenEditModal(storyboard.id, panelIndex)}
              onOpenAIDataModal={(panelIndex) => onOpenAIDataModal(storyboard.id, panelIndex)}
              getPanelCandidates={getPanelCandidates}
              onSelectPanelCandidateIndex={onSelectPanelCandidateIndex}
              onConfirmPanelCandidate={onConfirmPanelCandidate}
              onCancelPanelCandidate={onCancelPanelCandidate}
              formatClipTitle={formatClipTitle}
              movingClipId={movingClipId}
              onInsertPanel={onInsertPanel}
              insertingAfterPanelId={insertingAfterPanelId}
              projectId={projectId}
              episodeId={episodeId}
              onPanelVariant={onPanelVariant}
              submittingVariantPanelId={submittingVariantPanelId}
            />

            <div className="flex justify-center py-2">
              <button
                onClick={() => addStoryboardGroup(sbIndex + 1)}
                disabled={addingStoryboardGroup}
                className="inline-flex items-center justify-center rounded-md bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-200 group flex items-center gap-1 rounded px-3 py-1.5 text-xs transition-all disabled:opacity-50"
              >
                <AppIcon name="plusAlt" className="h-3 w-3 opacity-70 transition-opacity group-hover:opacity-100" />
                <span className="opacity-80 group-hover:opacity-100 transition-opacity">{t('group.insertHere')}</span>
              </button>
            </div>
          </div>
        )
      })}
    </>
  )
}
