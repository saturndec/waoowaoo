import { z } from 'zod'
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { getUserModelConfig } from '@/lib/config-service'
import { TASK_TYPE } from '@/lib/task/types'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { sanitizeImageInputsForTaskPayload } from '@/lib/media/outbound-image'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'
import { normalizeString, submitOperationTask } from '@/lib/operations/submit-operation-task'

function parseReferenceImages(body: Record<string, unknown>): string[] {
  const list = Array.isArray(body.referenceImageUrls)
    ? body.referenceImageUrls.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : []
  if (list.length > 0) return list.slice(0, 5)
  const single = typeof body.referenceImageUrl === 'string' ? body.referenceImageUrl.trim() : ''
  return single ? [single] : []
}

const EFFECTS_BILLABLE_LONG_RUNNING = {
  writes: true,
  billable: true,
  destructive: false,
  overwrite: false,
  bulk: false,
  externalSideEffects: true,
  longRunning: true,
} as const

export function createAssetHubLlmOperations(): ProjectAgentOperationRegistryDraft {
  return {
    asset_hub_ai_design_character: defineOperation({
      id: 'asset_hub_ai_design_character',
      summary: 'Submit global asset-hub character design task (ASSET_HUB_AI_DESIGN_CHARACTER).',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交资产中心角色设计任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        userInstruction: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const userInstruction = input.userInstruction.trim()
        const userConfig = await getUserModelConfig(ctx.userId)
        if (!userConfig.analysisModel) {
          throw new ApiError('MISSING_CONFIG')
        }
        const digest = createHash('sha1')
          .update(`${ctx.userId}:asset-hub:design-character:${userInstruction}`)
          .digest('hex')
          .slice(0, 16)

        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: 'global-asset-hub',
          type: TASK_TYPE.ASSET_HUB_AI_DESIGN_CHARACTER,
          targetType: 'GlobalAssetHubCharacterDesign',
          targetId: ctx.userId,
          operationId: 'asset_hub_ai_design_character',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload: {
            userInstruction,
            analysisModel: userConfig.analysisModel,
            displayMode: 'detail',
          },
          dedupeKey: `asset_hub_ai_design_character:${digest}`,
          priority: 1,
        })
      },
    }),

    asset_hub_ai_design_location: defineOperation({
      id: 'asset_hub_ai_design_location',
      summary: 'Submit global asset-hub location design task (ASSET_HUB_AI_DESIGN_LOCATION).',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交资产中心场景设计任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        userInstruction: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const userInstruction = input.userInstruction.trim()
        const userConfig = await getUserModelConfig(ctx.userId)
        if (!userConfig.analysisModel) {
          throw new ApiError('MISSING_CONFIG')
        }
        const digest = createHash('sha1')
          .update(`${ctx.userId}:asset-hub:design-location:${userInstruction}`)
          .digest('hex')
          .slice(0, 16)

        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: 'global-asset-hub',
          type: TASK_TYPE.ASSET_HUB_AI_DESIGN_LOCATION,
          targetType: 'GlobalAssetHubLocationDesign',
          targetId: ctx.userId,
          operationId: 'asset_hub_ai_design_location',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload: {
            userInstruction,
            analysisModel: userConfig.analysisModel,
            displayMode: 'detail',
          },
          dedupeKey: `asset_hub_ai_design_location:${digest}`,
          priority: 1,
        })
      },
    }),

    asset_hub_ai_modify_character: defineOperation({
      id: 'asset_hub_ai_modify_character',
      summary: 'Submit asset-hub AI modify character description task.',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交资产中心角色形象修改任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        characterId: z.string().min(1),
        appearanceIndex: z.number().int().min(0).max(50),
        currentDescription: z.string().min(1),
        modifyInstruction: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const character = await prisma.globalCharacter.findUnique({
          where: { id: input.characterId },
          select: { id: true, userId: true },
        })
        if (!character || character.userId !== ctx.userId) {
          throw new ApiError('NOT_FOUND')
        }

        const userConfig = await getUserModelConfig(ctx.userId)
        if (!userConfig.analysisModel) {
          throw new ApiError('MISSING_CONFIG')
        }

        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: 'global-asset-hub',
          type: TASK_TYPE.ASSET_HUB_AI_MODIFY_CHARACTER,
          targetType: 'GlobalCharacter',
          targetId: input.characterId,
          operationId: 'asset_hub_ai_modify_character',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload: {
            ...input,
            analysisModel: userConfig.analysisModel,
            displayMode: 'detail',
          },
          dedupeKey: `asset_hub_ai_modify_character:${input.characterId}:${input.appearanceIndex}`,
        })
      },
    }),

    asset_hub_ai_modify_location: defineOperation({
      id: 'asset_hub_ai_modify_location',
      summary: 'Submit asset-hub AI modify location description task.',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交资产中心场景修改任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        locationId: z.string().min(1),
        imageIndex: z.number().int().min(0).max(200),
        currentDescription: z.string().min(1),
        modifyInstruction: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const location = await prisma.globalLocation.findUnique({
          where: { id: input.locationId },
          select: { id: true, userId: true },
        })
        if (!location || location.userId !== ctx.userId) {
          throw new ApiError('NOT_FOUND')
        }

        const userConfig = await getUserModelConfig(ctx.userId)
        if (!userConfig.analysisModel) {
          throw new ApiError('MISSING_CONFIG')
        }

        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: 'global-asset-hub',
          type: TASK_TYPE.ASSET_HUB_AI_MODIFY_LOCATION,
          targetType: 'GlobalLocation',
          targetId: input.locationId,
          operationId: 'asset_hub_ai_modify_location',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload: {
            ...input,
            analysisModel: userConfig.analysisModel,
            displayMode: 'detail',
          },
          dedupeKey: `asset_hub_ai_modify_location:${input.locationId}:${input.imageIndex}`,
        })
      },
    }),

    asset_hub_ai_modify_prop: defineOperation({
      id: 'asset_hub_ai_modify_prop',
      summary: 'Submit asset-hub AI modify prop description task.',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交资产中心道具修改任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
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
        const propId = normalizeString(input.propId) || ''
        const variantId = normalizeString(input.variantId) || ''
        if (!propId) {
          throw new ApiError('INVALID_PARAMS')
        }

        const prop = await prisma.globalLocation.findFirst({
          where: {
            id: propId,
            userId: ctx.userId,
            assetKind: 'prop',
          },
          select: {
            id: true,
            userId: true,
            name: true,
          },
        })
        if (!prop) {
          throw new ApiError('NOT_FOUND')
        }

        const userConfig = await getUserModelConfig(ctx.userId)
        if (!userConfig.analysisModel) {
          throw new ApiError('MISSING_CONFIG')
        }

        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: 'global-asset-hub',
          type: TASK_TYPE.ASSET_HUB_AI_MODIFY_PROP,
          targetType: 'GlobalLocation',
          targetId: variantId || propId,
          operationId: 'asset_hub_ai_modify_prop',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload: {
            ...input,
            propId,
            propName: prop.name,
            ...(variantId ? { variantId } : {}),
            analysisModel: userConfig.analysisModel,
            displayMode: 'detail',
          },
          dedupeKey: `asset_hub_ai_modify_prop:${propId}:${variantId || 'default'}`,
        })
      },
    }),

    asset_hub_reference_to_character: defineOperation({
      id: 'asset_hub_reference_to_character',
      summary: 'Submit asset-hub reference-to-character task with normalized reference images.',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交参考图转角色任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const body = input as unknown as Record<string, unknown>
        const referenceImages = parseReferenceImages(body)
        const { normalized, issues } = sanitizeImageInputsForTaskPayload(referenceImages)
        if (normalized.length === 0) {
          throw new ApiError('INVALID_PARAMS', {
            code: 'REFERENCE_IMAGES_INVALID',
            issues,
          })
        }

        const count = normalizeImageGenerationCount('reference-to-character', body.count)
        const isBackgroundJob = body.isBackgroundJob === true || body.isBackgroundJob === 1 || body.isBackgroundJob === '1'
        const extractOnly = body.extractOnly === true || body.extractOnly === 1 || body.extractOnly === '1'
        const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : ''
        const appearanceId = typeof body.appearanceId === 'string' ? body.appearanceId.trim() : ''
        if (isBackgroundJob && (!characterId || !appearanceId)) {
          throw new ApiError('INVALID_PARAMS')
        }

        let analysisModel = ''
        if (extractOnly) {
          const userConfig = await getUserModelConfig(ctx.userId)
          analysisModel = userConfig.analysisModel || ''
          if (!analysisModel) {
            throw new ApiError('MISSING_CONFIG')
          }
        }

        const payload: Record<string, unknown> = {
          ...body,
          count,
          referenceImageUrls: normalized,
          ...(issues.length > 0 ? { referenceImageIssues: issues } : {}),
          ...(analysisModel ? { analysisModel } : {}),
          displayMode: 'detail',
        }

        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: 'global-asset-hub',
          type: TASK_TYPE.ASSET_HUB_REFERENCE_TO_CHARACTER,
          targetType: appearanceId ? 'GlobalCharacterAppearance' : 'GlobalCharacter',
          targetId: appearanceId || characterId || ctx.userId,
          operationId: 'asset_hub_reference_to_character',
          source: ctx.source,
          confirmed: body.confirmed === true,
          payload,
          dedupeKey: `asset_hub_reference_to_character:${appearanceId || characterId || ctx.userId}:${count}`,
        })
      },
    }),
  }
}
