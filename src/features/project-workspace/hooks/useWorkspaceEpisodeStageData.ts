'use client'

import { useEpisodeData } from '@/lib/query/hooks'
import type { ProjectClip, ProjectEditScript, ProjectFinalVideo, ProjectShot, ProjectStoryboard, ProjectVideoGroup } from '@/types/project'
import { useWorkspaceProvider } from '../WorkspaceProvider'

interface EpisodeStagePayload {
  name?: string
  novelText?: string | null
  audioUrl?: string | null
  srtContent?: string | null
  clips?: ProjectClip[]
  storyboards?: ProjectStoryboard[]
  shots?: ProjectShot[]
  editScript?: ProjectEditScript | null
  finalVideo?: ProjectFinalVideo | null
  videoGroups?: ProjectVideoGroup[]
}

export function useWorkspaceEpisodeStageData() {
  const { projectId, episodeId } = useWorkspaceProvider()
  const { data: episodeData } = useEpisodeData(projectId, episodeId || null)
  const payload = episodeData as EpisodeStagePayload | null

  return {
    episodeName: payload?.name,
    novelText: payload?.novelText || '',
    audioUrl: payload?.audioUrl || null,
    srtContent: payload?.srtContent || null,
    clips: payload?.clips || [],
    storyboards: payload?.storyboards || [],
    shots: payload?.shots || [],
    editScript: payload?.editScript || null,
    finalVideo: payload?.finalVideo || null,
    videoGroups: payload?.videoGroups || [],
  }
}
