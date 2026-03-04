'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import type { TaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'

type CharacterCardActionsProps =
  | {
    mode: 'selection'
    selectedIndex: number | null
    isConfirmingSelection: boolean
    confirmSelectionState: TaskPresentationState | null
    onConfirmSelection?: () => void
    isPrimaryAppearance: boolean
    voiceSettings: ReactNode
  }
  | {
    mode: 'compact'
    isPrimaryAppearance: boolean
    primaryAppearanceSelected: boolean
    currentImageUrl: string | null | undefined
    isAppearanceTaskRunning: boolean
    isAnyTaskRunning: boolean
    hasDescription: boolean
    onGenerate: () => void
    voiceSettings: ReactNode
  }

export default function CharacterCardActions(props: CharacterCardActionsProps) {
  const t = useTranslations('assets')

  if (props.mode === 'selection') {
    return (
      <>
        <div className="mt-3 text-xs text-muted-foreground text-center">
          {t('image.selectTip')}
        </div>

        {props.selectedIndex !== null && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={props.onConfirmSelection}
              disabled={props.isConfirmingSelection}
              className="px-4 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
            >
              {props.isConfirmingSelection ? (
                <TaskStatusInline state={props.confirmSelectionState} className="text-white [&>span]:text-white [&_svg]:text-white" />
              ) : (
                <>
                  <AppIcon name="check" className="w-4 h-4" />
                  {t('image.confirmOption', { number: props.selectedIndex + 1 })}
                </>
              )}
            </button>
          </div>
        )}

        {props.isPrimaryAppearance && props.voiceSettings}
      </>
    )
  }

  return (
    <>
      {props.isPrimaryAppearance && props.voiceSettings}

      {!props.isPrimaryAppearance && !props.primaryAppearanceSelected ? (
        <div className="w-full py-2 text-xs text-center text-muted-foreground bg-muted rounded border border-dashed border-border">
          <div className="flex items-center justify-center gap-1">
            <AppIcon name="lock" className="w-3 h-3" />
            {t('character.selectPrimaryFirst')}
          </div>
        </div>
      ) : (
        !props.currentImageUrl && !props.isAppearanceTaskRunning && !props.isAnyTaskRunning && (
          <button
            type="button"
            onClick={props.onGenerate}
            disabled={!props.hasDescription}
            className={`inline-flex items-center justify-center w-full py-1 text-xs disabled:opacity-50 ${props.isPrimaryAppearance ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-primary/10 text-primary hover:bg-primary/15'}`}
          >
            {props.isPrimaryAppearance ? t('common.generate') : t('character.generateFromPrimary')}
          </button>
        )
      )}
    </>
  )
}
