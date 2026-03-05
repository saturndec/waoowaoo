'use client'

import { AppIcon } from '@/components/ui/icons'
import { useTheme } from '@/components/providers/ThemeProvider'

interface WorkspaceTopActionsProps {
  onOpenAssetLibrary: () => void
  onOpenSettings: () => void
  onRefresh: () => void
  onStartDirector?: () => void
  assetLibraryLabel: string
  settingsLabel: string
  refreshTitle: string
  directorLabel?: string
  directorRunning?: boolean
}

export default function WorkspaceTopActions({
  onOpenAssetLibrary,
  onOpenSettings,
  onRefresh,
  onStartDirector,
  assetLibraryLabel,
  settingsLabel,
  refreshTitle,
  directorLabel,
  directorRunning,
}: WorkspaceTopActionsProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="fixed top-20 right-6 z-50 flex gap-3">
      {onStartDirector && (
        <button
          onClick={onStartDirector}
          className={`glass-btn-base flex items-center gap-2 px-4 py-3 rounded-3xl ${
            directorRunning
              ? 'bg-[var(--glass-accent-from)] text-white shadow-md'
              : 'glass-btn-secondary text-[var(--glass-text-primary)]'
          }`}
        >
          <AppIcon name="sparkles" className="h-5 w-5" />
          {directorLabel && (
            <span className="font-semibold text-sm hidden md:inline tracking-[0.01em]">{directorLabel}</span>
          )}
          {directorRunning && (
            <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
          )}
        </button>
      )}
      <button
        onClick={onOpenAssetLibrary}
        className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-4 py-3 rounded-3xl text-[var(--glass-text-primary)]"
      >
        <AppIcon name="package" className="h-5 w-5" />
        <span className="font-semibold text-sm hidden md:inline tracking-[0.01em]">{assetLibraryLabel}</span>
      </button>
      <button
        onClick={onOpenSettings}
        className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-4 py-3 rounded-3xl text-[var(--glass-text-primary)]"
      >
        <AppIcon name="settingsHexMinor" className="h-5 w-5" />
        <span className="font-semibold text-sm hidden md:inline tracking-[0.01em]">{settingsLabel}</span>
      </button>
      <button
        onClick={toggleTheme}
        className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-4 py-3 rounded-3xl text-[var(--glass-text-primary)]"
        title={theme === 'light' ? 'Dark mode' : 'Light mode'}
      >
        <AppIcon name={theme === 'light' ? 'moon' : 'sun'} className="w-5 h-5" />
      </button>
      <button
        onClick={onRefresh}
        className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-4 py-3 rounded-3xl text-[var(--glass-text-primary)]"
        title={refreshTitle}
      >
        <AppIcon name="refresh" className="w-5 h-5" />
      </button>
    </div>
  )
}
