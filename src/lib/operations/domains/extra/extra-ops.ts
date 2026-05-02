import { z } from 'zod'
import sharp from 'sharp'
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { getProjectModelConfig } from '@/lib/config-service'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { detectEpisodeMarkers, splitByMarkers } from '@/lib/episode-marker-detector'
import { uploadObject, generateUniqueKey } from '@/lib/storage'
import { decodeImageUrlsFromDb, encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'
import { submitOperationTask } from '@/lib/operations/submit-operation-task'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { resolveProjectImageStyleSignatureForTask } from '@/lib/image-generation/style'

function parseReferenceImages(body: Record<string, unknown>): string[] {
  const list = Array.isArray(body.referenceImageUrls)
    ? body.referenceImageUrls.map((item: unknown) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : []
  if (list.length > 0) return list.slice(0, 5)
  const single = typeof body.referenceImageUrl === 'string' ? body.referenceImageUrl.trim() : ''
  return single ? [single] : []
}

const EFFECTS_QUERY = {
  writes: false,
  billable: false,
  destructive: false,
  overwrite: false,
  bulk: false,
  externalSideEffects: false,
  longRunning: false,
} as const

const EFFECTS_BILLABLE_LONG_RUNNING = {
  writes: true,
  billable: true,
  destructive: false,
  overwrite: false,
  bulk: false,
  externalSideEffects: true,
  longRunning: true,
} as const

export function createExtraOperations(): ProjectAgentOperationRegistryDraft {
  return {
    ai_create_character: defineOperation({
      id: 'ai_create_character',
      summary: 'Submit AI create character design task.',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交 AI 角色设计任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        userInstruction: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const userInstruction = input.userInstruction.trim()
        const modelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        if (!modelConfig.analysisModel) {
          throw new ApiError('MISSING_CONFIG')
        }
        const dedupeDigest = createHash('sha1')
          .update(`${ctx.projectId}:${ctx.userId}:character:${userInstruction}`)
          .digest('hex')
          .slice(0, 16)

        const payload = {
          userInstruction,
          analysisModel: modelConfig.analysisModel,
          displayMode: 'detail',
        }

        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: ctx.projectId,
          type: TASK_TYPE.AI_CREATE_CHARACTER,
          targetType: 'ProjectCharacterDesign',
          targetId: ctx.projectId,
          operationId: 'ai_create_character',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload,
          dedupeKey: `project_ai_create_character:${dedupeDigest}`,
        })
      },
    }),
    ai_create_location: defineOperation({
      id: 'ai_create_location',
      summary: 'Submit AI create location design task.',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交 AI 场景设计任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        userInstruction: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const userInstruction = input.userInstruction.trim()
        const modelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        if (!modelConfig.analysisModel) {
          throw new ApiError('MISSING_CONFIG')
        }
        const dedupeDigest = createHash('sha1')
          .update(`${ctx.projectId}:${ctx.userId}:location:${userInstruction}`)
          .digest('hex')
          .slice(0, 16)

        const payload = {
          userInstruction,
          analysisModel: modelConfig.analysisModel,
          displayMode: 'detail',
        }

        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: ctx.projectId,
          type: TASK_TYPE.AI_CREATE_LOCATION,
          targetType: 'ProjectLocationDesign',
          targetId: ctx.projectId,
          operationId: 'ai_create_location',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload,
          dedupeKey: `project_ai_create_location:${dedupeDigest}`,
        })
      },
    }),
    ai_modify_location: defineOperation({
      id: 'ai_modify_location',
      summary: 'Submit AI modify location task.',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交 AI 场景修改任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        locationId: z.string().min(1),
        imageIndex: z.number().int().min(0).optional(),
        currentDescription: z.string().min(1),
        modifyInstruction: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const imageIndex = input.imageIndex ?? 0
        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: ctx.projectId,
          type: TASK_TYPE.AI_MODIFY_LOCATION,
          targetType: 'ProjectLocation',
          targetId: input.locationId,
          operationId: 'ai_modify_location',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload: {
            ...input,
            imageIndex,
          } as unknown as Record<string, unknown>,
          dedupeKey: `ai_modify_location:${input.locationId}:${imageIndex}`,
        })
      },
    }),
    clips_build: defineOperation({
      id: 'clips_build',
      summary: 'Submit clips build task for an episode.',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将生成 clips（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        episodeId: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) =>
        submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: ctx.projectId,
          episodeId: input.episodeId,
          type: TASK_TYPE.CLIPS_BUILD,
          targetType: 'ProjectEpisode',
          targetId: input.episodeId,
          operationId: 'clips_build',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload: {
            ...(input as unknown as Record<string, unknown>),
            displayMode: 'detail',
          },
          dedupeKey: `clips_build:${input.episodeId}`,
          priority: 1,
        }),
    }),
    episode_split_llm: defineOperation({
      id: 'episode_split_llm',
      summary: 'Submit episode split (LLM) task.',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将进行 AI 分集（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        content: z.string().min(100),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) =>
        submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: ctx.projectId,
          type: TASK_TYPE.EPISODE_SPLIT_LLM,
          targetType: 'Project',
          targetId: ctx.projectId,
          operationId: 'episode_split_llm',
          source: ctx.source,
          confirmed: input.confirmed === true,
          payload: { content: input.content },
          dedupeKey: `episode_split_llm:${ctx.projectId}:${input.content.length}`,
        }),
    }),
    reference_to_character: defineOperation({
      id: 'reference_to_character',
      summary: 'Submit reference-to-character task.',
      intent: 'act',
      effects: EFFECTS_BILLABLE_LONG_RUNNING,
      confirmation: {
        required: true,
        summary: '将提交参考图转角色任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const body = input as unknown as Record<string, unknown>
        const referenceImages = parseReferenceImages(body)
        if (referenceImages.length === 0) {
          throw new ApiError('INVALID_PARAMS')
        }
        const count = normalizeImageGenerationCount('reference-to-character', body.count)
        body.count = count

        const isBackgroundJob = body.isBackgroundJob === true || body.isBackgroundJob === 1 || body.isBackgroundJob === '1'
        const characterId = typeof body.characterId === 'string' ? body.characterId : ''
        const appearanceId = typeof body.appearanceId === 'string' ? body.appearanceId : ''
        if (isBackgroundJob && (!characterId || !appearanceId)) {
          throw new ApiError('INVALID_PARAMS')
        }

        const targetType = appearanceId ? 'CharacterAppearance' : 'Project'
        const targetId = appearanceId || characterId || ctx.projectId
        const locale = resolveRequiredTaskLocale(ctx.request, body)
        const styleSignature = await resolveProjectImageStyleSignatureForTask({
          projectId: ctx.projectId,
          userId: ctx.userId,
          locale,
          artStyleOverride: body.artStyle,
          invalidOverrideMessage: 'Invalid artStyle in reference_to_character payload',
        })

        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: ctx.projectId,
          type: TASK_TYPE.REFERENCE_TO_CHARACTER,
          targetType,
          targetId,
          operationId: 'reference_to_character',
          source: ctx.source,
          confirmed: body.confirmed === true,
          payload: body,
          dedupeKey: `reference_to_character:${targetId}:${count}:${styleSignature}`,
        })
      },
    }),
    split_episodes_by_markers: defineOperation({
      id: 'split_episodes_by_markers',
      summary: 'Split content into episodes by detecting episode markers (no LLM).',
      intent: 'query',
      effects: EFFECTS_QUERY,
      inputSchema: z.object({
        content: z.string().min(100),
      }),
      outputSchema: z.unknown(),
      execute: async (_ctx, input) => {
        const markerResult = detectEpisodeMarkers(input.content)
        if (!markerResult.hasMarkers || markerResult.matches.length < 2) {
          throw new ApiError('INVALID_PARAMS')
        }
        const episodes = splitByMarkers(input.content, markerResult)
        return {
          success: true,
          method: 'markers',
          markerType: markerResult.markerType,
          confidence: markerResult.confidence,
          episodes,
        }
      },
    }),
    upload_asset_image: defineOperation({
      id: 'upload_asset_image',
      summary: 'Upload a custom image as character/location asset (adds label bar), and update corresponding records.',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: true,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将上传并覆盖/新增资产图片（可能影响当前选择）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        type: z.enum(['character', 'location']),
        id: z.string().min(1),
        appearanceId: z.string().nullable().optional(),
        imageIndex: z.number().int().min(0).max(50).nullable().optional(),
        imageBase64: z.string().min(1),
        filename: z.string().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const buffer = Buffer.from(input.imageBase64, 'base64')
        const processed = await sharp(buffer)
          .jpeg({ quality: 90, mozjpeg: true })
          .toBuffer()

        // We always re-encode to JPEG, so ensure the storage key extension matches the bytes.
        const ext = 'jpg'
        const keyPrefix = input.type === 'character'
          ? `char-${input.id}-${input.appearanceId || 'unknown'}-upload`
          : `loc-${input.id}-upload`
        const key = generateUniqueKey(keyPrefix, ext)
        await uploadObject(processed, key, undefined, 'image/jpeg')

        if (input.type === 'character' && input.appearanceId) {
          const appearance = await prisma.characterAppearance.findFirst({
            where: {
              id: input.appearanceId,
              character: { projectId: ctx.projectId },
            },
            select: {
              id: true,
              imageUrls: true,
              selectedIndex: true,
            },
          })
          if (!appearance) throw new ApiError('NOT_FOUND')

          const imageUrls = decodeImageUrlsFromDb(appearance.imageUrls, 'characterAppearance.imageUrls')
          const targetIndex = input.imageIndex !== null && input.imageIndex !== undefined ? input.imageIndex : imageUrls.length
          while (imageUrls.length <= targetIndex) imageUrls.push('')
          imageUrls[targetIndex] = key

          const selectedIndex = appearance.selectedIndex
          const shouldUpdateImageUrl =
            selectedIndex === targetIndex
            || (selectedIndex === null && targetIndex === 0)
            || imageUrls.filter((u) => !!u).length === 1

          const updateData: Record<string, unknown> = {
            imageUrls: encodeImageUrls(imageUrls),
          }
          if (shouldUpdateImageUrl) {
            updateData.imageUrl = key
          }

          await prisma.characterAppearance.update({
            where: { id: appearance.id },
            data: updateData,
          })

          return { success: true, imageKey: key, imageIndex: targetIndex }
        }

        if (input.type === 'location') {
          const location = await prisma.projectLocation.findFirst({
            where: { id: input.id, projectId: ctx.projectId },
            include: { images: { orderBy: { imageIndex: 'asc' } } },
          })
          if (!location) throw new ApiError('NOT_FOUND')

          const targetImageIndex = input.imageIndex !== null && input.imageIndex !== undefined
            ? input.imageIndex
            : (location.images?.length || 0)
          const existingImage = location.images?.find((img) => img.imageIndex === targetImageIndex)

          let imageId: string
          if (existingImage) {
            const updated = await prisma.locationImage.update({
              where: { id: existingImage.id },
              data: { imageUrl: key },
              select: { id: true },
            })
            imageId = updated.id
          } else {
            const created = await prisma.locationImage.create({
              data: {
                locationId: input.id,
                imageIndex: targetImageIndex,
                imageUrl: key,
                description: null,
                isSelected: targetImageIndex === 0,
              },
              select: { id: true },
            })
            imageId = created.id
          }

          if (!location.selectedImageId) {
            await prisma.projectLocation.update({
              where: { id: input.id },
              data: { selectedImageId: imageId },
            })
          }

          return { success: true, imageKey: key, imageIndex: targetImageIndex }
        }

        throw new ApiError('INVALID_PARAMS')
      },
    }),
  }
}
