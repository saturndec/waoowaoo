import {
  calcImage,
  calcLipSync,
  calcMusic,
  calcText,
  calcVideo,
  calcVoice,
  calcVoiceDesign,
} from './cost'
import { BillingOperationError } from './errors'
import { BUILTIN_PRICING_VERSION } from '@/lib/ai-registry/pricing-resolution'
import { DEFAULT_LIPSYNC_MODEL_KEY, DEFAULT_VOICE_DESIGN_MODEL_KEY, DEFAULT_VOICE_MODEL_KEY } from '@/lib/ai-registry/api-config-catalog'
import { ensureAiCatalogsRegistered } from '@/lib/ai-exec/catalog-bootstrap'
import { TASK_TYPE, type TaskType } from '@/lib/task/types'
import type { TaskBillingInfo } from './types'

type AnyPayload = Record<string, unknown> | null | undefined

const BILLABLE_TASK_TYPES = new Set<TaskType>([
  TASK_TYPE.IMAGE_PANEL,
  TASK_TYPE.IMAGE_CHARACTER,
  TASK_TYPE.IMAGE_LOCATION,
  TASK_TYPE.MUSIC_GENERATE,
  TASK_TYPE.VIDEO_PANEL,
  TASK_TYPE.VIDEO_GROUP,
  TASK_TYPE.LIP_SYNC,
  TASK_TYPE.VOICE_LINE,
  TASK_TYPE.VOICE_DESIGN,
  TASK_TYPE.ASSET_HUB_VOICE_DESIGN,
  TASK_TYPE.REGENERATE_STORYBOARD_TEXT,
  TASK_TYPE.INSERT_PANEL,
  TASK_TYPE.PANEL_VARIANT,
  TASK_TYPE.MODIFY_ASSET_IMAGE,
  TASK_TYPE.REGENERATE_GROUP,
  TASK_TYPE.ASSET_HUB_IMAGE,
  TASK_TYPE.ASSET_HUB_MODIFY,
  TASK_TYPE.ANALYZE_NOVEL,
  TASK_TYPE.CLIPS_BUILD,
  TASK_TYPE.SCREENPLAY_CONVERT,
  TASK_TYPE.VOICE_ANALYZE,
  TASK_TYPE.ANALYZE_GLOBAL,
  TASK_TYPE.AI_STORY_EXPAND,
  TASK_TYPE.AI_MODIFY_APPEARANCE,
  TASK_TYPE.AI_MODIFY_LOCATION,
  TASK_TYPE.AI_MODIFY_PROP,
  TASK_TYPE.AI_MODIFY_SHOT_PROMPT,
  TASK_TYPE.ANALYZE_SHOT_VARIANTS,
  TASK_TYPE.AI_CREATE_CHARACTER,
  TASK_TYPE.AI_CREATE_LOCATION,
  TASK_TYPE.REFERENCE_TO_CHARACTER,
  TASK_TYPE.EPISODE_SPLIT_LLM,
  TASK_TYPE.ASSET_HUB_AI_DESIGN_CHARACTER,
  TASK_TYPE.ASSET_HUB_AI_DESIGN_LOCATION,
  TASK_TYPE.ASSET_HUB_AI_MODIFY_CHARACTER,
  TASK_TYPE.ASSET_HUB_AI_MODIFY_LOCATION,
  TASK_TYPE.ASSET_HUB_AI_MODIFY_PROP,
  TASK_TYPE.ASSET_HUB_REFERENCE_TO_CHARACTER,
])

