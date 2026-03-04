'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'

interface StoryboardHeaderProps {
  totalSegments: number
  totalPanels: number
  isDownloadingImages: boolean
  runningCount: number
  pendingPanelCount: number
  isBatchSubmitting: boolean
  onDownloadAllImages: () => void
  onGenerateAllPanels: () => void
  onBack: () => void
}

export default function StoryboardHeader({
  totalSegments,
  totalPanels,
  isDownloadingImages,
  runningCount,
  pendingPanelCount,
  isBatchSubmitting,
  onDownloadAllImages,
  onGenerateAllPanels,
  onBack
}: StoryboardHeaderProps) {
  const t = useTranslations('storyboard')
  const storyboardTaskRunningState = runningCount > 0
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'generate',
      resource: 'image',
      hasOutput: true,
    })
    : null

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">{t('header.storyboardPanel')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('header.segmentsCount', { count: totalSegments })}
            {t('header.panelsCount', { count: totalPanels })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {runningCount > 0 ? (
            <Badge variant="outline" className="gap-1 border-sky-200 bg-sky-100 text-sky-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
              <span className="inline-flex items-center gap-1.5">
                <TaskStatusInline state={storyboardTaskRunningState} />
                <span>({runningCount})</span>
              </span>
            </Badge>
          ) : null}
          <Badge variant="secondary">{t('header.concurrencyLimit', { count: 10 })}</Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {pendingPanelCount > 0 ? (
          <Button
            variant="default"
            loading={isBatchSubmitting}
            onClick={onGenerateAllPanels}
            disabled={runningCount > 0}
          >
            {t('header.generateAllPanels')} ({pendingPanelCount})
          </Button>
        ) : null}

        <Button
          variant="secondary"
          loading={isDownloadingImages}
          onClick={onDownloadAllImages}
          disabled={totalPanels === 0}
        >
          {isDownloadingImages ? t('header.downloading') : t('header.downloadAll')}
        </Button>

        <Button variant="ghost" onClick={onBack}>{t('header.back')}</Button>
      </div>
    </Card>
  )
}
