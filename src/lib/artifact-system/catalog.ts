import { ARTIFACT_TYPES, type ArtifactDefinition, type ArtifactType } from './types'

const artifactCatalog: Record<ArtifactType, ArtifactDefinition> = {
  [ARTIFACT_TYPES.STORY_RAW]: {
    type: ARTIFACT_TYPES.STORY_RAW,
    scope: 'episode',
    summary: 'Original story text for the episode.',
  },
  [ARTIFACT_TYPES.CREATIVE_BRIEF]: {
    type: ARTIFACT_TYPES.CREATIVE_BRIEF,
    scope: 'episode',
    summary: 'Creative brief distilled from the user goal and project context.',
  },
  [ARTIFACT_TYPES.SUSPENSE_MECHANISM]: {
    type: ARTIFACT_TYPES.SUSPENSE_MECHANISM,
    scope: 'episode',
    summary: 'Suspense or tension mechanism used to shape a short film concept.',
  },
  [ARTIFACT_TYPES.SHORT_SCRIPT]: {
    type: ARTIFACT_TYPES.SHORT_SCRIPT,
    scope: 'episode',
    summary: 'Short-form script artifact for planning shots and storyboards.',
  },
  [ARTIFACT_TYPES.SHOT_PLAN]: {
    type: ARTIFACT_TYPES.SHOT_PLAN,
    scope: 'episode',
    summary: 'Shot-level plan derived from a script or concept.',
  },
  [ARTIFACT_TYPES.AUDIO_PLAN]: {
    type: ARTIFACT_TYPES.AUDIO_PLAN,
    scope: 'episode',
    summary: 'Audio, voice, ambience, or music planning artifact.',
  },
  [ARTIFACT_TYPES.ANALYSIS_CHARACTERS]: {
    type: ARTIFACT_TYPES.ANALYSIS_CHARACTERS,
    scope: 'episode',
    summary: 'Normalized character analysis output.',
  },
  [ARTIFACT_TYPES.ANALYSIS_LOCATIONS]: {
    type: ARTIFACT_TYPES.ANALYSIS_LOCATIONS,
    scope: 'episode',
    summary: 'Normalized location analysis output.',
  },
  [ARTIFACT_TYPES.ANALYSIS_PROPS]: {
    type: ARTIFACT_TYPES.ANALYSIS_PROPS,
    scope: 'episode',
    summary: 'Normalized prop analysis output.',
  },
  [ARTIFACT_TYPES.CLIP_SPLIT]: {
    type: ARTIFACT_TYPES.CLIP_SPLIT,
    scope: 'episode',
    summary: 'Clip split results for the episode.',
  },
  [ARTIFACT_TYPES.CLIP_SCREENPLAY]: {
    type: ARTIFACT_TYPES.CLIP_SCREENPLAY,
    scope: 'clip',
    summary: 'Screenplay generated for a clip.',
  },
  [ARTIFACT_TYPES.STORYBOARD_PHASE1]: {
    type: ARTIFACT_TYPES.STORYBOARD_PHASE1,
    scope: 'clip',
    summary: 'Phase 1 storyboard plan.',
  },
  [ARTIFACT_TYPES.STORYBOARD_PHASE2_CINEMATOGRAPHY]: {
    type: ARTIFACT_TYPES.STORYBOARD_PHASE2_CINEMATOGRAPHY,
    scope: 'clip',
    summary: 'Phase 2 cinematography refinement.',
  },
  [ARTIFACT_TYPES.STORYBOARD_PHASE2_ACTING]: {
    type: ARTIFACT_TYPES.STORYBOARD_PHASE2_ACTING,
    scope: 'clip',
    summary: 'Phase 2 acting refinement.',
  },
  [ARTIFACT_TYPES.STORYBOARD_PHASE3_DETAIL]: {
    type: ARTIFACT_TYPES.STORYBOARD_PHASE3_DETAIL,
    scope: 'clip',
    summary: 'Phase 3 storyboard detail refinement.',
  },
  [ARTIFACT_TYPES.STORYBOARD_PANEL_SET]: {
    type: ARTIFACT_TYPES.STORYBOARD_PANEL_SET,
    scope: 'episode',
    summary: 'Persisted storyboard panel set for the episode.',
  },
  [ARTIFACT_TYPES.VOICE_LINES]: {
    type: ARTIFACT_TYPES.VOICE_LINES,
    scope: 'episode',
    summary: 'Voice line output for the episode.',
  },
  [ARTIFACT_TYPES.PANEL_PROMPT]: {
    type: ARTIFACT_TYPES.PANEL_PROMPT,
    scope: 'panel',
    summary: 'Prompt used to generate a panel.',
  },
  [ARTIFACT_TYPES.PANEL_IMAGE]: {
    type: ARTIFACT_TYPES.PANEL_IMAGE,
    scope: 'panel',
    summary: 'Rendered panel image output.',
  },
  [ARTIFACT_TYPES.PANEL_VIDEO]: {
    type: ARTIFACT_TYPES.PANEL_VIDEO,
    scope: 'panel',
    summary: 'Rendered panel video output.',
  },
}

export function getArtifactDefinition(type: ArtifactType): ArtifactDefinition {
  return artifactCatalog[type]
}

export function listArtifactDefinitions(): ArtifactDefinition[] {
  return Object.values(artifactCatalog)
}
