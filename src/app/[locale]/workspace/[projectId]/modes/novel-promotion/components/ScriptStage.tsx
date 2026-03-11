'use client'

import ScriptView from './ScriptView'
import MangaPanelControls from './MangaPanelControls'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'
import { useWorkspaceProvider } from '../WorkspaceProvider'

export default function ScriptStage() {
  const runtime = useWorkspaceStageRuntime()
  const { projectId, episodeId } = useWorkspaceProvider()
  const { clips, storyboards } = useWorkspaceEpisodeStageData()

  return (
    <div className="space-y-4">
      {runtime.journeyType === 'manga_webtoon' && (
        <MangaPanelControls
          enabled={runtime.quickMangaEnabled}
          preset={runtime.quickMangaPreset}
          layout={runtime.quickMangaLayout}
          colorMode={runtime.quickMangaColorMode}
          styleLockEnabled={runtime.quickMangaStyleLockEnabled}
          styleLockProfile={runtime.quickMangaStyleLockProfile}
          styleLockStrength={runtime.quickMangaStyleLockStrength}
          conflictPolicy={runtime.quickMangaConflictPolicy}
          onEnabledChange={runtime.onQuickMangaEnabledChange}
          onPresetChange={runtime.onQuickMangaPresetChange}
          onLayoutChange={runtime.onQuickMangaLayoutChange}
          onColorModeChange={runtime.onQuickMangaColorModeChange}
          onStyleLockEnabledChange={runtime.onQuickMangaStyleLockEnabledChange}
          onStyleLockProfileChange={runtime.onQuickMangaStyleLockProfileChange}
          onStyleLockStrengthChange={runtime.onQuickMangaStyleLockStrengthChange}
          onConflictPolicyChange={runtime.onQuickMangaConflictPolicyChange}
          compact
        />
      )}

      <ScriptView
        projectId={projectId}
        episodeId={episodeId}
        clips={clips}
        storyboards={storyboards}
        assetsLoading={runtime.assetsLoading}
        onClipUpdate={runtime.onClipUpdate}
        onOpenAssetLibrary={runtime.onOpenAssetLibrary}
        onGenerateStoryboard={runtime.onRunScriptToStoryboard}
        isSubmittingStoryboardBuild={runtime.isConfirmingAssets}
      />
    </div>
  )
}
