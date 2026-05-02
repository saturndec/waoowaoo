import { createHash } from 'crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ApiError, getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { estimateVoiceLineMaxSeconds } from '@/lib/voice/generate-voice-line'
import { getProviderConfig, resolveModelSelectionOrSingle } from '@/lib/user-api/runtime-config'
import { getProviderKey } from '@/lib/ai-registry/selection'
import { parseModelKeyStrict } from '@/lib/ai-registry/selection'
import { validatePreviewText, validateVoicePrompt } from '@/lib/ai-exec/voice-design'
import {
  hasAiVoiceLineBinding,
  parseSpeakerVoiceMap,
  type CharacterVoiceFields,
  type SpeakerVoiceMap,
} from '@/lib/ai-exec/voice-line'
import { createMutationBatch } from '@/lib/mutation-batch/service'
import type {
  TaskBatchSubmittedPartData,
  TaskSubmittedPartData,
} from '@/lib/project-agent/types'
import type { ProjectAgentOperationContext, ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { writeOperationDataPart } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'
import {
  refineTaskBatchSubmitOperationOutputSchema,
  refineTaskSubmitOperationOutputSchema,
  taskBatchSubmitOperationOutputSchemaBase,
  taskSubmitOperationOutputSchema,
  taskSubmitOperationOutputSchemaBase,
} from '@/lib/operations/output-schemas'
import { hasVoiceLineAudioOutput } from '@/lib/task/has-output'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveLocaleFromContext(locale?: unknown): string {
  const normalized = normalizeString(locale)
  return normalized || 'zh'
}

type VoiceLineRow = {
  id: string
  speaker: string
  content: string
  audioUrl?: string | null
}

type CharacterRow = CharacterVoiceFields & {
  name: string
}

function matchCharacterBySpeaker(speaker: string, characters: CharacterRow[]) {
  const normalizedSpeaker = speaker.trim().toLowerCase()
  return characters.find((character) => character.name.trim().toLowerCase() === normalizedSpeaker) || null
}

function hasSpeakerVoiceForProvider(
  speaker: string,
  characters: CharacterRow[],
  speakerVoices: SpeakerVoiceMap,
  providerKey: string,
): boolean {
  const character = matchCharacterBySpeaker(speaker, characters)
  const speakerVoice = speakerVoices[speaker]
  return hasAiVoiceLineBinding({
    providerId: providerKey,
    character,
    speakerVoice,
  })
}

function hasUploadedReferenceAudioForSpeaker(params: {
  speaker: string
  characters: CharacterRow[]
  speakerVoices: SpeakerVoiceMap
}): boolean {
  const character = matchCharacterBySpeaker(params.speaker, params.characters)
  if (normalizeString(character?.customVoiceUrl)) return true
  const entry = params.speakerVoices[params.speaker]
  if (entry && 'audioUrl' in entry && normalizeString(entry.audioUrl)) return true
  return false
}

async function buildVoiceGenerationContext(params: {
  ctx: ProjectAgentOperationContext
  input: {
    episodeId?: string
    audioModel?: string
  }
}) {
  const locale = resolveLocaleFromContext(params.ctx.context.locale)
  const episodeId = normalizeString(params.input.episodeId) || normalizeString(params.ctx.context.episodeId)
  const requestedAudioModel = normalizeString(params.input.audioModel)

  if (!episodeId) {
    throw new Error('PROJECT_AGENT_EPISODE_REQUIRED')
  }
  if (requestedAudioModel && !parseModelKeyStrict(requestedAudioModel)) {
    throw new Error('PROJECT_AGENT_MODEL_KEY_INVALID')
  }

  const [pref, projectData, episode] = await Promise.all([
    prisma.userPreference.findUnique({
      where: { userId: params.ctx.userId },
      select: { audioModel: true },
    }),
    prisma.project.findUnique({
      where: { id: params.ctx.projectId },
      select: {
        id: true,
        audioModel: true,
        characters: {
          select: {
            name: true,
            customVoiceUrl: true,
            voiceId: true,
          },
        },
      },
    }),
    prisma.projectEpisode.findFirst({
      where: {
        id: episodeId,
        projectId: params.ctx.projectId,
      },
      select: {
        id: true,
        speakerVoices: true,
      },
    }),
  ])

  if (!projectData || !episode) {
    throw new Error('PROJECT_AGENT_NOT_FOUND')
  }

  const preferredAudioModel = normalizeString(pref?.audioModel)
  if (preferredAudioModel && !parseModelKeyStrict(preferredAudioModel)) {
    throw new Error('PROJECT_AGENT_MODEL_KEY_INVALID')
  }
  const projectAudioModel = normalizeString(projectData.audioModel)
  if (projectAudioModel && !parseModelKeyStrict(projectAudioModel)) {
    throw new Error('PROJECT_AGENT_MODEL_KEY_INVALID')
  }

  const resolvedAudioModel = requestedAudioModel || projectAudioModel || preferredAudioModel
  const selectedResolvedAudioModel = await resolveModelSelectionOrSingle(
    params.ctx.userId,
    resolvedAudioModel || null,
    'audio',
  )
  const selectedProviderKey = getProviderKey(selectedResolvedAudioModel.provider).toLowerCase()

  return {
    locale,
    episodeId,
    selectedResolvedAudioModel,
    selectedProviderKey,
    speakerVoices: parseSpeakerVoiceMap(episode.speakerVoices),
    characters: (projectData.characters || []) as CharacterRow[],
  }
}

async function executeGenerateVoiceLineAudioOperation(params: {
  ctx: ProjectAgentOperationContext
  input: {
    confirmed?: boolean
    episodeId?: string
    lineId: string
    audioModel?: string
  }
  operationId: string
}) {
  const { locale, episodeId, selectedResolvedAudioModel, selectedProviderKey, speakerVoices, characters } = await buildVoiceGenerationContext({
    ctx: params.ctx,
    input: params.input,
  })

  const lineId = normalizeString(params.input.lineId)
  if (!lineId) {
    throw new Error('PROJECT_AGENT_VOICE_LINE_REQUIRED')
  }

  const line = await prisma.projectVoiceLine.findFirst({
    where: {
      id: lineId,
      episodeId,
    },
    select: {
      id: true,
      speaker: true,
      content: true,
      audioUrl: true,
    },
  })
  if (!line) {
    throw new Error('PROJECT_AGENT_VOICE_LINE_NOT_FOUND')
  }
  if (!hasSpeakerVoiceForProvider(line.speaker, characters, speakerVoices, selectedProviderKey)) {
    if (
      selectedProviderKey === 'bailian'
      && hasUploadedReferenceAudioForSpeaker({ speaker: line.speaker, characters, speakerVoices })
    ) {
      throw new ApiError('INVALID_PARAMS', {
        message: '无音色ID，QwenTTS 必须使用 AI 设计音色',
      })
    }
    throw new Error('PROJECT_AGENT_VOICE_BINDING_REQUIRED')
  }

  const localeForTask = resolveRequiredTaskLocale(params.ctx.request, { meta: { locale } })
  const payload = {
    episodeId,
    lineId: line.id,
    maxSeconds: estimateVoiceLineMaxSeconds(line.content),
    audioModel: selectedResolvedAudioModel.modelKey,
    meta: {
      locale,
    },
  }
  const result = await submitTask({
    userId: params.ctx.userId,
    locale: localeForTask,
    requestId: getRequestId(params.ctx.request),
    projectId: params.ctx.projectId,
    episodeId,
    type: TASK_TYPE.VOICE_LINE,
    targetType: 'ProjectVoiceLine',
    targetId: line.id,
    payload: withTaskUiPayload(payload, {
      hasOutputAtStart: await hasVoiceLineAudioOutput(line.id),
    }),
    dedupeKey: `voice_line:${line.id}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.VOICE_LINE, payload),
    operationId: params.operationId,
    operationSource: params.ctx.source,
    operationConfirmed: params.input.confirmed === true,
    operationRequestId: getRequestId(params.ctx.request),
  })

  const mutationBatch = await createMutationBatch({
    projectId: params.ctx.projectId,
    userId: params.ctx.userId,
    source: params.ctx.source,
    operationId: params.operationId,
    episodeId,
    summary: `${params.operationId}:${episodeId}:${line.id}`,
    entries: [
      {
        kind: 'voice_line_restore',
        targetType: 'ProjectVoiceLine',
        targetId: line.id,
        payload: {
          previousAudioUrl: line.audioUrl ?? null,
        },
      },
    ],
  })

  writeOperationDataPart<TaskSubmittedPartData>(params.ctx.writer, 'data-task-submitted', {
    operationId: params.operationId,
    taskId: result.taskId,
    status: result.status,
    runId: result.runId || null,
    deduped: result.deduped,
    mutationBatchId: mutationBatch.id,
  })

  return {
    ...result,
    lineId: line.id,
    mutationBatchId: mutationBatch.id,
  }
}

async function executeGenerateEpisodeVoiceAudioOperation(params: {
  ctx: ProjectAgentOperationContext
  input: {
    confirmed?: boolean
    episodeId?: string
    audioModel?: string
  }
  operationId: string
}) {
  const { locale, episodeId, selectedResolvedAudioModel, selectedProviderKey, speakerVoices, characters } = await buildVoiceGenerationContext({
    ctx: params.ctx,
    input: params.input,
  })

  const allLines = await prisma.projectVoiceLine.findMany({
    where: {
      episodeId,
      audioUrl: null,
    },
    orderBy: { lineIndex: 'asc' },
    select: {
      id: true,
      speaker: true,
      content: true,
      audioUrl: true,
    },
  })
  const voiceLines = allLines.filter((line) =>
    hasSpeakerVoiceForProvider(line.speaker, characters, speakerVoices, selectedProviderKey),
  )

  if (voiceLines.length === 0) {
    return {
      success: true,
      async: true,
      taskIds: [],
      total: 0,
      results: [],
      noop: true,
      reason: '没有需要生成的台词（可能是已生成或缺少音色绑定）',
    }
  }

  const localeForTask = resolveRequiredTaskLocale(params.ctx.request, { meta: { locale } })
  const results = await Promise.all(
    voiceLines.map(async (line) => {
      const payload = {
        episodeId,
        lineId: line.id,
        maxSeconds: estimateVoiceLineMaxSeconds(line.content),
        audioModel: selectedResolvedAudioModel.modelKey,
        meta: {
          locale,
        },
      }
      const result = await submitTask({
        userId: params.ctx.userId,
        locale: localeForTask,
        requestId: getRequestId(params.ctx.request),
        projectId: params.ctx.projectId,
        episodeId,
        type: TASK_TYPE.VOICE_LINE,
        targetType: 'ProjectVoiceLine',
        targetId: line.id,
        payload: withTaskUiPayload(payload, {
          hasOutputAtStart: await hasVoiceLineAudioOutput(line.id),
        }),
        dedupeKey: `voice_line:${line.id}`,
        billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.VOICE_LINE, payload),
        operationId: params.operationId,
        operationSource: params.ctx.source,
        operationConfirmed: params.input.confirmed === true,
        operationRequestId: getRequestId(params.ctx.request),
      })
      return {
        refId: line.id,
        taskId: result.taskId,
      }
    }),
  )

  const taskIds = results.map((item) => item.taskId)
  const mutationBatch = await createMutationBatch({
    projectId: params.ctx.projectId,
    userId: params.ctx.userId,
    source: params.ctx.source,
    operationId: params.operationId,
    episodeId,
    summary: `${params.operationId}:${episodeId}:batch`,
    entries: voiceLines.map((line) => ({
      kind: 'voice_line_restore',
      targetType: 'ProjectVoiceLine',
      targetId: line.id,
      payload: {
        previousAudioUrl: line.audioUrl ?? null,
      },
    })),
  })

  writeOperationDataPart<TaskBatchSubmittedPartData>(params.ctx.writer, 'data-task-batch-submitted', {
    operationId: params.operationId,
    total: taskIds.length,
    taskIds,
    results: results.map((item) => ({ refId: item.refId, taskId: item.taskId })),
    mutationBatchId: mutationBatch.id,
  })

  return {
    success: true,
    async: true,
    results: results.map((item) => ({ lineId: item.refId, taskId: item.taskId })),
    taskIds,
    total: taskIds.length,
    mutationBatchId: mutationBatch.id,
  }
}

const generateVoiceLineAudioInputSchema = z.object({
  confirmed: z.boolean().optional(),
  episodeId: z.string().min(1).optional(),
  lineId: z.string().min(1),
  audioModel: z.string().optional(),
})

const generateEpisodeVoiceAudioInputSchema = z.object({
  confirmed: z.boolean().optional(),
  episodeId: z.string().min(1).optional(),
  audioModel: z.string().optional(),
})

export function createVoiceOperations(): ProjectAgentOperationRegistryDraft {
  const submitWithMutationBatchOutputSchema = refineTaskSubmitOperationOutputSchema(
    taskSubmitOperationOutputSchemaBase.extend({
      mutationBatchId: z.string().min(1),
      lineId: z.string().min(1),
    }).passthrough(),
  )

  const batchWithLineResultsOutputSchema = refineTaskBatchSubmitOperationOutputSchema(
    taskBatchSubmitOperationOutputSchemaBase.extend({
      results: z.array(z.object({
        lineId: z.string().min(1),
        taskId: z.string().min(1),
      })),
    }).passthrough(),
  )

  return {
    generate_voice_line_audio: defineOperation({
      id: 'generate_voice_line_audio',
      summary: 'Generate audio for a single voice line.',
      intent: 'act',
      prerequisites: { episodeId: 'required' },
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
        summary: '将为单条台词生成配音（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: generateVoiceLineAudioInputSchema,
      outputSchema: submitWithMutationBatchOutputSchema,
      execute: async (ctx, input) => executeGenerateVoiceLineAudioOperation({
        ctx,
        input,
        operationId: 'generate_voice_line_audio',
      }),
    }),

    generate_episode_voice_audio: defineOperation({
      id: 'generate_episode_voice_audio',
      summary: 'Generate audio for all pending voice lines in an episode.',
      intent: 'act',
      prerequisites: { episodeId: 'required' },
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
        summary: '将为整集待生成台词批量生成配音（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: generateEpisodeVoiceAudioInputSchema,
      outputSchema: batchWithLineResultsOutputSchema,
      execute: async (ctx, input) => executeGenerateEpisodeVoiceAudioOperation({
        ctx,
        input,
        operationId: 'generate_episode_voice_audio',
      }),
    }),

    voice_design: defineOperation({
      id: 'voice_design',
      summary: 'Design a new voice using a text prompt and preview text (async task submission).',
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
        summary: '将进行音色设计（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        voicePrompt: z.string().min(1),
        previewText: z.string().min(1),
        preferredName: z.string().optional(),
        language: z.enum(['zh', 'en']).optional(),
      }),
      outputSchema: taskSubmitOperationOutputSchema,
      execute: async (ctx, input) => {
        const locale = resolveLocaleFromContext(ctx.context.locale)
        const voicePrompt = input.voicePrompt.trim()
        const previewText = input.previewText.trim()
        const preferredName = input.preferredName?.trim() || 'custom_voice'
        const language = input.language === 'en' ? 'en' : 'zh'

        const promptValidation = validateVoicePrompt(voicePrompt)
        if (!promptValidation.valid) {
          throw new Error('PROJECT_AGENT_VOICE_PROMPT_INVALID')
        }
        const textValidation = validatePreviewText(previewText)
        if (!textValidation.valid) {
          throw new Error('PROJECT_AGENT_VOICE_PREVIEW_TEXT_INVALID')
        }

        await getProviderConfig(ctx.userId, 'bailian')

        const digest = createHash('sha1')
          .update(`${ctx.userId}:${ctx.projectId}:${voicePrompt}:${previewText}:${preferredName}:${language}`)
          .digest('hex')
          .slice(0, 16)

        const payload = {
          voicePrompt,
          previewText,
          preferredName,
          language,
          displayMode: 'detail' as const,
          meta: {
            locale,
          },
        }

        const result = await submitTask({
          userId: ctx.userId,
          locale: resolveRequiredTaskLocale(ctx.request, payload),
          requestId: getRequestId(ctx.request),
          projectId: ctx.projectId,
          type: TASK_TYPE.VOICE_DESIGN,
          targetType: 'Project',
          targetId: ctx.projectId,
          payload,
          dedupeKey: `${TASK_TYPE.VOICE_DESIGN}:${digest}`,
          billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.VOICE_DESIGN, payload),
          operationId: 'voice_design',
          operationSource: ctx.source,
          operationConfirmed: input.confirmed === true,
          operationRequestId: getRequestId(ctx.request),
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'voice_design',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
        })

        return result
      },
    }),
  }
}
