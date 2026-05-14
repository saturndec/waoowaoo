import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { AI_PROMPT_IDS, buildAiPrompt } from '@/lib/ai-prompts'
import { withTextBilling } from '@/lib/billing'
import { getProjectModelConfig } from '@/lib/config-service'
import { resolveModelSelection } from '@/lib/user-api/runtime-config'
import { safeParseJsonObject } from '@/lib/json-repair'
import { encodeImageUrls, decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import { ART_STYLES, PRIMARY_APPEARANCE_INDEX, isArtStyleValue } from '@/lib/constants'
import { submitAssetGenerateTask } from '@/lib/assets/services/asset-actions'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'
import { normalizeVideoBlockPlanResponse } from '@/lib/video-groups/planner'
import type { Locale } from '@/i18n/routing'
import {
  normalizeEditAssetRequirements,
  finalizeEditScriptBriefQuestions,
  normalizeEditScriptBriefQuestions,
  normalizeEditScriptCore,
  resolveEditScriptDefaults,
} from './normalize'
import type {
  EditAssetKind,
  EditAssetRequirement,
  EditAssetStatus,
  EditScriptBriefQuestionsPayload,
  EditScriptPayload,
  EditScriptShot,
} from './types'
import { designEditAssetRequirements } from './asset-design'

interface GenerateEditScriptInput {
  readonly request: NextRequest
  readonly projectId: string
  readonly episodeId: string
  readonly userId: string
  readonly locale: Locale
  readonly prompt: string
  readonly videoRatio?: '9:16' | '16:9' | '21:9'
  readonly artStyle?: string
}

interface GenerateEditScriptBriefQuestionsInput {
  readonly request: NextRequest
  readonly projectId: string
  readonly episodeId: string
  readonly userId: string
  readonly locale: Locale
  readonly prompt: string
}

interface GenerateEditScriptAssetsInput {
  readonly request: NextRequest
  readonly projectId: string
  readonly episodeId: string
  readonly userId: string
  readonly locale: Locale
  readonly editScriptId?: string
  readonly requirementId?: string
}

interface GenerateEditScriptStoryboardInput {
  readonly request: NextRequest
  readonly projectId: string
  readonly episodeId: string
  readonly userId: string
  readonly locale: Locale
  readonly editScriptId?: string
}

interface UpdateEditScriptVideoBlockPromptInput {
  readonly projectId: string
  readonly episodeId: string
  readonly editScriptId: string
  readonly blockIndex: number
  readonly prompt: string
}

type PromptStepId =
  | typeof AI_PROMPT_IDS.EDIT_SCRIPT_BRIEF_QUESTIONS
  | typeof AI_PROMPT_IDS.EDIT_SCRIPT_TIMELINE
  | typeof AI_PROMPT_IDS.EDIT_SCRIPT_VISUAL_ACTION
  | typeof AI_PROMPT_IDS.EDIT_SCRIPT_CAMERA
  | typeof AI_PROMPT_IDS.EDIT_SCRIPT_AUDIO
  | typeof AI_PROMPT_IDS.EDIT_SCRIPT_PRIMARY
  | typeof AI_PROMPT_IDS.EDIT_SCRIPT_ASSET_EXTRACT

interface PersistedEditScriptRequirement {
  readonly id: string
  readonly kind: string
  readonly name: string
  readonly description: string
  readonly shotIndexes: Prisma.JsonValue
  readonly status: string
  readonly targetId: string | null
  readonly errorMessage: string | null
}

interface PersistedEditScript {
  readonly id: string
  readonly projectId: string
  readonly episodeId: string
  readonly userPrompt: string
  readonly title: string
  readonly logline: string | null
  readonly durationSec: number
  readonly shotCount: number
  readonly status: string
  readonly shotsJson: Prisma.JsonValue
  readonly videoBlocksJson: Prisma.JsonValue | null
  readonly requirements: readonly PersistedEditScriptRequirement[]
}

interface ExistingAssetRef {
  readonly id: string
  readonly previewImageUrl: string | null
  readonly hasOutput: boolean
  readonly taskTargetType: 'CharacterAppearance' | 'LocationImage'
  readonly taskTargetId: string
}

interface StoryboardCharacterRef {
  readonly characterId: string
  readonly name: string
  readonly appearanceId: string
  readonly appearanceIndex: number
  readonly appearance: string
}

interface PanelDraft {
  readonly panelIndex: number
  readonly panelNumber: number
  readonly shotType: string
  readonly cameraMove: string
  readonly description: string
  readonly location: string | null
  readonly characters: string | null
  readonly props: string | null
  readonly srtSegment: string
  readonly srtStart: number
  readonly srtEnd: number
  readonly duration: number
  readonly imagePrompt: string
  readonly videoPrompt: string
  readonly photographyRules: string
  readonly actingNotes: string | null
}

interface StoryboardPanelTaskTarget {
  readonly id: string
  readonly panelIndex: number
  readonly imageUrl: string | null
  readonly candidateImages: string | null
}

function stringifyForPrompt(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function assertLocale(value: Locale): Locale {
  return value
}

function resolveTextModel(config: Awaited<ReturnType<typeof getProjectModelConfig>>): string {
  if (!config.analysisModel) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MISSING_ANALYSIS_MODEL',
      message: 'Analysis model is required for edit-first script generation',
    })
  }
  return config.analysisModel
}

