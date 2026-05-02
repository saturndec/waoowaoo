import { createHash } from 'node:crypto'
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

const vocalModeSchema = z.enum(['instrumental', 'vocal'])
const outputFormatSchema = z.enum(['mp3', 'wav'])

const musicGenerationInputSchema = z.object({
  confirmed: z.boolean().optional(),
  musicModel: z.string().min(1).optional(),
  prompt: z.string().min(1),
  durationSeconds: z.number().int().min(1).max(600),
  vocalMode: vocalModeSchema.optional(),
  genre: z.string().min(1).optional(),
  mood: z.string().min(1).optional(),
  bpm: z.number().int().min(20).max(300).optional(),
  outputFormat: outputFormatSchema.optional(),
}).passthrough()

type MusicGenerationInput = z.infer<typeof musicGenerationInputSchema>

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function requireModelKey(value: string): string {
  const parsed = parseModelKeyStrict(value)
  if (!parsed) throw new Error('PROJECT_AGENT_MUSIC_MODEL_KEY_INVALID')
  return parsed.modelKey
}

function hashPayload(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 20)
}

async function resolveMusicModel(input: MusicGenerationInput, projectId: string, userId: string): Promise<string> {
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
  if (!configured) throw new Error('PROJECT_AGENT_MUSIC_MODEL_REQUIRED')
  return requireModelKey(configured)
}

export function createMusicGenerationOperations(): ProjectAgentOperationRegistryDraft {
  const taskSubmitOutput = refineTaskSubmitOperationOutputSchema(
    taskSubmitOperationOutputSchemaBase.extend({
      musicModel: z.string().min(1),
    }).passthrough(),
  )

  return {
    generate_project_music: defineOperation({
      id: 'generate_project_music',
      summary: 'Generate a project music asset using the configured music provider (async task submission).',
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
        summary: '将生成音乐/配乐资产（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: musicGenerationInputSchema,
      outputSchema: taskSubmitOutput,
      execute: async (ctx, input) => {
        const musicModel = await resolveMusicModel(input, ctx.projectId, ctx.userId)
        const payload: Record<string, unknown> = {
          prompt: input.prompt.trim(),
          durationSeconds: input.durationSeconds,
          musicModel,
          ...(input.vocalMode ? { vocalMode: input.vocalMode } : {}),
          ...(input.genre ? { genre: input.genre.trim() } : {}),
          ...(input.mood ? { mood: input.mood.trim() } : {}),
          ...(typeof input.bpm === 'number' ? { bpm: input.bpm } : {}),
          ...(input.outputFormat ? { outputFormat: input.outputFormat } : {}),
        }

        const result = await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: ctx.projectId,
          type: TASK_TYPE.MUSIC_GENERATE,
          targetType: 'Project',
          targetId: ctx.projectId,
          operationId: 'generate_project_music',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload,
          dedupeKey: `music_generate:${ctx.projectId}:${hashPayload(payload)}`,
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'generate_project_music',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
        })

        return {
          ...result,
          musicModel,
        }
      },
    }),
  }
}
