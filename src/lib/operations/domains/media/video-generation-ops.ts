import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { BillingOperationError } from '@/lib/billing/errors'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { createMutationBatch } from '@/lib/mutation-batch/service'
import { hasPanelVideoOutput, hasVideoGroupOutput } from '@/lib/task/has-output'
import { parseModelKeyStrict } from '@/lib/ai-registry/selection'
import type { CapabilityValue } from '@/lib/ai-registry/types'
import { ensureAiCatalogsRegistered } from '@/lib/ai-exec/catalog-bootstrap'
import { resolveAiVideoTokenPricingContract } from '@/lib/ai-exec/video-token-pricing'
import { resolveBuiltinCapabilitiesByModelKey } from '@/lib/ai-registry/capabilities-catalog'
import { resolveBuiltinPricing } from '@/lib/ai-registry/pricing-resolution'
import { resolveProjectModelCapabilityGenerationOptions } from '@/lib/config-service'
import { DEFAULT_GROUP_VIDEO_MODEL } from '@/lib/ai-exec/video-defaults'
import type {
  TaskBatchSubmittedPartData,
  TaskSubmittedPartData,
} from '@/lib/project-agent/types'
import type { ProjectAgentOperationContext, ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { writeOperationDataPart } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'
import { submitOperationTask } from '@/lib/operations/submit-operation-task'
import {
  refineTaskBatchSubmitOperationOutputSchema,
  refineTaskSubmitOperationOutputSchema,
  taskBatchSubmitOperationOutputSchemaBase,
  taskSubmitOperationOutputSchemaBase,
} from '@/lib/operations/output-schemas'
import { chunkVideoGroupShots, totalVideoGroupDuration, validateVideoGroupShotNumbers } from '@/lib/video-groups/core'
import { normalizeVideoBlockPlanResponse } from '@/lib/video-groups/planner'
import { VIDEO_GRID_MODES, type VideoBlockPlan, type VideoBlockPlanItem, type VideoGridMode, type VideoGroupShot } from '@/lib/video-groups/types'

type UnknownObject = { [key: string]: unknown }
const ASSET_REFERENCE_GRID_MODE = 'asset_reference'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

function resolveLocaleFromContext(locale?: unknown): string {
  const normalized = normalizeString(locale)
  return normalized || 'zh'
}

function isRecord(value: unknown): value is UnknownObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toVideoRuntimeSelections(value: unknown): Record<string, CapabilityValue> {
  if (!isRecord(value)) return {}
  const selections: Record<string, CapabilityValue> = {}
  for (const [field, raw] of Object.entries(value)) {
    if (field === 'aspectRatio') continue
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      selections[field] = raw
    }
  }
  return selections
}

function mergeVideoRuntimeSelections(...sources: unknown[]): Record<string, CapabilityValue> {
  const merged: Record<string, CapabilityValue> = {}
  for (const source of sources) {
    Object.assign(merged, toVideoRuntimeSelections(source))
  }
  return merged
}

function hasRuntimeSelections(value: unknown): boolean {
  return Object.keys(toVideoRuntimeSelections(value)).length > 0
}

function resolveVideoGenerationMode(payload: unknown): 'normal' | 'firstlastframe' {
  if (!isRecord(payload)) return 'normal'
  return isRecord(payload.firstLastFrame) ? 'firstlastframe' : 'normal'
}

function usesVideoTokenPricing(modelKey: string): boolean {
  return !!resolveAiVideoTokenPricingContract(modelKey)
}

function resolveVideoModelKeyFromPayload(payload: UnknownObject): string | null {
  const firstLast = isRecord(payload.firstLastFrame) ? payload.firstLastFrame : null
  if (firstLast && typeof firstLast.flModel === 'string' && parseModelKeyStrict(firstLast.flModel)) {
    return firstLast.flModel
  }
  if (typeof payload.videoModel === 'string' && parseModelKeyStrict(payload.videoModel)) {
    return payload.videoModel
  }
  return null
}

function requireVideoModelKeyFromPayload(payload: unknown): string {
  if (!isRecord(payload) || typeof payload.videoModel !== 'string' || !parseModelKeyStrict(payload.videoModel)) {
    throw new Error('PROJECT_AGENT_VIDEO_MODEL_REQUIRED')
  }
  return payload.videoModel
}

function validateFirstLastFrameModel(input: unknown) {
  if (input === undefined || input === null) return
  if (!isRecord(input)) {
    throw new Error('PROJECT_AGENT_FIRSTLASTFRAME_PAYLOAD_INVALID')
  }

  const flModel = input.flModel
  if (typeof flModel !== 'string' || !parseModelKeyStrict(flModel)) {
    throw new Error('PROJECT_AGENT_FIRSTLASTFRAME_MODEL_INVALID')
  }

  const capabilities = resolveBuiltinCapabilitiesByModelKey('video', flModel)
  if (capabilities?.video?.firstlastframe !== true) {
    throw new Error('PROJECT_AGENT_FIRSTLASTFRAME_MODEL_UNSUPPORTED')
  }
}

async function resolveVideoCapabilityOptions(input: {
  payload: unknown
  projectId: string
  userId: string
  lastVideoGenerationOptions?: unknown
}) {
  const payload = input.payload
  if (!isRecord(payload)) return {}
  const modelKey = resolveVideoModelKeyFromPayload(payload)
  if (!modelKey) return {}

  const builtinCaps = resolveBuiltinCapabilitiesByModelKey('video', modelKey)
  if (!builtinCaps) return toVideoRuntimeSelections(payload.generationOptions)

  const explicitRuntimeSelections = toVideoRuntimeSelections(payload.generationOptions)
  const shouldApplyLastOptions = !hasRuntimeSelections(payload.generationOptions)
  const runtimeSelections = mergeVideoRuntimeSelections(
    shouldApplyLastOptions ? input.lastVideoGenerationOptions : undefined,
    explicitRuntimeSelections,
  )
  runtimeSelections.generationMode = resolveVideoGenerationMode(payload)

  const resolveOptions = (selections: Record<string, CapabilityValue>) =>
    resolveProjectModelCapabilityGenerationOptions({
      projectId: input.projectId,
      userId: input.userId,
      modelType: 'video',
      modelKey,
      runtimeSelections: selections,
    })

  let resolvedOptions: Record<string, CapabilityValue>
  try {
    resolvedOptions = await resolveOptions(runtimeSelections)
  } catch (error) {
    if (!shouldApplyLastOptions) throw error
    const fallbackSelections = { ...explicitRuntimeSelections }
    fallbackSelections.generationMode = resolveVideoGenerationMode(payload)
    resolvedOptions = await resolveOptions(fallbackSelections)
  }

  const resolution = resolveBuiltinPricing({
      apiType: 'video',
      model: modelKey,
      selections: {
        ...resolvedOptions,
        ...(usesVideoTokenPricing(modelKey) ? { containsVideoInput: false } : {}),
      },
    })
  if (resolution.status === 'missing_capability_match') {
    throw new Error('PROJECT_AGENT_VIDEO_CAPABILITY_COMBINATION_UNSUPPORTED')
  }
  return resolvedOptions
}