function buildStyleContext(input: {
  readonly artStyle: string | null
  readonly directorStyleDoc: string | null
  readonly videoRatio: string | null
}): string {
  return [
    input.artStyle ? `artStyle: ${input.artStyle}` : null,
    input.directorStyleDoc ? `directorStyle: ${input.directorStyleDoc}` : null,
    input.videoRatio ? `aspectRatio: ${input.videoRatio}` : null,
  ].filter((line): line is string => Boolean(line)).join('\n') || 'No additional style context.'
}

function buildAvailableVisualStyles(locale: Locale): string {
  return ART_STYLES.map((style, index) => {
    const optionId = ['A', 'B', 'C', 'D', 'E', 'F'][index]
    if (!optionId) {
      throw new Error(`EDIT_SCRIPT_STYLE_OPTION_ID_MISSING:${style.value}`)
    }
    const prompt = locale === 'en' ? style.promptEn : style.promptZh
    return `${optionId}. ${style.label} (${style.value}) - ${prompt}`
  }).join('\n')
}

async function runPromptStep(input: {
  readonly userId: string
  readonly projectId: string
  readonly model: string
  readonly locale: Locale
  readonly promptId: PromptStepId
  readonly variables: Record<string, string>
  readonly stepTitle: string
  readonly stepIndex: number
  readonly stepTotal: number
}): Promise<Record<string, unknown>> {
  const finalPrompt = buildAiPrompt({
    promptId: input.promptId,
    locale: input.locale,
    variables: input.variables,
  })
  const maxInputTokens = Math.max(1200, Math.ceil(finalPrompt.length * 1.2))
  const maxOutputTokens = 2400
  const action = input.promptId
  const runCompletion = async () => executeAiTextStep({
    userId: input.userId,
    model: input.model,
    messages: [{ role: 'user', content: finalPrompt }],
    temperature: 0.4,
    projectId: input.projectId,
    action,
    meta: {
      stepId: action,
      stepTitle: input.stepTitle,
      stepIndex: input.stepIndex,
      stepTotal: input.stepTotal,
    },
  })

  const completion = await withTextBilling(
    input.userId,
    input.model,
    maxInputTokens,
    maxOutputTokens,
    { projectId: input.projectId, action, metadata: { promptId: input.promptId } },
    runCompletion,
  )
  if (!completion.text.trim()) {
    throw new Error(`EDIT_SCRIPT_PROMPT_EMPTY:${input.promptId}`)
  }
  return safeParseJsonObject(completion.text)
}

function readShotNumbers(value: Prisma.JsonValue): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'number' && Number.isInteger(item) ? item : null))
    .filter((item): item is number => item !== null && item > 0)
}

function isEditAssetKind(value: string): value is EditAssetKind {
  return value === 'character' || value === 'location'
}

function normalizeStoredStatus(value: string): EditAssetStatus {
  if (value === 'pending' || value === 'generating' || value === 'completed' || value === 'failed') {
    return value
  }
  return 'failed'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseShotsJson(value: Prisma.JsonValue): EditScriptShot[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): EditScriptShot[] => {
    if (!isRecord(item)) return []
    return [{
      shotNumber: Number(item.shotNumber),
      durationSec: Number(item.durationSec),
      visualAction: String(item.visualAction ?? ''),
      charactersAndScene: String(item.charactersAndScene ?? ''),
      camera: String(item.camera ?? ''),
      videoPrompt: String(item.videoPrompt ?? ''),
      sound: String(item.sound ?? ''),
    }]
  })
}

function parseVideoBlocksJson(value: Prisma.JsonValue | null, shots: readonly EditScriptShot[]) {
  if (!Array.isArray(value) || value.length === 0) return []
  return normalizeVideoBlockPlanResponse({
    response: { items: value },
    allShotNumbers: shots.map((shot) => shot.shotNumber),
    shots,
  }).items
}

async function resolveCharacterAsset(projectId: string, targetId: string | null): Promise<ExistingAssetRef | null> {
  if (!targetId) return null
  const character = await prisma.projectCharacter.findFirst({
    where: { id: targetId, projectId },
    select: {
      id: true,
      appearances: {
        orderBy: { appearanceIndex: 'asc' },
        take: 1,
        select: {
          id: true,
          imageUrl: true,
          imageMediaId: true,
          imageUrls: true,
        },
      },
    },
  })
  const appearance = character?.appearances[0]
  if (!character || !appearance) return null
  const imageUrls = decodeImageUrlsFromDb(appearance.imageUrls, 'editScript.character.imageUrls')
  const previewImageUrl = appearance.imageUrl || imageUrls[0] || null
  return {
    id: character.id,
    previewImageUrl,
    hasOutput: Boolean(appearance.imageMediaId || previewImageUrl),
    taskTargetType: 'CharacterAppearance',
    taskTargetId: appearance.id,
  }
}

async function resolveLocationAsset(projectId: string, targetId: string | null): Promise<ExistingAssetRef | null> {
  if (!targetId) return null
  const location = await prisma.projectLocation.findFirst({
    where: { id: targetId, projectId },
    select: {
      id: true,
      images: {
        orderBy: { imageIndex: 'asc' },
        take: 1,
        select: {
          imageUrl: true,
          imageMediaId: true,
        },
      },
    },
  })
  const image = location?.images[0]
  if (!location || !image) return null
  return {
    id: location.id,
    previewImageUrl: image.imageUrl || null,
    hasOutput: Boolean(image.imageMediaId || image.imageUrl),
    taskTargetType: 'LocationImage',
    taskTargetId: location.id,
  }
}

