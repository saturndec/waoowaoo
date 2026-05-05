import type { Project } from '@/types/project'
import type {
  ProjectClip,
  ProjectShot,
  ProjectStoryboard,
} from '@/types/project'

export interface Episode {
  id: string
  episodeNumber: number
  name: string
  description?: string | null
  novelText?: string | null
  audioUrl?: string | null
  srtContent?: string | null
  clips?: ProjectClip[]
  storyboards?: ProjectStoryboard[]
  shots?: ProjectShot[]
  voiceLines?: unknown[]
  createdAt: string
}

export interface ProjectWorkspaceProps {
  project: Project
  projectId: string
  episodeId?: string
  episode?: Episode | null
  viewMode?: 'global-assets' | 'episode'
  episodes?: Episode[]
  assistantAutoStartMessage?: string | null
  assistantAutoStartKey?: string | null
  onAssistantAutoStartConsumed?: () => void
  onEpisodeSelect?: (episodeId: string) => void
  onEpisodeCreate?: () => void
  onEpisodeRename?: (episodeId: string, newName: string) => void
  onEpisodeDelete?: (episodeId: string) => void
}
