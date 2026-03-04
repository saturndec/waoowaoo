'use client'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'

interface ProgressToastProps {
  show: boolean
  message: string
  step?: string
}

export default function ProgressToast({ show, message, step }: ProgressToastProps) {
  if (!show) return null
  const runningState = resolveTaskPresentationState({
    phase: 'processing',
    intent: 'generate',
    resource: 'text',
    hasOutput: true,
  })

  return (
    <div className="fixed bottom-8 right-8 z-50 animate-slide-up">
      <div className="rounded-xl border border-border bg-card shadow-lg min-w-[320px] p-4">
        <div className="flex items-start space-x-3">
          {/* Loading Spinner */}
          <div className="flex-shrink-0 mt-0.5">
            <TaskStatusInline state={runningState} className="[&>span]:sr-only" />
          </div>
          
          {/* Content */}
          <div className="flex-1">
            <div className="mb-1 font-semibold text-foreground">
              {message}
            </div>
            {step && (
              <div className="text-sm text-muted-foreground">
                {step}
              </div>
            )}
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-1.5 rounded-full bg-primary animate-progress" />
        </div>
      </div>
    </div>
  )
}