async function resolveRequirementAsset(projectId: string, requirement: PersistedEditScriptRequirement): Promise<ExistingAssetRef | null> {
  if (requirement.kind === 'character') return resolveCharacterAsset(projectId, requirement.targetId)
  if (requirement.kind === 'location') return resolveLocationAsset(projectId, requirement.targetId)
  return null
}

async function resolveAssetTaskFailure(input: {
  readonly projectId: string
  readonly taskTargetType: ExistingAssetRef['taskTargetType']
  readonly taskTargetId: string
}): Promise<string | null> {
  const task = await prisma.task.findFirst({
    where: {
      projectId: input.projectId,
      targetType: input.taskTargetType,
      targetId: input.taskTargetId,
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      status: true,
      errorMessage: true,
      errorCode: true,
    },
  })
  if (task?.status !== 'failed') return null
  return task.errorMessage || task.errorCode || 'Asset generation failed'
}

async function mapPersistedEditScript(script: PersistedEditScript): Promise<EditScriptPayload> {
  const requirements = await Promise.all(script.requirements.map(async (requirement): Promise<EditAssetRequirement> => {
    const resolvedAsset = await resolveRequirementAsset(script.projectId, requirement)
    const storedStatus = normalizeStoredStatus(requirement.status)
    const taskFailure = !resolvedAsset?.hasOutput && resolvedAsset
      ? await resolveAssetTaskFailure({
        projectId: script.projectId,
        taskTargetType: resolvedAsset.taskTargetType,
        taskTargetId: resolvedAsset.taskTargetId,
      })
      : null
    const status = resolvedAsset?.hasOutput ? 'completed' : taskFailure ? 'failed' : storedStatus
    return {
      id: requirement.id,
      kind: isEditAssetKind(requirement.kind) ? requirement.kind : 'character',
      name: requirement.name,
      description: requirement.description,
      shotNumbers: readShotNumbers(requirement.shotIndexes),
      status,
      targetId: requirement.targetId,
      errorMessage: status === 'failed' ? taskFailure || requirement.errorMessage : null,
      previewImageUrl: resolvedAsset?.previewImageUrl ?? null,
    }
  }))

  const shots = parseShotsJson(script.shotsJson)
  return {
    id: script.id,
    projectId: script.projectId,
    episodeId: script.episodeId,
    userPrompt: script.userPrompt,
    title: script.title,
    logline: script.logline,
    durationSec: script.durationSec,
    shotCount: script.shotCount,
    status: script.status,
    shots,
    videoBlocks: parseVideoBlocksJson(script.videoBlocksJson, shots),
    requirements,
  }
}

async function getPersistedEditScript(projectId: string, episodeId: string, editScriptId?: string): Promise<PersistedEditScript | null> {
  return await prisma.projectEditScript.findFirst({
    where: {
      projectId,
      episodeId,
      ...(editScriptId ? { id: editScriptId } : {}),
    },
    include: {
      requirements: {
        orderBy: [
          { kind: 'asc' },
          { name: 'asc' },
        ],
      },
    },
  })
}

async function markEditScriptGenerating(input: {
  readonly projectId: string
  readonly episodeId: string
  readonly userPrompt: string
  readonly durationSeconds: number
}): Promise<void> {
  await prisma.projectEditScript.upsert({
    where: { episodeId: input.episodeId },
    create: {
      projectId: input.projectId,
      episodeId: input.episodeId,
      userPrompt: input.userPrompt,
      title: 'Generating edit table',
      logline: null,
      durationSec: input.durationSeconds,
      shotCount: 0,
      status: 'generating',
      shotsJson: [] as unknown as Prisma.InputJsonValue,
      videoBlocksJson: [] as unknown as Prisma.InputJsonValue,
    },
    update: {
      userPrompt: input.userPrompt,
      status: 'generating',
    },
  })
}

async function markEditScriptFailed(input: {
  readonly projectId: string
  readonly episodeId: string
  readonly userPrompt: string
  readonly durationSeconds: number
  readonly message: string
}): Promise<void> {
  await prisma.projectEditScript.upsert({
    where: { episodeId: input.episodeId },
    create: {
      projectId: input.projectId,
      episodeId: input.episodeId,
      userPrompt: input.userPrompt,
      title: 'Edit table generation failed',
      logline: input.message,
      durationSec: input.durationSeconds,
      shotCount: 0,
      status: 'failed',
      shotsJson: [] as unknown as Prisma.InputJsonValue,
      videoBlocksJson: [] as unknown as Prisma.InputJsonValue,
    },
    update: {
      userPrompt: input.userPrompt,
      title: 'Edit table generation failed',
      logline: input.message,
      status: 'failed',
    },
  })
}

export async function readProjectEditScript(input: {
  readonly projectId: string
  readonly episodeId: string
}): Promise<EditScriptPayload | null> {
  const script = await getPersistedEditScript(input.projectId, input.episodeId)
  return script ? mapPersistedEditScript(script) : null
}

