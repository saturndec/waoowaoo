'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { PanelEditData } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/PanelEditForm'
import { AppIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { UiPatternMode } from './types'

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

interface FormFieldProps {
  label: string
  hint?: string
  actions?: ReactNode
  children: ReactNode
}

function FormField({ label, hint, actions, children }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-foreground">{label}</label>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function RemovableBadge({
  children,
  onRemove,
  tone = 'secondary',
}: {
  children: ReactNode
  onRemove: () => void
  tone?: 'secondary' | 'info' | 'success'
}) {
  const toneClassName =
    tone === 'info'
      ? 'border-sky-200 bg-sky-100 text-sky-700'
      : tone === 'success'
        ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
        : ''
  return (
    <Badge variant="outline" className={`gap-1.5 pr-1 ${toneClassName}`.trim()}>
      <span>{children}</span>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10"
      >
        <AppIcon name="close" className="h-3 w-3" />
      </button>
    </Badge>
  )
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
    <div className="space-y-3" data-mode={uiMode}>
      {saveStatus === 'saving' || isSaving ? (
        <Badge variant="outline" className="w-fit gap-1 border-sky-200 bg-sky-100 text-sky-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
          {t('common.saving')}
        </Badge>
      ) : null}
      {saveStatus === 'error' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="destructive">
            {saveErrorMessage || t('common.saveFailed')}
          </Badge>
          {onRetrySave ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRetrySave}
            >
              {t('common.retrySave')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={t('panel.shotTypeLabel')}>
          <Input
            value={panelData.shotType || ''}
            onChange={(event) => onUpdate({ shotType: event.target.value || null })}
            placeholder={t('panel.shotTypePlaceholder')}
            className="h-8 text-xs"
          />
        </FormField>

        <FormField label={t('panel.cameraMove')}>
          <Input
            value={panelData.cameraMove || ''}
            onChange={(event) => onUpdate({ cameraMove: event.target.value || null })}
            placeholder={t('panel.cameraMovePlaceholder')}
            className="h-8 text-xs"
          />
        </FormField>
      </div>

      {panelData.sourceText ? (
        <FormField label={t('panel.sourceText')}>
          <div className="rounded-md border bg-muted/40 px-3 py-2.5">
            <p className="text-sm leading-6 text-muted-foreground">&ldquo;{panelData.sourceText}&rdquo;</p>
          </div>
        </FormField>
      ) : null}

      <FormField label={t('panel.sceneDescription')}>
        <Textarea
          rows={2}
          value={panelData.description || ''}
          onChange={(event) => onUpdate({ description: event.target.value })}
          placeholder={t('panel.sceneDescriptionPlaceholder')}
          className="min-h-[68px] text-xs"
        />
      </FormField>

      <FormField label={t('panel.videoPrompt')} hint={t('panel.videoPromptHint')}>
        <Textarea
          rows={2}
          value={panelData.videoPrompt || ''}
          onChange={(event) => onUpdate({ videoPrompt: event.target.value })}
          placeholder={t('panel.videoPromptPlaceholder')}
          className="min-h-[68px] text-xs"
        />
      </FormField>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <FormField
          label={t('panel.locationLabel')}
          actions={(
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onOpenLocationPicker}
              aria-label={t('panel.editLocation')}
              title={t('panel.editLocation')}
              className="h-7 w-7"
            >
              <AppIcon name="edit" className="h-4 w-4" />
            </Button>
          )}
        >
          {panelData.location ? (
            <div className="flex flex-wrap gap-1.5">
              <RemovableBadge tone="success" onRemove={onRemoveLocation}>
                {panelData.location}
              </RemovableBadge>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('panel.locationNotEdited')}</p>
          )}
        </FormField>

        <FormField
          label={t('panel.characterLabelWithCount', { count: panelData.characters.length })}
          actions={(
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onOpenCharacterPicker}
              aria-label={t('panel.editCharacter')}
              title={t('panel.editCharacter')}
              className="h-7 w-7"
            >
              <AppIcon name="edit" className="h-4 w-4" />
            </Button>
          )}
        >
          {panelData.characters.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {panelData.characters.map((character, index) => (
                <RemovableBadge
                  key={`${character.name}-${index}`}
                  tone="info"
                  onRemove={() => onRemoveCharacter(index)}
                >
                  {character.name}({character.appearance})
                </RemovableBadge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('panel.charactersNotEdited')}</p>
          )}
        </FormField>
      </div>
    </div>
  )
}
