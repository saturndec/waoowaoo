'use client'

import { AppIcon } from '@/components/ui/icons'

interface WorkspaceTopActionsProps {
  onOpenAssetLibrary: () => void
  onOpenSettings: () => void
  onRefresh: () => void
  assetLibraryLabel: string
  settingsLabel: string
  refreshTitle: string
}

export default function WorkspaceTopActions({
  onOpenAssetLibrary,
  onOpenSettings,
  onRefresh,
  assetLibraryLabel,
  settingsLabel,
  refreshTitle,
}: WorkspaceTopActionsProps) {
  return (
    <div className="fixed bottom-4 right-3 z-50 flex flex-col gap-2 sm:bottom-auto sm:top-[calc(env(safe-area-inset-top,0px)+12.75rem)] sm:right-6 sm:flex-row sm:gap-3">
      <button
        onClick={onOpenAssetLibrary}
        className="glass-btn-base glass-btn-secondary flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-3xl text-[var(--glass-text-primary)]"
      >
        <AppIcon name="package" className="h-5 w-5" />
        <span className="font-semibold text-sm hidden lg:inline tracking-[0.01em]">{assetLibraryLabel}</span>
      </button>
      <button
        onClick={onOpenSettings}
        className="glass-btn-base glass-btn-secondary flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-3xl text-[var(--glass-text-primary)]"
      >
        <AppIcon name="settingsHexMinor" className="h-5 w-5" />
        <span className="font-semibold text-sm hidden lg:inline tracking-[0.01em]">{settingsLabel}</span>
      </button>
      <button
        onClick={onRefresh}
        className="glass-btn-base glass-btn-secondary flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-3xl text-[var(--glass-text-primary)]"
        title={refreshTitle}
      >
        <AppIcon name="refresh" className="w-5 h-5" />
      </button>
    </div>
  )
}
