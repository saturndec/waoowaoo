'use client'

import { AppIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'

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
    <div className="fixed right-6 top-20 z-50 flex gap-3">
      <Button
        type="button"
        onClick={onOpenAssetLibrary}
        variant="secondary"
        className="h-11 rounded-full px-4 text-foreground shadow-sm"
      >
        <AppIcon name="package" className="h-5 w-5" />
        <span className="hidden text-sm font-semibold tracking-[0.01em] md:inline">{assetLibraryLabel}</span>
      </Button>
      <Button
        type="button"
        onClick={onOpenSettings}
        variant="secondary"
        className="h-11 rounded-full px-4 text-foreground shadow-sm"
      >
        <AppIcon name="settingsHexMinor" className="h-5 w-5" />
        <span className="hidden text-sm font-semibold tracking-[0.01em] md:inline">{settingsLabel}</span>
      </Button>
      <Button
        type="button"
        onClick={onRefresh}
        variant="secondary"
        className="h-11 w-11 rounded-full p-0 text-foreground shadow-sm"
        title={refreshTitle}
      >
        <AppIcon name="refresh" className="h-5 w-5" />
      </Button>
    </div>
  )
}
