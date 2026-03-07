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
        className="glass-btn-base glass-btn-primary fixed bottom-4 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 z-40 flex items-center justify-center gap-2 rounded-2xl px-6 py-3 text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
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
