import { z } from 'zod'
import { ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { attachMediaFieldsToGlobalCharacter } from '@/lib/media/attach'
import { resolveMediaRefFromLegacyValue } from '@/lib/media/service'
import { PRIMARY_APPEARANCE_INDEX, isArtStyleValue } from '@/lib/constants'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { resolveTaskLocale } from '@/lib/task/resolve-locale'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { TASK_TYPE } from '@/lib/task/types'
import { sanitizeImageInputsForTaskPayload } from '@/lib/media/outbound-image'
import { submitOperationTask } from '@/lib/operations/submit-operation-task'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeFolderFilter(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  const text = normalizeString(value)
  if (!text) return undefined
  if (text === 'null') return null
  return text
}

function parseReferenceImages(body: Record<string, unknown>): string[] {
  const urls = Array.isArray(body.referenceImageUrls)
    ? body.referenceImageUrls.map((item) => normalizeString(item)).filter(Boolean)
    : []
  if (urls.length > 0) return urls.slice(0, 5)
  const single = normalizeString(body.referenceImageUrl)
  return single ? [single] : []
}

export function createAssetHubCharacterLibraryOperations(): ProjectAgentOperationRegistryDraft {
  return {
    asset_hub_list_characters: defineOperation({
      id: 'asset_hub_list_characters',
      summary: 'List global characters for the current user (optionally filtered by folderId).',
      intent: 'query',
      effects: {
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({
        folderId: z.string().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const folderId = normalizeFolderFilter((input as unknown as Record<string, unknown>).folderId)

        const where: Record<string, unknown> = { userId: ctx.userId }
        if (folderId === null) {
          where.folderId = null
        } else if (typeof folderId === 'string') {
          where.folderId = folderId
        }

        const characters = await prisma.globalCharacter.findMany({
          where,
          include: { appearances: true },
          orderBy: { createdAt: 'desc' },
        })

        const signedCharacters = await Promise.all(
          characters.map((character) => attachMediaFieldsToGlobalCharacter(character)),
        )

        return { characters: signedCharacters }
      },
    }),

    asset_hub_create_character: defineOperation({
      id: 'asset_hub_create_character',
      summary: 'Create a global character and its primary appearance; optionally enqueue reference-to-character task.',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: false,
      },
      inputSchema: z.object({
        name: z.string().min(1),
        artStyle: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const body = input as unknown as Record<string, unknown>
        const taskLocale = resolveTaskLocale(ctx.request, body)
        const bodyMeta = isRecord(body.meta) ? body.meta : {}

        const name = normalizeString(body.name)
        if (!name) throw new ApiError('INVALID_PARAMS')

        const normalizedArtStyle = normalizeString(body.artStyle)
        if (!isArtStyleValue(normalizedArtStyle)) {
          throw new ApiError('INVALID_PARAMS', {
            code: 'INVALID_ART_STYLE',
            message: 'artStyle is required and must be a supported value',
          })
        }

        const folderId = normalizeString(body.folderId) || null
        if (folderId) {
          const folder = await prisma.globalAssetFolder.findUnique({
            where: { id: folderId },
            select: { id: true, userId: true },
          })
          if (!folder || folder.userId !== ctx.userId) throw new ApiError('INVALID_PARAMS')
        }

        const initialImageUrl = normalizeString(body.initialImageUrl) || null
        const descriptionText = normalizeString(body.description) || `${name} 的角色设定`
        const imageMedia = await resolveMediaRefFromLegacyValue(initialImageUrl)
        const generateFromReference = body.generateFromReference === true || body.generateFromReference === 1 || body.generateFromReference === '1'
        const referenceImages = generateFromReference ? parseReferenceImages(body) : []
        const sanitizedReferenceImages = generateFromReference && referenceImages.length > 0
          ? sanitizeImageInputsForTaskPayload(referenceImages)
          : null

        if (sanitizedReferenceImages) {
          if (sanitizedReferenceImages.normalized.length === 0) {
            throw new ApiError('INVALID_PARAMS', {
              code: 'REFERENCE_IMAGES_INVALID',
              issues: sanitizedReferenceImages.issues,
            })
          }
        }

        const character = await prisma.globalCharacter.create({
          data: {
            userId: ctx.userId,
            folderId,
            name,
            aliases: null,
          },
        })

        const appearance = await prisma.globalCharacterAppearance.create({
          data: {
            characterId: character.id,
            appearanceIndex: PRIMARY_APPEARANCE_INDEX,
            changeReason: '初始形象',
            artStyle: normalizedArtStyle,
            description: descriptionText,
            descriptions: JSON.stringify([descriptionText]),
            imageUrl: initialImageUrl,
            imageMediaId: imageMedia?.id || null,
            imageUrls: encodeImageUrls(initialImageUrl ? [initialImageUrl] : []),
            previousImageUrls: encodeImageUrls([]),
          },
        })

        if (sanitizedReferenceImages) {
          const count = normalizeImageGenerationCount('reference-to-character', body.count)
          const customDescription = normalizeString(body.customDescription)

          const payload: Record<string, unknown> = {
            ...body,
            referenceImageUrls: sanitizedReferenceImages.normalized,
            ...(sanitizedReferenceImages.issues.length > 0 ? { referenceImageIssues: sanitizedReferenceImages.issues } : {}),
            characterName: name,
            characterId: character.id,
            appearanceId: appearance.id,
            count,
            isBackgroundJob: true,
            artStyle: normalizedArtStyle,
            ...(customDescription ? { customDescription } : {}),
            ...(taskLocale ? { locale: taskLocale } : {}),
            meta: {
              ...bodyMeta,
              ...(taskLocale ? { locale: taskLocale } : {}),
            },
            displayMode: 'detail',
          }

          try {
            await submitOperationTask({
              request: ctx.request,
              userId: ctx.userId,
              projectId: 'global-asset-hub',
              type: TASK_TYPE.ASSET_HUB_REFERENCE_TO_CHARACTER,
              targetType: 'GlobalCharacterAppearance',
              targetId: appearance.id,
              operationId: 'create_asset_hub_character',
              source: ctx.source,
              confirmed: body.confirmed === true,
              payload,
              dedupeKey: `asset_hub_reference_to_character:${appearance.id}:${count}`,
            })
          } catch (error) {
            await prisma.globalCharacter.delete({ where: { id: character.id } })
            throw error
          }
        }

        const characterWithAppearances = await prisma.globalCharacter.findUnique({
          where: { id: character.id },
          include: { appearances: true },
        })

        const withMedia = characterWithAppearances
          ? await attachMediaFieldsToGlobalCharacter(characterWithAppearances)
          : null

        return {
          success: true,
          character: withMedia,
        }
      },
    }),

    asset_hub_get_character: defineOperation({
      id: 'asset_hub_get_character',
      summary: 'Get a single global character by id.',
      intent: 'query',
      effects: {
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({
        characterId: z.string().min(1),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const character = await prisma.globalCharacter.findUnique({
          where: { id: input.characterId },
          include: { appearances: true },
        })
        if (!character || character.userId !== ctx.userId) {
          throw new ApiError('NOT_FOUND')
        }
        const withMedia = await attachMediaFieldsToGlobalCharacter(character)
        return { character: withMedia }
      },
    }),

    asset_hub_update_character: defineOperation({
      id: 'asset_hub_update_character',
      summary: 'Update a global character (name, folder, voice binding, profile fields).',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: true,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({
        characterId: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const body = input as unknown as Record<string, unknown>
        const characterId = normalizeString(body.characterId)
        if (!characterId) throw new ApiError('INVALID_PARAMS')

        const character = await prisma.globalCharacter.findUnique({
          where: { id: characterId },
        })
        if (!character) throw new ApiError('NOT_FOUND')
        if (character.userId !== ctx.userId) throw new ApiError('FORBIDDEN')

        const updateData: Record<string, unknown> = {}

        if (body.name !== undefined) {
          if (typeof body.name !== 'string') throw new ApiError('INVALID_PARAMS')
          updateData.name = body.name.trim()
        }
        if (body.aliases !== undefined) updateData.aliases = body.aliases
        if (body.profileData !== undefined) updateData.profileData = body.profileData
        if (body.profileConfirmed !== undefined) updateData.profileConfirmed = body.profileConfirmed
        if (body.voiceId !== undefined) updateData.voiceId = body.voiceId
        if (body.voiceType !== undefined) updateData.voiceType = body.voiceType
        if (body.globalVoiceId !== undefined) updateData.globalVoiceId = body.globalVoiceId

        if (body.customVoiceUrl !== undefined) {
          const value = typeof body.customVoiceUrl === 'string' ? body.customVoiceUrl : null
          const media = await resolveMediaRefFromLegacyValue(value)
          updateData.customVoiceUrl = value
          updateData.customVoiceMediaId = media?.id || null
        }

        if (body.folderId !== undefined) {
          const folderId = normalizeString(body.folderId) || null
          if (folderId) {
            const folder = await prisma.globalAssetFolder.findUnique({
              where: { id: folderId },
              select: { id: true, userId: true },
            })
            if (!folder || folder.userId !== ctx.userId) throw new ApiError('INVALID_PARAMS')
          }
          updateData.folderId = folderId
        }

        const updated = await prisma.globalCharacter.update({
          where: { id: characterId },
          data: updateData,
          include: { appearances: true },
        })

        const withMedia = await attachMediaFieldsToGlobalCharacter(updated)
        return { success: true, character: withMedia }
      },
    }),

    asset_hub_delete_character: defineOperation({
      id: 'asset_hub_delete_character',
      summary: 'Delete a global character and cleanup unreferenced provider resources.',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: true,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: false,
      },
      confirmation: {
        required: true,
        summary: '将删除该角色记录（不可恢复）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        characterId: z.string().min(1),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const character = await prisma.globalCharacter.findUnique({
          where: { id: input.characterId },
          select: { id: true, userId: true, voiceId: true, voiceType: true },
        })
        if (!character) throw new ApiError('NOT_FOUND')
        if (character.userId !== ctx.userId) throw new ApiError('FORBIDDEN')

        const { collectBailianManagedVoiceIds, cleanupUnreferencedBailianVoices } = await import('@/lib/ai-exec/voice-cleanup')
        const candidateVoiceIds = collectBailianManagedVoiceIds([
          { voiceId: character.voiceId, voiceType: character.voiceType },
        ])
        await cleanupUnreferencedBailianVoices({
          voiceIds: candidateVoiceIds,
          scope: {
            userId: ctx.userId,
            excludeGlobalCharacterId: character.id,
          },
        })

        await prisma.globalCharacter.delete({ where: { id: input.characterId } })
        return { success: true }
      },
    }),
  }
}
