'use client'

import { useTranslations } from 'next-intl'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import type { TaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'

type LocationCardActionsProps =
  | {
    mode: 'selection'
    selectedIndex: number | null
    isConfirmingSelection: boolean
    confirmingSelectionState: TaskPresentationState | null
    onConfirmSelection?: () => void
  }
  | {
    mode: 'compact'
    currentImageUrl: string | null | undefined
    isTaskRunning: boolean
    hasDescription: boolean
    onGenerate: () => void
  }

export default function LocationCardActions(props: LocationCardActionsProps) {
  const t = useTranslations('assets')

  if (props.mode === 'selection') {
    return (
      <>
        <div className="mt-3 text-xs text-muted-foreground text-center">
          {t('image.selectTip')}
        </div>

        {props.selectedIndex !== null && props.onConfirmSelection && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={props.onConfirmSelection}
              disabled={props.isConfirmingSelection}
              className="px-4 py-2 text-sm bg-emerald-700 text-white rounded-lg hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {props.isConfirmingSelection ? (
                <TaskStatusInline state={props.confirmingSelectionState} className="text-white [&>span]:text-white [&_svg]:text-white" />
              ) : (
                <>
                  <AppIcon name="check" className="w-4 h-4" />
                  {t('image.confirmOption', { number: props.selectedIndex + 1 })}
                  <span className="text-xs opacity-75">{t('image.deleteOthersHint')}</span>
                </>
              )}
            </button>
          </div>
        )}
      </>
    )
  }

  return (
    !props.currentImageUrl && !props.isTaskRunning && (
      <button
        type="button"
        onClick={props.onGenerate}
        disabled={!props.hasDescription}
        className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 w-full py-1 text-xs disabled:opacity-50"
      >
        {t('common.generate')}
      </button>
    )
  )
}
