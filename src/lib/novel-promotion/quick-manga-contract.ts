import { TASK_TYPE, type TaskType } from '@/lib/task/types'
import type {
  QuickMangaColorMode,
  QuickMangaLayout,
  QuickMangaOptions,
  QuickMangaPreset,
} from '@/lib/novel-promotion/quick-manga'

type AnyObj = Record<string, unknown>

export type QuickMangaStage = 'story-to-script' | 'script-to-storyboard'

export type QuickMangaFacadeOptions = QuickMangaOptions & {
  style: string | null
}

export type QuickMangaFacadeRequest = {
  episodeId: string
  stage: QuickMangaStage
  content: string | null
  options: QuickMangaFacadeOptions
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

function toObject(value: unknown): AnyObj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as AnyObj
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  return fallback
}

function toQuickMangaStage(value: unknown): QuickMangaStage {
  return value === 'script-to-storyboard' ? 'script-to-storyboard' : 'story-to-script'
}

function toQuickMangaPreset(value: unknown, fallback: QuickMangaPreset): QuickMangaPreset {
  return QUICK_MANGA_PRESETS.has(value as QuickMangaPreset) ? (value as QuickMangaPreset) : fallback
}

function toQuickMangaLayout(value: unknown, fallback: QuickMangaLayout): QuickMangaLayout {
  return QUICK_MANGA_LAYOUTS.has(value as QuickMangaLayout) ? (value as QuickMangaLayout) : fallback
}

function toQuickMangaColorMode(value: unknown, fallback: QuickMangaColorMode): QuickMangaColorMode {
  return QUICK_MANGA_COLOR_MODES.has(value as QuickMangaColorMode) ? (value as QuickMangaColorMode) : fallback
}

export function parseQuickMangaFacadeRequest(body: unknown): QuickMangaFacadeRequest | null {
  const payload = toObject(body)
  const episodeId = toTrimmedString(payload.episodeId)
  if (!episodeId) return null

  const stage = toQuickMangaStage(payload.stage)
  const contentRaw = toTrimmedString(payload.content)
  if (stage === 'story-to-script' && !contentRaw) {
    return null
  }

  const optionsInput = toObject(payload.quickManga)
  const options: QuickMangaFacadeOptions = {
    enabled: toBoolean(optionsInput.enabled, true),
    preset: toQuickMangaPreset(optionsInput.preset, 'auto'),
    layout: toQuickMangaLayout(optionsInput.layout, 'auto'),
    colorMode: toQuickMangaColorMode(optionsInput.colorMode, 'auto'),
    style: toTrimmedString(optionsInput.style) || null,
  }

  return {
    episodeId,
    stage,
    content: stage === 'story-to-script' ? contentRaw : null,
    options,
  }
}

export function resolveQuickMangaTaskType(stage: QuickMangaStage): TaskType {
  return stage === 'script-to-storyboard'
    ? TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN
    : TASK_TYPE.STORY_TO_SCRIPT_RUN
}

export function readQuickMangaOptionsFromPayload(payload: unknown): QuickMangaFacadeOptions {
  const input = toObject(toObject(payload).quickManga)
  return {
    enabled: toBoolean(input.enabled, false),
    preset: toQuickMangaPreset(input.preset, 'auto'),
    layout: toQuickMangaLayout(input.layout, 'auto'),
    colorMode: toQuickMangaColorMode(input.colorMode, 'auto'),
    style: toTrimmedString(input.style) || null,
  }
}
