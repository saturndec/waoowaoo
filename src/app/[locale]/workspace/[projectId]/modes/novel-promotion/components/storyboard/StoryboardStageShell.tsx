'use client'

import { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { TaskPresentationState } from '@/lib/task/presentation'
import TaskStatusInline from '@/components/task/TaskStatusInline'

interface StoryboardStageShellProps {
  children: ReactNode
  isTransitioning: boolean
  isNextDisabled: boolean
  transitioningState: TaskPresentationState | null
  onNext: () => void
}

export default function StoryboardStageShell({
  children,
  isTransitioning,
  isNextDisabled,
  transitioningState,
  onNext,
}: StoryboardStageShellProps) {
  const t = useTranslations('storyboard')

  return (
    <div className="space-y-6 pb-20">
      {children}
      <button
        onClick={onNext}
        disabled={isNextDisabled}
        className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-2xl px-6 py-3 text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isTransitioning ? (
          <TaskStatusInline state={transitioningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
        ) : (
          t('header.generateVideo')
        )}
      </button>
    </div>
  )
}
