import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ApiError, getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { buildImageBillingPayload, getProjectModelConfig } from '@/lib/config-service'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { ensureProjectLocationImageSlots } from '@/lib/image-generation/location-slots'
import { hasCharacterAppearanceOutput, hasLocationImageOutput, hasPanelImageOutput } from '@/lib/task/has-output'
import { sanitizeImageInputsForTaskPayload } from '@/lib/media/outbound-image'
import { resolveProjectImageStyleSignatureForTask } from '@/lib/image-generation/style'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'
import { taskSubmitOperationOutputSchema } from '@/lib/operations/output-schemas'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function toNumberOrNull(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function createMediaOperations(): ProjectAgentOperationRegistryDraft {
  return {
    regenerate_group: defineOperation({
      id: 'regenerate_group',
      summary: 'Regenerate a group of asset images (character/location) by submitting an async task.',
      intent: 'act',
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: false,
        bulk: true,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将批量重生成图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        type: z.enum(['character', 'location']),
        id: z.string().min(1),
        appearanceId: z.string().min(1).optional(),
        count: z.number().int().positive().max(12).optional(),
      }).passthrough().refine((value) => (value.type !== 'character' || !!value.appearanceId), {
        message: 'appearanceId is required when type=character',
        path: ['appearanceId'],
      }),
      outputSchema: taskSubmitOperationOutputSchema,
      execute: async (ctx, input) => {
        const count = input.type === 'character'
          ? normalizeImageGenerationCount('character', (input as Record<string, unknown>).count)
          : normalizeImageGenerationCount('location', (input as Record<string, unknown>).count)

        const appearanceId = normalizeString((input as Record<string, unknown>).appearanceId)
        const targetType = input.type === 'character' ? 'CharacterAppearance' : 'LocationImage'
        const targetId = input.type === 'character' ? appearanceId : input.id

        if (!targetId) {
          throw new ApiError('INVALID_PARAMS')
        }

        if (input.type === 'location') {
          const location = await prisma.projectLocation.findUnique({
            where: { id: input.id },
            select: { name: true, summary: true },
          })
          if (!location) {
            throw new ApiError('NOT_FOUND')
          }
          await ensureProjectLocationImageSlots({
            locationId: input.id,
            count,
            fallbackDescription: location.summary || location.name,
          })
        }

        const hasOutputAtStart = input.type === 'character'
          ? await hasCharacterAppearanceOutput({
              appearanceId,
              characterId: input.id,
            })
          : await hasLocationImageOutput({
              locationId: input.id,
            })

        const projectModelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        const imageModel = input.type === 'character'
          ? projectModelConfig.characterModel
          : projectModelConfig.locationModel

        let billingPayload: Record<string, unknown>
        try {
          billingPayload = await buildImageBillingPayload({
            projectId: ctx.projectId,
            userId: ctx.userId,
            imageModel,
            basePayload: {
              ...(toObject(input)),
              count,
            },
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Image model capability not configured'
          throw new ApiError('INVALID_PARAMS', { code: 'IMAGE_MODEL_CAPABILITY_NOT_CONFIGURED', message })
        }

        const locale = resolveRequiredTaskLocale(ctx.request, billingPayload)
        const styleSignature = await resolveProjectImageStyleSignatureForTask({
          projectId: ctx.projectId,
          userId: ctx.userId,
          locale,
          artStyleOverride: toObject(input).artStyle,
          invalidOverrideMessage: 'Invalid artStyle in regenerate_group payload',
        })

        return await submitTask({
          userId: ctx.userId,
          locale,
          requestId: getRequestId(ctx.request),
          projectId: ctx.projectId,
          type: TASK_TYPE.REGENERATE_GROUP,
          targetType,
          targetId,
          payload: withTaskUiPayload(billingPayload, {
            intent: 'regenerate',
            hasOutputAtStart,
          }),
          dedupeKey: `regenerate_group:${targetType}:${targetId}:${count}:${styleSignature}`,
          billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.REGENERATE_GROUP, billingPayload),
          operationId: 'regenerate_group',
          operationSource: ctx.source,
          operationConfirmed: input.confirmed === true,
          operationRequestId: getRequestId(ctx.request),
        })
      },
    }),

    regenerate_single_image: defineOperation({
      id: 'regenerate_single_image',
      summary: 'Regenerate a single image by index for character/location (async task submission).',
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
        summary: '将重生成单张图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        type: z.enum(['character', 'location']),
        id: z.string().min(1),
        appearanceId: z.string().min(1).optional(),
        imageIndex: z.union([z.number().int().min(0).max(200), z.string().min(1)]),
      }).passthrough(),
      outputSchema: taskSubmitOperationOutputSchema,
      execute: async (ctx, input) => {
        const imageIndex = (input as Record<string, unknown>).imageIndex
        const parsedImageIndex = toNumberOrNull(imageIndex)
        if (parsedImageIndex === null) {
          throw new ApiError('INVALID_PARAMS')
        }

        const appearanceId = normalizeString((input as Record<string, unknown>).appearanceId)
        const taskType = input.type === 'character' ? TASK_TYPE.IMAGE_CHARACTER : TASK_TYPE.IMAGE_LOCATION
        const targetType = input.type === 'character' ? 'CharacterAppearance' : 'LocationImage'
        const targetId = input.type === 'character' ? (appearanceId || input.id) : input.id

        const hasOutputAtStart = input.type === 'character'
          ? await hasCharacterAppearanceOutput({
              appearanceId: targetId,
              characterId: input.id,
            })
          : await hasLocationImageOutput({
              locationId: input.id,
              imageIndex: parsedImageIndex,
            })

        const projectModelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        const imageModel = input.type === 'character'
          ? projectModelConfig.characterModel
          : projectModelConfig.locationModel

        let billingPayload: Record<string, unknown>
        try {
          billingPayload = await buildImageBillingPayload({
            projectId: ctx.projectId,
            userId: ctx.userId,
            imageModel,
            basePayload: {
              ...(toObject(input)),
              imageIndex: parsedImageIndex,
            },
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Image model capability not configured'
          throw new ApiError('INVALID_PARAMS', { code: 'IMAGE_MODEL_CAPABILITY_NOT_CONFIGURED', message })
        }

        const locale = resolveRequiredTaskLocale(ctx.request, billingPayload)
        const styleSignature = await resolveProjectImageStyleSignatureForTask({
          projectId: ctx.projectId,
          userId: ctx.userId,
          locale,
          artStyleOverride: toObject(input).artStyle,
          invalidOverrideMessage: 'Invalid artStyle in regenerate_single_image payload',
        })

        return await submitTask({
          userId: ctx.userId,
          locale,
          requestId: getRequestId(ctx.request),
          projectId: ctx.projectId,
          type: taskType,
          targetType,
          targetId,
          payload: withTaskUiPayload(billingPayload, {
            intent: 'regenerate',
            hasOutputAtStart,
          }),
          dedupeKey: `${taskType}:${targetId}:single:${parsedImageIndex}:${styleSignature}`,
          billingInfo: buildDefaultTaskBillingInfo(taskType, billingPayload),
          operationId: 'regenerate_single_image',
          operationSource: ctx.source,
          operationConfirmed: input.confirmed === true,
          operationRequestId: getRequestId(ctx.request),
        })
      },
    }),

    regenerate_storyboard_text: defineOperation({
      id: 'regenerate_storyboard_text',
      summary: 'Regenerate storyboard text (async task submission).',
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
        summary: '将重生成分镜文本（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        storyboardId: z.string().min(1),
      }).passthrough(),
      outputSchema: taskSubmitOperationOutputSchema,
      execute: async (ctx, input) => {
        const projectModelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        const analysisModel = projectModelConfig.analysisModel
        const billingPayload = {
          ...(toObject(input)),
          ...(analysisModel ? { analysisModel } : {}),
        }

        return await submitTask({
          userId: ctx.userId,
          locale: resolveRequiredTaskLocale(ctx.request, billingPayload),
          requestId: getRequestId(ctx.request),
          projectId: ctx.projectId,
          type: TASK_TYPE.REGENERATE_STORYBOARD_TEXT,
          targetType: 'ProjectStoryboard',
          targetId: input.storyboardId,
          payload: billingPayload,
          dedupeKey: `regenerate_storyboard_text:${input.storyboardId}`,
          billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.REGENERATE_STORYBOARD_TEXT, billingPayload),
          operationId: 'regenerate_storyboard_text',
          operationSource: ctx.source,
          operationConfirmed: input.confirmed === true,
          operationRequestId: getRequestId(ctx.request),
        })
      },
    }),

    modify_storyboard_image: defineOperation({
      id: 'modify_storyboard_image',
      summary: 'Modify storyboard panel image using edit model (async task submission).',
      intent: 'act',
      effects: {
        writes: true,
        billable: true,
        destructive: true,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将修改分镜图片（可能覆盖现有结果且可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        storyboardId: z.string().min(1),
        panelIndex: z.number().int().min(0).max(2000),
        modifyPrompt: z.string().min(1),
        extraImageUrls: z.array(z.unknown()).optional(),
        selectedAssets: z.array(z.unknown()).optional(),
        meta: z.unknown().optional(),
      }).passthrough(),
      outputSchema: taskSubmitOperationOutputSchema,
      execute: async (ctx, input) => {
        const panel = await prisma.projectPanel.findFirst({
          where: {
            storyboardId: input.storyboardId,
            panelIndex: input.panelIndex,
          },
          select: {
            id: true,
          },
        })
        if (!panel) {
          throw new ApiError('NOT_FOUND')
        }

        const extraImageAudit = sanitizeImageInputsForTaskPayload(
          Array.isArray((input as Record<string, unknown>).extraImageUrls)
            ? (input as Record<string, unknown>).extraImageUrls as unknown[]
            : [],
        )
        const selectedAssetsRaw = Array.isArray((input as Record<string, unknown>).selectedAssets)
          ? (input as Record<string, unknown>).selectedAssets as unknown[]
          : []
        const selectedAssetIssues: Array<Record<string, unknown>> = []
        const normalizedSelectedAssets = selectedAssetsRaw.map((asset: unknown, assetIndex: number) => {
          if (!asset || typeof asset !== 'object') return asset
          const imageUrl = (asset as Record<string, unknown>).imageUrl
          const audit = sanitizeImageInputsForTaskPayload([imageUrl])
          for (const issue of audit.issues) {
            selectedAssetIssues.push({
              assetIndex,
              ...issue,
            })
          }
          const normalizedUrl = audit.normalized[0]
          if (!normalizedUrl) return asset
          return {
            ...toObject(asset),
            imageUrl: normalizedUrl,
          }
        })

        const rejectedRelativePathCount = [
          ...extraImageAudit.issues,
          ...selectedAssetIssues,
        ].filter((issue) => (issue as { reason?: unknown }).reason === 'relative_path_rejected').length
        if (rejectedRelativePathCount > 0) {
          throw new ApiError('INVALID_PARAMS')
        }

        const payload = {
          ...(toObject(input)),
          type: 'storyboard',
          panelId: panel.id,
          panelIndex: input.panelIndex,
          extraImageUrls: extraImageAudit.normalized,
          selectedAssets: normalizedSelectedAssets,
          meta: {
            ...toObject((input as Record<string, unknown>).meta),
            outboundImageInputAudit: {
              extraImageUrls: extraImageAudit.issues,
              selectedAssets: selectedAssetIssues,
            },
          },
        }
        const hasOutputAtStart = await hasPanelImageOutput(panel.id)

        const projectModelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        const imageModel = projectModelConfig.editModel

        let billingPayload: Record<string, unknown>
        try {
          billingPayload = await buildImageBillingPayload({
            projectId: ctx.projectId,
            userId: ctx.userId,
            imageModel,
            basePayload: payload,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Image model capability not configured'
          throw new ApiError('INVALID_PARAMS', { code: 'IMAGE_MODEL_CAPABILITY_NOT_CONFIGURED', message })
        }

        return await submitTask({
          userId: ctx.userId,
          locale: resolveRequiredTaskLocale(ctx.request, billingPayload),
          requestId: getRequestId(ctx.request),
          projectId: ctx.projectId,
          type: TASK_TYPE.MODIFY_ASSET_IMAGE,
          targetType: 'ProjectPanel',
          targetId: panel.id,
          payload: withTaskUiPayload(billingPayload, {
            intent: 'modify',
            hasOutputAtStart,
          }),
          dedupeKey: `modify_storyboard_image:${panel.id}`,
          billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.MODIFY_ASSET_IMAGE, billingPayload),
          operationId: 'modify_storyboard_image',
          operationSource: ctx.source,
          operationConfirmed: input.confirmed === true,
          operationRequestId: getRequestId(ctx.request),
        })
      },
    }),
  }
}