export async function updateProjectEditScriptVideoBlockPrompt(
  input: UpdateEditScriptVideoBlockPromptInput,
): Promise<EditScriptPayload> {
  const script = await getPersistedEditScript(input.projectId, input.episodeId, input.editScriptId)
  if (!script) throw new ApiError('NOT_FOUND')

  const shots = parseShotsJson(script.shotsJson)
  const blocks = parseVideoBlocksJson(script.videoBlocksJson, shots)
  const targetBlock = blocks[input.blockIndex]
  if (!targetBlock) throw new ApiError('INVALID_PARAMS')

  const prompt = input.prompt.trim()
  const nextBlocks = blocks.map((block, index) => (
    index === input.blockIndex
      ? { ...block, prompt }
      : block
  ))

  const updated = await prisma.projectEditScript.update({
    where: { id: script.id },
    data: {
      videoBlocksJson: nextBlocks as unknown as Prisma.InputJsonValue,
    },
    include: {
      requirements: {
        orderBy: [
          { kind: 'asc' },
          { name: 'asc' },
        ],
      },
    },
  })

  return await mapPersistedEditScript(updated)
}

export async function generateProjectEditScriptBriefQuestions(
  input: GenerateEditScriptBriefQuestionsInput,
): Promise<EditScriptBriefQuestionsPayload> {
  const locale = assertLocale(input.locale)
  const [episode, project, config] = await Promise.all([
    prisma.projectEpisode.findFirst({
      where: { id: input.episodeId, projectId: input.projectId },
      select: { id: true },
    }),
    prisma.project.findFirst({
      where: { id: input.projectId, userId: input.userId },
      select: {
        id: true,
        artStyle: true,
        directorStyleDoc: true,
        videoRatio: true,
      },
    }),
    getProjectModelConfig(input.projectId, input.userId),
  ])
  if (!episode || !project) throw new ApiError('NOT_FOUND')

  const model = resolveTextModel(config)
  const defaults = resolveEditScriptDefaults(input.prompt)
  const rawQuestions = await runPromptStep({
    userId: input.userId,
    projectId: input.projectId,
    model,
    locale,
    promptId: AI_PROMPT_IDS.EDIT_SCRIPT_BRIEF_QUESTIONS,
    variables: {
      user_request: input.prompt,
      duration_seconds: String(defaults.durationSeconds),
      available_visual_styles: buildAvailableVisualStyles(locale),
      style_context: buildStyleContext({
        artStyle: project.artStyle,
        directorStyleDoc: project.directorStyleDoc,
        videoRatio: project.videoRatio,
      }),
    },
    stepTitle: 'Edit brief questions',
    stepIndex: 1,
    stepTotal: 1,
  })

  return finalizeEditScriptBriefQuestions(
    normalizeEditScriptBriefQuestions(rawQuestions),
    locale,
    input.prompt,
  )
}

