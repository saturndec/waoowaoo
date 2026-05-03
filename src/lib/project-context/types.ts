import type { RecentOperationResult } from '@/lib/task/operation-result-types'

export interface ProjectPolicySnapshot {
  projectId: string
  episodeId?: string | null
  videoRatio: string
  artStyle: string
  analysisModel?: string | null
  overrides: Record<string, unknown>
}

export interface ProjectPolicyOverrideInput {
  videoRatio?: string
  artStyle?: string
  analysisModel?: string | null
  overrides?: Record<string, unknown>
}

export interface ProjectContextArtifactSummary {
  type: string
  refId: string
  createdAt?: string | null
}

export interface ProjectContextRunSummary {
  id: string
  runType: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface ProjectContextApprovalSummary {
  id: string
  status: string
  createdAt: string
}

export interface ProjectContextEpisodeSnapshot {
  novelText: string | null
  clipCount: number
  screenplayClipCount: number
  storyboardCount: number
  panelCount: number
  voiceLineCount: number
}

export interface ProjectContextClipSnapshot {
  clipId: string
  summary: string
  screenplayReady: boolean
  storyboardReady: boolean
  panelCount: number
}

export interface ProjectContextPanelSnapshot {
  panelId: string
  clipId: string
  storyboardId: string
  panelIndex: number
  description: string | null
  imagePrompt: string | null
  imageUrl: string | null
  imageMediaId: string | null
  candidateImages: string | null
  videoPrompt: string | null
  videoUrl: string | null
  videoMediaId: string | null
  updatedAt: string
}

export interface ProjectContextEpisodeDetailSnapshot {
  episode: ProjectContextEpisodeSnapshot | null
  clips: ProjectContextClipSnapshot[]
  panels: ProjectContextPanelSnapshot[]
  approvals: ProjectContextApprovalSummary[]
}

export interface ProjectContextSnapshot {
  projectId: string
  projectName: string
  episodeId?: string | null
  episodeName?: string | null
  currentStage?: string | null
  selectedScopeRef?: string | null
  selectedPanelId?: string | null
  selectedClipId?: string | null
  selectedAssetId?: string | null
  latestArtifacts: ProjectContextArtifactSummary[]
  activePlanRuns: ProjectContextRunSummary[]
  activeOperationTasks: RecentOperationResult[]
  recentOperationResults: RecentOperationResult[]
  policy: ProjectPolicySnapshot
  episodeDetail?: ProjectContextEpisodeDetailSnapshot
}
