'use client'

import NovelInputStage from './NovelInputStage'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'

export default function ConfigStage() {
  const runtime = useWorkspaceStageRuntime()
  const { episodeName, novelText } = useWorkspaceEpisodeStageData()

  return (
    <NovelInputStage
      novelText={novelText}
      episodeName={episodeName}
      onNovelTextChange={runtime.onNovelTextChange}
      isSubmittingTask={runtime.isSubmittingTTS}
      isSwitchingStage={runtime.isTransitioning}
      locale={runtime.locale}
      videoRatio={runtime.videoRatio ?? undefined}
      artStyle={runtime.artStyle ?? undefined}
      onLocaleChange={runtime.onLocaleChange}
      onVideoRatioChange={runtime.onVideoRatioChange}
      onArtStyleChange={runtime.onArtStyleChange}
      onNext={runtime.onRunStoryToScript}
    />
  )
}