export async function generateProjectEditScript(input: GenerateEditScriptInput): Promise<EditScriptPayload> {
  const locale = assertLocale(input.locale)
  const [episode, project, config] = await Promise.all([
    prisma.projectEpisode.findFirst({
      where: { id: input.episodeId, projectId: input.projectId },
      select: { id: true },
    }),
    prisma.project.findFirst({
      where: { id: input.projectId, userId: input.userId },
      select: {
        id: true,
        artStyle: true,
        directorStyleDoc: true,
        videoRatio: true,
      },
    }),
    getProjectModelConfig(input.projectId, input.userId),
  ])
  if (!episode || !project) throw new ApiError('NOT_FOUND')
  const effectiveVideoRatio = input.videoRatio ?? project.videoRatio
  const effectiveArtStyle = input.artStyle ?? project.artStyle
  if (input.artStyle && !isArtStyleValue(input.artStyle)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INVALID_ART_STYLE',
      message: 'artStyle must be a supported value',
    })
  }
  if ((input.videoRatio && input.videoRatio !== project.videoRatio)
    || (input.artStyle && input.artStyle !== project.artStyle)) {
    await prisma.project.update({
      where: { id: project.id },
      data: {
        ...(input.videoRatio ? { videoRatio: input.videoRatio } : {}),
        ...(input.artStyle ? { artStyle: input.artStyle } : {}),
      },
    })
  }
  const model = resolveTextModel(config)
  const defaults = resolveEditScriptDefaults(input.prompt)
  await markEditScriptGenerating({
    projectId: input.projectId,
    episodeId: input.episodeId,
    userPrompt: input.prompt,
    durationSeconds: defaults.durationSeconds,
  })

  try {
  const styleContext = buildStyleContext({
    artStyle: effectiveArtStyle,
    directorStyleDoc: project.directorStyleDoc,
    videoRatio: effectiveVideoRatio,
  })
  const commonVariables = {
    user_request: input.prompt,
    duration_seconds: String(defaults.durationSeconds),
  }

  const timeline = await runPromptStep({
    userId: input.userId,
    projectId: input.projectId,
    model,
    locale,
    promptId: AI_PROMPT_IDS.EDIT_SCRIPT_TIMELINE,
    variables: commonVariables,
    stepTitle: 'Edit timeline',
    stepIndex: 1,
    stepTotal: 6,
  })
  const visualAction = await runPromptStep({
    userId: input.userId,
    projectId: input.projectId,
    model,
    locale,
    promptId: AI_PROMPT_IDS.EDIT_SCRIPT_VISUAL_ACTION,
    variables: {
      user_request: input.prompt,
      timeline_json: stringifyForPrompt(timeline),
    },
    stepTitle: 'Edit visual action',
    stepIndex: 2,
    stepTotal: 6,
  })
  const camera = await runPromptStep({
    userId: input.userId,
    projectId: input.projectId,
    model,
    locale,
    promptId: AI_PROMPT_IDS.EDIT_SCRIPT_CAMERA,
    variables: {
      user_request: input.prompt,
      visual_action_json: stringifyForPrompt(visualAction),
      aspect_ratio: effectiveVideoRatio,
      style_context: styleContext,
    },
    stepTitle: 'Edit camera',
    stepIndex: 3,
    stepTotal: 6,
  })
  const audio = await runPromptStep({
    userId: input.userId,
    projectId: input.projectId,
    model,
    locale,
    promptId: AI_PROMPT_IDS.EDIT_SCRIPT_AUDIO,
    variables: {
      user_request: input.prompt,
      camera_json: stringifyForPrompt(camera),
    },
    stepTitle: 'Edit audio',
    stepIndex: 4,
    stepTotal: 6,
  })
  const primary = await runPromptStep({
    userId: input.userId,
    projectId: input.projectId,
    model,
    locale,
    promptId: AI_PROMPT_IDS.EDIT_SCRIPT_PRIMARY,
    variables: {
      ...commonVariables,
      timeline_json: stringifyForPrompt(timeline),
      visual_action_json: stringifyForPrompt(visualAction),
      camera_json: stringifyForPrompt(camera),
      audio_json: stringifyForPrompt(audio),
      aspect_ratio: effectiveVideoRatio,
      style_context: styleContext,
    },
    stepTitle: 'Edit primary table',
    stepIndex: 5,
    stepTotal: 6,
  })
  const core = normalizeEditScriptCore(primary)
  const assetRaw = await runPromptStep({
    userId: input.userId,
    projectId: input.projectId,
    model,
    locale,
    promptId: AI_PROMPT_IDS.EDIT_SCRIPT_ASSET_EXTRACT,
    variables: {
      edit_script_json: stringifyForPrompt(core),
    },
    stepTitle: 'Edit required assets',
    stepIndex: 6,
    stepTotal: 6,
  })
  const requirements = await designEditAssetRequirements({
    userId: input.userId,
    projectId: input.projectId,
    locale,
    analysisModel: model,
    userPrompt: input.prompt,
    shots: core.shots,
    requirements: normalizeEditAssetRequirements(assetRaw, core.shots),
  })

  const saved = await prisma.$transaction(async (tx) => {
    const script = await tx.projectEditScript.upsert({
      where: { episodeId: input.episodeId },
      create: {
        projectId: input.projectId,
        episodeId: input.episodeId,
        userPrompt: input.prompt,
        title: core.title,
        logline: core.logline,
        durationSec: core.durationSec,
        shotCount: core.shotCount,
        status: 'ready',
        shotsJson: core.shots as unknown as Prisma.InputJsonValue,
        videoBlocksJson: core.videoBlocks as unknown as Prisma.InputJsonValue,
      },
      update: {
        userPrompt: input.prompt,
        title: core.title,
        logline: core.logline,
        durationSec: core.durationSec,
        shotCount: core.shotCount,
        status: 'ready',
        shotsJson: core.shots as unknown as Prisma.InputJsonValue,
        videoBlocksJson: core.videoBlocks as unknown as Prisma.InputJsonValue,
      },
    })
    await tx.projectEditAssetRequirement.deleteMany({
      where: { editScriptId: script.id },
    })
    await tx.projectEditAssetRequirement.createMany({
      data: requirements.map((requirement) => ({
        editScriptId: script.id,
        projectId: input.projectId,
        episodeId: input.episodeId,
        kind: requirement.kind,
        name: requirement.name,
        description: requirement.description,
        shotIndexes: requirement.shotNumbers as unknown as Prisma.InputJsonValue,
        status: 'pending',
        targetId: null,
        errorMessage: null,
      })),
    })
    const nextScript = await tx.projectEditScript.findUniqueOrThrow({
      where: { id: script.id },
      include: {
        requirements: {
          orderBy: [
            { kind: 'asc' },
            { name: 'asc' },
          ],
        },
      },
    })
    return nextScript
  })

  return await mapPersistedEditScript(saved)
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    await markEditScriptFailed({
      projectId: input.projectId,
      episodeId: input.episodeId,
      userPrompt: input.prompt,
      durationSeconds: defaults.durationSeconds,
      message,
    })
    throw caught
  }
}

async function findExistingAsset(input: {
  readonly projectId: string
  readonly kind: EditAssetKind
  readonly name: string
}): Promise<ExistingAssetRef | null> {
  const normalizedName = input.name.trim().toLocaleLowerCase()
  if (input.kind === 'character') {
    const characters = await prisma.projectCharacter.findMany({
      where: { projectId: input.projectId },
      select: {
        id: true,
        name: true,
        appearances: {
          orderBy: { appearanceIndex: 'asc' },
          take: 1,
          select: {
            id: true,
            imageUrl: true,
            imageMediaId: true,
            imageUrls: true,
          },
        },
      },
    })
    const character = characters.find((item) => item.name.trim().toLocaleLowerCase() === normalizedName)
    if (!character) return null
    const appearance = character.appearances[0]
    const imageUrls = appearance ? decodeImageUrlsFromDb(appearance.imageUrls, 'editScript.existing.character.imageUrls') : []
    const previewImageUrl = appearance?.imageUrl || imageUrls[0] || null
    return {
      id: character.id,
      previewImageUrl,
      hasOutput: Boolean(appearance?.imageMediaId || previewImageUrl),
      taskTargetType: 'CharacterAppearance',
      taskTargetId: appearance?.id ?? character.id,
    }
  }

  const locations = await prisma.projectLocation.findMany({
    where: { projectId: input.projectId, assetKind: 'location' },
    select: {
      id: true,
      name: true,
      images: {
        orderBy: { imageIndex: 'asc' },
        take: 1,
        select: {
          imageUrl: true,
          imageMediaId: true,
        },
      },
    },
  })
  const location = locations.find((item) => item.name.trim().toLocaleLowerCase() === normalizedName)
  const image = location?.images[0]
  if (!location) return null
  return {
    id: location.id,
    previewImageUrl: image?.imageUrl || null,
    hasOutput: Boolean(image?.imageMediaId || image?.imageUrl),
    taskTargetType: 'LocationImage',
    taskTargetId: location.id,
  }
}

