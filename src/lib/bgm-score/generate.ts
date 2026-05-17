import { createHash } from 'node:crypto'
import type { Job } from 'bullmq'
import { executeAiTextStep, generateMusic } from '@/lib/ai-exec/engine'
import { prisma } from '@/lib/prisma'
import { safeParseJsonObject } from '@/lib/json-repair'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { generateUniqueKey, toFetchableUrl, uploadObject } from '@/lib/storage'
import type { TaskJobData } from '@/lib/task/types'
import {
  buildFinalRenderClips,
  parseFinalRenderEditScriptShots,
  parseFinalRenderEditScriptVideoBlocks,
  selectFinalRenderMusicDurationSeconds,
  type FinalRenderClipPlan,
  type FinalRenderEditScriptInput,
} from '@/lib/video-compose/final-render-plan'
import { reportTaskProgress } from '@/lib/workers/shared'
import { buildBgmScorePlanPrompt, buildFinalBgmMusicPrompt } from './prompt'
import { mergeBgmScoreProjectData, parseEditorProjectData } from './project-data'
import {
  BGM_SCORE_STATUS,
  bgmScorePlanSchema,
  type BgmScoreMix,
  type BgmScorePlan,
  type BgmScoreProjectData,
} from './types'

type BgmScoreGeneratePayload = {
  readonly episodeId?: unknown
  readonly musicModel?: unknown
  readonly outputFormat?: unknown
}

type GeneratedAudioBuffer = {
  readonly buffer: Buffer
  readonly mimeType: string
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readOutputFormat(value: unknown): 'mp3' | 'wav' {
  if (value === undefined || value === null || value === '') return 'mp3'
  if (value === 'mp3' || value === 'wav') return value
  throw new Error('BGM_SCORE_OUTPUT_FORMAT_INVALID')
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a'
  return 'mp3'
}

function decodeAudioDataUrl(dataUrl: string): GeneratedAudioBuffer | null {
  const match = /^data:(audio\/[^;]+);base64,(.+)$/i.exec(dataUrl.trim())
  if (!match) return null
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  }
}

async function loadAudioBuffer(input: {
  readonly audioBase64?: string
  readonly audioUrl?: string
  readonly mimeType?: string
}): Promise<GeneratedAudioBuffer> {
  const explicitMimeType = readString(input.mimeType) || 'audio/mpeg'
  if (input.audioBase64) {
    return {
      buffer: Buffer.from(input.audioBase64, 'base64'),
      mimeType: explicitMimeType,
    }
  }

  const audioUrl = readString(input.audioUrl)
  if (!audioUrl) throw new Error('BGM_SCORE_EMPTY_AUDIO_RESULT')
  const decoded = decodeAudioDataUrl(audioUrl)
  if (decoded) return decoded

  const response = await fetch(toFetchableUrl(audioUrl))
  if (!response.ok) {
    throw new Error(`BGM_SCORE_AUDIO_DOWNLOAD_FAILED:${response.status}`)
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get('content-type') || explicitMimeType,
  }
}

function timelineSignature(clips: readonly FinalRenderClipPlan[]): string {
  const payload = clips.map((clip) => ({
    order: clip.order,
    sourceKind: clip.sourceKind,
    panelId: clip.panelId,
    groupId: clip.groupId ?? null,
    shotNumbers: clip.shotNumbers,
    durationSeconds: clip.durationSeconds,
  }))
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24)
}

async function buildEditScript(episodeId: string): Promise<FinalRenderEditScriptInput | null> {
  const script = await prisma.projectEditScript.findUnique({
    where: { episodeId },
    select: {
      id: true,
      userPrompt: true,
      title: true,
      logline: true,
      durationSec: true,
      shotsJson: true,
      videoBlocksJson: true,
    },
  })
  if (!script) return null
  const shots = parseFinalRenderEditScriptShots(script.shotsJson)
  if (shots.length === 0) return null
  return {
    id: script.id,
    userPrompt: script.userPrompt,
    title: script.title,
    logline: script.logline,
    durationSec: script.durationSec,
    shots,
    videoBlocks: parseFinalRenderEditScriptVideoBlocks({
      value: script.videoBlocksJson,
      shots,
    }),
  }
}

