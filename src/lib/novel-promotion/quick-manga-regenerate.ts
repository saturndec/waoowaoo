import type { QuickMangaHistoryItem } from '@/lib/query/hooks/useQuickMangaHistory'
import type { QuickMangaContinuityContext } from '@/lib/novel-promotion/quick-manga-history'
import type {
  QuickMangaColorMode,
  QuickMangaLayout,
  QuickMangaOptions,
  QuickMangaPreset,
} from '@/lib/novel-promotion/quick-manga'

export type QuickMangaRegeneratePayload = QuickMangaOptions & {
  style: string | null
}

const QUICK_MANGA_PRESETS: ReadonlySet<QuickMangaPreset> = new Set([
  'auto',
  'action-battle',
  'romance-drama',
  'slice-of-life',
  'comedy-4koma',
])

const QUICK_MANGA_LAYOUTS: ReadonlySet<QuickMangaLayout> = new Set([
  'auto',
  'cinematic',
  'four-koma',
  'vertical-scroll',
])

const QUICK_MANGA_COLOR_MODES: ReadonlySet<QuickMangaColorMode> = new Set([
  'auto',
  'full-color',
  'black-white',
  'limited-palette',
])

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toQuickMangaPreset(value: unknown): QuickMangaPreset {
  return QUICK_MANGA_PRESETS.has(value as QuickMangaPreset)
    ? (value as QuickMangaPreset)
    : 'auto'
}

function toQuickMangaLayout(value: unknown): QuickMangaLayout {
  return QUICK_MANGA_LAYOUTS.has(value as QuickMangaLayout)
    ? (value as QuickMangaLayout)
    : 'auto'
}

function toQuickMangaColorMode(value: unknown): QuickMangaColorMode {
  return QUICK_MANGA_COLOR_MODES.has(value as QuickMangaColorMode)
    ? (value as QuickMangaColorMode)
    : 'auto'
}

export function resolveQuickMangaRegenerateStoryContent(params: {
  previousContent: string | null | undefined
  fallbackContent: string | null | undefined
}): { content: string; fallbackUsed: boolean } | null {
  const previous = typeof params.previousContent === 'string' ? params.previousContent.trim() : ''
  if (previous) {
    return {
      content: previous,
      fallbackUsed: false,
    }
  }

  const fallback = typeof params.fallbackContent === 'string' ? params.fallbackContent.trim() : ''
  if (!fallback) return null

  return {
    content: fallback,
    fallbackUsed: true,
  }
}

export function buildQuickMangaPayloadFromHistory(source: Pick<QuickMangaHistoryItem, 'options'>): QuickMangaRegeneratePayload {
  return {
    enabled: source.options.enabled === true,
    preset: toQuickMangaPreset(source.options.preset),
    layout: toQuickMangaLayout(source.options.layout),
    colorMode: toQuickMangaColorMode(source.options.colorMode),
    style: toTrimmedString(source.options.style) || null,
  }
}

export function buildQuickMangaContinuityContext(params: {
  source: Pick<QuickMangaHistoryItem, 'runId' | 'stage' | 'options'>
  fallbackContentUsed: boolean
}): QuickMangaContinuityContext {
  const payload = buildQuickMangaPayloadFromHistory(params.source)

  return {
    sourceRunId: params.source.runId,
    sourceStage: params.source.stage,
    shortcut: 'history-regenerate',
    fallbackContentUsed: params.fallbackContentUsed,
    reusedOptions: {
      preset: payload.preset,
      layout: payload.layout,
      colorMode: payload.colorMode,
      style: payload.style,
    },
  }
}
