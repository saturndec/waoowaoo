import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { BillingOperationError } from '@/lib/billing/errors'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { createMutationBatch } from '@/lib/mutation-batch/service'
import { hasPanelVideoOutput } from '@/lib/task/has-output'
import { parseModelKeyStrict } from '@/lib/ai-registry/selection'
import type { CapabilityValue } from '@/lib/ai-registry/types'
import { ensureAiCatalogsRegistered } from '@/lib/ai-exec/catalog-bootstrap'
import { resolveAiVideoTokenPricingContract } from '@/lib/ai-exec/video-token-pricing'
import { resolveBuiltinCapabilitiesByModelKey } from '@/lib/ai-registry/capabilities-catalog'
import { resolveBuiltinPricing } from '@/lib/ai-registry/pricing-resolution'
import { resolveProjectModelCapabilityGenerationOptions } from '@/lib/config-service'
import type {
  TaskBatchSubmittedPartData,
  TaskSubmittedPartData,
} from '@/lib/project-agent/types'
import type { ProjectAgentOperationContext, ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { writeOperationDataPart } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'
import {
  refineTaskBatchSubmitOperationOutputSchema,
  refineTaskSubmitOperationOutputSchema,
  taskBatchSubmitOperationOutputSchemaBase,
  taskSubmitOperationOutputSchemaBase,
} from '@/lib/operations/output-schemas'

type UnknownObject = { [key: string]: unknown }

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
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

async function executeGenerateEpisodeVideosOperation(params: {
  ctx: ProjectAgentOperationContext
  input: UnknownObject
  operationId: string
}) {
  const { payload, localeForTask } = buildVideoTaskPayload({ ctx: params.ctx, input: params.input })
  await validateVideoTaskPayloadOrThrow({
    payload,
    projectId: params.ctx.projectId,
    userId: params.ctx.userId,
  })

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
    select: { id: true, videoUrl: true, lastVideoGenerationOptions: true },
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
    panels.map(async (panel) =>
      submitTask({
        userId: params.ctx.userId,
        locale: localeForTask,
        requestId: getRequestId(params.ctx.request),
        projectId: params.ctx.projectId,
        episodeId,
        type: TASK_TYPE.VIDEO_PANEL,
        targetType: 'ProjectPanel',
        targetId: panel.id,
        payload: withTaskUiPayload(payload, {
          hasOutputAtStart: await hasPanelVideoOutput(panel.id),
        }),
        dedupeKey: `video_panel:${panel.id}`,
        billingInfo: buildVideoPanelBillingInfoOrThrow(payload),
        operationId: params.operationId,
        operationSource: params.ctx.source,
        operationConfirmed: params.input.confirmed === true,
        operationRequestId: getRequestId(params.ctx.request),
      }),
    ),
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
      select: { id: true, videoUrl: true, lastVideoGenerationOptions: true, storyboard: { select: { episodeId: true } } },
    })
    panelId = panel?.id || ''
    previousVideoUrl = panel?.videoUrl ?? null
    previousLastVideoGenerationOptions = panel?.lastVideoGenerationOptions ?? null
    episodeId = panel?.storyboard.episodeId ?? null
  }
  if (!panelId) {
    throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
  }
  if (normalizeString(payload.panelId)) {
    const panel = await prisma.projectPanel.findUnique({
      where: { id: panelId },
      select: { videoUrl: true, lastVideoGenerationOptions: true, storyboard: { select: { episodeId: true } } },
    })
    if (!panel) {
      throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
    }
    previousVideoUrl = panel.videoUrl ?? null
    previousLastVideoGenerationOptions = panel.lastVideoGenerationOptions ?? null
    episodeId = panel.storyboard.episodeId
  }

  await validateVideoTaskPayloadOrThrow({
    payload,
    projectId: params.ctx.projectId,
    userId: params.ctx.userId,
    lastVideoGenerationOptions: previousLastVideoGenerationOptions,
  })

  const result = await submitTask({
    userId: params.ctx.userId,
    locale: localeForTask,
    requestId: getRequestId(params.ctx.request),
    projectId: params.ctx.projectId,
    type: TASK_TYPE.VIDEO_PANEL,
    targetType: 'ProjectPanel',
    targetId: panelId,
    payload: withTaskUiPayload(payload, {
      hasOutputAtStart: await hasPanelVideoOutput(panelId),
    }),
    dedupeKey: `video_panel:${panelId}`,
    billingInfo: buildVideoPanelBillingInfoOrThrow(payload),
    operationId: params.operationId,
    operationSource: params.ctx.source,
    operationConfirmed: params.input.confirmed === true,
    operationRequestId: getRequestId(params.ctx.request),
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
  }
}
ensureAiCatalogsRegistered()
