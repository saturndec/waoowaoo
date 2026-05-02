import { createHash, randomUUID } from 'crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import {
  buildImageBillingPayload,
  getProjectModelConfig,
  resolveProjectModelCapabilityGenerationOptions,
} from '@/lib/config-service'
import { resolveModelSelection } from '@/lib/user-api/runtime-config'
import { hasPanelImageOutput } from '@/lib/task/has-output'
import { resolveProjectImageStyleSignatureForTask } from '@/lib/image-generation/style'
import { createMutationBatch } from '@/lib/mutation-batch/service'
import type { TaskSubmittedPartData } from '@/lib/project-agent/types'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { writeOperationDataPart } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'
import {
  refineTaskSubmitOperationOutputSchema,
  taskSubmitOperationOutputSchemaBase,
} from '@/lib/operations/output-schemas'
import { sanitizeImageInputsForTaskPayload } from '@/lib/media/outbound-image'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveLocaleFromContext(locale?: unknown): string {
  const normalized = normalizeString(locale)
  return normalized || 'zh'
}

function resolveCandidateCount(input?: unknown): number {
  const parsed = typeof input === 'number' ? input : Number(input)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.min(4, Math.trunc(parsed)))
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return Array.from(new Set(input
    .map((item) => normalizeString(item))
    .filter(Boolean)))
}

type ReferenceImageNoteInput = {
  source: string
  label: string
  instruction: string
  url?: string
  referencePanelId?: string
}

function normalizeReferenceImageNotes(input: unknown): ReferenceImageNoteInput[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      if (!isRecord(item)) return null
      const source = normalizeString(item.source) || 'custom'
      const label = normalizeString(item.label)
      const instruction = normalizeString(item.instruction)
      const url = normalizeString(item.url)
      const referencePanelId = normalizeString(item.referencePanelId)
      if (!label && !instruction && !url && !referencePanelId) return null
      return {
        source,
        label,
        instruction,
        ...(url ? { url } : {}),
        ...(referencePanelId ? { referencePanelId } : {}),
      }
    })
    .filter((item): item is ReferenceImageNoteInput => Boolean(item))
    .slice(0, 16)
}