function toNumber(value: unknown, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return n
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function readNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function pickFirstString(values: unknown[]): string | null {
  for (const value of values) {
    const next = readString(value)
    if (next) return next
  }
  return null
}

function buildTextTaskInfo(taskType: TaskType, payload: AnyPayload): TaskBillingInfo | null {
  const inputTokens = Math.max(0, Math.floor(toNumber(payload?.maxInputTokens, 3000)))
  const outputTokens = Math.max(0, Math.floor(toNumber(payload?.maxOutputTokens, 1200)))
  const model = pickFirstString([payload?.analysisModel, payload?.model])
  if (!model) return null

  // calcText may throw if model has no built-in pricing (user custom pricing resolved later)
  let maxFrozenCost = 0
  try {
    maxFrozenCost = calcText(model, inputTokens, outputTokens)
  } catch {
    // Custom-priced or uncatalogued model: actual cost resolved in prepareTaskBilling with user context
  }

  return {
    billable: true,
    source: 'task',
    taskType,
    apiType: 'text',
    model,
    quantity: inputTokens + outputTokens,
    unit: 'token',
    maxFrozenCost,
    pricingVersion: BUILTIN_PRICING_VERSION,
    action: String(taskType),
    metadata: { inputTokens, outputTokens },
    status: 'quoted',
  }
}

function buildImageTaskInfo(taskType: TaskType, payload: AnyPayload): TaskBillingInfo | null {
  const model = pickFirstString([payload?.imageModel, payload?.modelId, payload?.model])
  if (!model) return null
  const quantity = Math.max(1, Math.floor(toNumber(payload?.candidateCount ?? payload?.count, 1)))
  const generationOptions = toRecord(payload?.generationOptions)
  const resolution = readString(generationOptions.resolution) || readString(payload?.resolution)
  const metadata = resolution ? { resolution } : undefined
  let maxFrozenCost = 0
  try {
    maxFrozenCost = calcImage(model, quantity, metadata)
  } catch (error) {
    if (error instanceof BillingOperationError && error.code === 'BILLING_UNKNOWN_MODEL') {
      // Uncatalogued model: allow task to proceed without billing estimate
    } else {
      throw error
    }
  }
  return {
    billable: true,
    source: 'task',
    taskType,
    apiType: 'image',
    model,
    quantity,
    unit: 'image',
    maxFrozenCost,
    pricingVersion: BUILTIN_PRICING_VERSION,
    action: String(taskType),
    ...(metadata ? { metadata } : {}),
    status: 'quoted',
  }
}

function buildVideoTaskInfo(taskType: TaskType, payload: AnyPayload): TaskBillingInfo | null {
  const firstLastFramePayload = toRecord(payload?.firstLastFrame)
  const generationMode = Object.keys(firstLastFramePayload).length > 0 ? 'firstlastframe' : 'normal'
  const model = pickFirstString([
    payload?.videoModel,
    payload?.modelId,
    payload?.model,
    firstLastFramePayload.flModel,
  ])
  if (!model) return null
  const generationOptions = toRecord(payload?.generationOptions)
  const resolution = readString(generationOptions.resolution) || readString(payload?.resolution)
  const duration = readNumber(generationOptions.duration) ?? readNumber(payload?.duration)
  const aspectRatio = readString(generationOptions.aspectRatio) || readString(payload?.aspectRatio)
  const generateAudio = typeof generationOptions.generateAudio === 'boolean'
    ? generationOptions.generateAudio
    : undefined
  const quantity = Math.max(1, Math.floor(toNumber(payload?.count, 1)))
  const metadata = {
    ...(resolution ? { resolution } : {}),
    ...(typeof duration === 'number' ? { duration } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    generationMode,
    ...(typeof generateAudio === 'boolean' ? { generateAudio } : {}),
    containsVideoInput: false,
  }
  let maxFrozenCost = 0
  try {
    maxFrozenCost = calcVideo(model, resolution || '720p', quantity, metadata)
  } catch (error) {
    if (error instanceof BillingOperationError && error.code === 'BILLING_UNKNOWN_MODEL') {
      // Uncatalogued model: allow task to proceed without billing estimate
    } else {
      throw error
    }
  }
  return {
    billable: true,
    source: 'task',
    taskType,
    apiType: 'video',
    model,
    quantity,
    unit: 'video',
    maxFrozenCost,
    pricingVersion: BUILTIN_PRICING_VERSION,
    action: String(taskType),
    metadata,
    status: 'quoted',
  }
}

function buildMusicTaskInfo(taskType: TaskType, payload: AnyPayload): TaskBillingInfo | null {
  const model = pickFirstString([payload?.musicModel, payload?.modelId, payload?.model])
  if (!model) return null
  const durationSeconds = readNumber(payload?.durationSeconds)
  if (durationSeconds === null || durationSeconds <= 0) return null
  const outputFormat = readString(payload?.outputFormat)
  const vocalMode = readString(payload?.vocalMode)
  const genre = readString(payload?.genre)
  const mood = readString(payload?.mood)
  const bpm = readNumber(payload?.bpm)
  const metadata = {
    durationSeconds,
    ...(outputFormat ? { outputFormat } : {}),
    ...(vocalMode ? { vocalMode } : {}),
    ...(genre ? { genre } : {}),
    ...(mood ? { mood } : {}),
    ...(typeof bpm === 'number' ? { bpm } : {}),
  }
  return {
    billable: true,
    source: 'task',
    taskType,
    apiType: 'music',
    model,
    quantity: durationSeconds,
    unit: 'second',
    maxFrozenCost: calcMusic(model, durationSeconds, metadata),
    pricingVersion: BUILTIN_PRICING_VERSION,
    action: String(taskType),
    metadata,
    status: 'quoted',
  }
}

function buildVoiceTaskInfo(taskType: TaskType, payload: AnyPayload): TaskBillingInfo {
  const maxSeconds = Math.max(1, Math.floor(toNumber(payload?.maxSeconds, 5)))
  return {
    billable: true,
    source: 'task',
    taskType,
    apiType: 'voice',
    model: DEFAULT_VOICE_MODEL_KEY,
    quantity: maxSeconds,
    unit: 'second',
    maxFrozenCost: calcVoice(maxSeconds),
    pricingVersion: BUILTIN_PRICING_VERSION,
    action: String(taskType),
    metadata: { maxSeconds },
    status: 'quoted',
  }
}

function buildVoiceDesignTaskInfo(taskType: TaskType): TaskBillingInfo {
  return {
    billable: true,
    source: 'task',
    taskType,
    apiType: 'voice-design',
    model: DEFAULT_VOICE_DESIGN_MODEL_KEY,
    quantity: 1,
    unit: 'call',
    maxFrozenCost: calcVoiceDesign(),
    pricingVersion: BUILTIN_PRICING_VERSION,
    action: String(taskType),
    status: 'quoted',
  }
}

export function isBillableTaskType(taskType: TaskType) {
  return BILLABLE_TASK_TYPES.has(taskType)
}

export function buildDefaultTaskBillingInfo(taskType: TaskType, payload: AnyPayload): TaskBillingInfo | null {
  if (!isBillableTaskType(taskType)) return null

  switch (taskType) {
    case TASK_TYPE.IMAGE_PANEL:
    case TASK_TYPE.IMAGE_CHARACTER:
    case TASK_TYPE.IMAGE_LOCATION:
    case TASK_TYPE.MODIFY_ASSET_IMAGE:
    case TASK_TYPE.REGENERATE_GROUP:
    case TASK_TYPE.ASSET_HUB_IMAGE:
    case TASK_TYPE.ASSET_HUB_MODIFY:
      return buildImageTaskInfo(taskType, payload)
    case TASK_TYPE.VIDEO_PANEL:
    case TASK_TYPE.VIDEO_GROUP:
      return buildVideoTaskInfo(taskType, payload)
    case TASK_TYPE.MUSIC_GENERATE:
      return buildMusicTaskInfo(taskType, payload)
    case TASK_TYPE.LIP_SYNC: {
      const lipSyncModel = pickFirstString([payload?.lipSyncModel]) || DEFAULT_LIPSYNC_MODEL_KEY
      return {
        billable: true,
        source: 'task',
        taskType,
        apiType: 'lip-sync',
        model: lipSyncModel,
        quantity: 1,
        unit: 'call',
        maxFrozenCost: calcLipSync(lipSyncModel),
        pricingVersion: BUILTIN_PRICING_VERSION,
        action: String(taskType),
        status: 'quoted',
      }
    }
    case TASK_TYPE.VOICE_LINE:
      return buildVoiceTaskInfo(taskType, payload)
    case TASK_TYPE.VOICE_DESIGN:
    case TASK_TYPE.ASSET_HUB_VOICE_DESIGN:
      return buildVoiceDesignTaskInfo(taskType)
    case TASK_TYPE.REGENERATE_STORYBOARD_TEXT:
    case TASK_TYPE.INSERT_PANEL:
    case TASK_TYPE.ANALYZE_NOVEL:
    case TASK_TYPE.CLIPS_BUILD:
    case TASK_TYPE.SCREENPLAY_CONVERT:
    case TASK_TYPE.VOICE_ANALYZE:
    case TASK_TYPE.ANALYZE_GLOBAL:
    case TASK_TYPE.AI_STORY_EXPAND:
    case TASK_TYPE.AI_MODIFY_APPEARANCE:
    case TASK_TYPE.AI_MODIFY_LOCATION:
    case TASK_TYPE.AI_MODIFY_PROP:
    case TASK_TYPE.AI_MODIFY_SHOT_PROMPT:
    case TASK_TYPE.ANALYZE_SHOT_VARIANTS:
    case TASK_TYPE.AI_CREATE_CHARACTER:
    case TASK_TYPE.AI_CREATE_LOCATION:
    case TASK_TYPE.REFERENCE_TO_CHARACTER:
    case TASK_TYPE.EPISODE_SPLIT_LLM:
    case TASK_TYPE.ASSET_HUB_AI_DESIGN_CHARACTER:
    case TASK_TYPE.ASSET_HUB_AI_DESIGN_LOCATION:
    case TASK_TYPE.ASSET_HUB_AI_MODIFY_CHARACTER:
    case TASK_TYPE.ASSET_HUB_AI_MODIFY_LOCATION:
    case TASK_TYPE.ASSET_HUB_AI_MODIFY_PROP:
    case TASK_TYPE.ASSET_HUB_REFERENCE_TO_CHARACTER:
      return buildTextTaskInfo(taskType, payload)
    case TASK_TYPE.PANEL_VARIANT:
      return buildImageTaskInfo(taskType, payload)
    default:
      return null
  }
}
ensureAiCatalogsRegistered()
