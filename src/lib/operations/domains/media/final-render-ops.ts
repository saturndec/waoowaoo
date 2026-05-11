import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { TASK_TYPE } from '@/lib/task/types'
import { parseModelKeyStrict } from '@/lib/ai-registry/selection'
import type { TaskSubmittedPartData } from '@/lib/project-agent/types'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { writeOperationDataPart } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'
import { submitOperationTask } from '@/lib/operations/submit-operation-task'
import {
  refineTaskSubmitOperationOutputSchema,
  taskSubmitOperationOutputSchemaBase,
} from '@/lib/operations/output-schemas'

const finalRenderInputSchema = z.object({
  confirmed: z.boolean().optional(),
  episodeId: z.string().min(1).optional(),
  musicModel: z.string().min(1).optional(),
  outputFormat: z.enum(['mp3', 'wav']).optional(),
  bgmVolume: z.number().min(0).max(1).optional(),
}).passthrough()

type FinalRenderInput = z.infer<typeof finalRenderInputSchema>

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function requireModelKey(value: string): string {
  const parsed = parseModelKeyStrict(value)
  if (!parsed) throw new Error('PROJECT_AGENT_FINAL_RENDER_MUSIC_MODEL_INVALID')
  return parsed.modelKey
}

async function resolveMusicModel(input: FinalRenderInput, projectId: string, userId: string): Promise<string> {
  const requested = normalizeString(input.musicModel)
  if (requested) return requireModelKey(requested)

  const [project, pref] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { musicModel: true },
    }),
    prisma.userPreference.findUnique({
      where: { userId },
      select: { musicModel: true },
    }),
  ])
  const configured = normalizeString(project?.musicModel) || normalizeString(pref?.musicModel)
  if (!configured) throw new Error('PROJECT_AGENT_FINAL_RENDER_MUSIC_MODEL_REQUIRED')
  return requireModelKey(configured)
}

async function resolveEpisodeId(input: FinalRenderInput, contextEpisodeId: unknown, projectId: string): Promise<string> {
  const episodeId = normalizeString(input.episodeId) || normalizeString(contextEpisodeId)
  if (!episodeId) throw new Error('PROJECT_AGENT_EPISODE_REQUIRED')
  const episode = await prisma.projectEpisode.findFirst({
    where: { id: episodeId, projectId },
    select: { id: true },
  })
  if (!episode) throw new Error('PROJECT_AGENT_EPISODE_NOT_FOUND')
  return episode.id
}

export function createFinalRenderOperations(): ProjectAgentOperationRegistryDraft {
  const taskSubmitOutput = refineTaskSubmitOperationOutputSchema(
    taskSubmitOperationOutputSchemaBase.extend({
      episodeId: z.string().min(1),
      musicModel: z.string().min(1),
    }).passthrough(),
  )

  return {
    render_final_video: defineOperation({
      id: 'render_final_video',
      summary: 'Generate BGM from the edit-first timing/emotion map and render the final linear edited video with FFmpeg.',
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
        summary: '将根据 edit-first 剪辑表生成背景音乐并用 FFmpeg 导出最终成片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: finalRenderInputSchema,
      outputSchema: taskSubmitOutput,
      execute: async (ctx, input) => {
        const episodeId = await resolveEpisodeId(input, ctx.context.episodeId, ctx.projectId)
        const musicModel = await resolveMusicModel(input, ctx.projectId, ctx.userId)
        const payload: Record<string, unknown> = {
          episodeId,
          musicModel,
          ...(input.outputFormat ? { outputFormat: input.outputFormat } : {}),
          ...(typeof input.bgmVolume === 'number' ? { bgmVolume: input.bgmVolume } : {}),
        }

        const result = await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: ctx.projectId,
          episodeId,
          type: TASK_TYPE.FINAL_VIDEO_RENDER,
          targetType: 'ProjectEpisode',
          targetId: episodeId,
          operationId: 'render_final_video',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload,
          dedupeKey: `final_video_render:${episodeId}`,
          billingInfo: null,
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'render_final_video',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
        })

        return {
          ...result,
          episodeId,
          musicModel,
        }
      },
    }),
  }
}
