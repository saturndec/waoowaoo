import {
  type ProductEntryIntent,
  type ProductJourneyType,
} from '@/lib/workspace/project-mode'

export type OnboardingSourceType = 'blank' | 'story_text' | 'import_script'

export interface WorkspaceOnboardingContext {
  journeyType?: ProductJourneyType
  entryIntent?: ProductEntryIntent
  sourceType: OnboardingSourceType
  sourceContent?: string
  capturedAt: string
}

const ONBOARDING_CONTEXT_KEY = '__workspaceOnboardingContext'

function parseJsonObject(input: string | null | undefined): Record<string, unknown> {
  if (!input || !input.trim()) return {}
  try {
    const parsed = JSON.parse(input)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

function normalizeSourceType(value: unknown): OnboardingSourceType {
  if (value === 'story_text' || value === 'import_script') return value
  return 'blank'
}

export function buildWorkspaceOnboardingContext(input: {
  journeyType?: ProductJourneyType
  entryIntent?: ProductEntryIntent
  sourceType?: unknown
  sourceContent?: unknown
}): WorkspaceOnboardingContext {
  const sourceType = normalizeSourceType(input.sourceType)
  const sourceContentRaw = typeof input.sourceContent === 'string' ? input.sourceContent.trim() : ''

  return {
    journeyType: input.journeyType,
    entryIntent: input.entryIntent,
    sourceType,
    sourceContent: sourceType === 'blank' || sourceContentRaw.length === 0 ? undefined : sourceContentRaw,
    capturedAt: new Date().toISOString(),
  }
}

export function mergeWorkspaceOnboardingContextIntoCapabilityOverrides(input: {
  existingCapabilityOverrides?: string | null
  onboardingContext: WorkspaceOnboardingContext
}): string {
  const parsed = parseJsonObject(input.existingCapabilityOverrides)
  parsed[ONBOARDING_CONTEXT_KEY] = input.onboardingContext
  return JSON.stringify(parsed)
}

export function readWorkspaceOnboardingContextFromCapabilityOverrides(
  capabilityOverrides?: string | null,
): WorkspaceOnboardingContext | null {
  const parsed = parseJsonObject(capabilityOverrides)
  const context = parsed[ONBOARDING_CONTEXT_KEY]
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null

  const sourceType = normalizeSourceType((context as Record<string, unknown>).sourceType)
  const sourceContentRaw = (context as Record<string, unknown>).sourceContent
  const sourceContent = typeof sourceContentRaw === 'string' && sourceContentRaw.trim().length > 0
    ? sourceContentRaw
    : undefined

  const journeyTypeRaw = (context as Record<string, unknown>).journeyType
  const entryIntentRaw = (context as Record<string, unknown>).entryIntent
  const capturedAtRaw = (context as Record<string, unknown>).capturedAt

  return {
    sourceType,
    sourceContent,
    journeyType: journeyTypeRaw === 'film_video' || journeyTypeRaw === 'manga_webtoon' ? journeyTypeRaw : undefined,
    entryIntent: entryIntentRaw === 'film_story_studio'
      || entryIntentRaw === 'video_ad_short'
      || entryIntentRaw === 'cinematic_scene'
      || entryIntentRaw === 'manga_quickstart'
      || entryIntentRaw === 'manga_story_to_panels'
      ? entryIntentRaw
      : undefined,
    capturedAt: typeof capturedAtRaw === 'string' && capturedAtRaw ? capturedAtRaw : new Date(0).toISOString(),
  }
}
