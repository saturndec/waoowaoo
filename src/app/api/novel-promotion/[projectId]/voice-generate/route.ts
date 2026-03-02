import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { estimateVoiceLineMaxSeconds } from '@/lib/voice/generate-voice-line'
import { hasVoiceLineAudioOutput } from '@/lib/task/has-output'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { parseModelKeyStrict } from '@/lib/model-config-contract'

type VoiceLineRow = {
  id: string
  speaker: string
  content: string
}

type CharacterRow = {
  name: string
  voiceId: string | null
  customVoiceUrl: string | null
}

type SpeakerVoiceConfig = {
  audioUrl?: string | null
  voiceId?: string | null
}

function parseSpeakerVoices(raw: string | null | undefined) {
  if (!raw) return {} as Record<string, SpeakerVoiceConfig>
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      throw new ApiError('INVALID_PARAMS')
    }
    return parsed as Record<string, SpeakerVoiceConfig>
  } catch {
    throw new ApiError('INVALID_PARAMS')
  }
}

function matchCharacterBySpeaker(speaker: string, characters: CharacterRow[]) {
  const normalizedSpeaker = speaker.trim().toLowerCase()
  return characters.find((character) => character.name.trim().toLowerCase() === normalizedSpeaker) || null
}

function hasSpeakerVoiceBinding(
  speaker: string,
  characters: CharacterRow[],
  speakerVoices: Record<string, SpeakerVoiceConfig>,
) {
  const character = matchCharacterBySpeaker(speaker, characters)
  if (character?.voiceId || character?.customVoiceUrl) return true
  const speakerVoice = speakerVoices[speaker]
  return !!speakerVoice?.voiceId || !!speakerVoice?.audioUrl
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json().catch(() => null)
  const locale = resolveRequiredTaskLocale(request, body)
  const episodeId = typeof body?.episodeId === 'string' ? body.episodeId : ''
  const lineId = typeof body?.lineId === 'string' ? body.lineId : ''
  const audioModel = typeof body?.audioModel === 'string' ? body.audioModel.trim() : ''
  const all = body?.all === true

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS')
  }
  if (!all && !lineId) {
    throw new ApiError('INVALID_PARAMS')
  }
  if (audioModel && !parseModelKeyStrict(audioModel)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_KEY_INVALID',
      field: 'audioModel'})
  }

  const projectData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    select: {
      id: true,
      characters: {
        select: {
          name: true,
          voiceId: true,
          customVoiceUrl: true}}}})
  if (!projectData) {
    throw new ApiError('NOT_FOUND')
  }

  const episode = await prisma.novelPromotionEpisode.findFirst({
    where: {
      id: episodeId,
      novelPromotionProjectId: projectData.id},
    select: {
      id: true,
      speakerVoices: true}})
  if (!episode) {
    throw new ApiError('NOT_FOUND')
  }

  const speakerVoices = parseSpeakerVoices(episode.speakerVoices)
  const characters = projectData.characters || []

  let voiceLines: VoiceLineRow[] = []
  if (all) {
    const allLines = await prisma.novelPromotionVoiceLine.findMany({
      where: {
        episodeId,
        audioUrl: null},
      orderBy: { lineIndex: 'asc' },
      select: {
        id: true,
        speaker: true,
        content: true}})
    voiceLines = allLines.filter((line) => hasSpeakerVoiceBinding(line.speaker, characters, speakerVoices))
  } else {
    const line = await prisma.novelPromotionVoiceLine.findFirst({
      where: {
        id: lineId,
        episodeId},
      select: {
        id: true,
        speaker: true,
        content: true}})
    if (!line) {
      throw new ApiError('NOT_FOUND')
    }
    if (!hasSpeakerVoiceBinding(line.speaker, characters, speakerVoices)) {
      throw new ApiError('INVALID_PARAMS')
    }
    voiceLines = [line]
  }

  if (voiceLines.length === 0) {
    if (all) {
      return NextResponse.json({
        success: true,
        async: true,
        taskIds: [],
        total: 0})
    }
    throw new ApiError('INVALID_PARAMS')
  }

  const results = await Promise.all(
    voiceLines.map(async (line) => {
      const payload = {
        episodeId,
        lineId: line.id,
        maxSeconds: estimateVoiceLineMaxSeconds(line.content),
        ...(audioModel ? { audioModel } : {})}
      const result = await submitTask({
        userId: session.user.id,
    locale,
        requestId: getRequestId(request),
        projectId,
        episodeId,
        type: TASK_TYPE.VOICE_LINE,
        targetType: 'NovelPromotionVoiceLine',
        targetId: line.id,
        payload: withTaskUiPayload(payload, {
          hasOutputAtStart: await hasVoiceLineAudioOutput(line.id)}),
        dedupeKey: `voice_line:${line.id}`,
        billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.VOICE_LINE, payload)})

      return {
        lineId: line.id,
        taskId: result.taskId}
    }),
  )

  if (all) {
    return NextResponse.json({
      success: true,
      async: true,
      taskIds: results.map((item) => item.taskId),
      total: results.length})
  }

  return NextResponse.json({
    success: true,
    async: true,
    taskId: results[0].taskId})
})
