'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { UiPatternMode } from './types'

export interface StoryboardHeaderV2Props {
  totalSegments: number
  totalPanels: number
  isDownloadingImages: boolean
  runningCount: number
  pendingPanelCount: number
  isBatchSubmitting: boolean
  onDownloadAllImages: () => void
  onGenerateAllPanels: () => void
  onBack: () => void
  uiMode?: UiPatternMode
}

export default function StoryboardHeaderV2({
  totalSegments,
  totalPanels,
  isDownloadingImages,
  runningCount,
  pendingPanelCount,
  isBatchSubmitting,
  onDownloadAllImages,
  onGenerateAllPanels,
  onBack,
  uiMode = 'flow'
}: StoryboardHeaderV2Props) {
  const t = useTranslations('storyboard')

  return (
    <Card className="space-y-4 p-4" data-mode={uiMode}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">{t('header.storyboardPanel')} (V2)</h3>
          <p className="text-sm text-muted-foreground">
            {t('header.segmentsCount', { count: totalSegments })} {t('header.panelsCount', { count: totalPanels })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {runningCount > 0 ? (
            <Badge variant="outline" className="gap-1 border-sky-200 bg-sky-100 text-sky-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
              {t('header.generatingStatus', { count: runningCount })}
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
            {t('header.generatePendingPanels', { count: pendingPanelCount })}
          </Button>
        ) : null}

        <Button
          variant="secondary"
          loading={isDownloadingImages}
          onClick={onDownloadAllImages}
          disabled={totalPanels === 0}
        >
          {t('header.downloadAll')}
        </Button>

        <Button variant="ghost" onClick={onBack}>{t('header.back')}</Button>
      </div>
    </Card>
  )
}
