export const ARTIFACT_TYPES = {
  STORY_RAW: 'story.raw',
  CREATIVE_BRIEF: 'creative.brief',
  SUSPENSE_MECHANISM: 'suspense.mechanism',
  SHORT_SCRIPT: 'script.short',
  SHOT_PLAN: 'shot.plan',
  AUDIO_PLAN: 'audio.plan',
  ANALYSIS_CHARACTERS: 'analysis.characters',
  ANALYSIS_LOCATIONS: 'analysis.locations',
  ANALYSIS_PROPS: 'analysis.props',
  CLIP_SPLIT: 'clip.split',
  CLIP_SCREENPLAY: 'clip.screenplay',
  STORYBOARD_PHASE1: 'storyboard.phase1',
  STORYBOARD_PHASE2_CINEMATOGRAPHY: 'storyboard.phase2.cinematography',
  STORYBOARD_PHASE2_ACTING: 'storyboard.phase2.acting',
  STORYBOARD_PHASE3_DETAIL: 'storyboard.phase3.detail',
  STORYBOARD_PANEL_SET: 'storyboard.panel_set',
  VOICE_LINES: 'voice.lines',
  PANEL_PROMPT: 'panel.prompt',
  PANEL_IMAGE: 'panel.image',
  PANEL_VIDEO: 'panel.video',
} as const

export type ArtifactType = (typeof ARTIFACT_TYPES)[keyof typeof ARTIFACT_TYPES]

export type ArtifactScopeKind = 'project' | 'episode' | 'clip' | 'panel'

export interface ArtifactRef {
  scope: ArtifactScopeKind
  id: string
}

export interface ArtifactDefinition {
  type: ArtifactType
  scope: ArtifactScopeKind
  summary: string
}

export function formatArtifactRef(ref: ArtifactRef): string {
  return `${ref.scope}:${ref.id}`
}
