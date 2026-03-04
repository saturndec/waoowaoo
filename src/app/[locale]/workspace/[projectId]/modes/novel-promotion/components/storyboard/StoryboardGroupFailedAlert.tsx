'use client'

import { AppIcon } from '@/components/ui/icons'

interface StoryboardGroupFailedAlertProps {
  failedError: string
  title: string
  closeTitle: string
  onClose: () => void
}

export default function StoryboardGroupFailedAlert({
  failedError,
  title,
  closeTitle,
  onClose,
}: StoryboardGroupFailedAlertProps) {
  return (
    <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
      <div className="flex items-start gap-3">
        <AppIcon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="flex-1">
          <h4 className="text-sm font-bold text-destructive">{title}</h4>
          <p className="mt-1 text-sm text-destructive">{failedError}</p>
        </div>
        <button
          onClick={onClose}
          className="inline-flex items-center justify-center rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 rounded p-1"
          title={closeTitle}
        >
          <AppIcon name="close" className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
