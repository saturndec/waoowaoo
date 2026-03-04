import { useTranslations } from 'next-intl'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { AppIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import type { PromptStageRuntime } from './hooks/usePromptStageActions'
import PromptListCardView from './PromptListCardView'
import PromptListTableView from './PromptListTableView'

interface PromptListPanelProps {
  runtime: PromptStageRuntime
}

export default function PromptListPanel({ runtime }: PromptListPanelProps) {
  const t = useTranslations('storyboard')
  const tCommon = useTranslations('common')

  const {
    viewMode,
    onViewModeChange,
    onGenerateAllImages,
    isAnyTaskRunning,
    runningCount,
    batchTaskRunningState,
    onBack,
    shots,
  } = runtime

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {onBack && (
            <Button
              onClick={onBack}
              disabled={isAnyTaskRunning}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              <AppIcon name="chevronLeft" className="w-4 h-4" />
              <span>{tCommon('back')}</span>
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            {t('header.panels')}: {shots.length}
            {runningCount > 0 && (
              <span className="ml-2 font-medium text-foreground">
                ({runningCount} {t('group.generating')})
              </span>
            )}
          </span>
          <Button
            onClick={onGenerateAllImages}
            disabled={isAnyTaskRunning}
            size="sm"
            className="min-w-[7rem]"
          >
            {isAnyTaskRunning ? (
              <TaskStatusInline state={batchTaskRunningState} className="[&>span]:text-primary-foreground [&_svg]:text-primary-foreground text-primary-foreground" />
            ) : (
              t('group.generateAll')
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted p-1">
          <Button
            onClick={() => onViewModeChange('card')}
            variant={viewMode === 'card' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 px-3 text-sm"
          >
            {tCommon('preview')}
          </Button>
          <Button
            onClick={() => onViewModeChange('table')}
            variant={viewMode === 'table' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 px-3 text-sm"
          >
            {t('common.status')}
          </Button>
        </div>
      </div>

      {viewMode === 'card' ? (
        <PromptListCardView runtime={runtime} />
      ) : (
        <PromptListTableView runtime={runtime} />
      )}
    </>
  )
}
