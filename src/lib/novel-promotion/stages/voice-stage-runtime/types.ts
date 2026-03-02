'use client'

export interface VoiceLine {
  id: string
  lineIndex: number
  speaker: string
  content: string
  emotionPrompt: string | null
  emotionStrength: number | null
  audioUrl: string | null
  lineTaskRunning: boolean
  matchedPanelId?: string | null
  matchedStoryboardId?: string | null
  matchedPanelIndex?: number | null
}

export interface Character {
  id: string
  name: string
  voiceId?: string | null
  customVoiceUrl?: string | null
}

export interface BindablePanelOption {
  id: string
  storyboardId: string
  panelIndex: number
  label: string
}

export interface EpisodeStoryboard {
  id: string
  clipId?: string | null
  panels?: Array<{
    id: string
    panelIndex: number
    srtSegment?: string | null
    description?: string | null
  }>
}

export interface EpisodeClip {
  id: string
}

export interface SpeakerVoiceEntry {
  voiceType: string
  voiceId?: string
  audioUrl: string
}

export interface VoiceStageShellProps {
  projectId: string
  episodeId: string
  onBack?: () => void
  embedded?: boolean
  onVoiceLineClick?: (storyboardId: string, panelIndex: number) => void
  onVoiceLinesChanged?: () => void
  onOpenAssetLibraryForCharacter?: (characterId?: string | null) => void
}
