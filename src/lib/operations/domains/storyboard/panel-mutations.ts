import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createMutationBatch } from '@/lib/mutation-batch/service'
import { resolveInsertPanelUserInput } from '@/lib/project-workflow/insert-panel'
import { serializeStructuredJsonField } from '@/lib/project-workflow/panel-ai-data-sync'
import type { TaskSubmittedPartData } from '@/lib/project-agent/types'
import type { ProjectAgentOperationContext } from '@/lib/operations/types'
import { writeOperationDataPart } from '@/lib/operations/types'
import { getSignedUrl, generateUniqueKey, downloadAndUploadImage, toFetchableUrl } from '@/lib/storage'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { getProjectModelConfig } from '@/lib/config-service'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { getRequestId } from '@/lib/api-errors'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseNullableNumberField(value: unknown): number | null {
  if (value === null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  throw new Error('INVALID_PARAMS')
}

function toStructuredJsonField(value: unknown, fieldName: string): string | null {
  try {
    return serializeStructuredJsonField(value, fieldName)
  } catch (error) {
    const message = error instanceof Error ? error.message : `${fieldName} must be valid JSON`
    throw new Error(message || 'INVALID_PARAMS')
  }
}

function resolveLocaleFromContext(locale?: unknown): string {
  const normalized = normalizeString(locale)
  return normalized || 'zh'
}

const storyboardMutationActionSchema = z.enum([
  'insert_panel',
  'update_panel_prompt',
  'reorder_panels',
  'create_panel',
  'select_panel_candidate',
  'cancel_panel_candidates',
  'delete_panel',
  'update_panel_fields',
  'revert_panel_image',
])

const storyboardMutationInputSchema = z.object({
  confirmed: z.boolean().optional(),
  action: storyboardMutationActionSchema,
  storyboardId: z.string().min(1).optional(),
  insertAfterPanelId: z.string().min(1).optional(),
  panelId: z.string().min(1).optional(),
  panelIndex: z.number().int().min(0).max(2000).optional(),
  panelNumber: z.unknown().optional(),
  shotType: z.string().nullable().optional(),
  cameraMove: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  characters: z.string().nullable().optional(),
  props: z.string().nullable().optional(),
  srtSegment: z.string().nullable().optional(),
  srtStart: z.unknown().optional(),
  srtEnd: z.unknown().optional(),
  duration: z.unknown().optional(),
  linkedToNextPanel: z.unknown().optional(),
  userInput: z.string().optional(),
  prompt: z.string().optional(),
  videoPrompt: z.string().nullable().optional(),
  firstLastFramePrompt: z.string().nullable().optional(),
  imagePrompt: z.string().nullable().optional(),
  selectedImageUrl: z.string().optional(),
  previousImageUrl: z.string().nullable().optional(),
  actingNotes: z.unknown().optional(),
  photographyRules: z.unknown().optional(),
  orderedPanelIds: z.array(z.string().min(1)).min(1).optional(),
}).passthrough()

export const createStoryboardPanelInputSchema = z.object({
  confirmed: z.boolean().optional(),
  storyboardId: z.string().min(1),
  shotType: z.string().nullable().optional(),
  cameraMove: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  characters: z.string().nullable().optional(),
  props: z.string().nullable().optional(),
  srtStart: z.unknown().optional(),
  srtEnd: z.unknown().optional(),
  duration: z.unknown().optional(),
  videoPrompt: z.string().nullable().optional(),
  firstLastFramePrompt: z.string().nullable().optional(),
}).passthrough()

export const deleteStoryboardPanelInputSchema = z.object({
  confirmed: z.boolean().optional(),
  storyboardId: z.string().min(1).optional(),
  panelId: z.string().min(1).optional(),
  panelIndex: z.number().int().min(0).max(2000).optional(),
}).refine((value) => Boolean(value.panelId || (value.storyboardId && typeof value.panelIndex === 'number')), {
  message: 'panelId or (storyboardId + panelIndex) is required',
  path: ['panelId'],
})

export const updateStoryboardPanelPromptInputSchema = z.object({
  confirmed: z.boolean().optional(),
  storyboardId: z.string().min(1).optional(),
  panelId: z.string().min(1).optional(),
  panelIndex: z.number().int().min(0).max(2000).optional(),
  videoPrompt: z.string().nullable().optional(),
  firstLastFramePrompt: z.string().nullable().optional(),
  imagePrompt: z.string().nullable().optional(),
}).refine((value) => Boolean(value.panelId || (value.storyboardId && typeof value.panelIndex === 'number')), {
  message: 'panelId or (storyboardId + panelIndex) is required',
  path: ['panelId'],
}).refine((value) => (
  Object.prototype.hasOwnProperty.call(value, 'videoPrompt')
  || Object.prototype.hasOwnProperty.call(value, 'firstLastFramePrompt')
  || Object.prototype.hasOwnProperty.call(value, 'imagePrompt')
), {
  message: 'at least one prompt field is required',
  path: ['videoPrompt'],
})

export const updateStoryboardPanelFieldsInputSchema = z.object({
  confirmed: z.boolean().optional(),
  storyboardId: z.string().min(1),
  panelId: z.string().min(1).optional(),
  panelIndex: z.number().int().min(0).max(2000).optional(),
  panelNumber: z.unknown().optional(),
  shotType: z.string().nullable().optional(),
  cameraMove: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  characters: z.string().nullable().optional(),
  props: z.string().nullable().optional(),
  srtStart: z.unknown().optional(),
  srtEnd: z.unknown().optional(),
  duration: z.unknown().optional(),
  linkedToNextPanel: z.unknown().optional(),
  actingNotes: z.unknown().optional(),
  photographyRules: z.unknown().optional(),
  videoPrompt: z.string().nullable().optional(),
  firstLastFramePrompt: z.string().nullable().optional(),
}).passthrough().refine((value) => Boolean(value.panelId || typeof value.panelIndex === 'number'), {
  message: 'panelId or panelIndex is required',
  path: ['panelId'],
})

export const reorderStoryboardPanelsInputSchema = z.object({
  confirmed: z.boolean().optional(),
  storyboardId: z.string().min(1),
  orderedPanelIds: z.array(z.string().min(1)).min(1),
})

export const selectStoryboardPanelCandidateInputSchema = z.object({
  confirmed: z.boolean().optional(),
  panelId: z.string().min(1),
  selectedImageUrl: z.string().min(1),
})

export const cancelStoryboardPanelCandidatesInputSchema = z.object({
  confirmed: z.boolean().optional(),
  panelId: z.string().min(1),
})

export const revertStoryboardPanelImageInputSchema = z.object({
  confirmed: z.boolean().optional(),
  panelId: z.string().min(1),
})

export const insertStoryboardPanelInputSchema = z.object({
  confirmed: z.boolean().optional(),
  storyboardId: z.string().min(1),
  insertAfterPanelId: z.string().min(1),
  userInput: z.string().optional(),
  prompt: z.string().optional(),
}).passthrough()

type StoryboardMutationInput = z.infer<typeof storyboardMutationInputSchema>

type PanelHistoryEntry = {
  url: string
  timestamp: string
}

function parseUnknownArray(jsonValue: string | null): unknown[] {
  if (!jsonValue) return []
  try {
    const parsed = JSON.parse(jsonValue)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parsePanelHistory(jsonValue: string | null): PanelHistoryEntry[] {
  return parseUnknownArray(jsonValue).filter((entry): entry is PanelHistoryEntry => {
    if (!entry || typeof entry !== 'object') return false
    const candidate = entry as { url?: unknown; timestamp?: unknown }
    return typeof candidate.url === 'string' && typeof candidate.timestamp === 'string'
  })
}

export async function executeStoryboardMutationOperation(
  ctx: ProjectAgentOperationContext,
  input: StoryboardMutationInput,
  operationId: string,
) {
  const locale = resolveLocaleFromContext(ctx.context.locale)
  let storyboardId = normalizeString(input.storyboardId)

  if (input.action === 'select_panel_candidate' || input.action === 'cancel_panel_candidates') {
    const panelId = normalizeString(input.panelId)
    if (!panelId) {
      throw new Error('PROJECT_AGENT_PANEL_REQUIRED')
    }

    const panel = await prisma.projectPanel.findFirst({
      where: {
        id: panelId,
        storyboard: {
          episode: {
            projectId: ctx.projectId,
          },
        },
      },
      select: {
        id: true,
        imageUrl: true,
        imageHistory: true,
        candidateImages: true,
        storyboard: { select: { episodeId: true } },
      },
    })
    if (!panel) {
      throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
    }

    if (input.action === 'cancel_panel_candidates') {
      const previousCandidateImages = panel.candidateImages
      await prisma.projectPanel.update({
        where: { id: panelId },
        data: { candidateImages: null },
      })

      const mutationBatch = await createMutationBatch({
        projectId: ctx.projectId,
        userId: ctx.userId,
        source: ctx.source,
        operationId,
        episodeId: panel.storyboard.episodeId,
        summary: `cancel_panel_candidates:${panelId}`,
        entries: [
          {
            kind: 'panel_candidates_restore',
            targetType: 'ProjectPanel',
            targetId: panelId,
            payload: {
              previousCandidateImages,
            },
          },
        ],
      })

      return { success: true, panelId, mutationBatchId: mutationBatch.id }
    }

    const selectedImageUrl = normalizeString(input.selectedImageUrl)
    if (!selectedImageUrl) {
      throw new Error('PROJECT_AGENT_SELECTED_IMAGE_REQUIRED')
    }

    const candidateImages = parseUnknownArray(panel.candidateImages)
    const selectedCosKey = await resolveStorageKeyFromMediaValue(selectedImageUrl)
    const candidateKeys = (await Promise.all(
      candidateImages.map((candidate: unknown) => resolveStorageKeyFromMediaValue(candidate)),
    )).filter((key): key is string => !!key)

    if (!selectedCosKey || !candidateKeys.includes(selectedCosKey)) {
      throw new Error('PROJECT_AGENT_PANEL_CANDIDATE_INVALID')
    }

    const currentHistory = parsePanelHistory(panel.imageHistory)
    if (panel.imageUrl) {
      currentHistory.push({
        url: panel.imageUrl,
        timestamp: new Date().toISOString(),
      })
    }

    let finalImageKey = selectedCosKey
    const isReusableKey = !finalImageKey.startsWith('http://')
      && !finalImageKey.startsWith('https://')
      && !finalImageKey.startsWith('/')

    if (!isReusableKey) {
      const sourceUrl = toFetchableUrl(selectedImageUrl)
      const cosKey = generateUniqueKey(`panel-${panelId}-selected`, 'png')
      finalImageKey = await downloadAndUploadImage(sourceUrl, cosKey)
    }

    const signedUrl = getSignedUrl(finalImageKey, 7 * 24 * 3600)
    const previousCandidateImages = panel.candidateImages
    const previousImageUrl = panel.imageUrl
    const previousImageHistory = panel.imageHistory

    await prisma.projectPanel.update({
      where: { id: panelId },
      data: {
        imageUrl: finalImageKey,
        imageHistory: JSON.stringify(currentHistory),
        candidateImages: null,
      },
    })

    const mutationBatch = await createMutationBatch({
      projectId: ctx.projectId,
      userId: ctx.userId,
      source: ctx.source,
      operationId,
      episodeId: panel.storyboard.episodeId,
      summary: `select_panel_candidate:${panelId}`,
      entries: [
        {
          kind: 'panel_candidate_select_restore',
          targetType: 'ProjectPanel',
          targetId: panelId,
          payload: {
            previousImageUrl,
            previousImageHistory,
            previousCandidateImages,
          },
        },
      ],
    })

    return {
      success: true,
      panelId,
      imageUrl: signedUrl,
      cosKey: finalImageKey,
      mutationBatchId: mutationBatch.id,
    }
  }

  if (input.action === 'revert_panel_image') {
    const panelId = normalizeString(input.panelId)
    if (!panelId) {
      throw new Error('PROJECT_AGENT_PANEL_REQUIRED')
    }

    const panel = await prisma.projectPanel.findFirst({
      where: {
        id: panelId,
        storyboard: {
          episode: {
            projectId: ctx.projectId,
          },
        },
      },
      select: {
        id: true,
        storyboardId: true,
        imageUrl: true,
        imageMediaId: true,
        imageHistory: true,
        previousImageUrl: true,
        previousImageMediaId: true,
        storyboard: {
          select: {
            episodeId: true,
          },
        },
      },
    })
    if (!panel) {
      throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
    }
    if (!panel.previousImageUrl && !panel.previousImageMediaId) {
      throw new Error('PROJECT_AGENT_PANEL_PREVIOUS_IMAGE_REQUIRED')
    }

    const history = parsePanelHistory(panel.imageHistory)
    if (panel.imageUrl) {
      history.push({
        url: panel.imageUrl,
        timestamp: new Date().toISOString(),
      })
    }

    await prisma.projectPanel.update({
      where: { id: panel.id },
      data: {
        imageUrl: panel.previousImageUrl,
        imageMediaId: panel.previousImageMediaId,
        previousImageUrl: null,
        previousImageMediaId: null,
        imageHistory: JSON.stringify(history),
      },
    })

    const mutationBatch = await createMutationBatch({
      projectId: ctx.projectId,
      userId: ctx.userId,
      source: ctx.source,
      operationId,
      episodeId: panel.storyboard.episodeId,
      summary: `revert_panel_image:${panelId}`,
      entries: [
        {
          kind: 'panel_image_revert_restore',
          targetType: 'ProjectPanel',
          targetId: panel.id,
          payload: {
            previous: {
              imageUrl: panel.imageUrl,
              imageMediaId: panel.imageMediaId,
              previousImageUrl: panel.previousImageUrl,
              previousImageMediaId: panel.previousImageMediaId,
              imageHistory: panel.imageHistory,
            },
          },
        },
      ],
    })

    return { success: true, panelId: panel.id, storyboardId: panel.storyboardId, mutationBatchId: mutationBatch.id }
  }

  if (!storyboardId && (input.action === 'delete_panel' || input.action === 'update_panel_prompt')) {
    const panelId = normalizeString(input.panelId)
    if (panelId) {
      const panel = await prisma.projectPanel.findFirst({
        where: {
          id: panelId,
          storyboard: {
            episode: {
              projectId: ctx.projectId,
            },
          },
        },
        select: { storyboardId: true },
      })
      if (!panel) {
        throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
      }
      storyboardId = panel.storyboardId
    }
  }

  if (!storyboardId) {
    throw new Error('PROJECT_AGENT_STORYBOARD_REQUIRED')
  }

  const storyboard = await prisma.projectStoryboard.findFirst({
    where: {
      id: storyboardId,
      episode: {
        projectId: ctx.projectId,
      },
    },
    select: { id: true, episodeId: true },
  })
  if (!storyboard) {
    throw new Error('PROJECT_AGENT_STORYBOARD_NOT_FOUND')
  }

  if (input.action === 'create_panel') {
    const createdPanel = await prisma.$transaction(async (tx) => {
      const maxPanel = await tx.projectPanel.findFirst({
        where: { storyboardId },
        orderBy: { panelIndex: 'desc' },
        select: { panelIndex: true },
      })
      const nextPanelIndex = (maxPanel?.panelIndex ?? -1) + 1

      const hasSrtStart = Object.prototype.hasOwnProperty.call(input, 'srtStart')
      const hasSrtEnd = Object.prototype.hasOwnProperty.call(input, 'srtEnd')
      const hasDuration = Object.prototype.hasOwnProperty.call(input, 'duration')

      const panel = await tx.projectPanel.create({
        data: {
          storyboardId,
          panelIndex: nextPanelIndex,
          panelNumber: nextPanelIndex + 1,
          shotType: input.shotType ?? null,
          cameraMove: input.cameraMove ?? null,
          description: input.description ?? null,
          location: input.location ?? null,
          characters: input.characters ?? null,
          props: input.props ?? null,
          ...(hasSrtStart ? { srtStart: parseNullableNumberField(input.srtStart) } : {}),
          ...(hasSrtEnd ? { srtEnd: parseNullableNumberField(input.srtEnd) } : {}),
          ...(hasDuration ? { duration: parseNullableNumberField(input.duration) } : {}),
          videoPrompt: input.videoPrompt ?? null,
          firstLastFramePrompt: input.firstLastFramePrompt ?? null,
        },
      })

      const panelCount = await tx.projectPanel.count({
        where: { storyboardId },
      })
      await tx.projectStoryboard.update({
        where: { id: storyboardId },
        data: { panelCount },
      })

      return panel
    })

    const mutationBatch = await createMutationBatch({
      projectId: ctx.projectId,
      userId: ctx.userId,
      source: ctx.source,
      operationId,
      episodeId: storyboard.episodeId,
      summary: `create_panel:${createdPanel.id}`,
      entries: [
        {
          kind: 'panel_create_delete',
          targetType: 'ProjectPanel',
          targetId: createdPanel.id,
          payload: {
            storyboardId,
            panelIndex: createdPanel.panelIndex,
          },
        },
      ],
    })

    return {
      success: true,
      panel: createdPanel,
      panelId: createdPanel.id,
      storyboardId,
      mutationBatchId: mutationBatch.id,
    }
  }

  if (input.action === 'delete_panel') {
    let panelId = normalizeString(input.panelId)
    if (!panelId) {
      if (typeof input.panelIndex !== 'number' || !Number.isFinite(input.panelIndex)) {
        throw new Error('PROJECT_AGENT_PANEL_REQUIRED')
      }
      const panel = await prisma.projectPanel.findFirst({
        where: {
          storyboardId,
          panelIndex: input.panelIndex,
        },
        select: { id: true },
      })
      panelId = panel?.id || ''
    }
    if (!panelId) {
      throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
    }

    const panel = await prisma.projectPanel.findFirst({
      where: { id: panelId, storyboardId },
      select: {
        id: true,
        storyboardId: true,
        panelIndex: true,
        panelNumber: true,
        shotType: true,
        cameraMove: true,
        description: true,
        location: true,
        characters: true,
        props: true,
        srtSegment: true,
        srtStart: true,
        srtEnd: true,
        duration: true,
        imagePrompt: true,
        imageUrl: true,
        imageMediaId: true,
        imageHistory: true,
        videoPrompt: true,
        firstLastFramePrompt: true,
        videoUrl: true,
        videoGenerationMode: true,
        videoMediaId: true,
        sceneType: true,
        candidateImages: true,
        linkedToNextPanel: true,
        lipSyncTaskId: true,
        lipSyncVideoUrl: true,
        lipSyncVideoMediaId: true,
        sketchImageUrl: true,
        sketchImageMediaId: true,
        photographyRules: true,
        actingNotes: true,
        previousImageUrl: true,
        previousImageMediaId: true,
      },
    })
    if (!panel) {
      throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
    }

    await prisma.$transaction(async (tx) => {
      await tx.projectPanel.delete({
        where: { id: panelId },
      })

      const maxPanel = await tx.projectPanel.findFirst({
        where: { storyboardId },
        orderBy: { panelIndex: 'desc' },
        select: { panelIndex: true },
      })
      const maxPanelIndex = maxPanel?.panelIndex ?? -1
      const offset = maxPanelIndex + 1000

      await tx.projectPanel.updateMany({
        where: {
          storyboardId,
          panelIndex: { gt: panel.panelIndex },
        },
        data: {
          panelIndex: { increment: offset },
          panelNumber: { increment: offset },
        },
      })

      await tx.projectPanel.updateMany({
        where: {
          storyboardId,
          panelIndex: { gt: panel.panelIndex + offset },
        },
        data: {
          panelIndex: { decrement: offset + 1 },
          panelNumber: { decrement: offset + 1 },
        },
      })

      const panelCount = await tx.projectPanel.count({
        where: { storyboardId },
      })
      await tx.projectStoryboard.update({
        where: { id: storyboardId },
        data: { panelCount },
      })
    })

    const mutationBatch = await createMutationBatch({
      projectId: ctx.projectId,
      userId: ctx.userId,
      source: ctx.source,
      operationId,
      episodeId: storyboard.episodeId,
      summary: `delete_panel:${panelId}`,
      entries: [
        {
          kind: 'panel_delete_restore',
          targetType: 'ProjectStoryboard',
          targetId: storyboardId,
          payload: {
            panel,
          },
        },
      ],
    })

    return { success: true, panelId, storyboardId, mutationBatchId: mutationBatch.id }
  }

  if (input.action === 'update_panel_fields') {
    let panelId = normalizeString(input.panelId)
    const panelIndex = typeof input.panelIndex === 'number' && Number.isFinite(input.panelIndex)
      ? input.panelIndex
      : null

    const updateData: Record<string, unknown> = {}
    if (Object.prototype.hasOwnProperty.call(input, 'panelNumber')) {
      const parsed = parseNullableNumberField(input.panelNumber)
      updateData.panelNumber = parsed === null ? null : Math.trunc(parsed)
    }
    if (Object.prototype.hasOwnProperty.call(input, 'shotType')) updateData.shotType = input.shotType
    if (Object.prototype.hasOwnProperty.call(input, 'cameraMove')) updateData.cameraMove = input.cameraMove
    if (Object.prototype.hasOwnProperty.call(input, 'description')) updateData.description = input.description
    if (Object.prototype.hasOwnProperty.call(input, 'location')) updateData.location = input.location
    if (Object.prototype.hasOwnProperty.call(input, 'characters')) updateData.characters = input.characters
    if (Object.prototype.hasOwnProperty.call(input, 'props')) updateData.props = input.props
    if (Object.prototype.hasOwnProperty.call(input, 'srtSegment')) updateData.srtSegment = input.srtSegment
    if (Object.prototype.hasOwnProperty.call(input, 'srtStart')) updateData.srtStart = parseNullableNumberField(input.srtStart)
    if (Object.prototype.hasOwnProperty.call(input, 'srtEnd')) updateData.srtEnd = parseNullableNumberField(input.srtEnd)
    if (Object.prototype.hasOwnProperty.call(input, 'duration')) updateData.duration = parseNullableNumberField(input.duration)
    if (Object.prototype.hasOwnProperty.call(input, 'videoPrompt')) updateData.videoPrompt = input.videoPrompt
    if (Object.prototype.hasOwnProperty.call(input, 'firstLastFramePrompt')) updateData.firstLastFramePrompt = input.firstLastFramePrompt
    if (Object.prototype.hasOwnProperty.call(input, 'linkedToNextPanel')) {
      updateData.linkedToNextPanel = input.linkedToNextPanel === true
    }
    if (Object.prototype.hasOwnProperty.call(input, 'actingNotes')) updateData.actingNotes = toStructuredJsonField(input.actingNotes, 'actingNotes')
    if (Object.prototype.hasOwnProperty.call(input, 'photographyRules')) updateData.photographyRules = toStructuredJsonField(input.photographyRules, 'photographyRules')

    if (Object.keys(updateData).length === 0) {
      return { success: true, panelId: panelId || null, noop: true }
    }

    const existing = panelId
      ? await prisma.projectPanel.findFirst({
          where: { id: panelId, storyboardId },
          select: {
            id: true,
            panelIndex: true,
            panelNumber: true,
            shotType: true,
            cameraMove: true,
            description: true,
            location: true,
            characters: true,
            props: true,
            srtSegment: true,
            srtStart: true,
            srtEnd: true,
            duration: true,
            videoPrompt: true,
            firstLastFramePrompt: true,
            linkedToNextPanel: true,
            actingNotes: true,
            photographyRules: true,
          },
        })
      : panelIndex === null
        ? null
        : await prisma.projectPanel.findUnique({
            where: {
              storyboardId_panelIndex: {
                storyboardId,
                panelIndex,
              },
            },
            select: {
              id: true,
              panelIndex: true,
              panelNumber: true,
              shotType: true,
              cameraMove: true,
              description: true,
              location: true,
              characters: true,
              props: true,
              srtSegment: true,
              srtStart: true,
              srtEnd: true,
              duration: true,
              videoPrompt: true,
              firstLastFramePrompt: true,
              linkedToNextPanel: true,
              actingNotes: true,
              photographyRules: true,
            },
          })

    if (existing) {
      panelId = existing.id
      await prisma.projectPanel.update({
        where: { id: existing.id },
        data: updateData,
      })

      const mutationBatch = await createMutationBatch({
        projectId: ctx.projectId,
        userId: ctx.userId,
        source: ctx.source,
        operationId,
        episodeId: storyboard.episodeId,
        summary: `update_panel_fields:${existing.id}`,
        entries: [
          {
            kind: 'panel_fields_restore',
            targetType: 'ProjectPanel',
            targetId: existing.id,
            payload: {
              previous: existing,
            },
          },
        ],
      })

      return { success: true, panelId: existing.id, storyboardId, mutationBatchId: mutationBatch.id }
    }

    if (panelIndex === null) {
      throw new Error('PROJECT_AGENT_PANEL_REQUIRED')
    }

    const createdPanel = await prisma.projectPanel.create({
      data: {
        storyboardId,
        panelIndex,
        panelNumber: panelIndex + 1,
        imageUrl: null,
        ...updateData,
      },
      select: { id: true, panelIndex: true },
    })

    const panelCount = await prisma.projectPanel.count({
      where: { storyboardId },
    })
    await prisma.projectStoryboard.update({
      where: { id: storyboardId },
      data: { panelCount },
    })

    const mutationBatch = await createMutationBatch({
      projectId: ctx.projectId,
      userId: ctx.userId,
      source: ctx.source,
      operationId,
      episodeId: storyboard.episodeId,
      summary: `create_panel:${createdPanel.id}`,
      entries: [
        {
          kind: 'panel_create_delete',
          targetType: 'ProjectPanel',
          targetId: createdPanel.id,
          payload: {
            storyboardId,
            panelIndex: createdPanel.panelIndex,
          },
        },
      ],
    })

    return { success: true, panelId: createdPanel.id, storyboardId, created: true, mutationBatchId: mutationBatch.id }
  }

  if (input.action === 'update_panel_prompt') {
    let panelId = normalizeString(input.panelId)
    if (!panelId) {
      if (typeof input.panelIndex !== 'number' || !Number.isFinite(input.panelIndex)) {
        throw new Error('PROJECT_AGENT_PANEL_REQUIRED')
      }
      const panel = await prisma.projectPanel.findFirst({
        where: {
          storyboardId,
          panelIndex: input.panelIndex,
        },
        select: { id: true },
      })
      panelId = panel?.id || ''
    }

    const updateData: Record<string, unknown> = {}
    if (Object.prototype.hasOwnProperty.call(input, 'videoPrompt')) updateData.videoPrompt = input.videoPrompt
    if (Object.prototype.hasOwnProperty.call(input, 'firstLastFramePrompt')) updateData.firstLastFramePrompt = input.firstLastFramePrompt
    if (Object.prototype.hasOwnProperty.call(input, 'imagePrompt')) updateData.imagePrompt = input.imagePrompt
    if (Object.keys(updateData).length === 0) {
      return { success: true, panelId, noop: true }
    }

    if (!panelId) {
      if (typeof input.panelIndex !== 'number' || !Number.isFinite(input.panelIndex)) {
        throw new Error('PROJECT_AGENT_PANEL_REQUIRED')
      }

      const createdPanel = await prisma.projectPanel.create({
        data: {
          storyboardId,
          panelIndex: input.panelIndex,
          panelNumber: input.panelIndex + 1,
          imageUrl: null,
          ...updateData,
        },
        select: { id: true, panelIndex: true },
      })

      const panelCount = await prisma.projectPanel.count({
        where: { storyboardId },
      })
      await prisma.projectStoryboard.update({
        where: { id: storyboardId },
        data: { panelCount },
      })

      const mutationBatch = await createMutationBatch({
        projectId: ctx.projectId,
        userId: ctx.userId,
        source: ctx.source,
        operationId,
        episodeId: storyboard.episodeId,
        summary: `create_panel:${createdPanel.id}`,
        entries: [
          {
            kind: 'panel_create_delete',
            targetType: 'ProjectPanel',
            targetId: createdPanel.id,
            payload: {
              storyboardId,
              panelIndex: createdPanel.panelIndex,
            },
          },
        ],
      })

      return { success: true, panelId: createdPanel.id, created: true, mutationBatchId: mutationBatch.id }
    }

    const before = await prisma.projectPanel.findFirst({
      where: { id: panelId, storyboardId },
      select: {
        id: true,
        videoPrompt: true,
        firstLastFramePrompt: true,
        imagePrompt: true,
      },
    })
    if (!before) {
      throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
    }

    await prisma.projectPanel.update({
      where: { id: panelId },
      data: updateData,
    })

    const mutationBatch = await createMutationBatch({
      projectId: ctx.projectId,
      userId: ctx.userId,
      source: ctx.source,
      operationId,
      episodeId: storyboard.episodeId,
      summary: `update_panel_prompt:${panelId}`,
      entries: [
        {
          kind: 'panel_prompt_restore',
          targetType: 'ProjectPanel',
          targetId: panelId,
          payload: {
            previousVideoPrompt: before.videoPrompt,
            previousFirstLastFramePrompt: before.firstLastFramePrompt,
            previousImagePrompt: before.imagePrompt,
          },
        },
      ],
    })

    return { success: true, panelId, mutationBatchId: mutationBatch.id }
  }

  if (input.action === 'reorder_panels') {
    const orderedPanelIds = Array.isArray(input.orderedPanelIds)
      ? input.orderedPanelIds
          .filter((panelId: unknown): panelId is string => typeof panelId === 'string')
          .map((panelId: string) => panelId.trim())
          .filter((panelId: string) => panelId.length > 0)
      : []
    if (orderedPanelIds.length === 0) {
      throw new Error('PROJECT_AGENT_ORDER_REQUIRED')
    }

    const panels = await prisma.projectPanel.findMany({
      where: { storyboardId },
      select: { id: true, panelIndex: true, panelNumber: true },
    })

    const panelById = new Map(panels.map((panel) => [panel.id, panel] as const))
    const uniqueIds = Array.from(new Set(orderedPanelIds)) as string[]
    if (uniqueIds.length !== orderedPanelIds.length) {
      throw new Error('PROJECT_AGENT_ORDER_DUPLICATE_IDS')
    }
    if (uniqueIds.length !== panels.length) {
      throw new Error('PROJECT_AGENT_ORDER_INCOMPLETE')
    }
    for (const panelId of uniqueIds) {
      if (!panelById.has(panelId)) {
        throw new Error('PROJECT_AGENT_ORDER_INVALID_PANEL')
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const panel of panels) {
        await tx.projectPanel.update({
          where: { id: panel.id },
          data: { panelIndex: -(panel.panelIndex + 1) },
        })
      }

      for (let nextIndex = 0; nextIndex < uniqueIds.length; nextIndex++) {
        const panelId = uniqueIds[nextIndex] as string
        await tx.projectPanel.update({
          where: { id: panelId },
          data: {
            panelIndex: nextIndex,
            panelNumber: nextIndex + 1,
          },
        })
      }
    })

    const mutationBatch = await createMutationBatch({
      projectId: ctx.projectId,
      userId: ctx.userId,
      source: ctx.source,
      operationId,
      episodeId: storyboard.episodeId,
      summary: `reorder_panels:${storyboardId}`,
      entries: [
        {
          kind: 'panel_reorder_restore',
          targetType: 'ProjectStoryboard',
          targetId: storyboardId,
          payload: {
            storyboardId,
            panels,
          },
        },
      ],
    })

    return { success: true, storyboardId, mutationBatchId: mutationBatch.id }
  }

  if (!input.insertAfterPanelId) {
    throw new Error('PROJECT_AGENT_INSERT_AFTER_REQUIRED')
  }
  const userInput = resolveInsertPanelUserInput(input as unknown as Record<string, unknown>, locale)
  const projectModelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
  const billingPayload: Record<string, unknown> = {
    ...(isRecord(input) ? input : {}),
    userInput,
    ...(projectModelConfig.analysisModel ? { analysisModel: projectModelConfig.analysisModel } : {}),
    meta: {
      locale,
    },
  }
  delete billingPayload.confirmed

  const result = await submitTask({
    userId: ctx.userId,
    locale: resolveRequiredTaskLocale(ctx.request, billingPayload),
    requestId: getRequestId(ctx.request),
    projectId: ctx.projectId,
    type: TASK_TYPE.INSERT_PANEL,
    targetType: 'ProjectStoryboard',
    targetId: storyboardId,
    payload: billingPayload,
    dedupeKey: `insert_panel:${storyboardId}:${input.insertAfterPanelId}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.INSERT_PANEL, billingPayload),
    operationId,
    operationSource: ctx.source,
    operationConfirmed: input.confirmed === true,
    operationRequestId: getRequestId(ctx.request),
  })

  const mutationBatch = await createMutationBatch({
    projectId: ctx.projectId,
    userId: ctx.userId,
    source: ctx.source,
    operationId,
    episodeId: storyboard.episodeId,
    summary: `insert_panel:${storyboardId}:${input.insertAfterPanelId}`,
    entries: [
      {
        kind: 'insert_panel_undo',
        targetType: 'ProjectStoryboard',
        targetId: storyboardId,
        payload: {
          taskId: result.taskId,
        },
      },
    ],
  })

  writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
    operationId,
    taskId: result.taskId,
    status: result.status,
    runId: result.runId || null,
    deduped: result.deduped,
    mutationBatchId: mutationBatch.id,
  })

  return { ...result, storyboardId, mutationBatchId: mutationBatch.id }
}
