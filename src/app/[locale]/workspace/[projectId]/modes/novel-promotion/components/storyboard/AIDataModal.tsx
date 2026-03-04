'use client'

import { useTranslations } from 'next-intl'
import AIDataModalFormPane from './AIDataModalFormPane'
import AIDataModalPreviewPane from './AIDataModalPreviewPane'
import type { AIDataModalProps } from './AIDataModal.types'
import { useAIDataModalState } from './hooks/useAIDataModalState'
import { AppIcon } from '@/components/ui/icons'

export type {
  AIDataModalProps,
  AIDataSavePayload,
  PhotographyRules,
  ActingCharacter,
  ActingNotes,
} from './AIDataModal.types'

export default function AIDataModal({
  isOpen,
  onClose,
  syncKey,
  panelNumber,
  shotType: initialShotType,
  cameraMove: initialCameraMove,
  description: initialDescription,
  location,
  characters,
  videoPrompt: initialVideoPrompt,
  photographyRules: initialPhotographyRules,
  actingNotes: initialActingNotes,
  videoRatio,
  onSave,
}: AIDataModalProps) {
  const t = useTranslations('storyboard')

  const {
    shotType,
    setShotType,
    cameraMove,
    setCameraMove,
    description,
    setDescription,
    videoPrompt,
    setVideoPrompt,
    photographyRules,
    actingNotes,
    updatePhotographyField,
    updatePhotographyCharacter,
    updateActingCharacter,
    savePayload,
  } = useAIDataModalState({
    isOpen,
    syncKey,
    initialShotType,
    initialCameraMove,
    initialDescription,
    initialVideoPrompt,
    initialPhotographyRules,
    initialActingNotes,
  })

  const handleSave = () => {
    onSave(savePayload)
    onClose()
  }

  const previewJson = {
    aspect_ratio: videoRatio,
    shot: {
      shot_type: shotType,
      camera_move: cameraMove,
      description,
      location,
      characters,
      prompt_text: `A ${videoRatio} shot: ${description}. ${videoPrompt}`,
    },
    ...(photographyRules ? { photography_rules: photographyRules } : {}),
    ...(actingNotes.length > 0 ? { acting_notes: actingNotes } : {}),
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-card rounded-2xl shadow-2xl w-[90vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted">
          <div className="flex items-center gap-3">
            <span className="text-2xl" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t('aiData.title')}</h2>
              <p className="text-xs text-muted-foreground">{t('aiData.subtitle', { number: panelNumber })}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <AppIcon name="close" className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex">
          <AIDataModalFormPane
            t={(key) => t(key as never)}
            shotType={shotType}
            cameraMove={cameraMove}
            description={description}
            location={location}
            characters={characters}
            videoPrompt={videoPrompt}
            photographyRules={photographyRules}
            actingNotes={actingNotes}
            onShotTypeChange={setShotType}
            onCameraMoveChange={setCameraMove}
            onDescriptionChange={setDescription}
            onVideoPromptChange={setVideoPrompt}
            onPhotographyFieldChange={updatePhotographyField}
            onPhotographyCharacterChange={updatePhotographyCharacter}
            onActingCharacterChange={updateActingCharacter}
          />

          <AIDataModalPreviewPane
            t={(key) => t(key as never)}
            previewJson={previewJson}
          />
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            {t('candidate.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors flex items-center gap-2"
          >
            <AppIcon name="check" className="w-4 h-4" />
            {t('aiData.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
