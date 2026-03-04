'use client'
import { useTranslations } from 'next-intl'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface VideoToolbarProps {
  totalPanels: number
  runningCount: number
  videosWithUrl: number
  failedCount: number
  isAnyTaskRunning: boolean
  isDownloading: boolean
  onGenerateAll: () => void
  onDownloadAll: () => void
  onBack: () => void
  onEnterEditor?: () => void  // 进入剪辑器
  videosReady?: boolean  // 是否有视频可以剪辑
}

export default function VideoToolbar({
  totalPanels,
  runningCount,
  videosWithUrl,
  failedCount,
  isAnyTaskRunning,
  isDownloading,
  onGenerateAll,
  onDownloadAll,
  onBack,
  onEnterEditor,
  videosReady = false
}: VideoToolbarProps) {
  const t = useTranslations('video')
  const videoTaskRunningState = isAnyTaskRunning
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'generate',
      resource: 'video',
      hasOutput: videosWithUrl > 0,
    })
    : null
  const videoDownloadState = isDownloading
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'generate',
      resource: 'video',
      hasOutput: videosWithUrl > 0,
    })
    : null
  return (
    <Card>
      <CardContent className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-foreground">
             {t('toolbar.title')}
          </span>
          <span className="text-sm text-muted-foreground">
            {t('toolbar.totalShots', { count: totalPanels })}
            {runningCount > 0 && (
              <span className="ml-2 animate-pulse text-primary">({t('toolbar.generatingShots', { count: runningCount })})</span>
            )}
            {videosWithUrl > 0 && (
              <span className="ml-2 text-emerald-700">({t('toolbar.completedShots', { count: videosWithUrl })})</span>
            )}
            {failedCount > 0 && (
              <span className="ml-2 text-destructive">({t('toolbar.failedShots', { count: failedCount })})</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={onGenerateAll}
            disabled={isAnyTaskRunning}
            className="h-9 gap-2 px-4 text-sm font-medium"
          >
            {isAnyTaskRunning ? (
              <TaskStatusInline state={videoTaskRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
            ) : (
              <>
                <AppIcon name="plus" className="w-4 h-4" />
                <span>{t('toolbar.generateAll')}</span>
              </>
            )}
          </Button>
          <Button
            onClick={onDownloadAll}
            disabled={videosWithUrl === 0 || isDownloading}
            variant="secondary"
            className="h-9 gap-2 px-4 text-sm font-medium"
            title={videosWithUrl === 0 ? t('toolbar.noVideos') : t('toolbar.downloadCount', { count: videosWithUrl })}
          >
            {isDownloading ? (
              <TaskStatusInline state={videoDownloadState} className="[&>span]:text-foreground [&_svg]:text-foreground" />
            ) : (
              <>
                <AppIcon name="image" className="w-4 h-4" />
                <span>{t('toolbar.downloadAll')}</span>
              </>
            )}
          </Button>
          {onEnterEditor && (
            <Button
              onClick={onEnterEditor}
              disabled={!videosReady}
              variant="outline"
              className="h-9 gap-2 px-4 text-sm font-medium"
              title={videosReady ? t('toolbar.enterEditor') : t('panelCard.needVideo')}
            >
              <AppIcon name="wandOff" className="w-4 h-4" />
              <span>{t('toolbar.enterEdit')}</span>
            </Button>
          )}
          <Button
            onClick={onBack}
            variant="outline"
            className="h-9 gap-2 px-4 text-sm font-medium hover:text-primary"
          >
            <AppIcon name="chevronLeft" className="w-4 h-4" />
            <span>{t('toolbar.back')}</span>
          </Button>
        </div>
      </div>
      </CardContent>
    </Card>
  )
}
