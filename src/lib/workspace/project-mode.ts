export type WorkspaceProjectEntryMode = 'story' | 'manga'

export type ProductJourneyType = 'film_video' | 'manga_webtoon'

export type ProductEntryIntent =
  | 'film_story_studio'
  | 'video_ad_short'
  | 'cinematic_scene'
  | 'manga_quickstart'
  | 'manga_story_to_panels'

export interface ProductIntentContract {
  journeyType?: ProductJourneyType
  entryIntent?: ProductEntryIntent
}

export interface ProjectCreationInput extends ProductIntentContract {
  name: string
  description: string
  entryMode: WorkspaceProjectEntryMode
  sourceType?: 'blank' | 'story_text' | 'import_script'
  sourceContent?: string
}

export interface ProjectCreatePayload extends ProductIntentContract {
  name: string
  description: string
  mode: 'novel-promotion'
  /**
   * VAT-92 contract field for create flow mode selection.
   * Keep optional for backward compatibility with older clients.
   */
  projectMode?: WorkspaceProjectEntryMode
  /**
   * Dual-journey onboarding source context (additive, backward compatible).
   */
  sourceType?: 'blank' | 'story_text' | 'import_script'
  sourceContent?: string
}

export function mapJourneyTypeToProjectMode(journeyType: ProductJourneyType): WorkspaceProjectEntryMode {
  return journeyType === 'manga_webtoon' ? 'manga' : 'story'
}

export function mapJourneyTypeToEntryMode(journeyType: ProductJourneyType): WorkspaceProjectEntryMode {
  return mapJourneyTypeToProjectMode(journeyType)
}

export function mapEntryModeToJourneyType(entryMode: WorkspaceProjectEntryMode): ProductJourneyType {
  return entryMode === 'manga' ? 'manga_webtoon' : 'film_video'
}

export function defaultEntryIntentByJourney(journeyType: ProductJourneyType): ProductEntryIntent {
  return journeyType === 'manga_webtoon' ? 'manga_quickstart' : 'film_story_studio'
}

export function resolveProjectModeCompatibility(input: {
  projectMode?: unknown
  journeyType?: unknown
}): WorkspaceProjectEntryMode {
  if (input.projectMode === 'manga' || input.projectMode === 'story') {
    return input.projectMode
  }
  if (input.journeyType === 'manga_webtoon' || input.journeyType === 'film_video') {
    return mapJourneyTypeToProjectMode(input.journeyType)
  }
  return 'story'
}

export function toProjectCreatePayload(input: ProjectCreationInput): ProjectCreatePayload {
  const journeyType = input.journeyType ?? mapEntryModeToJourneyType(input.entryMode)
  const entryIntent = input.entryIntent ?? defaultEntryIntentByJourney(journeyType)

  return {
    name: input.name.trim(),
    description: input.description.trim(),
    mode: 'novel-promotion',
    projectMode: input.entryMode,
    journeyType,
    entryIntent,
    sourceType: input.sourceType,
    sourceContent: input.sourceContent?.trim() || undefined,
  }
}

export function buildProjectEntryUrl(projectId: string, entryMode: WorkspaceProjectEntryMode): string {
  const basePath = `/workspace/${projectId}`
  if (entryMode === 'manga') {
    const params = new URLSearchParams({
      stage: 'script',
      quickManga: '1',
    })
    return `${basePath}?${params.toString()}`
  }

  return basePath
}
