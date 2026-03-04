'use client'

import TaskStatusInline from '@/components/task/TaskStatusInline'
import type { TaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'

type ToastType = 'success' | 'warning' | 'error'

interface ToastState {
  message: string
  type: ToastType
}

interface AssetsStageStatusOverlaysProps {
  toast: ToastState | null
  onCloseToast: () => void
  isGlobalAnalyzing: boolean
  globalAnalyzingState: TaskPresentationState | null
  globalAnalyzingTitle: string
  globalAnalyzingHint: string
  globalAnalyzingTip: string
}

export default function AssetsStageStatusOverlays({
  toast,
  onCloseToast,
  isGlobalAnalyzing,
  globalAnalyzingState,
  globalAnalyzingTitle,
  globalAnalyzingHint,
  globalAnalyzingTip,
}: AssetsStageStatusOverlaysProps) {
  return (
    <>
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg ${
              toast.type === 'success'
                ? 'bg-emerald-700 text-white'
                : toast.type === 'warning'
                  ? 'bg-amber-700 text-white'
                  : 'bg-destructive text-white'
            }`}
          >
            <span className="text-sm font-medium">{toast.message}</span>
            <button onClick={onCloseToast} className="ml-2 hover:opacity-80">
              <AppIcon name="close" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {isGlobalAnalyzing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45">
          <div className="rounded-xl border border-border bg-card shadow-lg p-8 max-w-md mx-4 animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center">
                  <AppIcon name="ideaAlt" className="w-10 h-10 text-white" />
                </div>
              </div>

              <h3 className="text-xl font-bold text-foreground mb-2">
                {globalAnalyzingTitle}
              </h3>
              <p className="text-muted-foreground text-sm mb-4">{globalAnalyzingHint}</p>
              <TaskStatusInline state={globalAnalyzingState} />

              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">{globalAnalyzingTip}</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
