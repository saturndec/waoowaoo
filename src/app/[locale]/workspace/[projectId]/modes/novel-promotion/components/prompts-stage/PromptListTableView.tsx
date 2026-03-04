import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { Button } from '@/components/ui/button'
import {
  parseImagePrompt,
  type PromptStageRuntime,
} from './hooks/usePromptStageActions'

interface PromptListTableViewProps {
  runtime: PromptStageRuntime
}

export default function PromptListTableView({ runtime }: PromptListTableViewProps) {
  const t = useTranslations('storyboard')

  const {
    shots,
    onGenerateImage,
    isBatchSubmitting,
    shotExtraAssets,
    getShotRunningState,
    isShotTaskRunning,
    handleStartEdit,
    setPreviewImage,
  } = runtime

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('panel.shot')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('common.preview')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">SRT</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {shots.map((shot) => {
              const { content } = parseImagePrompt(shot.imagePrompt)
              const shotRunningState = getShotRunningState(shot)

              return (
                <tr key={shot.id} className="hover:bg-muted/40">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">#{shot.shotId}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="h-12 w-20 overflow-hidden rounded bg-muted">
                      {shot.imageUrl && (
                        <MediaImageWithLoading
                          src={shot.imageUrl}
                          alt={`${t('panel.shot')}${shot.shotId}`}
                          containerClassName="w-full h-full"
                          className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setPreviewImage(shot.imageUrl)}
                        />
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                    {shot.srtStart}-{shot.srtEnd}
                    <div className="text-xs text-muted-foreground">{shot.srtDuration?.toFixed(1)}s</div>
                    <div className="text-xs mt-1 line-clamp-2">{content}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <div className="flex items-center space-x-2">
                      <Button
                        onClick={() => onGenerateImage(shot.id, shotExtraAssets[shot.id])}
                        disabled={isShotTaskRunning(shot) || isBatchSubmitting}
                        size="sm"
                        variant={shot.imageUrl ? 'secondary' : 'default'}
                        className="h-7 px-2 text-xs"
                      >
                        {isShotTaskRunning(shot)
                          ? <TaskStatusInline state={shotRunningState} className="[&>span]:text-primary-foreground [&_svg]:text-primary-foreground text-primary-foreground" />
                          : <span>{t('common.generate')}</span>}
                      </Button>
                      <Button
                        onClick={() => handleStartEdit(shot.id, 'imagePrompt', shot.imagePrompt || '')}
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={t('prompts.imagePrompt')}
                      >
                        <AppIcon name="edit" className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
