import TaskStatusInline from '@/components/task/TaskStatusInline'
import { useTranslations } from 'next-intl'
import type { PromptStageRuntime } from './hooks/usePromptStageActions'

interface PromptEditorPanelProps {
  runtime: PromptStageRuntime
}

export default function PromptEditorPanel({ runtime }: PromptEditorPanelProps) {
  const tStoryboard = useTranslations('storyboard')
  const tNovelPromotion = useTranslations('novelPromotion')
  const {
    onAppendContent,
    appendContent,
    setAppendContent,
    isAppending,
    appendTaskRunningState,
    handleAppendSubmit,
    isAnyTaskRunning,
    onNext,
  } = runtime

  return (
    <>
      {onAppendContent && (
        <div className="mt-8 p-6 bg-muted rounded-lg border-2 border-dashed border-border">
          <h3 className="text-lg font-semibold text-foreground mb-3">{tStoryboard('prompts.appendTitle')}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {tStoryboard('prompts.appendDescription')}
          </p>
          <textarea
            value={appendContent}
            onChange={(e) => setAppendContent(e.target.value)}
            placeholder={tStoryboard('panelActions.pasteSrtPlaceholder')}
            disabled={isAppending}
            className="w-full h-48 p-4 border border-border rounded-lg resize-none focus:ring-2 focus:ring-primary focus:border-primary/40 disabled:bg-muted disabled:cursor-not-allowed font-mono text-sm"
          />
          <div className="flex justify-end mt-4">
            <button
              onClick={handleAppendSubmit}
              disabled={isAppending || !appendContent.trim()}
              className="inline-flex items-center justify-center px-6 py-3 bg-emerald-700 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isAppending ? (
                <TaskStatusInline state={appendTaskRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
              ) : (
                tStoryboard('prompts.appendSubmit')
              )}
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-end items-center pt-4">
        <button
          onClick={onNext}
          disabled={isAnyTaskRunning}
          className="inline-flex items-center justify-center px-6 py-2 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {tNovelPromotion('buttons.enterVideoGeneration')}
        </button>
      </div>
    </>
  )
}
