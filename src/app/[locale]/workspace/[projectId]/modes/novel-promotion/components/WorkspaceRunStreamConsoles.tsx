'use client'

import LLMStageStreamCard, { type LLMStageViewItem } from '@/components/llm-console/LLMStageStreamCard'
import { useTranslations } from 'next-intl'

type RunStreamStep = {
  id: string
  title?: string
}

type RunStreamState = {
  status?: 'idle' | 'running' | 'completed' | 'failed'
  isVisible: boolean
  stages: LLMStageViewItem[]
  selectedStep?: RunStreamStep | null
  activeStepId?: string | null
  outputText: string
  activeMessage?: string
  overallProgress: number
  isRunning: boolean
  errorMessage?: string
  stop: () => void
  reset: () => void
  selectStep: (stepId: string) => void
}

interface WorkspaceRunStreamConsolesProps {
  storyToScriptStream: RunStreamState
  scriptToStoryboardStream: RunStreamState
  storyToScriptConsoleMinimized: boolean
  scriptToStoryboardConsoleMinimized: boolean
  onStoryToScriptMinimizedChange: (next: boolean) => void
  onScriptToStoryboardMinimizedChange: (next: boolean) => void
}

export default function WorkspaceRunStreamConsoles({
  storyToScriptStream,
  scriptToStoryboardStream,
  storyToScriptConsoleMinimized,
  scriptToStoryboardConsoleMinimized,
  onStoryToScriptMinimizedChange,
  onScriptToStoryboardMinimizedChange,
}: WorkspaceRunStreamConsolesProps) {
  const t = useTranslations('progress')

  const showStoryToScriptConsole =
    storyToScriptStream.isVisible &&
    storyToScriptStream.stages.length > 0
  const storyToScriptCardTitle =
    storyToScriptStream.selectedStep?.title ||
    t('runConsole.storyToScript')
  const storyToScriptSelectedStageId =
    storyToScriptStream.selectedStep?.id || storyToScriptStream.activeStepId || null
  const storyToScriptSelectedStage = storyToScriptSelectedStageId
    ? storyToScriptStream.stages.find((stage) => stage.id === storyToScriptSelectedStageId) || null
    : null
  const storyToScriptShowCursor =
    storyToScriptStream.isRunning &&
    storyToScriptStream.selectedStep?.id === storyToScriptStream.activeStepId &&
    storyToScriptSelectedStage?.status === 'processing'
  const showScriptToStoryboardConsole =
    scriptToStoryboardStream.isVisible &&
    scriptToStoryboardStream.stages.length > 0
  const scriptToStoryboardCardTitle =
    scriptToStoryboardStream.selectedStep?.title ||
    t('runConsole.scriptToStoryboard')
  const scriptToStoryboardSelectedStageId =
    scriptToStoryboardStream.selectedStep?.id || scriptToStoryboardStream.activeStepId || null
  const scriptToStoryboardSelectedStage = scriptToStoryboardSelectedStageId
    ? scriptToStoryboardStream.stages.find((stage) => stage.id === scriptToStoryboardSelectedStageId) || null
    : null
  const scriptToStoryboardShowCursor =
    scriptToStoryboardStream.isRunning &&
    scriptToStoryboardStream.selectedStep?.id === scriptToStoryboardStream.activeStepId &&
    scriptToStoryboardSelectedStage?.status === 'processing'
  return (
    <>
      {showStoryToScriptConsole && storyToScriptConsoleMinimized && (
        <button
          type="button"
          onClick={() => onStoryToScriptMinimizedChange(false)}
          className="fixed right-3 left-3 sm:left-auto sm:right-6 bottom-4 sm:bottom-6 z-[120] glass-surface-modal rounded-2xl px-4 py-3 text-sm font-medium text-[var(--glass-tone-info-fg)]"
        >
          {t('runConsole.storyToScriptRunning')}
        </button>
      )}

      {showStoryToScriptConsole && !storyToScriptConsoleMinimized && (
        <div className="fixed inset-0 z-[120] glass-overlay backdrop-blur-sm">
          <div className="mx-auto mt-4 h-[calc(100vh-2rem)] w-[min(96vw,1400px)]">
            <LLMStageStreamCard
              title={storyToScriptCardTitle}
              subtitle={t('runConsole.storyToScriptSubtitle')}
              stages={storyToScriptStream.stages}
              activeStageId={storyToScriptStream.activeStepId || storyToScriptStream.stages[storyToScriptStream.stages.length - 1]?.id || ''}
              selectedStageId={storyToScriptStream.selectedStep?.id || undefined}
              onSelectStage={storyToScriptStream.selectStep}
              outputText={storyToScriptStream.outputText}
              activeMessage={storyToScriptStream.activeMessage}
              overallProgress={storyToScriptStream.overallProgress}
              showCursor={storyToScriptShowCursor}
              autoScroll={storyToScriptStream.selectedStep?.id === storyToScriptStream.activeStepId}
              errorMessage={storyToScriptStream.errorMessage}
              topRightAction={(
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={storyToScriptStream.reset}
                    className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                  >
                    {t('runConsole.stop')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onStoryToScriptMinimizedChange(true)}
                    className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                  >
                    {t('runConsole.minimize')}
                  </button>
                </div>
              )}
            />
          </div>
        </div>
      )}

      {showScriptToStoryboardConsole && scriptToStoryboardConsoleMinimized && (
        <button
          type="button"
          onClick={() => onScriptToStoryboardMinimizedChange(false)}
          className="fixed right-3 left-3 sm:left-auto sm:right-6 bottom-16 sm:bottom-20 z-[120] glass-surface-modal rounded-2xl px-4 py-3 text-sm font-medium text-[var(--glass-tone-info-fg)]"
        >
          {t('runConsole.scriptToStoryboardRunning')}
        </button>
      )}

      {showScriptToStoryboardConsole && !scriptToStoryboardConsoleMinimized && (
        <div className="fixed inset-0 z-[120] glass-overlay backdrop-blur-sm">
          <div className="mx-auto mt-4 h-[calc(100vh-2rem)] w-[min(96vw,1400px)]">
            <LLMStageStreamCard
              title={scriptToStoryboardCardTitle}
              subtitle={t('runConsole.scriptToStoryboardSubtitle')}
              stages={scriptToStoryboardStream.stages}
              activeStageId={scriptToStoryboardStream.activeStepId || scriptToStoryboardStream.stages[scriptToStoryboardStream.stages.length - 1]?.id || ''}
              selectedStageId={scriptToStoryboardStream.selectedStep?.id || undefined}
              onSelectStage={scriptToStoryboardStream.selectStep}
              outputText={scriptToStoryboardStream.outputText}
              activeMessage={scriptToStoryboardStream.activeMessage}
              overallProgress={scriptToStoryboardStream.overallProgress}
              showCursor={scriptToStoryboardShowCursor}
              autoScroll={scriptToStoryboardStream.selectedStep?.id === scriptToStoryboardStream.activeStepId}
              errorMessage={scriptToStoryboardStream.errorMessage}
              topRightAction={(
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={scriptToStoryboardStream.reset}
                    className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                  >
                    {t('runConsole.stop')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onScriptToStoryboardMinimizedChange(true)}
                    className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                  >
                    {t('runConsole.minimize')}
                  </button>
                </div>
              )}
            />
          </div>
        </div>
      )}
    </>
  )
}
