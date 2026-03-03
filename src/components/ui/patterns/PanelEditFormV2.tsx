'use client'

import { useTranslations } from 'next-intl'
import type { PanelEditData } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/PanelEditForm'
import {
  GlassChip,
  GlassField,
  GlassInput,
  GlassTextarea
} from '@/components/ui/primitives'
import type { UiPatternMode } from './types'
import { AppIcon } from '@/components/ui/icons'

export interface PanelEditFormV2Props {
  panelData: PanelEditData
  isSaving?: boolean
  saveStatus?: 'idle' | 'saving' | 'error'
  saveErrorMessage?: string | null
  onRetrySave?: () => void
  onUpdate: (updates: Partial<PanelEditData>) => void
  onOpenCharacterPicker: () => void
  onOpenLocationPicker: () => void
  onRemoveCharacter: (index: number) => void
  onRemoveLocation: () => void
  uiMode?: UiPatternMode
}

export default function PanelEditFormV2({
  panelData,
  isSaving = false,
  saveStatus = 'idle',
  saveErrorMessage = null,
  onRetrySave,
  onUpdate,
  onOpenCharacterPicker,
  onOpenLocationPicker,
  onRemoveCharacter,
  onRemoveLocation,
  uiMode = 'flow'
}: PanelEditFormV2Props) {
  const t = useTranslations('storyboard')

  return (
    <div className={`ui-pattern-form ui-pattern-form-${uiMode} space-y-2`}>
      {saveStatus === 'saving' || isSaving ? (
        <GlassChip tone="info" icon={<span className="h-2 w-2 animate-pulse rounded-full bg-current" />}>
          {t('common.saving')}
        </GlassChip>
      ) : null}
      {saveStatus === 'error' ? (
        <div className="flex flex-wrap items-center gap-2">
          <GlassChip tone="danger">
            {saveErrorMessage || t('common.saveFailed')}
          </GlassChip>
          {onRetrySave ? (
            <button
              type="button"
              onClick={onRetrySave}
              className="glass-btn-base glass-btn-soft px-2 py-1 text-xs"
            >
              {t('common.retrySave')}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <GlassField label={t('panel.shotTypeLabel')}>
          <GlassInput
            density="compact"
            value={panelData.shotType || ''}
            onChange={(event) => onUpdate({ shotType: event.target.value || null })}
            placeholder={t('panel.shotTypePlaceholder')}
          />
        </GlassField>

        <GlassField label={t('panel.cameraMove')}>
          <GlassInput
            density="compact"
            value={panelData.cameraMove || ''}
            onChange={(event) => onUpdate({ cameraMove: event.target.value || null })}
            placeholder={t('panel.cameraMovePlaceholder')}
          />
        </GlassField>

        <GlassField label={t('panel.duration')}>
          <GlassInput
            density="compact"
            type="number"
            min={1}
            max={60}
            value={panelData.duration ?? ''}
            onChange={(event) => {
              const val = event.target.value === '' ? null : parseInt(event.target.value, 10)
              onUpdate({ duration: Number.isFinite(val) ? val : null })
            }}
            placeholder={t('panel.durationPlaceholder')}
          />
        </GlassField>
      </div>

      {panelData.sourceText ? (
        <GlassField label={t('panel.sourceText')}>
          <div className="rounded-[var(--glass-radius-md)] bg-[var(--glass-bg-surface-strong)] px-3 py-2.5">
            <p className="text-sm leading-6 text-[var(--glass-text-secondary)]">&ldquo;{panelData.sourceText}&rdquo;</p>
          </div>
        </GlassField>
      ) : null}

      <GlassField label={t('panel.sceneDescription')}>
        <GlassTextarea
          density="compact"
          rows={2}
          value={panelData.description || ''}
          onChange={(event) => onUpdate({ description: event.target.value })}
          placeholder={t('panel.sceneDescriptionPlaceholder')}
        />
      </GlassField>

      <GlassField label={t('panel.videoPrompt')} hint={t('panel.videoPromptHint')}>
        <GlassTextarea
          density="compact"
          rows={2}
          value={panelData.videoPrompt || ''}
          onChange={(event) => onUpdate({ videoPrompt: event.target.value })}
          placeholder={t('panel.videoPromptPlaceholder')}
        />
      </GlassField>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        <GlassField
          label={t('panel.locationLabel')}
          actions={
            <button
              type="button"
              onClick={onOpenLocationPicker}
              className="inline-flex h-8 w-8 items-center justify-center text-[var(--glass-text-secondary)] hover:text-[var(--glass-tone-info-fg)] transition-colors"
              aria-label={t('panel.editLocation')}
              title={t('panel.editLocation')}
            >
              <AppIcon name="edit" className="h-4 w-4" />
            </button>
          }
        >
          {panelData.location ? (
            <div className="flex flex-wrap gap-1.5">
              <GlassChip tone="success" onRemove={onRemoveLocation}>{panelData.location}</GlassChip>
            </div>
          ) : (
            <p className="text-xs text-[var(--glass-text-tertiary)]">{t('panel.locationNotEdited')}</p>
          )}
        </GlassField>

        <GlassField
          label={t('panel.characterLabelWithCount', { count: panelData.characters.length })}
          actions={
            <button
              type="button"
              onClick={onOpenCharacterPicker}
              className="inline-flex h-8 w-8 items-center justify-center text-[var(--glass-text-secondary)] hover:text-[var(--glass-tone-info-fg)] transition-colors"
              aria-label={t('panel.editCharacter')}
              title={t('panel.editCharacter')}
            >
              <AppIcon name="edit" className="h-4 w-4" />
            </button>
          }
        >
          {panelData.characters.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {panelData.characters.map((character, index) => (
                <GlassChip key={`${character.name}-${index}`} tone="info" onRemove={() => onRemoveCharacter(index)}>
                  {character.name}({character.appearance})
                </GlassChip>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--glass-text-tertiary)]">{t('panel.charactersNotEdited')}</p>
          )}
        </GlassField>
      </div>
    </div>
  )
}