async function createRequiredAsset(input: {
  readonly projectId: string
  readonly kind: EditAssetKind
  readonly name: string
  readonly description: string
}): Promise<ExistingAssetRef> {
  if (input.kind === 'character') {
    const character = await prisma.projectCharacter.create({
      data: {
        projectId: input.projectId,
        name: input.name,
        aliases: null,
        appearances: {
          create: {
            appearanceIndex: PRIMARY_APPEARANCE_INDEX,
            changeReason: 'primary',
            description: input.description,
            descriptions: JSON.stringify([input.description]),
            imageUrls: encodeImageUrls([]),
            previousImageUrls: encodeImageUrls([]),
          },
        },
      },
      select: {
        id: true,
        appearances: {
          orderBy: { appearanceIndex: 'asc' },
          take: 1,
          select: { id: true },
        },
      },
    })
    return {
      id: character.id,
      previewImageUrl: null,
      hasOutput: false,
      taskTargetType: 'CharacterAppearance',
      taskTargetId: character.appearances[0]?.id ?? character.id,
    }
  }

  const location = await prisma.projectLocation.create({
    data: {
      projectId: input.projectId,
      name: input.name,
      summary: input.description,
      assetKind: 'location',
      images: {
        create: {
          imageIndex: 0,
          description: input.description,
        },
      },
    },
    select: { id: true },
  })
  return {
    id: location.id,
    previewImageUrl: null,
    hasOutput: false,
    taskTargetType: 'LocationImage',
    taskTargetId: location.id,
  }
}

async function deleteCreatedAsset(input: {
  readonly kind: EditAssetKind
  readonly id: string
}): Promise<void> {
  if (input.kind === 'character') {
    await prisma.projectCharacter.delete({ where: { id: input.id } })
    return
  }
  await prisma.projectLocation.delete({ where: { id: input.id } })
}

async function submitRequirementImageTask(input: {
  readonly request: NextRequest
  readonly projectId: string
  readonly episodeId: string
  readonly userId: string
  readonly locale: Locale
  readonly kind: EditAssetKind
  readonly assetId: string
}): Promise<void> {
  const characterAppearance = input.kind === 'character'
    ? await prisma.characterAppearance.findFirst({
        where: { characterId: input.assetId },
        orderBy: { appearanceIndex: 'asc' },
        select: { id: true, appearanceIndex: true },
      })
    : null
  if (input.kind === 'character' && !characterAppearance) {
    throw new Error('EDIT_SCRIPT_CHARACTER_APPEARANCE_NOT_FOUND')
  }

  await submitAssetGenerateTask({
    request: input.request,
    kind: input.kind,
    assetId: input.assetId,
    episodeId: input.episodeId,
    body: {
      count: 1,
      ...(characterAppearance
        ? {
            appearanceId: characterAppearance.id,
            appearanceIndex: characterAppearance.appearanceIndex,
          }
        : {}),
      meta: {
        locale: input.locale,
      },
    },
    access: {
      scope: 'project',
      userId: input.userId,
      projectId: input.projectId,
    },
  })
}

