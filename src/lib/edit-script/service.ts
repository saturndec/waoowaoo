import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { AI_PROMPT_IDS, buildAiPrompt } from '@/lib/ai-prompts'
import { withTextBilling } from '@/lib/billing'
import { getProjectModelConfig } from '@/lib/config-service'
import { safeParseJsonObject } from '@/lib/json-repair'
import { encodeImageUrls, decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'
import { submitAssetGenerateTask } from '@/lib/assets/services/asset-actions'
import type { Locale } from '@/i18n/routing'
import {
  normalizeEditAssetRequirements,
  normalizeEditScriptCore,
  resolveEditScriptDefaults,
} from './normalize'
import type {
  EditAssetKind,
  EditAssetRequirement,
  EditAssetStatus,
  EditScriptPayload,
  EditScriptShot,
} from './types'

interface GenerateEditScriptInput {
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
}

type PromptStepId =
  | typeof AI_PROMPT_IDS.EDIT_SCRIPT_TIMELINE
  | typeof AI_PROMPT_IDS.EDIT_SCRIPT_VISUAL_ACTION
  | typeof AI_PROMPT_IDS.EDIT_SCRIPT_CAMERA
  | typeof AI_PROMPT_IDS.EDIT_SCRIPT_VIDEO_PROMPT
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
  readonly requirements: readonly PersistedEditScriptRequirement[]
}

interface ExistingAssetRef {
  readonly id: string
  readonly previewImageUrl: string | null
  readonly hasOutput: boolean
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
      transition: String(item.transition ?? ''),
    }]
  })
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
  }
}

async function resolveRequirementAsset(projectId: string, requirement: PersistedEditScriptRequirement): Promise<ExistingAssetRef | null> {
  if (requirement.kind === 'character') return resolveCharacterAsset(projectId, requirement.targetId)
  if (requirement.kind === 'location') return resolveLocationAsset(projectId, requirement.targetId)
  return null
}

async function mapPersistedEditScript(script: PersistedEditScript): Promise<EditScriptPayload> {
  const requirements = await Promise.all(script.requirements.map(async (requirement): Promise<EditAssetRequirement> => {
    const resolvedAsset = await resolveRequirementAsset(script.projectId, requirement)
    const storedStatus = normalizeStoredStatus(requirement.status)
    const status = resolvedAsset?.hasOutput ? 'completed' : storedStatus
    return {
      id: requirement.id,
      kind: isEditAssetKind(requirement.kind) ? requirement.kind : 'character',
      name: requirement.name,
      description: requirement.description,
      shotNumbers: readShotNumbers(requirement.shotIndexes),
      status,
      targetId: requirement.targetId,
      errorMessage: status === 'failed' ? requirement.errorMessage : null,
      previewImageUrl: resolvedAsset?.previewImageUrl ?? null,
    }
  }))

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
    shots: parseShotsJson(script.shotsJson),
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

export async function readProjectEditScript(input: {
  readonly projectId: string
  readonly episodeId: string
}): Promise<EditScriptPayload | null> {
  const script = await getPersistedEditScript(input.projectId, input.episodeId)
  return script ? mapPersistedEditScript(script) : null
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
  const model = resolveTextModel(config)
  const defaults = resolveEditScriptDefaults(input.prompt)
  const styleContext = buildStyleContext({
    artStyle: project.artStyle,
    directorStyleDoc: project.directorStyleDoc,
    videoRatio: project.videoRatio,
  })
  const commonVariables = {
    user_request: input.prompt,
    duration_seconds: String(defaults.durationSeconds),
    shot_count: String(defaults.shotCount),
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
    stepTotal: 7,
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
    stepTotal: 7,
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
      aspect_ratio: project.videoRatio || '9:16',
      style_context: styleContext,
    },
    stepTitle: 'Edit camera',
    stepIndex: 3,
    stepTotal: 7,
  })
  const videoPrompt = await runPromptStep({
    userId: input.userId,
    projectId: input.projectId,
    model,
    locale,
    promptId: AI_PROMPT_IDS.EDIT_SCRIPT_VIDEO_PROMPT,
    variables: {
      user_request: input.prompt,
      camera_json: stringifyForPrompt(camera),
      aspect_ratio: project.videoRatio || '9:16',
      style_context: styleContext,
    },
    stepTitle: 'Edit video prompt',
    stepIndex: 4,
    stepTotal: 7,
  })
  const audio = await runPromptStep({
    userId: input.userId,
    projectId: input.projectId,
    model,
    locale,
    promptId: AI_PROMPT_IDS.EDIT_SCRIPT_AUDIO,
    variables: {
      user_request: input.prompt,
      video_prompt_json: stringifyForPrompt(videoPrompt),
    },
    stepTitle: 'Edit audio',
    stepIndex: 5,
    stepTotal: 7,
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
      video_prompt_json: stringifyForPrompt(videoPrompt),
      audio_json: stringifyForPrompt(audio),
      aspect_ratio: project.videoRatio || '9:16',
      style_context: styleContext,
    },
    stepTitle: 'Edit primary table',
    stepIndex: 6,
    stepTotal: 7,
  })
  const core = normalizeEditScriptCore(primary, defaults.shotCount)
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
    stepIndex: 7,
    stepTotal: 7,
  })
  const requirements = normalizeEditAssetRequirements(assetRaw, core.shots)

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
      },
      update: {
        userPrompt: input.prompt,
        title: core.title,
        logline: core.logline,
        durationSec: core.durationSec,
        shotCount: core.shotCount,
        status: 'ready',
        shotsJson: core.shots as unknown as Prisma.InputJsonValue,
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
      select: { id: true },
    })
    return { id: character.id, previewImageUrl: null, hasOutput: false }
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
  return { id: location.id, previewImageUrl: null, hasOutput: false }
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

  for (const requirement of script.requirements) {
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
