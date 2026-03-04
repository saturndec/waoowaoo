'use client'

import { useTranslations } from 'next-intl'
import type { TaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'

type TaskStatusOverlayProps = {
  state: TaskPresentationState | null
  className?: string
}

export default function TaskStatusOverlay({ state, className }: TaskStatusOverlayProps) {
  const t = useTranslations('common')
  if (!state) return null
  if (state.mode !== 'overlay' && state.mode !== 'placeholder') return null
  const label = state.labelKey ? t(state.labelKey) : t('loading')

  return (
    <div
      className={[
        'absolute inset-0 flex flex-col items-center justify-center',
        'bg-[var(--ui-overlay)]',
        className || '',
      ].join(' ').trim()}
    >
      {state.isError ? (
        <AppIcon name="alertSolid" className="h-7 w-7 text-destructive" />
      ) : (
        <AppIcon name="loader" className="h-7 w-7 animate-spin text-white" />
      )}
      <span className="mt-2 text-xs text-white">{label}</span>
    </div>
  )
}
