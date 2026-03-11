import { TASK_TYPE, type TaskType } from '@/lib/task/types'
import type {
  QuickMangaColorMode,
  QuickMangaLayout,
  QuickMangaOptions,
  QuickMangaPreset,
} from '@/lib/novel-promotion/quick-manga'

type AnyObj = Record<string, unknown>

export type QuickMangaStage = 'story-to-script' | 'script-to-storyboard'

export type QuickMangaStyleLockProfile = 'auto' | 'line-consistent' | 'ink-contrast' | 'soft-tones'

export type QuickMangaContinuityMode = 'off' | 'chapter-strict' | 'chapter-flex'

export type QuickMangaContinuityConflictPolicy = 'balanced' | 'prefer-style-lock' | 'prefer-chapter-context'

export type QuickMangaGenerationControls = {
  panelTemplateId: string | null
  styleLock: {
    enabled: boolean
    profile: QuickMangaStyleLockProfile
    strength: number
  }
  chapterContinuity: {
    mode: QuickMangaContinuityMode
    chapterId: string | null
    conflictPolicy: QuickMangaContinuityConflictPolicy
  }
}

export type QuickMangaContinuityContext = {
  sourceRunId: string
  sourceStage: QuickMangaStage
  shortcut: 'history-regenerate'
  fallbackContentUsed: boolean
  reusedOptions: {
    preset: QuickMangaPreset
    layout: QuickMangaLayout
    colorMode: QuickMangaColorMode
    style: string | null
  }
  reusedControls?: QuickMangaGenerationControls
}

export type QuickMangaFacadeOptions = QuickMangaOptions & {
  panelTemplateId: string | null
  style: string | null
}

export type QuickMangaFacadeRequest = {
  episodeId: string
  stage: QuickMangaStage
  content: string | null
  options: QuickMangaFacadeOptions
  controls: QuickMangaGenerationControls
  continuity: QuickMangaContinuityContext | null
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
  'splash-focus',
])

const QUICK_MANGA_COLOR_MODES: ReadonlySet<QuickMangaColorMode> = new Set([
  'auto',
  'full-color',
  'black-white',
  'limited-palette',
])

const QUICK_MANGA_STYLE_LOCK_PROFILES: ReadonlySet<QuickMangaStyleLockProfile> = new Set([
  'auto',
  'line-consistent',
  'ink-contrast',
  'soft-tones',
])

const QUICK_MANGA_CONTINUITY_MODES: ReadonlySet<QuickMangaContinuityMode> = new Set([
  'off',
  'chapter-strict',
  'chapter-flex',
])

const QUICK_MANGA_CONFLICT_POLICIES: ReadonlySet<QuickMangaContinuityConflictPolicy> = new Set([
  'balanced',
  'prefer-style-lock',
  'prefer-chapter-context',
])

function toObject(value: unknown): AnyObj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as AnyObj
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toNullableTrimmedString(value: unknown): string | null {
  const text = toTrimmedString(value)
  return text || null
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

function toStyleLockProfile(value: unknown, fallback: QuickMangaStyleLockProfile): QuickMangaStyleLockProfile {
  return QUICK_MANGA_STYLE_LOCK_PROFILES.has(value as QuickMangaStyleLockProfile)
    ? (value as QuickMangaStyleLockProfile)
    : fallback
}

function toContinuityMode(value: unknown, fallback: QuickMangaContinuityMode): QuickMangaContinuityMode {
  return QUICK_MANGA_CONTINUITY_MODES.has(value as QuickMangaContinuityMode)
    ? (value as QuickMangaContinuityMode)
    : fallback
}

function toConflictPolicy(value: unknown, fallback: QuickMangaContinuityConflictPolicy): QuickMangaContinuityConflictPolicy {
  return QUICK_MANGA_CONFLICT_POLICIES.has(value as QuickMangaContinuityConflictPolicy)
    ? (value as QuickMangaContinuityConflictPolicy)
    : fallback
}

function toClampedStrength(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  if (value < 0) return 0
  if (value > 1) return 1
  return Math.round(value * 100) / 100
}

function parseGenerationControls(input: unknown): QuickMangaGenerationControls {
  const payload = toObject(input)
  const styleLock = toObject(payload.styleLock)
  const chapterContinuity = toObject(payload.chapterContinuity)

  return {
    panelTemplateId: toNullableTrimmedString(payload.panelTemplateId),
    styleLock: {
      enabled: toBoolean(styleLock.enabled, false),
      profile: toStyleLockProfile(styleLock.profile, 'auto'),
      strength: toClampedStrength(styleLock.strength, 0.65),
    },
    chapterContinuity: {
      mode: toContinuityMode(chapterContinuity.mode, 'off'),
      chapterId: toNullableTrimmedString(chapterContinuity.chapterId),
      conflictPolicy: toConflictPolicy(chapterContinuity.conflictPolicy, 'balanced'),
    },
  }
}

function parseContinuityContext(input: unknown): QuickMangaContinuityContext | null {
  const payload = toObject(input)
  if (toTrimmedString(payload.shortcut) !== 'history-regenerate') {
    return null
  }

  const sourceRunId = toTrimmedString(payload.sourceRunId)
  if (!sourceRunId) return null

  const reusedOptionsInput = toObject(payload.reusedOptions)

  const hasReusedControls = payload.reusedControls && typeof payload.reusedControls === 'object' && !Array.isArray(payload.reusedControls)

  return {
    sourceRunId,
    sourceStage: toQuickMangaStage(payload.sourceStage),
    shortcut: 'history-regenerate',
    fallbackContentUsed: payload.fallbackContentUsed === true,
    reusedOptions: {
      preset: toQuickMangaPreset(reusedOptionsInput.preset, 'auto'),
      layout: toQuickMangaLayout(reusedOptionsInput.layout, 'auto'),
      colorMode: toQuickMangaColorMode(reusedOptionsInput.colorMode, 'auto'),
      style: toNullableTrimmedString(reusedOptionsInput.style),
    },
    ...(hasReusedControls
      ? { reusedControls: parseGenerationControls(payload.reusedControls) }
      : {}),
  }
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
    panelTemplateId: toNullableTrimmedString(optionsInput.panelTemplateId),
    style: toNullableTrimmedString(optionsInput.style),
  }

  return {
    episodeId,
    stage,
    content: stage === 'story-to-script' ? contentRaw : null,
    options,
    controls: parseGenerationControls(payload.quickMangaControls),
    continuity: parseContinuityContext(payload.continuity),
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
    panelTemplateId: toNullableTrimmedString(input.panelTemplateId),
    style: toNullableTrimmedString(input.style),
  }
}

export function readQuickMangaControlsFromPayload(payload: unknown): QuickMangaGenerationControls {
  return parseGenerationControls(toObject(payload).quickMangaControls)
}

export function readQuickMangaContinuityContextFromPayload(payload: unknown): QuickMangaContinuityContext | null {
  return parseContinuityContext(toObject(payload).continuity)
}
