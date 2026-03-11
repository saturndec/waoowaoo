'use client'

import NovelInputStage from './NovelInputStage'
import QuickMangaHistoryPanel from './QuickMangaHistoryPanel'
import MangaPanelControls from './MangaPanelControls'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'

export default function ConfigStage() {
  const runtime = useWorkspaceStageRuntime()
  const { episodeName, novelText } = useWorkspaceEpisodeStageData()

  return (
    <div className="space-y-5">
      <NovelInputStage
        novelText={novelText}
        episodeName={episodeName}
        journeyType={runtime.journeyType}
        onNovelTextChange={runtime.onNovelTextChange}
        isSubmittingTask={runtime.isSubmittingTTS}
        isSwitchingStage={runtime.isTransitioning}
        quickMangaEnabled={runtime.quickMangaEnabled}
        quickMangaPreset={runtime.quickMangaPreset}
        quickMangaLayout={runtime.quickMangaLayout}
        quickMangaColorMode={runtime.quickMangaColorMode}
        onQuickMangaEnabledChange={runtime.onQuickMangaEnabledChange}
        onQuickMangaPresetChange={runtime.onQuickMangaPresetChange}
        onQuickMangaLayoutChange={runtime.onQuickMangaLayoutChange}
        onQuickMangaColorModeChange={runtime.onQuickMangaColorModeChange}
        quickMangaStyleLockEnabled={runtime.quickMangaStyleLockEnabled}
        quickMangaStyleLockProfile={runtime.quickMangaStyleLockProfile}
        quickMangaStyleLockStrength={runtime.quickMangaStyleLockStrength}
        quickMangaChapterContinuityMode={runtime.quickMangaChapterContinuityMode}
        quickMangaChapterId={runtime.quickMangaChapterId}
        quickMangaConflictPolicy={runtime.quickMangaConflictPolicy}
        onQuickMangaStyleLockEnabledChange={runtime.onQuickMangaStyleLockEnabledChange}
        onQuickMangaStyleLockProfileChange={runtime.onQuickMangaStyleLockProfileChange}
        onQuickMangaStyleLockStrengthChange={runtime.onQuickMangaStyleLockStrengthChange}
        onQuickMangaChapterContinuityModeChange={runtime.onQuickMangaChapterContinuityModeChange}
        onQuickMangaChapterIdChange={runtime.onQuickMangaChapterIdChange}
        onQuickMangaConflictPolicyChange={runtime.onQuickMangaConflictPolicyChange}
        videoRatio={runtime.videoRatio ?? undefined}
        artStyle={runtime.artStyle ?? undefined}
        onVideoRatioChange={runtime.onVideoRatioChange}
        onArtStyleChange={runtime.onArtStyleChange}
        selectedCharacterStrategy={runtime.selectedCharacterStrategy}
        onCharacterStrategyChange={runtime.onCharacterStrategyChange}
        selectedEnvironmentId={runtime.selectedEnvironmentId}
        onEnvironmentChange={runtime.onEnvironmentChange}
        onGenerateDemoSampleAssets={runtime.onGenerateDemoSampleAssets}
        demoSampleAssetsPending={runtime.demoSampleAssetsPending}
        onNext={runtime.onRunStoryToScript}
      />
      {runtime.journeyType === 'manga_webtoon' && (
        <>
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
          />
          <QuickMangaHistoryPanel enabled={runtime.quickMangaEnabled} />
        </>
      )}
    </div>
  )
}