function buildVideoPanelBillingInfoOrThrow(payload: unknown) {
  try {
    return buildDefaultTaskBillingInfo(TASK_TYPE.VIDEO_PANEL, isRecord(payload) ? payload : null)
  } catch (error) {
    if (
      error instanceof BillingOperationError
      && (
        error.code === 'BILLING_UNKNOWN_VIDEO_CAPABILITY_COMBINATION'
        || error.code === 'BILLING_UNKNOWN_VIDEO_RESOLUTION'
      )
    ) {
      throw new Error('PROJECT_AGENT_VIDEO_CAPABILITY_COMBINATION_UNSUPPORTED')
    }
    if (error instanceof BillingOperationError && error.code === 'BILLING_UNKNOWN_MODEL') {
      return null
    }
    throw error
  }
}

function buildVideoGroupBillingInfoOrThrow(payload: unknown) {
  try {
    return buildDefaultTaskBillingInfo(TASK_TYPE.VIDEO_GROUP, isRecord(payload) ? payload : null)
  } catch (error) {
    if (
      error instanceof BillingOperationError
      && (
        error.code === 'BILLING_UNKNOWN_VIDEO_CAPABILITY_COMBINATION'
        || error.code === 'BILLING_UNKNOWN_VIDEO_RESOLUTION'
      )
    ) {
      throw new Error('PROJECT_AGENT_VIDEO_CAPABILITY_COMBINATION_UNSUPPORTED')
    }
    if (error instanceof BillingOperationError && error.code === 'BILLING_UNKNOWN_MODEL') {
      return null
    }
    throw error
  }
}

function buildVideoTaskPayload(params: {
  ctx: ProjectAgentOperationContext
  input: UnknownObject
}) {
  const locale = resolveLocaleFromContext(params.ctx.context.locale)
  const existingMeta = isRecord(params.input.meta) ? params.input.meta : {}
  const payload: UnknownObject = {
    ...params.input,
    meta: {
      ...existingMeta,
      locale,
    },
  }
  delete payload.confirmed

  return {
    payload,
    localeForTask: resolveRequiredTaskLocale(params.ctx.request, payload),
  }
}

async function validateVideoTaskPayloadOrThrow(params: {
  payload: UnknownObject
  projectId: string
  userId: string
  lastVideoGenerationOptions?: unknown
}) {
  requireVideoModelKeyFromPayload(params.payload)
  validateFirstLastFrameModel(params.payload.firstLastFrame)
  const resolvedOptions = await resolveVideoCapabilityOptions({
    payload: params.payload,
    projectId: params.projectId,
    userId: params.userId,
    lastVideoGenerationOptions: params.lastVideoGenerationOptions,
  })
  params.payload.generationOptions = resolvedOptions
}

function requirePanelSystemVideoDurationSec(panelId: string, duration: unknown): number {
  if (typeof duration !== 'number' || !Number.isFinite(duration) || !Number.isInteger(duration) || duration <= 0) {
    throw new Error(`PROJECT_AGENT_PANEL_VIDEO_DURATION_REQUIRED:${panelId}`)
  }
  return duration
}

function applySystemVideoDuration(payload: UnknownObject, durationSec: number): void {
  const rawGenerationOptions = isRecord(payload.generationOptions) ? payload.generationOptions : {}
  payload.generationOptions = {
    ...rawGenerationOptions,
    duration: durationSec,
  }
}

async function executeGenerateEpisodeVideosOperation(params: {
  ctx: ProjectAgentOperationContext
  input: UnknownObject
  operationId: string
}) {
  const { payload, localeForTask } = buildVideoTaskPayload({ ctx: params.ctx, input: params.input })

  const episodeId = normalizeString(payload.episodeId) || normalizeString(params.ctx.context.episodeId)
  if (!episodeId) {
    throw new Error('PROJECT_AGENT_EPISODE_REQUIRED')
  }
  const limit = typeof payload.limit === 'number' && Number.isFinite(payload.limit) ? payload.limit : 20

  const panels = await prisma.projectPanel.findMany({
    where: {
      storyboard: { episodeId },
      imageUrl: { not: null },
      OR: [
        { videoUrl: null },
        { videoUrl: '' },
      ],
    },
    select: { id: true, videoUrl: true, duration: true, lastVideoGenerationOptions: true },
    take: limit,
  })

  if (panels.length === 0) {
    return {
      success: true,
      async: true,
      total: 0,
      taskIds: [],
      results: [],
      noop: true,
      reason: '没有需要生成的视频分镜（可能是已生成或缺少图片）',
    }
  }

  const tasks = await Promise.all(
    panels.map(async (panel) => {
      const panelPayload: UnknownObject = {
        ...payload,
        meta: isRecord(payload.meta) ? { ...payload.meta } : payload.meta,
      }
      applySystemVideoDuration(panelPayload, requirePanelSystemVideoDurationSec(panel.id, panel.duration))
      await validateVideoTaskPayloadOrThrow({
        payload: panelPayload,
        projectId: params.ctx.projectId,
        userId: params.ctx.userId,
        lastVideoGenerationOptions: panel.lastVideoGenerationOptions,
      })

      return submitOperationTask({
        request: params.ctx.request,
        userId: params.ctx.userId,
        locale: localeForTask,
        projectId: params.ctx.projectId,
        episodeId,
        type: TASK_TYPE.VIDEO_PANEL,
        targetType: 'ProjectPanel',
        targetId: panel.id,
        operationId: params.operationId,
        source: params.ctx.source,
        confirmed: params.input.confirmed === true,
        payload: withTaskUiPayload(panelPayload, {
          hasOutputAtStart: await hasPanelVideoOutput(panel.id),
        }),
        dedupeKey: `video_panel:${panel.id}`,
        billingInfo: buildVideoPanelBillingInfoOrThrow(panelPayload),
        decoratePayload: false,
      })
    }),
  )

  const taskIds = tasks.map((task) => task.taskId)
  const mutationBatch = await createMutationBatch({
    projectId: params.ctx.projectId,
    userId: params.ctx.userId,
    source: params.ctx.source,
    operationId: params.operationId,
    episodeId,
    summary: `${params.operationId}:${episodeId}:batch`,
    entries: panels.map((panel) => ({
      kind: 'panel_video_restore',
      targetType: 'ProjectPanel',
      targetId: panel.id,
      payload: {
        previousVideoUrl: panel.videoUrl ?? null,
        previousLastVideoGenerationOptions: panel.lastVideoGenerationOptions ?? null,
      },
    })),
  })
  writeOperationDataPart<TaskBatchSubmittedPartData>(params.ctx.writer, 'data-task-batch-submitted', {
    operationId: params.operationId,
    total: tasks.length,
    taskIds,
    results: panels.map((panel, index) => ({ refId: panel.id, taskId: taskIds[index] || '' })),
    mutationBatchId: mutationBatch.id,
  })

  return {
    success: true,
    async: true,
    tasks,
    total: tasks.length,
    taskIds,
    results: panels.map((panel, index) => ({ refId: panel.id, taskId: taskIds[index] || '' })),
    mutationBatchId: mutationBatch.id,
  }
}

