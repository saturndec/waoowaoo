import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { getArtStylePrompt } from '@/lib/constants'
import { createScopedLogger } from '@/lib/logging/core'
import { type TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '../shared'
import {
  assertTaskActive,
  getProjectModels,
  resolveImageSourceFromGeneration,
  uploadImageSourceToCos,
} from '../utils'
import {
  normalizeReferenceImagesForGeneration,
  type OutboundImageNormalizationIssue,
} from '@/lib/media/outbound-image'
import {
  AnyObj,
  clampCount,
  collectPanelReferenceImages,
  findCharacterByName,
  parsePanelCharacterReferences,
  pickFirstString,
  resolveNovelData,
} from './image-task-handler-shared'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'

function parseJsonUnknown(raw: string | null | undefined): unknown | null {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function parseDescriptionList(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

function pickAppearanceDescription(appearance: {
  descriptions?: string | null
  description?: string | null
  selectedIndex?: number | null
}): string {
  const descriptions = parseDescriptionList(appearance.descriptions || null)
  if (descriptions.length > 0) {
    const selectedIndex = typeof appearance.selectedIndex === 'number' ? appearance.selectedIndex : 0
    const selected = descriptions[selectedIndex] || descriptions[0]
    if (selected && selected.trim()) return selected.trim()
  }
  if (typeof appearance.description === 'string' && appearance.description.trim()) {
    return appearance.description.trim()
  }
  return '无描述'
}

function buildPanelPromptContext(params: {
  panel: {
    id: string
    shotType: string | null
    cameraMove: string | null
    description: string | null
    videoPrompt: string | null
    location: string | null
    characters: string | null
    srtSegment: string | null
    photographyRules: string | null
    actingNotes: string | null
  }
  projectData: Awaited<ReturnType<typeof resolveNovelData>>
}) {
  const panelCharacters = parsePanelCharacterReferences(params.panel.characters)
  const characterContexts = panelCharacters.map((reference) => {
    const character = findCharacterByName(params.projectData.characters || [], reference.name)
    if (!character) {
      return {
        name: reference.name,
        appearance: reference.appearance || null,
        description: '无角色外貌数据',
      }
    }

    const appearances = character.appearances || []
    const matchedAppearance =
      (reference.appearance
        ? appearances.find((appearance) => (appearance.changeReason || '').toLowerCase() === reference.appearance!.toLowerCase())
        : null) || appearances[0] || null

    return {
      name: character.name,
      appearance: matchedAppearance?.changeReason || null,
      description: matchedAppearance ? pickAppearanceDescription(matchedAppearance) : '无角色外貌数据',
    }
  })

  const locationContext = (() => {
    if (!params.panel.location) return null
    const matchedLocation = (params.projectData.locations || []).find(
      (item) => item.name.toLowerCase() === params.panel.location!.toLowerCase(),
    )
    if (!matchedLocation) return null
    const selectedImage = (matchedLocation.images || []).find((item) => item.isSelected) || matchedLocation.images?.[0]
    return {
      name: matchedLocation.name,
      description: selectedImage?.description || null,
    }
  })()

  return {
    panel: {
      panel_id: params.panel.id,
      shot_type: params.panel.shotType || '',
      camera_move: params.panel.cameraMove || '',
      description: params.panel.description || '',
      video_prompt: params.panel.videoPrompt || '',
      location: params.panel.location || '',
      characters: panelCharacters,
      source_text: params.panel.srtSegment || '',
      photography_rules: parseJsonUnknown(params.panel.photographyRules),
      acting_notes: parseJsonUnknown(params.panel.actingNotes),
    },
    context: {
      character_appearances: characterContexts,
      location_reference: locationContext,
    },
  }
}

function buildPanelPrompt(params: {
  locale: TaskJobData['locale']
  aspectRatio: string
  styleText: string
  sourceText: string
  contextJson: string
}) {
  return buildPrompt({
    promptId: PROMPT_IDS.NP_SINGLE_PANEL_IMAGE,
    locale: params.locale,
    variables: {
      aspect_ratio: params.aspectRatio,
      storyboard_text_json_input: params.contextJson,
      source_text: params.sourceText || '无',
      style: params.styleText,
    },
  })
}

function toLogError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  return {
    name: 'UnknownError',
    message: String(error),
  }
}

export async function handlePanelImageTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const panelId = pickFirstString(payload.panelId, job.data.targetId)
  if (!panelId) throw new Error('panelId missing')

  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId },
  })

  if (!panel) throw new Error('Panel not found')

  const projectData = await resolveNovelData(job.data.projectId)
  const modelConfig = await getProjectModels(job.data.projectId, job.data.userId)
  const modelKey = modelConfig.storyboardModel
  if (!modelKey) throw new Error('Storyboard model not configured')

  const logger = createScopedLogger({
    module: 'worker.panel-image',
    action: 'panel_image_generate',
    requestId: job.data.trace?.requestId || undefined,
    taskId: job.data.taskId,
    projectId: job.data.projectId,
    userId: job.data.userId,
  })

  const candidateCount = clampCount(payload.candidateCount ?? payload.count, 1, 4, 1)
  const refs = await collectPanelReferenceImages(projectData, panel)
  const normalizationIssues: OutboundImageNormalizationIssue[] = []
  logger.info({
    message: 'panel reference image normalization started',
    details: {
      panelId,
      referenceImagesRawCount: refs.length,
      referenceImageCandidates: refs.map((ref, index) => ({
        index,
        valuePreview: ref.substring(0, 180),
      })),
    },
  })
  const normalizedRefs = await normalizeReferenceImagesForGeneration(refs, {
    onIssue: (issue) => {
      normalizationIssues.push({
        index: issue.index,
        input: issue.input,
        code: issue.code,
        stage: issue.stage,
        message: issue.message,
      })
      logger.warn({
        message: 'panel reference image normalization issue',
        details: {
          panelId,
          issue: {
            index: issue.index,
            code: issue.code,
            stage: issue.stage,
            message: issue.message,
            inputPreview: issue.input.substring(0, 180),
          },
        },
      })
    },
    context: {
      taskType: job.data.type,
      panelId,
      taskId: job.data.taskId,
      projectId: job.data.projectId,
      userId: job.data.userId,
    },
  }).catch((error: unknown) => {
    logger.error({
      message: 'panel reference image normalization failed',
      errorCode: 'PANEL_REFERENCE_IMAGE_NORMALIZATION_FAILED',
      retryable: false,
      details: {
        panelId,
        modelKey,
        referenceImagesRawCount: refs.length,
        normalizationIssueCount: normalizationIssues.length,
        normalizationIssues: normalizationIssues.map((issue) => ({
          ...issue,
          input: issue.input.substring(0, 180),
        })),
      },
      error: toLogError(error),
    })
    throw error
  })
  logger.info({
    message: 'panel reference image normalization completed',
    details: {
      panelId,
      referenceImagesRawCount: refs.length,
      referenceImagesNormalizedCount: normalizedRefs.length,
      normalizationIssueCount: normalizationIssues.length,
    },
  })

  logger.info({
    message: 'panel image generation started',
    details: {
      panelId,
      modelKey,
      candidateCount,
      referenceImagesRawCount: refs.length,
      referenceImagesNormalizedCount: normalizedRefs.length,
      rawUrls: refs.map((u) => u.substring(0, 100)),
      normalizedUrls: normalizedRefs.map((u) => u.substring(0, 100)),
      panelCharacters: panel.characters,
      panelLocation: panel.location,
      artStyle: modelConfig.artStyle,
    },
  })

  const artStyle = getArtStylePrompt(modelConfig.artStyle, job.data.locale)
  if (!projectData.videoRatio) throw new Error('Project videoRatio not configured')
  const aspectRatio = projectData.videoRatio
  const promptContext = buildPanelPromptContext({
    panel: {
      id: panel.id,
      shotType: panel.shotType,
      cameraMove: panel.cameraMove,
      description: panel.description,
      videoPrompt: panel.videoPrompt,
      location: panel.location,
      characters: panel.characters,
      srtSegment: panel.srtSegment,
      photographyRules: panel.photographyRules,
      actingNotes: panel.actingNotes,
    },
    projectData,
  })
  const contextJson = JSON.stringify(promptContext, null, 2)
  const prompt = buildPanelPrompt({
    locale: job.data.locale,
    aspectRatio,
    styleText: artStyle || '与参考图风格一致',
    sourceText: panel.srtSegment || panel.description || '',
    contextJson,
  })
  logger.info({
    message: 'panel image prompt resolved',
    details: {
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 300),
    },
  })

  const candidates: string[] = []

  for (let i = 0; i < candidateCount; i++) {
    const candidateIndex = i + 1
    const candidateStartedAt = Date.now()
    await reportTaskProgress(job, 18 + Math.floor((i / Math.max(candidateCount, 1)) * 58), {
      stage: 'generate_panel_candidate',
      candidateIndex: i,
    })

    logger.info({
      message: 'panel candidate generation started',
      details: {
        panelId,
        candidateIndex,
        candidateCount,
        referenceImagesCount: normalizedRefs.length,
      },
    })

    let source: string
    try {
      source = await resolveImageSourceFromGeneration(job, {
        userId: job.data.userId,
        modelId: modelKey,
        prompt,
        options: {
          referenceImages: normalizedRefs,
          aspectRatio,
        },
        pollProgress: { start: 30, end: 90 },
      })
      logger.info({
        message: 'panel candidate source generated',
        durationMs: Date.now() - candidateStartedAt,
        details: {
          panelId,
          candidateIndex,
          sourceType: source.startsWith('data:') ? 'data-url' : 'url',
        },
      })
    } catch (error) {
      logger.error({
        message: 'panel candidate generation failed',
        errorCode: 'PANEL_CANDIDATE_GENERATION_FAILED',
        retryable: false,
        durationMs: Date.now() - candidateStartedAt,
        details: {
          panelId,
          candidateIndex,
          candidateCount,
          modelKey,
        },
        error: toLogError(error),
      })
      throw error
    }

    try {
      const cosKey = await uploadImageSourceToCos(source, 'panel-candidate', `${panel.id}-${i}`)
      candidates.push(cosKey)
      logger.info({
        message: 'panel candidate uploaded',
        durationMs: Date.now() - candidateStartedAt,
        details: {
          panelId,
          candidateIndex,
          cosKeyPreview: cosKey.substring(0, 120),
        },
      })
    } catch (error) {
      logger.error({
        message: 'panel candidate upload failed',
        errorCode: 'PANEL_CANDIDATE_UPLOAD_FAILED',
        retryable: false,
        durationMs: Date.now() - candidateStartedAt,
        details: {
          panelId,
          candidateIndex,
        },
        error: toLogError(error),
      })
      throw error
    }
  }

  const isFirstGeneration = !panel.imageUrl

  await assertTaskActive(job, 'persist_panel_image')
  if (isFirstGeneration) {
    await prisma.novelPromotionPanel.update({
      where: { id: panel.id },
      data: {
        imageUrl: candidates[0] || null,
        candidateImages: candidateCount > 1 ? JSON.stringify(candidates) : null,
      },
    })
  } else {
    await prisma.novelPromotionPanel.update({
      where: { id: panel.id },
      data: {
        previousImageUrl: panel.imageUrl,
        candidateImages: JSON.stringify(candidates),
      },
    })
  }

  logger.info({
    message: 'panel image generation persisted',
    details: {
      panelId: panel.id,
      isFirstGeneration,
      candidateCount: candidates.length,
      firstCandidatePreview: candidates[0]?.substring(0, 120) || null,
    },
  })

  return {
    panelId: panel.id,
    candidateCount: candidates.length,
    imageUrl: isFirstGeneration ? candidates[0] || null : null,
  }
}
