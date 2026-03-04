import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { TaskPresentationState } from '@/lib/task/presentation'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import VoiceToolbar from '../voice/VoiceToolbar'
import EmbeddedVoiceToolbar from '../voice/EmbeddedVoiceToolbar'
import SpeakerVoiceStatus from '../voice/SpeakerVoiceStatus'
import { AppIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface BindablePanelOption {
  id: string
  storyboardId: string
  panelIndex: number
  label: string
}

interface VoiceControlPanelProps {
  children: ReactNode
  embedded: boolean
  onBack?: () => void
  analyzing: boolean
  isBatchSubmittingAll: boolean
  isDownloading: boolean
  runningLineCount: number
  allSpeakersHaveVoice: boolean
  totalLines: number
  linesWithVoice: number
  linesWithAudio: number
  speakers: string[]
  speakerStats: Record<string, number>
  isLineEditorOpen: boolean
  isSavingLineEditor: boolean
  editingLineId: string | null
  editingContent: string
  editingSpeaker: string
  editingMatchedPanelId: string
  speakerOptions: string[]
  bindablePanelOptions: BindablePanelOption[]
  savingLineEditorState: TaskPresentationState | null
  onAnalyze: () => Promise<void>
  onGenerateAll: () => Promise<void>
  onDownloadAll: () => Promise<void>
  onStartAdd: () => void
  onOpenAssetLibraryForSpeaker: (speaker: string) => void
  onOpenInlineBinding?: (speaker: string) => void
  hasSpeakerCharacter?: (speaker: string) => boolean
  onCancelEdit: () => void
  onSaveEdit: () => Promise<void>
  onEditingContentChange: (value: string) => void
  onEditingSpeakerChange: (value: string) => void
  onEditingMatchedPanelIdChange: (value: string) => void
  getSpeakerVoiceUrl: (speaker: string) => string | null
}

export default function VoiceControlPanel({
  children,
  embedded,
  onBack,
  analyzing,
  isBatchSubmittingAll,
  isDownloading,
  runningLineCount,
  allSpeakersHaveVoice,
  totalLines,
  linesWithVoice,
  linesWithAudio,
  speakers,
  speakerStats,
  isLineEditorOpen,
  isSavingLineEditor,
  editingLineId,
  editingContent,
  editingSpeaker,
  editingMatchedPanelId,
  speakerOptions,
  bindablePanelOptions,
  savingLineEditorState,
  onAnalyze,
  onGenerateAll,
  onDownloadAll,
  onStartAdd,
  onOpenAssetLibraryForSpeaker,
  onOpenInlineBinding,
  hasSpeakerCharacter,
  onCancelEdit,
  onSaveEdit,
  onEditingContentChange,
  onEditingSpeakerChange,
  onEditingMatchedPanelIdChange,
  getSpeakerVoiceUrl,
}: VoiceControlPanelProps) {
  const t = useTranslations('voice')

  return (
    <div className="space-y-6 pb-20">
      {!embedded ? (
        <VoiceToolbar
          onBack={onBack}
          onAddLine={onStartAdd}
          onAnalyze={onAnalyze}
          onGenerateAll={onGenerateAll}
          onDownloadAll={onDownloadAll}
          analyzing={analyzing}
          isBatchSubmitting={isBatchSubmittingAll}
          runningCount={runningLineCount}
          isDownloading={isDownloading}
          allSpeakersHaveVoice={allSpeakersHaveVoice}
          totalLines={totalLines}
          linesWithVoice={linesWithVoice}
          linesWithAudio={linesWithAudio}
        />
      ) : (
        <EmbeddedVoiceToolbar
          totalLines={totalLines}
          linesWithAudio={linesWithAudio}
          analyzing={analyzing}
          isDownloading={isDownloading}
          isBatchSubmitting={isBatchSubmittingAll}
          runningCount={runningLineCount}
          allSpeakersHaveVoice={allSpeakersHaveVoice}
          onAddLine={onStartAdd}
          onAnalyze={onAnalyze}
          onDownloadAll={onDownloadAll}
          onGenerateAll={onGenerateAll}
        />
      )}

      {speakers.length > 0 && (
        <SpeakerVoiceStatus
          speakers={speakers}
          speakerStats={speakerStats}
          getSpeakerVoiceUrl={getSpeakerVoiceUrl}
          onOpenAssetLibrary={onOpenAssetLibraryForSpeaker}
          onOpenInlineBinding={onOpenInlineBinding}
          hasSpeakerCharacter={hasSpeakerCharacter}
          embedded={embedded}
        />
      )}

      {children}

      {isLineEditorOpen && (
        <Dialog open={isLineEditorOpen} onOpenChange={(open) => { if (!open) onCancelEdit() }}>
          <DialogContent className="w-full max-w-xl p-5">
            <DialogHeader className="mb-2">
              <DialogTitle className="flex items-center justify-between gap-2 text-lg">
                {editingLineId ? t('lineEditor.editTitle') : t('lineEditor.addTitle')}
                <Button
                  onClick={onCancelEdit}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title={t('common.cancel')}
                >
                  <AppIcon name="close" className="h-5 w-5" />
                </Button>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">{t('lineEditor.contentLabel')}</label>
                <Textarea
                  value={editingContent}
                  onChange={(event) => onEditingContentChange(event.target.value)}
                  placeholder={t('lineEditor.contentPlaceholder')}
                  rows={4}
                  className="resize-y"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">{t('lineEditor.speakerLabel')}</label>
                <select
                  value={editingSpeaker}
                  onChange={(event) => onEditingSpeakerChange(event.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="" disabled>{t('lineEditor.selectSpeaker')}</option>
                  {speakerOptions.map((speaker) => (
                    <option key={speaker} value={speaker}>
                      {speaker}
                    </option>
                  ))}
                </select>
                {speakerOptions.length === 0 && (
                  <p className="mt-1 text-xs text-amber-700">{t('lineEditor.noSpeakerOptions')}</p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">{t('lineEditor.bindPanelLabel')}</label>
                <select
                  value={editingMatchedPanelId}
                  onChange={(event) => onEditingMatchedPanelIdChange(event.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">{t('lineEditor.unboundPanel')}</option>
                  {bindablePanelOptions.map((panel) => (
                    <option key={panel.id} value={panel.id}>
                      {panel.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button
                onClick={onCancelEdit}
                disabled={isSavingLineEditor}
                variant="outline"
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={onSaveEdit}
                disabled={isSavingLineEditor}
                className="gap-2"
              >
                {isSavingLineEditor && (
                  <TaskStatusInline state={savingLineEditorState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                )}
                <span>{editingLineId ? t('lineEditor.saveEdit') : t('lineEditor.saveAdd')}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
