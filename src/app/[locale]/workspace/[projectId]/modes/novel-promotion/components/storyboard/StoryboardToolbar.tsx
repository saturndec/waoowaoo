'use client'

import { useTranslations } from 'next-intl'
import type { TaskPresentationState } from '@/lib/task/presentation'
import StoryboardHeader from './StoryboardHeader'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { AppIcon } from '@/components/ui/icons'

interface StoryboardToolbarProps {
  totalSegments: number
  totalPanels: number
  isDownloadingImages: boolean
  runningCount: number
  pendingPanelCount: number
  isBatchSubmitting: boolean
  addingStoryboardGroup: boolean
  addingStoryboardGroupState: TaskPresentationState | null
  onDownloadAllImages: () => Promise<void>
  onGenerateAllPanels: () => Promise<void>
  onAddStoryboardGroupAtStart: () => void
  onBack: () => void
}

export default function StoryboardToolbar({
  totalSegments,
  totalPanels,
  isDownloadingImages,
  runningCount,
  pendingPanelCount,
  isBatchSubmitting,
  addingStoryboardGroup,
  addingStoryboardGroupState,
  onDownloadAllImages,
  onGenerateAllPanels,
  onAddStoryboardGroupAtStart,
  onBack,
}: StoryboardToolbarProps) {
  const t = useTranslations('storyboard')
  return (
    <>
      <StoryboardHeader
        totalSegments={totalSegments}
        totalPanels={totalPanels}
        isDownloadingImages={isDownloadingImages}
        runningCount={runningCount}
        pendingPanelCount={pendingPanelCount}
        isBatchSubmitting={isBatchSubmitting}
        onDownloadAllImages={onDownloadAllImages}
        onGenerateAllPanels={onGenerateAllPanels}
        onBack={onBack}
      />

      <div className="flex justify-center">
        <button
          onClick={onAddStoryboardGroupAtStart}
          disabled={addingStoryboardGroup}
          className="group flex items-center gap-2 px-4 py-2 border-2 border-dashed border-border hover:border-emerald-300 hover:bg-emerald-100 rounded-lg text-muted-foreground hover:text-emerald-700 transition-all"
        >
          {addingStoryboardGroup ? (
            <TaskStatusInline state={addingStoryboardGroupState} />
          ) : (
            <>
              <AppIcon name="plusAlt" className="w-5 h-5" />
              <span>{t('group.addAtStart')}</span>
            </>
          )}
        </button>
      </div>
    </>
  )
}