function ensureSchedulableTimeline(clips: readonly FinalRenderClipPlan[]): void {
  if (clips.length === 0) throw new Error('BGM_SCORE_VIDEO_TIMELINE_INCOMPLETE')
  const invalidClip = clips.find((clip) => !Number.isFinite(clip.durationSeconds) || clip.durationSeconds <= 0)
  if (invalidClip) {
    throw new Error(`BGM_SCORE_VIDEO_TIMELINE_INCOMPLETE:${invalidClip.groupId ?? invalidClip.panelId}`)
  }
}

function normalizePlanDuration(plan: BgmScorePlan, durationSeconds: number): BgmScorePlan {
  return {
    ...plan,
    durationSeconds,
  }
}

function parseBgmScorePlan(text: string, durationSeconds: number): BgmScorePlan {
  const parsed = safeParseJsonObject(text)
  const result = bgmScorePlanSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`BGM_SCORE_PLAN_INVALID:${result.error.issues.map((issue) => issue.message).join(',')}`)
  }
  const normalized = normalizePlanDuration(result.data, durationSeconds)
  const normalizedResult = bgmScorePlanSchema.safeParse(normalized)
  if (!normalizedResult.success) {
    throw new Error(`BGM_SCORE_PLAN_INVALID:${normalizedResult.error.issues.map((issue) => issue.message).join(',')}`)
  }
  return normalizedResult.data
}

async function writeBgmScoreProjectData(input: {
  readonly episodeId: string
  readonly bgmScore: BgmScoreProjectData
}): Promise<void> {
  const existing = await prisma.videoEditorProject.findUnique({
    where: { episodeId: input.episodeId },
    select: { projectData: true },
  })
  const projectData = mergeBgmScoreProjectData(
    parseEditorProjectData(existing?.projectData ?? null),
    input.bgmScore,
  )
  await prisma.videoEditorProject.upsert({
    where: { episodeId: input.episodeId },
    create: {
      episodeId: input.episodeId,
      projectData: JSON.stringify(projectData),
      renderStatus: null,
      renderTaskId: null,
      outputUrl: null,
    },
    update: {
      projectData: JSON.stringify(projectData),
    },
  })
}

async function uploadGeneratedBgmMix(input: {
  readonly audio: GeneratedAudioBuffer
  readonly durationSeconds: number
}): Promise<BgmScoreMix> {
  const storageKey = await uploadObject(
    input.audio.buffer,
    generateUniqueKey('music/bgm-score', extensionFromMimeType(input.audio.mimeType)),
    1,
    input.audio.mimeType,
  )
  const media = await ensureMediaObjectFromStorageKey(storageKey, {
    mimeType: input.audio.mimeType,
    sizeBytes: input.audio.buffer.byteLength,
    durationMs: Math.round(input.durationSeconds * 1000),
  })
  return {
    mediaId: media.id,
    url: media.url,
    storageKey,
    mimeType: input.audio.mimeType,
    durationMs: Math.round(input.durationSeconds * 1000),
  }
}

export async function handleBgmScoreGenerateTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as BgmScoreGeneratePayload
  const episodeId = readString(payload.episodeId) || readString(job.data.episodeId)
  const musicModel = readString(payload.musicModel)
  if (!episodeId) throw new Error('BGM_SCORE_EPISODE_REQUIRED')
  if (!musicModel) throw new Error('BGM_SCORE_MUSIC_MODEL_REQUIRED')

  let editScriptId = ''
  let signature = ''
  let durationSeconds = 0

  try {
    await reportTaskProgress(job, 8, { stage: 'bgm_score_prepare' })
    const [project, episode, editScript, panels, videoGroups] = await Promise.all([
      prisma.project.findUnique({
        where: { id: job.data.projectId },
        select: {
          analysisModel: true,
          videoRatio: true,
          artStyle: true,
          artStylePrompt: true,
          visualStylePresetSource: true,
          visualStylePresetId: true,
          directorStylePresetSource: true,
          directorStylePresetId: true,
          directorStyleDoc: true,
        },
      }),
      prisma.projectEpisode.findFirst({
        where: { id: episodeId, projectId: job.data.projectId },
        select: { id: true },
      }),
      buildEditScript(episodeId),
      prisma.projectPanel.findMany({
        where: { storyboard: { episodeId } },
        include: {
          videoMedia: true,
          lipSyncVideoMedia: true,
          storyboard: {
            select: {
              id: true,
              createdAt: true,
              storyboardTextJson: true,
              clip: { select: { createdAt: true } },
            },
          },
        },
      }),
      prisma.projectVideoGroup.findMany({
        where: { episodeId, projectId: job.data.projectId },
        include: { videoMedia: true },
      }),
    ])
    if (!project) throw new Error('BGM_SCORE_PROJECT_NOT_FOUND')
    if (!episode) throw new Error('BGM_SCORE_EPISODE_NOT_FOUND')
    if (!editScript) throw new Error('BGM_SCORE_EDIT_SCRIPT_REQUIRED')
    const analysisModel = readString(project.analysisModel)
    if (!analysisModel) throw new Error('BGM_SCORE_ANALYSIS_MODEL_REQUIRED')

    const clips = buildFinalRenderClips({ panels, videoGroups, editScript })
    ensureSchedulableTimeline(clips)
    editScriptId = editScript.id
    durationSeconds = clips.reduce((total, clip) => total + clip.durationSeconds, 0)
    signature = timelineSignature(clips)

    await writeBgmScoreProjectData({
      episodeId,
      bgmScore: {
        schemaVersion: 2,
        status: BGM_SCORE_STATUS.GENERATING,
        taskId: job.data.taskId,
        editScriptId,
        timelineSignature: signature,
        durationSeconds,
        musicModel,
      },
    })

    await reportTaskProgress(job, 18, { stage: 'bgm_score_plan' })
    const completion = await executeAiTextStep({
      userId: job.data.userId,
      model: analysisModel,
      messages: [{
        role: 'user',
        content: buildBgmScorePlanPrompt({
          editScript,
          projectContext: {
            videoRatio: project.videoRatio,
            artStyle: project.artStyle,
            artStylePrompt: project.artStylePrompt,
            visualStylePresetSource: project.visualStylePresetSource,
            visualStylePresetId: project.visualStylePresetId,
            directorStylePresetSource: project.directorStylePresetSource,
            directorStylePresetId: project.directorStylePresetId,
            directorStyleDoc: project.directorStyleDoc,
          },
          clips,
          totalDurationSeconds: durationSeconds,
        }),
      }],
      temperature: 0.35,
      projectId: job.data.projectId,
      action: 'bgm_score_plan',
      meta: {
        stepId: 'bgm_score_plan',
        stepTitle: 'bgm_score_plan',
        stepIndex: 1,
        stepTotal: 1,
      },
    })
    const plan = parseBgmScorePlan(completion.text, durationSeconds)

    const outputFormat = readOutputFormat(payload.outputFormat)
    await reportTaskProgress(job, 45, {
      stage: 'bgm_score_generate_music',
      designSectionCount: plan.scoreDesign.sections.length,
      promptSectionCount: plan.promptSections.length,
      virtualLayerCount: plan.virtualLayers.length,
    })
    const generated = await generateMusic(job.data.userId, musicModel, buildFinalBgmMusicPrompt(plan), {
      durationSeconds: selectFinalRenderMusicDurationSeconds(musicModel, durationSeconds),
      vocalMode: 'instrumental',
      outputFormat,
    })
    if (!generated.success) {
      throw new Error(generated.error || 'BGM_SCORE_PROVIDER_FAILED')
    }
    const audio = await loadAudioBuffer({
      audioBase64: generated.audioBase64,
      audioUrl: generated.audioUrl,
      mimeType: generated.audioMimeType,
    })

    await reportTaskProgress(job, 88, { stage: 'bgm_score_persist' })
    const mix = await uploadGeneratedBgmMix({ audio, durationSeconds })
    const bgmScore: BgmScoreProjectData = {
      schemaVersion: 2,
      status: BGM_SCORE_STATUS.COMPLETED,
      taskId: job.data.taskId,
      editScriptId,
      timelineSignature: signature,
      durationSeconds,
      musicModel,
      plan,
      mix,
    }
    await writeBgmScoreProjectData({ episodeId, bgmScore })

    return {
      episodeId,
      mediaId: mix.mediaId,
      audioUrl: mix.url,
      storageKey: mix.storageKey,
      musicModel,
      designSectionCount: plan.scoreDesign.sections.length,
      promptSectionCount: plan.promptSections.length,
      virtualLayerCount: plan.virtualLayers.length,
      durationMs: mix.durationMs,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (editScriptId && signature && durationSeconds > 0) {
      await writeBgmScoreProjectData({
        episodeId,
        bgmScore: {
          schemaVersion: 2,
          status: BGM_SCORE_STATUS.FAILED,
          taskId: job.data.taskId,
          editScriptId,
          timelineSignature: signature,
          durationSeconds,
          musicModel,
          errorMessage: message,
        },
      })
    }
    throw error
  }
}
