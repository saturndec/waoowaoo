import type { QuickMangaOptions } from '@/lib/novel-promotion/quick-manga'
import type { QuickMangaGenerationControls } from '@/lib/novel-promotion/quick-manga-contract'
import type { ProductEntryIntent, ProductJourneyType } from '@/lib/workspace/project-mode'
import type { OnboardingSourceType } from '@/lib/workspace/onboarding-context'

export type GenerationStage = 'story_to_script' | 'script_to_storyboard'

export interface JourneyGenerationContext {
  journeyType: ProductJourneyType
  entryIntent?: ProductEntryIntent
  sourceType?: OnboardingSourceType
}

export interface JourneyGenerationStageConfig {
  temperature: number
  reasoning: boolean
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high'
  quickManga: QuickMangaOptions
  quickMangaControls?: QuickMangaGenerationControls
  meta: {
    runtimeLane: ProductJourneyType
    stageProfile: GenerationStage
    entryIntent?: ProductEntryIntent
    sourceType?: OnboardingSourceType
  }
}

const FILM_STAGE_DEFAULTS: Record<GenerationStage, Pick<JourneyGenerationStageConfig, 'temperature' | 'reasoning' | 'reasoningEffort'>> = {
  story_to_script: {
    temperature: 0.7,
    reasoning: true,
    reasoningEffort: 'medium',
  },
  script_to_storyboard: {
    temperature: 0.7,
    reasoning: true,
    reasoningEffort: 'medium',
  },
}

const MANGA_STAGE_DEFAULTS: Record<GenerationStage, Pick<JourneyGenerationStageConfig, 'temperature' | 'reasoning' | 'reasoningEffort'>> = {
  story_to_script: {
    temperature: 0.66,
    reasoning: true,
    reasoningEffort: 'high',
  },
  script_to_storyboard: {
    temperature: 0.72,
    reasoning: true,
    reasoningEffort: 'high',
  },
}

function resolveQuickMangaForLane(params: {
  journeyType: ProductJourneyType
  quickManga: QuickMangaOptions
}): QuickMangaOptions {
  if (params.journeyType !== 'manga_webtoon') {
    return {
      enabled: false,
      preset: params.quickManga.preset,
      layout: params.quickManga.layout,
      colorMode: params.quickManga.colorMode,
      panelTemplateId: null,
    }
  }

  return {
    enabled: params.quickManga.enabled,
    preset: params.quickManga.preset,
    layout: params.quickManga.layout,
    colorMode: params.quickManga.colorMode,
    panelTemplateId: params.quickManga.panelTemplateId || null,
  }
}

export function buildJourneyGenerationStageConfig(params: {
  context: JourneyGenerationContext
  stage: GenerationStage
  quickManga: QuickMangaOptions
  quickMangaControls: QuickMangaGenerationControls
}): JourneyGenerationStageConfig {
  const defaults = params.context.journeyType === 'manga_webtoon'
    ? MANGA_STAGE_DEFAULTS[params.stage]
    : FILM_STAGE_DEFAULTS[params.stage]

  const quickMangaForLane = resolveQuickMangaForLane({
    journeyType: params.context.journeyType,
    quickManga: params.quickManga,
  })

  const shouldAttachQuickMangaControls =
    params.context.journeyType === 'manga_webtoon' && quickMangaForLane.enabled

  return {
    temperature: defaults.temperature,
    reasoning: defaults.reasoning,
    reasoningEffort: defaults.reasoningEffort,
    quickManga: quickMangaForLane,
    quickMangaControls: shouldAttachQuickMangaControls ? params.quickMangaControls : undefined,
    meta: {
      runtimeLane: params.context.journeyType,
      stageProfile: params.stage,
      entryIntent: params.context.entryIntent,
      sourceType: params.context.sourceType,
    },
  }
}