export async function generateProjectEditScriptAssets(input: GenerateEditScriptAssetsInput): Promise<EditScriptPayload> {
  const script = await getPersistedEditScript(input.projectId, input.episodeId, input.editScriptId)
  if (!script) throw new ApiError('NOT_FOUND')

  const requirements = input.requirementId
    ? script.requirements.filter((requirement) => requirement.id === input.requirementId)
    : script.requirements
  if (input.requirementId && requirements.length === 0) throw new ApiError('NOT_FOUND')

  for (const requirement of requirements) {
    if (!isEditAssetKind(requirement.kind)) {
      await prisma.projectEditAssetRequirement.update({
        where: { id: requirement.id },
        data: { status: 'failed', errorMessage: `Unsupported asset kind: ${requirement.kind}` },
      })
      continue
    }

    const existing = requirement.targetId
      ? await resolveRequirementAsset(input.projectId, requirement)
      : await findExistingAsset({
        projectId: input.projectId,
        kind: requirement.kind,
        name: requirement.name,
      })
    if (existing?.hasOutput) {
      await prisma.projectEditAssetRequirement.update({
        where: { id: requirement.id },
        data: { targetId: existing.id, status: 'completed', errorMessage: null },
      })
      continue
    }

    let createdAssetId: string | null = null
    const asset = existing ?? await createRequiredAsset({
      projectId: input.projectId,
      kind: requirement.kind,
      name: requirement.name,
      description: requirement.description,
    })
    if (!existing) {
      createdAssetId = asset.id
    }

    await prisma.projectEditAssetRequirement.update({
      where: { id: requirement.id },
      data: { targetId: asset.id, status: 'generating', errorMessage: null },
    })

    try {
      await submitRequirementImageTask({
        request: input.request,
        projectId: input.projectId,
        episodeId: input.episodeId,
        userId: input.userId,
        locale: input.locale,
        kind: requirement.kind,
        assetId: asset.id,
      })
    } catch (error) {
      if (createdAssetId) {
        await deleteCreatedAsset({ kind: requirement.kind, id: createdAssetId })
      }
      await prisma.projectEditAssetRequirement.update({
        where: { id: requirement.id },
        data: {
          targetId: existing?.id ?? null,
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }

  const updated = await getPersistedEditScript(input.projectId, input.episodeId, script.id)
  if (!updated) throw new ApiError('NOT_FOUND')
  return await mapPersistedEditScript(updated)
}

function buildEditStoryboardMarker(editScriptId: string): string {
  return JSON.stringify({
    source: 'edit_script',
    editScriptId,
  })
}

async function assertStoryboardImageModelReady(input: {
  readonly projectId: string
  readonly userId: string
}): Promise<void> {
  const config = await getProjectModelConfig(input.projectId, input.userId)
  if (!config.storyboardModel) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'STORYBOARD_MODEL_NOT_CONFIGURED',
      message: 'Storyboard image model is required before generating edit-first storyboards',
    })
  }
  await resolveModelSelection(input.userId, config.storyboardModel, 'image')
}

async function resolveCompletedEditScript(input: {
  readonly projectId: string
  readonly episodeId: string
  readonly editScriptId?: string
}): Promise<EditScriptPayload> {
  const persisted = await getPersistedEditScript(input.projectId, input.episodeId, input.editScriptId)
  if (!persisted) throw new ApiError('NOT_FOUND')
  const editScript = await mapPersistedEditScript(persisted)
  const notReady = editScript.requirements.filter((requirement) => requirement.status !== 'completed' || !requirement.targetId)
  if (notReady.length > 0) {
    throw new ApiError('CONFLICT', {
      code: 'EDIT_SCRIPT_ASSETS_NOT_READY',
      message: `Edit script assets must be completed before storyboard generation: ${notReady.map((item) => item.name).join(', ')}`,
    })
  }
  if (!editScript.id) {
    throw new Error('EDIT_SCRIPT_ID_REQUIRED')
  }
  return editScript
}

async function buildCharacterRefsByRequirementId(
  requirements: readonly EditAssetRequirement[],
): Promise<Map<string, StoryboardCharacterRef>> {
  const characterRequirements = requirements.filter((requirement): requirement is EditAssetRequirement & { readonly targetId: string } =>
    requirement.kind === 'character' && Boolean(requirement.targetId),
  )
  const characters = await prisma.projectCharacter.findMany({
    where: {
      id: { in: characterRequirements.map((requirement) => requirement.targetId) },
    },
    select: {
      id: true,
      name: true,
      appearances: {
        orderBy: { appearanceIndex: 'asc' },
        take: 1,
        select: {
          id: true,
          appearanceIndex: true,
          changeReason: true,
        },
      },
    },
  })
  const characterById = new Map(characters.map((character) => [character.id, character]))
  const output = new Map<string, StoryboardCharacterRef>()
  for (const requirement of characterRequirements) {
    if (!requirement.id) continue
    const character = characterById.get(requirement.targetId)
    const appearance = character?.appearances[0]
    if (!character || !appearance) {
      throw new Error(`EDIT_SCRIPT_STORYBOARD_CHARACTER_ASSET_INVALID:${requirement.name}`)
    }
    output.set(requirement.id, {
      characterId: character.id,
      name: character.name,
      appearanceId: appearance.id,
      appearanceIndex: appearance.appearanceIndex,
      appearance: appearance.changeReason || 'primary',
    })
  }
  return output
}

function buildShotPanelDrafts(input: {
  readonly editScript: EditScriptPayload
  readonly characterRefsByRequirementId: ReadonlyMap<string, StoryboardCharacterRef>
}): PanelDraft[] {
  let cursor = 0
  return input.editScript.shots.map((shot, index) => {
    const shotNumber = shot.shotNumber
    const characterRefs = input.editScript.requirements
      .filter((requirement) => requirement.kind === 'character' && requirement.id && requirement.shotNumbers.includes(shotNumber))
      .map((requirement) => input.characterRefsByRequirementId.get(requirement.id!))
      .filter((reference): reference is StoryboardCharacterRef => Boolean(reference))
    const location = input.editScript.requirements
      .find((requirement) => requirement.kind === 'location' && requirement.shotNumbers.includes(shotNumber))
    const srtStart = cursor
    const srtEnd = cursor + shot.durationSec
    cursor = srtEnd
    const imagePrompt = [
      shot.visualAction,
      `人物/场景：${shot.charactersAndScene}`,
      `镜头方式：${shot.camera}`,
      `视频提示词：${shot.videoPrompt}`,
    ].join('\n')

    return {
      panelIndex: index,
      panelNumber: shotNumber,
      shotType: shot.camera,
      cameraMove: shot.camera,
      description: shot.visualAction,
      location: location?.name ?? null,
      characters: characterRefs.length > 0 ? JSON.stringify(characterRefs) : null,
      props: null,
      srtSegment: shot.visualAction,
      srtStart,
      srtEnd,
      duration: shot.durationSec,
      imagePrompt,
      videoPrompt: shot.videoPrompt,
      photographyRules: JSON.stringify({
        source: 'edit_script',
        editScriptId: input.editScript.id,
        shotNumber,
        camera: shot.camera,
        sound: shot.sound,
      }),
      actingNotes: null,
    }
  })
}

async function upsertEditScriptStoryboardPanels(input: {
  readonly editScript: EditScriptPayload
  readonly panelDrafts: readonly PanelDraft[]
}) {
  const editScriptId = input.editScript.id
  const episodeId = input.editScript.episodeId
  if (!editScriptId || !episodeId) throw new Error('EDIT_SCRIPT_STORYBOARD_INPUT_INVALID')
  const marker = buildEditStoryboardMarker(editScriptId)
  const markerNeedle = `"editScriptId":"${editScriptId}"`
  const existing = await prisma.projectStoryboard.findFirst({
    where: {
      episodeId,
      clip: {
        screenplay: {
          contains: markerNeedle,
        },
      },
    },
    include: {
      clip: true,
      panels: {
        orderBy: { panelIndex: 'asc' },
      },
    },
  })

  const storyboard = existing ?? await prisma.$transaction(async (tx) => {
    const clip = await tx.projectClip.create({
      data: {
        episodeId,
        start: 0,
        end: input.editScript.durationSec,
        duration: input.editScript.durationSec,
        summary: input.editScript.title,
        location: input.editScript.requirements
          .filter((requirement) => requirement.kind === 'location')
          .map((requirement) => requirement.name)
          .join('、') || null,
        characters: JSON.stringify(input.editScript.requirements
          .filter((requirement) => requirement.kind === 'character')
          .map((requirement) => requirement.name)),
        props: null,
        content: input.editScript.logline || input.editScript.userPrompt || input.editScript.title,
        shotCount: input.editScript.shotCount,
        screenplay: marker,
      },
    })
    const createdStoryboard = await tx.projectStoryboard.create({
      data: {
        episodeId,
        clipId: clip.id,
        panelCount: input.panelDrafts.length,
        storyboardTextJson: JSON.stringify({
          source: 'edit_script',
          editScriptId,
          title: input.editScript.title,
          shots: input.editScript.shots,
        }),
        photographyPlan: JSON.stringify({
        source: 'edit_script',
        editScriptId,
        rules: 'Use edit-script block-first shot fields as the source of truth for storyboard panels.',
      }),
      },
      include: {
        clip: true,
        panels: true,
      },
    })
    return createdStoryboard
  })

  const existingPanels = new Map(storyboard.panels.map((panel) => [panel.panelIndex, panel]))
  const panelTargets: StoryboardPanelTaskTarget[] = []
  for (const draft of input.panelDrafts) {
    const existingPanel = existingPanels.get(draft.panelIndex)
    if (existingPanel) {
      panelTargets.push({
        id: existingPanel.id,
        panelIndex: existingPanel.panelIndex,
        imageUrl: existingPanel.imageUrl,
        candidateImages: existingPanel.candidateImages,
      })
      continue
    }
    const panel = await prisma.projectPanel.create({
      data: {
        storyboardId: storyboard.id,
        panelIndex: draft.panelIndex,
        panelNumber: draft.panelNumber,
        shotType: draft.shotType,
        cameraMove: draft.cameraMove,
        description: draft.description,
        location: draft.location,
        characters: draft.characters,
        props: draft.props,
        srtSegment: draft.srtSegment,
        srtStart: draft.srtStart,
        srtEnd: draft.srtEnd,
        duration: draft.duration,
        imagePrompt: draft.imagePrompt,
        videoPrompt: draft.videoPrompt,
        photographyRules: draft.photographyRules,
        actingNotes: draft.actingNotes,
      },
    })
    panelTargets.push({
      id: panel.id,
      panelIndex: panel.panelIndex,
      imageUrl: panel.imageUrl,
      candidateImages: panel.candidateImages,
    })
  }

  await prisma.projectStoryboard.update({
    where: { id: storyboard.id },
    data: {
      panelCount: input.panelDrafts.length,
    },
  })

  return {
    storyboardId: storyboard.id,
    panels: panelTargets,
  }
}

export async function generateProjectEditScriptStoryboard(input: GenerateEditScriptStoryboardInput): Promise<{
  readonly storyboardId: string
  readonly panelCount: number
  readonly submittedImageTasks: number
}> {
  await assertStoryboardImageModelReady({
    projectId: input.projectId,
    userId: input.userId,
  })
  const editScript = await resolveCompletedEditScript({
    projectId: input.projectId,
    episodeId: input.episodeId,
    editScriptId: input.editScriptId,
  })
  const characterRefsByRequirementId = await buildCharacterRefsByRequirementId(editScript.requirements)
  const panelDrafts = buildShotPanelDrafts({
    editScript,
    characterRefsByRequirementId,
  })
  const storyboard = await upsertEditScriptStoryboardPanels({
    editScript,
    panelDrafts,
  })

  let submittedImageTasks = 0
  for (const panel of storyboard.panels) {
    if (panel.imageUrl || panel.candidateImages) continue
    await executeProjectAgentOperationFromApi({
      request: input.request,
      operationId: 'regenerate_panel_image',
      projectId: input.projectId,
      userId: input.userId,
      context: {
        locale: input.locale,
        episodeId: input.episodeId,
      },
      input: {
        panelId: panel.id,
        count: 1,
      },
      source: 'project-ui',
    })
    submittedImageTasks += 1
  }

  return {
    storyboardId: storyboard.storyboardId,
    panelCount: storyboard.panels.length,
    submittedImageTasks,
  }
}
