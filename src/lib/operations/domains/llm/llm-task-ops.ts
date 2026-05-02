import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { getProjectModelConfig } from '@/lib/config-service'
import { TASK_TYPE } from '@/lib/task/types'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'
import { normalizeString, submitOperationTask } from '@/lib/operations/submit-operation-task'

const EFFECTS_BILLABLE_LONG_RUNNING = {
  writes: true,
  billable: true,
  destructive: false,
  overwrite: false,
  bulk: false,
  externalSideEffects: true,
  longRunning: true,
} as const

export function createLlmTaskOperations(): ProjectAgentOperationRegistryDraft {
  return {
    analyze_novel: defineOperation({
      id: 'analyze_novel',
      summary: 'Submit novel analysis task (ANALYZE_NOVEL).',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交文本分析任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        episodeId: z.string().optional(),
        content: z.string().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const modelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        if (!modelConfig.analysisModel) {
          throw new ApiError('MISSING_CONFIG')
        }
        const payload: Record<string, unknown> = {
          ...(input as unknown as Record<string, unknown>),
          analysisModel: modelConfig.analysisModel,
          displayMode: 'detail',
        }
        const episodeId = normalizeString((input as unknown as Record<string, unknown>).episodeId) || null
        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: ctx.projectId,
          episodeId,
          type: TASK_TYPE.ANALYZE_NOVEL,
          targetType: 'Project',
          targetId: ctx.projectId,
          operationId: 'analyze_novel',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload,
          dedupeKey: `analyze_novel:${ctx.projectId}:${episodeId || 'global'}`,
          priority: 1,
        })
      },
    }),
    analyze_global: defineOperation({
      id: 'analyze_global',
      summary: 'Submit global asset analysis task (ANALYZE_GLOBAL).',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交全局资产分析任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const modelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        if (!modelConfig.analysisModel) {
          throw new ApiError('MISSING_CONFIG')
        }
        const payload: Record<string, unknown> = {
          ...(input as unknown as Record<string, unknown>),
          analysisModel: modelConfig.analysisModel,
          displayMode: 'detail',
        }
        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: ctx.projectId,
          type: TASK_TYPE.ANALYZE_GLOBAL,
          targetType: 'Project',
          targetId: ctx.projectId,
          operationId: 'analyze_global',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload,
          dedupeKey: `analyze_global:${ctx.projectId}`,
          priority: 1,
        })
      },
    }),
    analyze_shot_variants: defineOperation({
      id: 'analyze_shot_variants',
      summary: 'Submit shot variants analysis task (ANALYZE_SHOT_VARIANTS).',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交镜头变体分析任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        panelId: z.string().min(1),
        episodeId: z.string().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const modelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        if (!modelConfig.analysisModel) {
          throw new ApiError('MISSING_CONFIG')
        }
        const payload: Record<string, unknown> = {
          ...(input as unknown as Record<string, unknown>),
          analysisModel: modelConfig.analysisModel,
          displayMode: 'detail',
        }
        const episodeId = normalizeString((input as unknown as Record<string, unknown>).episodeId) || null
        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: ctx.projectId,
          episodeId,
          type: TASK_TYPE.ANALYZE_SHOT_VARIANTS,
          targetType: 'ProjectPanel',
          targetId: input.panelId,
          operationId: 'analyze_shot_variants',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload,
          dedupeKey: `analyze_shot_variants:${input.panelId}`,
          priority: 1,
        })
      },
    }),
    screenplay_convert: defineOperation({
      id: 'screenplay_convert',
      summary: 'Submit screenplay conversion task (SCREENPLAY_CONVERT).',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交 clips→screenplay 转换任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        episodeId: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const modelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        if (!modelConfig.analysisModel) {
          throw new ApiError('MISSING_CONFIG')
        }
        const payload: Record<string, unknown> = {
          ...(input as unknown as Record<string, unknown>),
          analysisModel: modelConfig.analysisModel,
          displayMode: 'detail',
        }
        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: ctx.projectId,
          episodeId: input.episodeId,
          type: TASK_TYPE.SCREENPLAY_CONVERT,
          targetType: 'ProjectEpisode',
          targetId: input.episodeId,
          operationId: 'screenplay_convert',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload,
          dedupeKey: `screenplay_convert:${input.episodeId}`,
          priority: 2,
        })
      },
    }),
    story_to_script_run: defineOperation({
      id: 'story_to_script_run',
      summary: 'Submit story-to-script run task (STORY_TO_SCRIPT_RUN) for internal streaming/observe flows.',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交 story-to-script 运行任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        episodeId: z.string().min(1),
        content: z.string().min(1).optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const modelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        if (!modelConfig.analysisModel) {
          throw new ApiError('MISSING_CONFIG')
        }
        const payload: Record<string, unknown> = {
          ...(input as unknown as Record<string, unknown>),
          analysisModel: modelConfig.analysisModel,
          displayMode: 'detail',
        }
        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: ctx.projectId,
          episodeId: input.episodeId,
          type: TASK_TYPE.STORY_TO_SCRIPT_RUN,
          targetType: 'ProjectEpisode',
          targetId: input.episodeId,
          operationId: 'story_to_script_run',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload,
          dedupeKey: `story_to_script_run:${input.episodeId}`,
          priority: 2,
        })
      },
    }),
    script_to_storyboard_run: defineOperation({
      id: 'script_to_storyboard_run',
      summary: 'Submit script-to-storyboard run task (SCRIPT_TO_STORYBOARD_RUN) for internal streaming/observe flows.',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交 script-to-storyboard 运行任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        episodeId: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const modelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        if (!modelConfig.analysisModel) {
          throw new ApiError('MISSING_CONFIG')
        }
        const payload: Record<string, unknown> = {
          ...(input as unknown as Record<string, unknown>),
          analysisModel: modelConfig.analysisModel,
          displayMode: 'detail',
        }
        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: ctx.projectId,
          episodeId: input.episodeId,
          type: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
          targetType: 'ProjectEpisode',
          targetId: input.episodeId,
          operationId: 'script_to_storyboard_run',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload,
          dedupeKey: `script_to_storyboard_run:${input.episodeId}`,
          priority: 2,
        })
      },
    }),
    voice_analyze: defineOperation({
      id: 'voice_analyze',
      summary: 'Submit voice analysis task (VOICE_ANALYZE).',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交台词分析任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        episodeId: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const modelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        if (!modelConfig.analysisModel) {
          throw new ApiError('MISSING_CONFIG')
        }
        const payload: Record<string, unknown> = {
          ...(input as unknown as Record<string, unknown>),
          analysisModel: modelConfig.analysisModel,
          displayMode: 'detail',
        }
        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: ctx.projectId,
          episodeId: input.episodeId,
          type: TASK_TYPE.VOICE_ANALYZE,
          targetType: 'ProjectEpisode',
          targetId: input.episodeId,
          operationId: 'voice_analyze',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload,
          dedupeKey: `voice_analyze:${input.episodeId}`,
          priority: 1,
        })
      },
    }),
    ai_modify_appearance: defineOperation({
      id: 'ai_modify_appearance',
      summary: 'Submit AI modify appearance task.',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交 AI 形象修改任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        characterId: z.string().min(1),
        appearanceId: z.string().min(1),
        currentDescription: z.string().min(1),
        modifyInstruction: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) =>
        submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: ctx.projectId,
          type: TASK_TYPE.AI_MODIFY_APPEARANCE,
          targetType: 'CharacterAppearance',
          targetId: input.appearanceId,
          operationId: 'ai_modify_appearance',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload: input as unknown as Record<string, unknown>,
          dedupeKey: `ai_modify_appearance:${input.appearanceId}`,
        }),
    }),
    ai_modify_prop: defineOperation({
      id: 'ai_modify_prop',
      summary: 'Submit AI modify prop task.',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交 AI 道具修改任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        propId: z.string().min(1),
        variantId: z.string().optional(),
        currentDescription: z.string().min(1),
        modifyInstruction: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const propId = normalizeString((input as unknown as Record<string, unknown>).propId)
        const variantId = normalizeString((input as unknown as Record<string, unknown>).variantId) || undefined

        const prop = await prisma.projectLocation.findFirst({
          where: {
            id: propId,
            projectId: ctx.projectId,
            assetKind: 'prop',
          },
          select: {
            id: true,
            name: true,
          },
        })
        if (!prop) {
          throw new ApiError('NOT_FOUND')
        }

        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: ctx.projectId,
          type: TASK_TYPE.AI_MODIFY_PROP,
          targetType: 'ProjectLocation',
          targetId: variantId || propId,
          operationId: 'ai_modify_prop',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload: {
            ...(input as unknown as Record<string, unknown>),
            propId,
            propName: prop.name,
            ...(variantId ? { variantId } : {}),
          },
          dedupeKey: `ai_modify_prop:${propId}:${variantId || 'default'}`,
        })
      },
    }),
    ai_modify_shot_prompt: defineOperation({
      id: 'ai_modify_shot_prompt',
      summary: 'Submit AI modify shot prompt task.',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交 AI 镜头提示词修改任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        panelId: z.string().optional(),
        episodeId: z.string().optional(),
        currentPrompt: z.string().min(1),
        modifyInstruction: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const panelId = normalizeString((input as unknown as Record<string, unknown>).panelId)
        const episodeId = normalizeString((input as unknown as Record<string, unknown>).episodeId) || null

        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: ctx.projectId,
          episodeId,
          type: TASK_TYPE.AI_MODIFY_SHOT_PROMPT,
          targetType: panelId ? 'ProjectPanel' : 'Project',
          targetId: panelId || ctx.projectId,
          operationId: 'ai_modify_shot_prompt',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload: input as unknown as Record<string, unknown>,
          dedupeKey: panelId ? `ai_modify_shot_prompt:${panelId}` : `ai_modify_shot_prompt:${ctx.projectId}`,
        })
      },
    }),
  }
}
