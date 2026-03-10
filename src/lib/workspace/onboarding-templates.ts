import {
  defaultEntryIntentByJourney,
  mapEntryModeToJourneyType,
  type ProductEntryIntent,
  type WorkspaceProjectEntryMode,
} from '@/lib/workspace/project-mode'

export type WorkspaceStarterTemplate = {
  id: string
  mode: WorkspaceProjectEntryMode
  titleKey: string
  descriptionKey: string
  entryIntent?: ProductEntryIntent
}

const STARTER_TEMPLATES: readonly WorkspaceStarterTemplate[] = [
  {
    id: 'story-cinematic-short',
    mode: 'story',
    titleKey: 'starterTemplates.story.cinematicShort.title',
    descriptionKey: 'starterTemplates.story.cinematicShort.desc',
    entryIntent: 'cinematic_scene',
  },
  {
    id: 'story-social-ad',
    mode: 'story',
    titleKey: 'starterTemplates.story.socialAd.title',
    descriptionKey: 'starterTemplates.story.socialAd.desc',
    entryIntent: 'video_ad_short',
  },
  {
    id: 'story-dialogue-drama',
    mode: 'story',
    titleKey: 'starterTemplates.story.dialogueDrama.title',
    descriptionKey: 'starterTemplates.story.dialogueDrama.desc',
    entryIntent: 'film_story_studio',
  },
  {
    id: 'manga-action-battle',
    mode: 'manga',
    titleKey: 'starterTemplates.manga.actionBattle.title',
    descriptionKey: 'starterTemplates.manga.actionBattle.desc',
    entryIntent: 'manga_story_to_panels',
  },
  {
    id: 'manga-romance-school',
    mode: 'manga',
    titleKey: 'starterTemplates.manga.romanceSchool.title',
    descriptionKey: 'starterTemplates.manga.romanceSchool.desc',
    entryIntent: 'manga_story_to_panels',
  },
  {
    id: 'manga-fantasy-quest',
    mode: 'manga',
    titleKey: 'starterTemplates.manga.fantasyQuest.title',
    descriptionKey: 'starterTemplates.manga.fantasyQuest.desc',
    entryIntent: 'manga_story_to_panels',
  },
  {
    id: 'manga-comedy-4koma',
    mode: 'manga',
    titleKey: 'starterTemplates.manga.comedy4Koma.title',
    descriptionKey: 'starterTemplates.manga.comedy4Koma.desc',
    entryIntent: 'manga_quickstart',
  },
]

export function getStarterTemplatesByMode(mode: WorkspaceProjectEntryMode): WorkspaceStarterTemplate[] {
  return STARTER_TEMPLATES.filter((template) => template.mode === mode)
}

export function resolveEntryIntentFromTemplate(input: {
  entryMode: WorkspaceProjectEntryMode
  templateId?: string
}): ProductEntryIntent {
  const selectedTemplate = STARTER_TEMPLATES.find((template) => template.id === input.templateId)

  if (selectedTemplate?.entryIntent) {
    return selectedTemplate.entryIntent
  }

  return defaultEntryIntentByJourney(mapEntryModeToJourneyType(input.entryMode))
}

export function buildStarterProjectName(prefix: string): string {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${prefix} ${mm}-${dd}`
}
