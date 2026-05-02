import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { createMutationBatch } from '@/lib/mutation-batch/service'
import { hasPanelLipSyncOutput } from '@/lib/task/has-output'
import { DEFAULT_LIPSYNC_MODEL_KEY } from '@/lib/ai-registry/api-config-catalog'
import { parseModelKeyStrict } from '@/lib/ai-registry/selection'
import type { TaskSubmittedPartData } from '@/lib/project-agent/types'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { writeOperationDataPart } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'
import {
  refineTaskSubmitOperationOutputSchema,
  taskSubmitOperationOutputSchemaBase,
} from '@/lib/operations/output-schemas'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveLocaleFromContext(locale?: unknown): string {
  const normalized = normalizeString(locale)
  return normalized || 'zh'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function createLipSyncOperations(): ProjectAgentOperationRegistryDraft {
  const withMutationBatchBase = taskSubmitOperationOutputSchemaBase.extend({
    mutationBatchId: z.string().min(1),
  }).passthrough()

  const taskSubmitOutputWithMutationBatch = <TShape extends z.ZodRawShape>(shape: TShape) => refineTaskSubmitOperationOutputSchema(
    withMutationBatchBase.extend(shape).passthrough(),
  )

  return {
    lip_sync: defineOperation({
      id: 'lip_sync',
      summary: 'Generate lip-sync video for a storyboard panel using a voice line (async task submission).',
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
        summary: '将进行口型同步（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        storyboardId: z.string().min(1),
        panelIndex: z.number().int().min(0).max(2000),
        voiceLineId: z.string().min(1),
        lipSyncModel: z.string().optional(),
      }).passthrough(),
      outputSchema: taskSubmitOutputWithMutationBatch({
        panelId: z.string().min(1),
        lipSyncModel: z.string().min(1),
      }),
      execute: async (ctx, input) => {
        const locale = resolveLocaleFromContext(ctx.context.locale)

        const requestedLipSyncModel = normalizeString((input as Record<string, unknown>).lipSyncModel)
        if (requestedLipSyncModel && !parseModelKeyStrict(requestedLipSyncModel)) {
          throw new Error('PROJECT_AGENT_MODEL_KEY_INVALID')
        }

        const pref = await prisma.userPreference.findUnique({
          where: { userId: ctx.userId },
          select: { lipSyncModel: true },
        })
        const preferredLipSyncModel = normalizeString(pref?.lipSyncModel)
        const resolvedLipSyncModel = requestedLipSyncModel || preferredLipSyncModel || DEFAULT_LIPSYNC_MODEL_KEY
        if (!parseModelKeyStrict(resolvedLipSyncModel)) {
          throw new Error('PROJECT_AGENT_MODEL_KEY_INVALID')
        }

        const storyboardId = input.storyboardId.trim()
        const panelIndex = input.panelIndex
        const voiceLineId = input.voiceLineId.trim()

        const panel = await prisma.projectPanel.findFirst({
          where: { storyboardId, panelIndex: Number(panelIndex) },
          select: { id: true, lipSyncVideoUrl: true, storyboard: { select: { episodeId: true } } },
        })
        if (!panel) {
          throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
        }

        const payload: Record<string, unknown> = {
          ...(isRecord(input) ? input : {}),
          lipSyncModel: resolvedLipSyncModel,
          meta: {
            locale,
          },
        }
        delete payload.confirmed

        const result = await submitTask({
          userId: ctx.userId,
          locale: resolveRequiredTaskLocale(ctx.request, payload),
          requestId: getRequestId(ctx.request),
          projectId: ctx.projectId,
          type: TASK_TYPE.LIP_SYNC,
          targetType: 'ProjectPanel',
          targetId: panel.id,
          payload: withTaskUiPayload(payload, {
            hasOutputAtStart: await hasPanelLipSyncOutput(panel.id),
          }),
          dedupeKey: `lip_sync:${panel.id}:${voiceLineId}`,
          billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.LIP_SYNC, payload),
          operationId: 'lip_sync',
          operationSource: ctx.source,
          operationConfirmed: input.confirmed === true,
          operationRequestId: getRequestId(ctx.request),
        })

        const mutationBatch = await createMutationBatch({
          projectId: ctx.projectId,
          userId: ctx.userId,
          source: ctx.source,
          operationId: 'lip_sync',
          episodeId: panel.storyboard.episodeId,
          summary: `lip_sync:${panel.id}:${voiceLineId}`,
          entries: [
            {
              kind: 'panel_lipsync_restore',
              targetType: 'ProjectPanel',
              targetId: panel.id,
              payload: {
                previousLipSyncVideoUrl: panel.lipSyncVideoUrl ?? null,
              },
            },
          ],
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'lip_sync',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
          mutationBatchId: mutationBatch.id,
        })

        return {
          ...result,
          panelId: panel.id,
          lipSyncModel: resolvedLipSyncModel,
          mutationBatchId: mutationBatch.id,
        }
      },
    }),
  }
}