function formatReferenceImageNote(note: ReferenceImageNoteInput | undefined, fallback: string): string {
  if (!note) return fallback
  const parts = [
    note.source ? `source=${note.source}` : '',
    note.label ? `label=${note.label}` : '',
    note.instruction ? `usage=${note.instruction}` : '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join('; ') : fallback
}

function createReferenceSignature(input: unknown): string {
  const serialized = JSON.stringify(input)
  return createHash('sha1').update(serialized).digest('hex').slice(0, 12)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function createPanelVariantId(): string {
  try {
    return randomUUID()
  } catch {
    return `panel-variant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

async function rollbackCreatedVariantPanel(params: {
  panelId: string
  storyboardId: string
  panelIndex: number
}) {
  await prisma.$transaction(async (tx) => {
    await tx.projectPanel.delete({
      where: { id: params.panelId },
    })

    const maxPanel = await tx.projectPanel.findFirst({
      where: { storyboardId: params.storyboardId },
      orderBy: { panelIndex: 'desc' },
      select: { panelIndex: true },
    })
    const maxPanelIndex = maxPanel?.panelIndex ?? -1
    const offset = maxPanelIndex + 1000

    await tx.projectPanel.updateMany({
      where: {
        storyboardId: params.storyboardId,
        panelIndex: { gt: params.panelIndex },
      },
      data: {
        panelIndex: { increment: offset },
        panelNumber: { increment: offset },
      },
    })

    await tx.projectPanel.updateMany({
      where: {
        storyboardId: params.storyboardId,
        panelIndex: { gt: params.panelIndex + offset },
      },
      data: {
        panelIndex: { decrement: offset + 1 },
        panelNumber: { decrement: offset + 1 },
      },
    })

    const panelCount = await tx.projectPanel.count({
      where: { storyboardId: params.storyboardId },
    })

    await tx.projectStoryboard.update({
      where: { id: params.storyboardId },
      data: { panelCount },
    })
  })
}

export function createStoryboardPanelImageOperations(): ProjectAgentOperationRegistryDraft {
  const withMutationBatchBase = taskSubmitOperationOutputSchemaBase.extend({
    mutationBatchId: z.string().min(1),
  }).passthrough()

  const taskSubmitOutputWithMutationBatch = <TShape extends z.ZodRawShape>(shape: TShape) => refineTaskSubmitOperationOutputSchema(
    withMutationBatchBase.extend(shape).passthrough(),
  )

  return {
    regenerate_panel_image: defineOperation({
      id: 'regenerate_panel_image',
      summary: 'Regenerate storyboard panel images (async task submission).',
      intent: 'act',
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将为分镜格子重新生成图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        panelId: z.string().min(1).optional(),
        storyboardId: z.string().min(1).optional(),
        panelIndex: z.number().int().min(0).max(1000).optional(),
        count: z.number().int().positive().max(4).optional(),
        referencePanelIds: z.array(z.string().min(1)).max(8).optional(),
        extraImageUrls: z.array(z.unknown()).max(8).optional(),
        referenceImageNotes: z.array(z.unknown()).max(16).optional(),
      }).refine((value) => Boolean(value.panelId || (value.storyboardId && typeof value.panelIndex === 'number')), {
        message: 'panelId or (storyboardId + panelIndex) is required',
        path: ['panelId'],
      }),
      outputSchema: taskSubmitOutputWithMutationBatch({
        panelId: z.string().min(1),
      }),
      execute: async (ctx, input) => {
        const locale = resolveLocaleFromContext(ctx.context.locale)

        let panelId = normalizeString(input.panelId)
        if (!panelId) {
          const storyboardId = normalizeString(input.storyboardId)
          const panelIndex = typeof input.panelIndex === 'number' ? input.panelIndex : NaN
          if (!storyboardId || !Number.isFinite(panelIndex)) {
            throw new Error('PROJECT_AGENT_PANEL_REQUIRED')
          }
          const panel = await prisma.projectPanel.findFirst({
            where: {
              storyboardId,
              panelIndex,
            },
            select: { id: true },
          })
          panelId = panel?.id || ''
        }

        if (!panelId) {
          throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
        }

        const candidateCount = resolveCandidateCount(input.count)
        const referencePanelIds = normalizeStringArray((input as { referencePanelIds?: unknown }).referencePanelIds).slice(0, 8)
        const referencePanelImageUrls: string[] = []
        if (referencePanelIds.length > 0) {
          const referencePanels = await prisma.projectPanel.findMany({
            where: {
              id: { in: referencePanelIds },
              storyboard: {
                episode: {
                  projectId: ctx.projectId,
                },
              },
            },
            select: {
              id: true,
              imageUrl: true,
            },
          })
          const panelById = new Map(referencePanels.map((panel) => [panel.id, panel]))
          for (const referencePanelId of referencePanelIds) {
            const referencePanel = panelById.get(referencePanelId)
            if (!referencePanel || !referencePanel.imageUrl) {
              throw new Error('PROJECT_AGENT_REFERENCE_PANEL_NOT_FOUND')
            }
            referencePanelImageUrls.push(referencePanel.imageUrl)
          }
        }

        const extraImageAudit = sanitizeImageInputsForTaskPayload(
          Array.isArray((input as Record<string, unknown>).extraImageUrls)
            ? (input as Record<string, unknown>).extraImageUrls as unknown[]
            : [],
        )
        if (extraImageAudit.issues.some((issue) => (issue as { reason?: unknown }).reason === 'relative_path_rejected')) {
          throw new Error('PROJECT_AGENT_REFERENCE_IMAGE_INVALID')
        }
        const rawReferenceNotes = normalizeReferenceImageNotes((input as Record<string, unknown>).referenceImageNotes)
        const notesByPanelId = new Map(rawReferenceNotes
          .filter((note) => note.referencePanelId)
          .map((note) => [note.referencePanelId!, note]))
        const notesByUrl = new Map(rawReferenceNotes
          .filter((note) => note.url)
          .map((note) => [note.url!, note]))
        const referenceImageNotes = [
          ...referencePanelIds.map((referencePanelId, index) => formatReferenceImageNote(
            notesByPanelId.get(referencePanelId),
            `source=storyboard; label=previous storyboard panel ${index + 1}; usage=Use this previous storyboard panel as continuity reference for staging, placement, and spatial relationship.`,
          )),
          ...extraImageAudit.normalized.map((url, index) => formatReferenceImageNote(
            notesByUrl.get(url),
            `source=custom; label=extra reference ${index + 1}; usage=Use this extra image only as directed by the user reference note.`,
          )),
        ].slice(0, 16)
        const referenceSignature = createReferenceSignature({
          referencePanelIds,
          referencePanelImageUrls,
          extraImageUrls: extraImageAudit.normalized,
          referenceImageNotes,
        })
        const body = {
          panelId,
          candidateCount,
          count: candidateCount,
          ...(referencePanelIds.length > 0 ? { referencePanelIds } : {}),
          ...(referencePanelImageUrls.length > 0 ? { referencePanelImageUrls } : {}),
          ...(extraImageAudit.normalized.length > 0 ? { extraImageUrls: extraImageAudit.normalized } : {}),
          ...(referenceImageNotes.length > 0 ? { referenceImageNotes } : {}),
          meta: {
            locale,
            ...(extraImageAudit.issues.length > 0 ? { outboundImageInputAudit: { extraImageUrls: extraImageAudit.issues } } : {}),
          },
        }

        const projectModelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        if (!projectModelConfig.storyboardModel) {
          throw new Error('STORYBOARD_MODEL_NOT_CONFIGURED')
        }
        await resolveModelSelection(ctx.userId, projectModelConfig.storyboardModel, 'image')
        const capabilityOptions = await resolveProjectModelCapabilityGenerationOptions({
          projectId: ctx.projectId,
          userId: ctx.userId,
          modelType: 'image',
          modelKey: projectModelConfig.storyboardModel,
        })

        const billingPayload = {
          ...body,
          imageModel: projectModelConfig.storyboardModel,
          ...(Object.keys(capabilityOptions).length > 0 ? { generationOptions: capabilityOptions } : {}),
        }

        const hasOutputAtStart = await hasPanelImageOutput(panelId)

        const taskLocale = resolveRequiredTaskLocale(ctx.request, body)
        const styleSignature = await resolveProjectImageStyleSignatureForTask({
          projectId: ctx.projectId,
          userId: ctx.userId,
          locale: taskLocale,
          invalidOverrideMessage: 'Invalid artStyle in image_panel payload',
        })

        const result = await submitTask({
          userId: ctx.userId,
          locale: taskLocale,
          requestId: getRequestId(ctx.request),
          projectId: ctx.projectId,
          type: TASK_TYPE.IMAGE_PANEL,
          targetType: 'ProjectPanel',
          targetId: panelId,
          payload: withTaskUiPayload(billingPayload, {
            intent: 'regenerate',
            hasOutputAtStart,
          }),
          dedupeKey: `image_panel:${panelId}:${candidateCount}:${styleSignature}:${referenceSignature}`,
          billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.IMAGE_PANEL, billingPayload),
          operationId: 'regenerate_panel_image',
          operationSource: ctx.source,
          operationConfirmed: input.confirmed === true,
          operationRequestId: getRequestId(ctx.request),
        })

        const mutationBatch = await createMutationBatch({
          projectId: ctx.projectId,
          userId: ctx.userId,
          source: ctx.source,
          operationId: 'regenerate_panel_image',
          episodeId: null,
          summary: `regenerate_panel_image:${panelId}`,
          entries: [
            {
              kind: 'panel_candidate_cancel',
              targetType: 'ProjectPanel',
              targetId: panelId,
            },
          ],
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'regenerate_panel_image',
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
      },
    }),

    panel_variant: defineOperation({
      id: 'panel_variant',
      summary: 'Insert a variant panel after an existing panel and enqueue image generation (async task submission).',
      intent: 'act',
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将创建新的分镜格并生成变体图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        storyboardId: z.string().min(1),
        insertAfterPanelId: z.string().min(1),
        sourcePanelId: z.string().min(1),
        variant: z.record(z.unknown()),
      }).passthrough(),
      outputSchema: taskSubmitOutputWithMutationBatch({
        panelId: z.string().min(1),
      }),
      execute: async (ctx, input) => {
        const locale = resolveLocaleFromContext(ctx.context.locale)
        const storyboardId = input.storyboardId.trim()
        const insertAfterPanelId = input.insertAfterPanelId.trim()
        const sourcePanelId = input.sourcePanelId.trim()
        const variant = input.variant || {}

        const variantVideoPrompt = typeof variant.video_prompt === 'string' ? variant.video_prompt.trim() : ''
        if (!variantVideoPrompt) {
          throw new Error('PROJECT_AGENT_PANEL_VARIANT_INVALID')
        }

        const storyboard = await prisma.projectStoryboard.findUnique({
          where: { id: storyboardId },
          select: {
            id: true,
            episodeId: true,
            episode: {
              select: {
                projectId: true,
              },
            },
          },
        })
        if (!storyboard || storyboard.episode.projectId !== ctx.projectId) {
          throw new Error('PROJECT_AGENT_STORYBOARD_NOT_FOUND')
        }

        const [sourcePanel, insertAfter] = await Promise.all([
          prisma.projectPanel.findUnique({ where: { id: sourcePanelId } }),
          prisma.projectPanel.findUnique({ where: { id: insertAfterPanelId } }),
        ])
        if (!sourcePanel || sourcePanel.storyboardId !== storyboardId) {
          throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
        }
        if (!insertAfter || insertAfter.storyboardId !== storyboardId) {
          throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
        }

        const projectModelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        const imageModel = projectModelConfig.storyboardModel
        const createdPanelId = createPanelVariantId()

        let billingPayload: Record<string, unknown>
        try {
          billingPayload = await buildImageBillingPayload({
            projectId: ctx.projectId,
            userId: ctx.userId,
            imageModel,
            basePayload: { ...(isRecord(input) ? input : {}), newPanelId: createdPanelId, meta: { locale } },
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Image model capability not configured'
          throw new Error(message)
        }

        const createdPanel = await prisma.$transaction(async (tx) => {
          const affectedPanels = await tx.projectPanel.findMany({
            where: { storyboardId, panelIndex: { gt: insertAfter.panelIndex } },
            select: { id: true, panelIndex: true },
            orderBy: { panelIndex: 'asc' },
          })

          for (const panel of affectedPanels) {
            await tx.projectPanel.update({
              where: { id: panel.id },
              data: { panelIndex: -(panel.panelIndex + 1) },
            })
          }

          for (const panel of affectedPanels) {
            await tx.projectPanel.update({
              where: { id: panel.id },
              data: { panelIndex: panel.panelIndex + 1 },
            })
          }

          const created = await tx.projectPanel.create({
            data: {
              id: createdPanelId,
              storyboardId,
              panelIndex: insertAfter.panelIndex + 1,
              panelNumber: insertAfter.panelIndex + 2,
              shotType: typeof variant.shot_type === 'string' ? variant.shot_type : sourcePanel.shotType,
              cameraMove: typeof variant.camera_move === 'string' ? variant.camera_move : sourcePanel.cameraMove,
              description: typeof variant.description === 'string' ? variant.description : sourcePanel.description,
              videoPrompt: variantVideoPrompt,
              location: typeof variant.location === 'string' ? variant.location : sourcePanel.location,
              characters: variant.characters ? JSON.stringify(variant.characters) : sourcePanel.characters,
              srtSegment: sourcePanel.srtSegment,
              duration: sourcePanel.duration,
            },
          })

          const panelCount = await tx.projectPanel.count({
            where: { storyboardId },
          })

          await tx.projectStoryboard.update({
            where: { id: storyboardId },
            data: { panelCount },
          })

          return created
        })

        let result: Awaited<ReturnType<typeof submitTask>>
        try {
          const taskLocale = resolveRequiredTaskLocale(ctx.request, billingPayload)
          const styleSignature = await resolveProjectImageStyleSignatureForTask({
            projectId: ctx.projectId,
            userId: ctx.userId,
            locale: taskLocale,
            invalidOverrideMessage: 'Invalid artStyle in panel_variant payload',
          })

          result = await submitTask({
            userId: ctx.userId,
            locale: taskLocale,
            requestId: getRequestId(ctx.request),
            projectId: ctx.projectId,
            type: TASK_TYPE.PANEL_VARIANT,
            targetType: 'ProjectPanel',
            targetId: createdPanel.id,
            payload: billingPayload,
            dedupeKey: `panel_variant:${storyboardId}:${insertAfterPanelId}:${sourcePanelId}:${styleSignature}`,
            billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.PANEL_VARIANT, billingPayload),
            operationId: 'panel_variant',
            operationSource: ctx.source,
            operationConfirmed: input.confirmed === true,
            operationRequestId: getRequestId(ctx.request),
          })
        } catch (error) {
          await rollbackCreatedVariantPanel({
            panelId: createdPanel.id,
            storyboardId,
            panelIndex: createdPanel.panelIndex,
          })
          throw error
        }

        const mutationBatch = await createMutationBatch({
          projectId: ctx.projectId,
          userId: ctx.userId,
          source: ctx.source,
          operationId: 'panel_variant',
          episodeId: storyboard.episodeId,
          summary: `panel_variant:${createdPanel.id}`,
          entries: [
            {
              kind: 'panel_variant_delete',
              targetType: 'ProjectPanel',
              targetId: createdPanel.id,
              payload: {
                storyboardId,
                panelIndex: createdPanel.panelIndex,
              },
            },
          ],
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'panel_variant',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
          mutationBatchId: mutationBatch.id,
        })

        return { ...result, panelId: createdPanel.id, mutationBatchId: mutationBatch.id }
      },
    }),
  }
}
