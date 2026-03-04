'use client'

import { useTranslations } from 'next-intl'
import type { TaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'

type TaskStatusInlineProps = {
  state: TaskPresentationState | null
  className?: string
}

export default function TaskStatusInline({ state, className }: TaskStatusInlineProps) {
  const t = useTranslations('common')
  if (!state) return null
  if (!state.isRunning && !state.isError) return null
  const label = state.labelKey ? t(state.labelKey) : t('loading')

  return (
    <div className={['inline-flex items-center gap-1 text-xs', className || ''].join(' ').trim()}>
      {state.isError ? (
        <span className="text-destructive">{label}</span>
      ) : (
        <>
          <AppIcon name="loader" className="h-3.5 w-3.5 animate-spin text-primary" />
          <span className="text-muted-foreground">{label}</span>
        </>
      )}
    </div>
  )
}