function parseShotNumbersJson(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'number' ? item : Number(item)))
    .filter((item) => Number.isInteger(item) && item > 0)
}

function sameShotNumbers(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

async function findExistingVideoGroup(params: {
  episodeId: string
  gridMode: string
  shotNumbers: readonly number[]
}) {
  const candidates = await prisma.projectVideoGroup.findMany({
    where: {
      episodeId: params.episodeId,
      gridMode: params.gridMode,
    },
    select: {
      id: true,
      status: true,
      taskId: true,
      errorCode: true,
      errorMessage: true,
      referenceImageUrl: true,
      referenceImageMediaId: true,
      videoUrl: true,
      videoMediaId: true,
      shotNumbers: true,
    },
  })
  return candidates.find((candidate) => sameShotNumbers(parseShotNumbersJson(candidate.shotNumbers), params.shotNumbers)) ?? null
}

function parseEditScriptShots(value: unknown): VideoGroupShot[] {
  if (!Array.isArray(value)) throw new Error('PROJECT_AGENT_EDIT_SCRIPT_SHOTS_INVALID')
  return value.map((item) => {
    if (!isRecord(item)) throw new Error('PROJECT_AGENT_EDIT_SCRIPT_SHOT_INVALID')
    const shotNumber = Number(item.shotNumber)
    const durationSec = Number(item.durationSec)
    if (!Number.isInteger(shotNumber) || shotNumber <= 0) throw new Error('PROJECT_AGENT_EDIT_SCRIPT_SHOT_NUMBER_INVALID')
    if (!Number.isInteger(durationSec) || durationSec < 1 || durationSec > 5) throw new Error('PROJECT_AGENT_EDIT_SCRIPT_SHOT_DURATION_INVALID')
    return {
      shotNumber,
      durationSec,
      visualAction: normalizeString(item.visualAction),
      charactersAndScene: normalizeString(item.charactersAndScene),
      camera: normalizeString(item.camera),
      videoPrompt: normalizeString(item.videoPrompt),
      sound: normalizeString(item.sound),
    }
  })
}

async function buildEpisodeVideoBlockPlan(params: {
  ctx: ProjectAgentOperationContext
  episodeId: string
}): Promise<{
  readonly editScript: {
    readonly title: string
    readonly logline: string | null
    readonly shotsJson: Prisma.JsonValue
    readonly videoBlocksJson: Prisma.JsonValue | null
  }
  readonly shots: readonly VideoGroupShot[]
  readonly plan: VideoBlockPlan
}> {
  const editScript = await prisma.projectEditScript.findFirst({
    where: { projectId: params.ctx.projectId, episodeId: params.episodeId },
    select: {
      title: true,
      logline: true,
      shotsJson: true,
      videoBlocksJson: true,
    },
  })
  if (!editScript) throw new Error('PROJECT_AGENT_EDIT_SCRIPT_REQUIRED')
  if (!Array.isArray(editScript.videoBlocksJson) || editScript.videoBlocksJson.length === 0) {
    throw new Error('PROJECT_AGENT_VIDEO_BLOCKS_REQUIRED')
  }
  const shots = parseEditScriptShots(editScript.shotsJson)
  if (shots.length === 0) throw new Error('PROJECT_AGENT_EDIT_SCRIPT_SHOTS_EMPTY')

  return {
    editScript,
    shots,
    plan: normalizeVideoBlockPlanResponse({
      response: { items: editScript.videoBlocksJson },
      allShotNumbers: shots.map((shot) => shot.shotNumber),
      shots,
    }),
  }
}

async function resolvePanelIdForVideoBlockShot(params: {
  episodeId: string
  shotNumber: number
}): Promise<string> {
  const panel = await prisma.projectPanel.findFirst({
    where: {
      storyboard: { episodeId: params.episodeId },
      panelNumber: params.shotNumber,
    },
    select: {
      id: true,
      imageUrl: true,
      imageMediaId: true,
    },
  })
  if (!panel) throw new Error(`PROJECT_AGENT_AUTO_VIDEO_PANEL_NOT_FOUND:${params.shotNumber}`)
  if (!panel.imageUrl && !panel.imageMediaId) {
    throw new Error(`PROJECT_AGENT_AUTO_VIDEO_PANEL_IMAGE_MISSING:${params.shotNumber}`)
  }
  return panel.id
}

async function resolveVideoGroupInput(params: {
  projectId: string
  episodeId: string
  gridMode: VideoGridMode
  shotNumbers: readonly number[]
}) {
  const shotNumbers = validateVideoGroupShotNumbers({
    gridMode: params.gridMode,
    shotNumbers: params.shotNumbers,
  })
  const [episode, editScript, panels] = await Promise.all([
    prisma.projectEpisode.findFirst({
      where: { id: params.episodeId, projectId: params.projectId },
      select: { id: true },
    }),
    prisma.projectEditScript.findFirst({
      where: { episodeId: params.episodeId, projectId: params.projectId },
      select: { id: true, title: true, logline: true, shotsJson: true },
    }),
    prisma.projectPanel.findMany({
      where: {
        storyboard: { episodeId: params.episodeId },
        panelNumber: { in: shotNumbers },
      },
      select: {
        id: true,
        panelNumber: true,
        imageUrl: true,
        imageMediaId: true,
      },
    }),
  ])
  if (!episode) throw new Error('PROJECT_AGENT_EPISODE_NOT_FOUND')
  if (!editScript) throw new Error('PROJECT_AGENT_EDIT_SCRIPT_REQUIRED')
  const shots = parseEditScriptShots(editScript.shotsJson)
  const selectedShots = shotNumbers.map((shotNumber) => {
    const shot = shots.find((item) => item.shotNumber === shotNumber)
    if (!shot) throw new Error(`PROJECT_AGENT_VIDEO_GROUP_SHOT_NOT_FOUND:${shotNumber}`)
    return shot
  })
  const panelByShotNumber = new Map<number, (typeof panels)[number]>()
  panels.forEach((panel) => {
    if (typeof panel.panelNumber === 'number') panelByShotNumber.set(panel.panelNumber, panel)
  })
  shotNumbers.forEach((shotNumber) => {
    const panel = panelByShotNumber.get(shotNumber)
    if (!panel) throw new Error(`PROJECT_AGENT_VIDEO_GROUP_PANEL_NOT_FOUND:${shotNumber}`)
    if (!panel.imageUrl && !panel.imageMediaId) throw new Error(`PROJECT_AGENT_VIDEO_GROUP_PANEL_IMAGE_MISSING:${shotNumber}`)
  })
  return {
    editScript,
    shotNumbers,
    selectedShots,
  }
}

async function upsertVideoGroupForTask(params: {
  projectId: string
  episodeId: string
  gridMode: string
  shotNumbers: readonly number[]
  durationSec: number
  clearReferenceImage?: boolean
}) {
  const existing = await findExistingVideoGroup({
    episodeId: params.episodeId,
    gridMode: params.gridMode,
    shotNumbers: params.shotNumbers,
  })
  if (existing) {
    await prisma.projectVideoGroup.update({
      where: { id: existing.id },
      data: {
        durationSec: params.durationSec,
        status: 'queued',
        taskId: null,
        errorCode: null,
        errorMessage: null,
        ...(params.clearReferenceImage ? {
          referenceImageUrl: null,
          referenceImageMediaId: null,
        } : {}),
      },
    })
    return { groupId: existing.id, previous: existing }
  }
  const created = await prisma.projectVideoGroup.create({
    data: {
      projectId: params.projectId,
      episodeId: params.episodeId,
      gridMode: params.gridMode,
      shotNumbers: params.shotNumbers as unknown as Prisma.InputJsonValue,
      durationSec: params.durationSec,
      status: 'queued',
    },
    select: { id: true },
  })
  return { groupId: created.id, previous: null }
}

function validateAssetReferenceShotNumbers(shotNumbers: readonly number[]): number[] {
  const normalized = shotNumbers.map((value) => Number(value))
  if (normalized.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error('PROJECT_AGENT_ASSET_REFERENCE_SHOT_NUMBERS_INVALID')
  }
  if (normalized.length < 1 || normalized.length > 9) {
    throw new Error(`PROJECT_AGENT_ASSET_REFERENCE_SHOT_COUNT_UNSUPPORTED:${normalized.length}`)
  }
  normalized.forEach((shotNumber, index) => {
    if (index === 0) return
    if (shotNumber !== normalized[index - 1] + 1) {
      throw new Error('PROJECT_AGENT_ASSET_REFERENCE_SHOT_NUMBERS_NOT_CONTINUOUS')
    }
  })
  return normalized
}

function durationForShotNumbers(shots: readonly VideoGroupShot[], shotNumbers: readonly number[]): number {
  return shotNumbers.reduce((total, shotNumber) => {
    const shot = shots.find((item) => item.shotNumber === shotNumber)
    if (!shot) throw new Error(`PROJECT_AGENT_ASSET_REFERENCE_SHOT_NOT_FOUND:${shotNumber}`)
    return total + shot.durationSec
  }, 0)
}

function gridModeForAssetReferenceItem(item: VideoBlockPlanItem): string {
  if (item.kind === 'group') return item.gridMode ?? ASSET_REFERENCE_GRID_MODE
  return ASSET_REFERENCE_GRID_MODE
}

async function submitAssetReferenceVideoBlockTask(params: {
  ctx: ProjectAgentOperationContext
  input: UnknownObject
  operationId: string
  episodeId: string
  item: VideoBlockPlanItem
  shots?: readonly VideoGroupShot[]
}) {
  const referenceImageUrls = normalizeStringList(params.input.referenceImageUrls)
  if (referenceImageUrls.length === 0) {
    throw new Error('PROJECT_AGENT_ASSET_REFERENCE_IMAGES_REQUIRED')
  }
  const shotNumbers = validateAssetReferenceShotNumbers(params.item.shotNumbers)
  const shots = params.shots ?? (await buildEpisodeVideoBlockPlan({
    ctx: params.ctx,
    episodeId: params.episodeId,
  })).shots
  const durationSec = durationForShotNumbers(shots, shotNumbers)
  if (durationSec < 1 || durationSec > 15) {
    throw new Error(`PROJECT_AGENT_ASSET_REFERENCE_DURATION_UNSUPPORTED:${durationSec}`)
  }

  const { payload, localeForTask } = buildVideoTaskPayload({ ctx: params.ctx, input: params.input })
  applySystemVideoDuration(payload, durationSec)
  payload.episodeId = params.episodeId
  payload.gridMode = gridModeForAssetReferenceItem(params.item)
  payload.shotNumbers = shotNumbers
  payload.durationSec = durationSec
  payload.sourceMode = 'asset_reference'
  payload.prompt = params.item.prompt
  payload.referenceImageUrls = referenceImageUrls

  await validateVideoTaskPayloadOrThrow({
    payload,
    projectId: params.ctx.projectId,
    userId: params.ctx.userId,
  })

  const { groupId, previous } = await upsertVideoGroupForTask({
    projectId: params.ctx.projectId,
    episodeId: params.episodeId,
    gridMode: String(payload.gridMode),
    shotNumbers,
    durationSec,
    clearReferenceImage: true,
  })

  try {
    const result = await submitOperationTask({
      request: params.ctx.request,
      userId: params.ctx.userId,
      locale: localeForTask,
      projectId: params.ctx.projectId,
      episodeId: params.episodeId,
      type: TASK_TYPE.VIDEO_GROUP,
      targetType: 'ProjectVideoGroup',
      targetId: groupId,
      operationId: params.operationId,
      source: params.ctx.source,
      confirmed: params.input.confirmed === true,
      payload: withTaskUiPayload(payload, {
        hasOutputAtStart: await hasVideoGroupOutput(groupId),
      }),
      dedupeKey: `video_group:${groupId}`,
      billingInfo: buildVideoGroupBillingInfoOrThrow(payload),
      decoratePayload: false,
    })
    await prisma.projectVideoGroup.update({
      where: { id: groupId },
      data: {
        taskId: result.taskId,
        status: result.status,
        prompt: params.item.prompt,
        referenceImageUrl: referenceImageUrls[0] ?? null,
        referenceImageMediaId: null,
      },
    })
    return {
      result,
      groupId,
      durationSec,
      shotNumbers,
    }
  } catch (error) {
    await rollbackVideoGroupTaskRecord({ groupId, previous })
    throw error
  }
}

async function rollbackVideoGroupTaskRecord(params: {
  groupId: string
  previous: Awaited<ReturnType<typeof findExistingVideoGroup>> | null
}) {
  if (!params.previous) {
    await prisma.projectVideoGroup.delete({ where: { id: params.groupId } }).catch(() => undefined)
    return
  }
  await prisma.projectVideoGroup.update({
    where: { id: params.groupId },
    data: {
      status: params.previous.status,
      taskId: params.previous.taskId,
      errorCode: params.previous.errorCode,
      errorMessage: params.previous.errorMessage,
      referenceImageUrl: params.previous.referenceImageUrl,
      referenceImageMediaId: params.previous.referenceImageMediaId,
      videoUrl: params.previous.videoUrl,
      videoMediaId: params.previous.videoMediaId,
    },
  }).catch(() => undefined)
}

async function submitVideoGroupTask(params: {
  ctx: ProjectAgentOperationContext
  input: UnknownObject
  operationId: string
  episodeId: string
  gridMode: VideoGridMode
  shotNumbers: readonly number[]
}) {
  const resolved = await resolveVideoGroupInput({
    projectId: params.ctx.projectId,
    episodeId: params.episodeId,
    gridMode: params.gridMode,
    shotNumbers: params.shotNumbers,
  })
  const durationSec = totalVideoGroupDuration(resolved.selectedShots)
  const { payload, localeForTask } = buildVideoTaskPayload({ ctx: params.ctx, input: params.input })
  applySystemVideoDuration(payload, durationSec)
  payload.episodeId = params.episodeId
  payload.gridMode = params.gridMode
  payload.shotNumbers = resolved.shotNumbers
  payload.durationSec = durationSec

  await validateVideoTaskPayloadOrThrow({
    payload,
    projectId: params.ctx.projectId,
    userId: params.ctx.userId,
  })

  const { groupId, previous } = await upsertVideoGroupForTask({
    projectId: params.ctx.projectId,
    episodeId: params.episodeId,
    gridMode: params.gridMode,
    shotNumbers: resolved.shotNumbers,
    durationSec,
  })

  try {
    const result = await submitOperationTask({
      request: params.ctx.request,
      userId: params.ctx.userId,
      locale: localeForTask,
      projectId: params.ctx.projectId,
      episodeId: params.episodeId,
      type: TASK_TYPE.VIDEO_GROUP,
      targetType: 'ProjectVideoGroup',
      targetId: groupId,
      operationId: params.operationId,
      source: params.ctx.source,
      confirmed: params.input.confirmed === true,
      payload: withTaskUiPayload(payload, {
        hasOutputAtStart: await hasVideoGroupOutput(groupId),
      }),
      dedupeKey: `video_group:${groupId}`,
      billingInfo: buildVideoGroupBillingInfoOrThrow(payload),
      decoratePayload: false,
    })
    await prisma.projectVideoGroup.update({
      where: { id: groupId },
      data: {
        taskId: result.taskId,
        status: result.status,
      },
    })
    return {
      result,
      groupId,
      durationSec,
      shotNumbers: resolved.shotNumbers,
    }
  } catch (error) {
    await rollbackVideoGroupTaskRecord({ groupId, previous })
    throw error
  }
}

async function executeGenerateVideoGroupOperation(params: {
  ctx: ProjectAgentOperationContext
  input: UnknownObject
  operationId: string
}) {
  const episodeId = normalizeString(params.input.episodeId) || normalizeString(params.ctx.context.episodeId)
  if (!episodeId) throw new Error('PROJECT_AGENT_EPISODE_REQUIRED')
  const gridMode = params.input.gridMode === '3x3' ? '3x3' : '2x2'
  const shotNumbers = Array.isArray(params.input.shotNumbers)
    ? params.input.shotNumbers.map((value) => Number(value))
    : []
  const submitted = await submitVideoGroupTask({
    ctx: params.ctx,
    input: params.input,
    operationId: params.operationId,
    episodeId,
    gridMode,
    shotNumbers,
  })
  writeOperationDataPart<TaskSubmittedPartData>(params.ctx.writer, 'data-task-submitted', {
    operationId: params.operationId,
    taskId: submitted.result.taskId,
    status: submitted.result.status,
    runId: submitted.result.runId || null,
    deduped: submitted.result.deduped,
  })
  return {
    ...submitted.result,
    groupId: submitted.groupId,
    episodeId,
    gridMode,
    shotNumbers: submitted.shotNumbers,
    durationSec: submitted.durationSec,
  }
}

async function executeGenerateEpisodeVideoGroupsOperation(params: {
  ctx: ProjectAgentOperationContext
  input: UnknownObject
  operationId: string
}) {
  const episodeId = normalizeString(params.input.episodeId) || normalizeString(params.ctx.context.episodeId)
  if (!episodeId) throw new Error('PROJECT_AGENT_EPISODE_REQUIRED')
  const gridMode = params.input.gridMode === '3x3' ? '3x3' : '2x2'
  const editScript = await prisma.projectEditScript.findFirst({
    where: { episodeId, projectId: params.ctx.projectId },
    select: { shotsJson: true },
  })
  if (!editScript) throw new Error('PROJECT_AGENT_EDIT_SCRIPT_REQUIRED')
  const shots = parseEditScriptShots(editScript.shotsJson)
  const chunks = chunkVideoGroupShots({
    gridMode,
    shotNumbers: shots.map((shot) => shot.shotNumber),
  })
  if (chunks.length === 0) {
    return {
      success: true,
      async: true,
      total: 0,
      taskIds: [],
      results: [],
      noop: true,
      reason: '没有足够镜头组成连续视频片段',
    }
  }

  const submitted = []
  for (const shotNumbers of chunks) {
    submitted.push(await submitVideoGroupTask({
      ctx: params.ctx,
      input: params.input,
      operationId: params.operationId,
      episodeId,
      gridMode,
      shotNumbers,
    }))
  }
  const taskIds = submitted.map((item) => item.result.taskId)
  writeOperationDataPart<TaskBatchSubmittedPartData>(params.ctx.writer, 'data-task-batch-submitted', {
    operationId: params.operationId,
    total: submitted.length,
    taskIds,
    results: submitted.map((item) => ({ refId: item.groupId, taskId: item.result.taskId })),
  })
  return {
    success: true,
    async: true,
    total: submitted.length,
    taskIds,
    results: submitted.map((item) => ({
      refId: item.groupId,
      taskId: item.result.taskId,
      shotNumbers: item.shotNumbers,
      durationSec: item.durationSec,
    })),
    gridMode,
  }
}

async function executeGenerateEpisodeVideosAutoOperation(params: {
  ctx: ProjectAgentOperationContext
  input: UnknownObject
  operationId: string
}) {
  const episodeId = normalizeString(params.input.episodeId) || normalizeString(params.ctx.context.episodeId)
  if (!episodeId) throw new Error('PROJECT_AGENT_EPISODE_REQUIRED')

  const singleVideoModel = normalizeString(params.input.videoModel)
  if (!singleVideoModel) throw new Error('PROJECT_AGENT_VIDEO_MODEL_REQUIRED')
  const groupVideoModel = normalizeString(params.input.groupVideoModel) || DEFAULT_GROUP_VIDEO_MODEL
  const planned = await buildEpisodeVideoBlockPlan({
    ctx: params.ctx,
    episodeId,
  })

  const submitted: Array<{
    readonly refId: string
    readonly taskId: string
    readonly kind: VideoBlockPlanItem['kind']
    readonly shotNumbers: readonly number[]
    readonly durationSec?: number
  }> = []
  const taskIds: string[] = []

  for (const item of planned.plan.items) {
    if (item.kind === 'single') {
      const panelId = await resolvePanelIdForVideoBlockShot({
        episodeId,
        shotNumber: item.shotNumbers[0],
      })
      const singleResult = await executeGeneratePanelVideoOperation({
        ctx: params.ctx,
        input: {
          confirmed: params.input.confirmed,
          panelId,
          videoModel: singleVideoModel,
          customPrompt: item.prompt,
          generationOptions: params.input.generationOptions,
        },
        operationId: params.operationId,
      })
      const taskId = normalizeString(singleResult.taskId)
      taskIds.push(taskId)
      submitted.push({
        refId: panelId,
        taskId,
        kind: 'single',
        shotNumbers: item.shotNumbers,
      })
      continue
    }

    if (!item.gridMode) throw new Error('PROJECT_AGENT_AUTO_VIDEO_GROUP_GRID_MODE_REQUIRED')
    const groupResult = await submitVideoGroupTask({
      ctx: params.ctx,
      input: {
        confirmed: params.input.confirmed,
        videoModel: groupVideoModel,
        generationOptions: params.input.generationOptions,
      },
      operationId: params.operationId,
      episodeId,
      gridMode: item.gridMode,
      shotNumbers: item.shotNumbers,
    })
    taskIds.push(groupResult.result.taskId)
    submitted.push({
      refId: groupResult.groupId,
      taskId: groupResult.result.taskId,
      kind: 'group',
      shotNumbers: groupResult.shotNumbers,
      durationSec: groupResult.durationSec,
    })
  }

  writeOperationDataPart<TaskBatchSubmittedPartData>(params.ctx.writer, 'data-task-batch-submitted', {
    operationId: params.operationId,
    total: submitted.length,
    taskIds,
    results: submitted.map((item) => ({ refId: item.refId, taskId: item.taskId })),
  })

  return {
    success: true,
    async: true,
    total: submitted.length,
    taskIds,
    results: submitted,
    plan: planned.plan,
    singleVideoModel,
    groupVideoModel,
  }
}

async function executeGenerateAssetReferenceVideoOperation(params: {
  ctx: ProjectAgentOperationContext
  input: UnknownObject
  operationId: string
}) {
  const episodeId = normalizeString(params.input.episodeId) || normalizeString(params.ctx.context.episodeId)
  if (!episodeId) throw new Error('PROJECT_AGENT_EPISODE_REQUIRED')
  const blockIndex = typeof params.input.blockIndex === 'number' && Number.isInteger(params.input.blockIndex)
    ? params.input.blockIndex
    : -1
  if (blockIndex < 0) throw new Error('PROJECT_AGENT_ASSET_REFERENCE_BLOCK_REQUIRED')
  const planned = await buildEpisodeVideoBlockPlan({
    ctx: params.ctx,
    episodeId,
  })
  const item = planned.plan.items[blockIndex]
  if (!item) throw new Error(`PROJECT_AGENT_ASSET_REFERENCE_BLOCK_NOT_FOUND:${blockIndex}`)

  const submitted = await submitAssetReferenceVideoBlockTask({
    ctx: params.ctx,
    input: params.input,
    operationId: params.operationId,
    episodeId,
    item,
    shots: planned.shots,
  })
  writeOperationDataPart<TaskSubmittedPartData>(params.ctx.writer, 'data-task-submitted', {
    operationId: params.operationId,
    taskId: submitted.result.taskId,
    status: submitted.result.status,
    runId: submitted.result.runId || null,
    deduped: submitted.result.deduped,
  })
  return {
    ...submitted.result,
    groupId: submitted.groupId,
    episodeId,
    sourceMode: 'asset_reference',
    blockIndex,
    shotNumbers: submitted.shotNumbers,
    durationSec: submitted.durationSec,
  }
}

async function executeGenerateEpisodeAssetReferenceVideosOperation(params: {
  ctx: ProjectAgentOperationContext
  input: UnknownObject
  operationId: string
}) {
  const episodeId = normalizeString(params.input.episodeId) || normalizeString(params.ctx.context.episodeId)
  if (!episodeId) throw new Error('PROJECT_AGENT_EPISODE_REQUIRED')
  const planned = await buildEpisodeVideoBlockPlan({
    ctx: params.ctx,
    episodeId,
  })

  const submitted = []
  for (const item of planned.plan.items) {
    submitted.push(await submitAssetReferenceVideoBlockTask({
      ctx: params.ctx,
      input: params.input,
      operationId: params.operationId,
      episodeId,
      item,
      shots: planned.shots,
    }))
  }
  const taskIds = submitted.map((item) => item.result.taskId)
  writeOperationDataPart<TaskBatchSubmittedPartData>(params.ctx.writer, 'data-task-batch-submitted', {
    operationId: params.operationId,
    total: submitted.length,
    taskIds,
    results: submitted.map((item) => ({ refId: item.groupId, taskId: item.result.taskId })),
  })

  return {
    success: true,
    async: true,
    total: submitted.length,
    taskIds,
    results: submitted.map((item) => ({
      refId: item.groupId,
      taskId: item.result.taskId,
      shotNumbers: item.shotNumbers,
      durationSec: item.durationSec,
    })),
    sourceMode: 'asset_reference',
  }
}

async function executeGeneratePanelVideoOperation(params: {
  ctx: ProjectAgentOperationContext
  input: UnknownObject
  operationId: string
}) {
  const { payload, localeForTask } = buildVideoTaskPayload({ ctx: params.ctx, input: params.input })
  let panelId = normalizeString(payload.panelId)
  let previousVideoUrl: string | null = null
  let previousLastVideoGenerationOptions: unknown = null
  let episodeId: string | null = null
  if (!panelId) {
    const storyboardId = normalizeString(payload.storyboardId)
    const panelIndex = typeof payload.panelIndex === 'number' ? payload.panelIndex : NaN
    if (!storyboardId || !Number.isFinite(panelIndex)) {
      throw new Error('PROJECT_AGENT_PANEL_REQUIRED')
    }
    const panel = await prisma.projectPanel.findFirst({
      where: { storyboardId, panelIndex: Number(panelIndex) },
      select: { id: true, videoUrl: true, duration: true, lastVideoGenerationOptions: true, storyboard: { select: { episodeId: true } } },
    })
    panelId = panel?.id || ''
    previousVideoUrl = panel?.videoUrl ?? null
    previousLastVideoGenerationOptions = panel?.lastVideoGenerationOptions ?? null
    episodeId = panel?.storyboard.episodeId ?? null
    if (panel) applySystemVideoDuration(payload, requirePanelSystemVideoDurationSec(panel.id, panel.duration))
  }
  if (!panelId) {
    throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
  }
  if (normalizeString(payload.panelId)) {
    const panel = await prisma.projectPanel.findUnique({
      where: { id: panelId },
      select: { videoUrl: true, duration: true, lastVideoGenerationOptions: true, storyboard: { select: { episodeId: true } } },
    })
    if (!panel) {
      throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
    }
    previousVideoUrl = panel.videoUrl ?? null
    previousLastVideoGenerationOptions = panel.lastVideoGenerationOptions ?? null
    episodeId = panel.storyboard.episodeId
    applySystemVideoDuration(payload, requirePanelSystemVideoDurationSec(panelId, panel.duration))
  }

  await validateVideoTaskPayloadOrThrow({
    payload,
    projectId: params.ctx.projectId,
    userId: params.ctx.userId,
    lastVideoGenerationOptions: previousLastVideoGenerationOptions,
  })

  const result = await submitOperationTask({
    request: params.ctx.request,
    userId: params.ctx.userId,
    locale: localeForTask,
    projectId: params.ctx.projectId,
    type: TASK_TYPE.VIDEO_PANEL,
    targetType: 'ProjectPanel',
    targetId: panelId,
    operationId: params.operationId,
    source: params.ctx.source,
    confirmed: params.input.confirmed === true,
    payload: withTaskUiPayload(payload, {
      hasOutputAtStart: await hasPanelVideoOutput(panelId),
    }),
    dedupeKey: `video_panel:${panelId}`,
    billingInfo: buildVideoPanelBillingInfoOrThrow(payload),
    decoratePayload: false,
  })

  const mutationBatch = await createMutationBatch({
    projectId: params.ctx.projectId,
    userId: params.ctx.userId,
    source: params.ctx.source,
    operationId: params.operationId,
    episodeId,
    summary: `${params.operationId}:${panelId}`,
    entries: [
      {
        kind: 'panel_video_restore',
        targetType: 'ProjectPanel',
        targetId: panelId,
        payload: {
          previousVideoUrl,
          previousLastVideoGenerationOptions,
        },
      },
    ],
  })

  writeOperationDataPart<TaskSubmittedPartData>(params.ctx.writer, 'data-task-submitted', {
    operationId: params.operationId,
    taskId: result.taskId,
    status: result.status,
    runId: result.runId || null,
    deduped: result.deduped,
    mutationBatchId: mutationBatch.id,
  })

  return {
    ...result,
    panelId,
    mutationBatchId: mutationBatch.id,
  }
}

const generatePanelVideoInputSchema = z.object({
  confirmed: z.boolean().optional(),
  panelId: z.string().min(1).optional(),
  storyboardId: z.string().min(1).optional(),
  panelIndex: z.number().int().min(0).max(2000).optional(),
  videoModel: z.string().min(1),
  firstLastFrame: z.unknown().optional(),
  generationOptions: z.record(z.unknown()).optional(),
}).passthrough().refine((value) => Boolean(value.panelId || (value.storyboardId && typeof value.panelIndex === 'number')), {
  message: 'panelId or (storyboardId + panelIndex) is required',
  path: ['panelId'],
})

const generateEpisodeVideosInputSchema = z.object({
  confirmed: z.boolean().optional(),
  episodeId: z.string().min(1).optional(),
  limit: z.number().int().positive().max(50).optional(),
  videoModel: z.string().min(1),
  firstLastFrame: z.unknown().optional(),
  generationOptions: z.record(z.unknown()).optional(),
}).passthrough()

const generateVideoGroupInputSchema = z.object({
  confirmed: z.boolean().optional(),
  episodeId: z.string().min(1).optional(),
  gridMode: z.enum(VIDEO_GRID_MODES),
  shotNumbers: z.array(z.number().int().positive()).min(1).max(9),
  videoModel: z.string().min(1),
  generationOptions: z.record(z.unknown()).optional(),
}).passthrough()

const generateEpisodeVideoGroupsInputSchema = z.object({
  confirmed: z.boolean().optional(),
  episodeId: z.string().min(1).optional(),
  gridMode: z.enum(VIDEO_GRID_MODES),
  videoModel: z.string().min(1),
  generationOptions: z.record(z.unknown()).optional(),
}).passthrough()

const generateEpisodeVideosAutoInputSchema = z.object({
  confirmed: z.boolean().optional(),
  episodeId: z.string().min(1).optional(),
  videoModel: z.string().min(1),
  groupVideoModel: z.string().min(1).optional(),
  generationOptions: z.record(z.unknown()).optional(),
}).passthrough()

const generateAssetReferenceVideoInputSchema = z.object({
  confirmed: z.boolean().optional(),
  episodeId: z.string().min(1).optional(),
  blockIndex: z.number().int().min(0).max(59),
  videoModel: z.string().min(1),
  referenceImageUrls: z.array(z.string().trim().min(1)).min(1).max(8),
  generationOptions: z.record(z.unknown()).optional(),
}).passthrough()

const generateEpisodeAssetReferenceVideosInputSchema = z.object({
  confirmed: z.boolean().optional(),
  episodeId: z.string().min(1).optional(),
  videoModel: z.string().min(1),
  referenceImageUrls: z.array(z.string().trim().min(1)).min(1).max(8),
  generationOptions: z.record(z.unknown()).optional(),
}).passthrough()

export function createVideoGenerationOperations(): ProjectAgentOperationRegistryDraft {
  const generatePanelVideoOutputSchema = refineTaskSubmitOperationOutputSchema(
    taskSubmitOperationOutputSchemaBase.extend({
      mutationBatchId: z.string().min(1),
      panelId: z.string().min(1),
    }).passthrough(),
  )

  const generateEpisodeVideosOutputSchema = refineTaskBatchSubmitOperationOutputSchema(
    taskBatchSubmitOperationOutputSchemaBase.extend({
      results: z.array(z.object({
        refId: z.string().min(1),
        taskId: z.string().min(1),
      })),
    }).passthrough(),
  )

  const generateVideoGroupOutputSchema = refineTaskSubmitOperationOutputSchema(
    taskSubmitOperationOutputSchemaBase.extend({
      groupId: z.string().min(1),
      episodeId: z.string().min(1),
      gridMode: z.enum(VIDEO_GRID_MODES),
      shotNumbers: z.array(z.number().int().positive()),
      durationSec: z.number().int().positive(),
    }).passthrough(),
  )

  const generateEpisodeVideoGroupsOutputSchema = refineTaskBatchSubmitOperationOutputSchema(
    taskBatchSubmitOperationOutputSchemaBase.extend({
      results: z.array(z.object({
        refId: z.string().min(1),
        taskId: z.string().min(1),
        shotNumbers: z.array(z.number().int().positive()),
        durationSec: z.number().int().positive(),
      })),
      gridMode: z.enum(VIDEO_GRID_MODES),
    }).passthrough(),
  )

  const generateEpisodeVideosAutoOutputSchema = refineTaskBatchSubmitOperationOutputSchema(
    taskBatchSubmitOperationOutputSchemaBase.extend({
      results: z.array(z.object({
        refId: z.string().min(1),
        taskId: z.string().min(1),
        kind: z.enum(['single', 'group']),
        shotNumbers: z.array(z.number().int().positive()),
        durationSec: z.number().int().positive().optional(),
      })),
      singleVideoModel: z.string().min(1),
      groupVideoModel: z.string().min(1),
      plan: z.object({
        items: z.array(z.object({
          kind: z.enum(['single', 'group']),
          shotNumbers: z.array(z.number().int().positive()),
          gridMode: z.enum(VIDEO_GRID_MODES).optional(),
          reason: z.string().min(1),
          prompt: z.string().min(1),
        })),
      }),
    }).passthrough(),
  )

  const generateAssetReferenceVideoOutputSchema = refineTaskSubmitOperationOutputSchema(
    taskSubmitOperationOutputSchemaBase.extend({
      groupId: z.string().min(1),
      episodeId: z.string().min(1),
      sourceMode: z.literal('asset_reference'),
      blockIndex: z.number().int().min(0),
      shotNumbers: z.array(z.number().int().positive()),
      durationSec: z.number().int().positive(),
    }).passthrough(),
  )

  const generateEpisodeAssetReferenceVideosOutputSchema = refineTaskBatchSubmitOperationOutputSchema(
    taskBatchSubmitOperationOutputSchemaBase.extend({
      results: z.array(z.object({
        refId: z.string().min(1),
        taskId: z.string().min(1),
        shotNumbers: z.array(z.number().int().positive()),
        durationSec: z.number().int().positive(),
      })),
      sourceMode: z.literal('asset_reference'),
    }).passthrough(),
  )

  return {
    generate_panel_video: defineOperation({
      id: 'generate_panel_video',
      summary: 'Generate video for a single storyboard panel.',
      intent: 'act',
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将为单个分镜格生成视频（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: generatePanelVideoInputSchema,
      outputSchema: generatePanelVideoOutputSchema,
      execute: async (ctx, input) => executeGeneratePanelVideoOperation({
        ctx,
        input: input as UnknownObject,
        operationId: 'generate_panel_video',
      }),
    }),

    generate_episode_videos: defineOperation({
      id: 'generate_episode_videos',
      summary: 'Batch generate videos for pending panels in an episode.',
      intent: 'act',
      prerequisites: { episodeId: 'required' },
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: true,
        bulk: true,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将为整集待生成分镜批量生成视频（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: generateEpisodeVideosInputSchema,
      outputSchema: generateEpisodeVideosOutputSchema,
      execute: async (ctx, input) => executeGenerateEpisodeVideosOperation({
        ctx,
        input: input as UnknownObject,
        operationId: 'generate_episode_videos',
      }),
    }),

    generate_video_group: defineOperation({
      id: 'generate_video_group',
      summary: 'Generate one continuous video segment from ordered storyboard reference images.',
      intent: 'act',
      prerequisites: { episodeId: 'required' },
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将使用一组有序分镜参考图生成连续视频片段（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: generateVideoGroupInputSchema,
      outputSchema: generateVideoGroupOutputSchema,
      execute: async (ctx, input) => executeGenerateVideoGroupOperation({
        ctx,
        input: input as UnknownObject,
        operationId: 'generate_video_group',
      }),
    }),

    generate_episode_video_groups: defineOperation({
      id: 'generate_episode_video_groups',
      summary: 'Batch generate continuous video segments for an episode.',
      intent: 'act',
      prerequisites: { episodeId: 'required' },
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: true,
        bulk: true,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将按剪辑先行顺序批量生成连续视频片段（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: generateEpisodeVideoGroupsInputSchema,
      outputSchema: generateEpisodeVideoGroupsOutputSchema,
      execute: async (ctx, input) => executeGenerateEpisodeVideoGroupsOperation({
        ctx,
        input: input as UnknownObject,
        operationId: 'generate_episode_video_groups',
      }),
    }),

    generate_episode_videos_auto: defineOperation({
      id: 'generate_episode_videos_auto',
      summary: 'Generate episode videos from edit-first videoBlocks, using single-shot tasks and Seedance 2.0 continuous groups.',
      intent: 'act',
      prerequisites: { episodeId: 'required' },
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: true,
        bulk: true,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将按剪辑先行表中的视频片段提交单镜头和 Seedance 2.0 连续片段任务（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: generateEpisodeVideosAutoInputSchema,
      outputSchema: generateEpisodeVideosAutoOutputSchema,
      execute: async (ctx, input) => executeGenerateEpisodeVideosAutoOperation({
        ctx,
        input: input as UnknownObject,
        operationId: 'generate_episode_videos_auto',
      }),
    }),

    generate_asset_reference_video: defineOperation({
      id: 'generate_asset_reference_video',
      summary: 'Generate one edit-first video block directly from reference assets and text prompt.',
      intent: 'act',
      prerequisites: { episodeId: 'required' },
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将使用参考资产图和剪辑先行提示词直接生成一个视频片段（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: generateAssetReferenceVideoInputSchema,
      outputSchema: generateAssetReferenceVideoOutputSchema,
      execute: async (ctx, input) => executeGenerateAssetReferenceVideoOperation({
        ctx,
        input: input as UnknownObject,
        operationId: 'generate_asset_reference_video',
      }),
    }),

    generate_episode_asset_reference_videos: defineOperation({
      id: 'generate_episode_asset_reference_videos',
      summary: 'Batch generate edit-first video blocks directly from reference assets and text prompts.',
      intent: 'act',
      prerequisites: { episodeId: 'required' },
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: true,
        bulk: true,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将使用参考资产图和剪辑先行提示词批量直接生成视频片段（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: generateEpisodeAssetReferenceVideosInputSchema,
      outputSchema: generateEpisodeAssetReferenceVideosOutputSchema,
      execute: async (ctx, input) => executeGenerateEpisodeAssetReferenceVideosOperation({
        ctx,
        input: input as UnknownObject,
        operationId: 'generate_episode_asset_reference_videos',
      }),
    }),
  }
}
ensureAiCatalogsRegistered()
