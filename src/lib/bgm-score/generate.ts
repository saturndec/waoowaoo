import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
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
import { renderBgmScoreMix, type BgmScoreCommandResult } from './mixer'
import { buildBgmScorePlanPrompt } from './prompt'
import { mergeBgmScoreProjectData, parseEditorProjectData } from './project-data'
import {
  BGM_SCORE_STATUS,
  bgmScorePlanSchema,
  type BgmScoreGeneratedStem,
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

type GeneratedStemBuffer = {
  readonly stem: BgmScorePlan['stems'][number]
  readonly buffer: Buffer
  readonly mimeType: string
  readonly inputPath: string
}

type StemGenerationSuccess = {
  readonly status: 'fulfilled'
  readonly stem: GeneratedStemBuffer
}

type StemGenerationFailure = {
  readonly status: 'rejected'
  readonly role: BgmScorePlan['stems'][number]['role']
  readonly message: string
}

type StemGenerationOutcome = StemGenerationSuccess | StemGenerationFailure

const execFileAsync = promisify(execFile)

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

async function runCommand(command: string, args: readonly string[]): Promise<BgmScoreCommandResult> {
  const result = await execFileAsync(command, [...args], {
    maxBuffer: 32 * 1024 * 1024,
  })
  return {
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
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

function ensureCompleteTimeline(clips: readonly FinalRenderClipPlan[]): void {
  if (clips.length === 0) throw new Error('BGM_SCORE_VIDEO_TIMELINE_INCOMPLETE')
  const missingClip = clips.find((clip) =>
    typeof clip.source === 'string'
      ? !clip.source.trim()
      : !readString(clip.source.url) && !readString(clip.source.storageKey))
  if (missingClip) {
    throw new Error(`BGM_SCORE_VIDEO_TIMELINE_INCOMPLETE:${missingClip.groupId ?? missingClip.panelId}`)
  }
}

function normalizePlanDuration(plan: BgmScorePlan, durationSeconds: number): BgmScorePlan {
  return {
    ...plan,
    durationSeconds,
    stems: plan.stems.map((stem) => ({
      ...stem,
      durationSec: Math.min(stem.durationSec, Math.max(0.1, durationSeconds - stem.startSec)),
    })),
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

async function uploadGeneratedStem(input: {
  readonly stem: GeneratedStemBuffer
}): Promise<BgmScoreGeneratedStem> {
  const storageKey = await uploadObject(
    input.stem.buffer,
    generateUniqueKey(`music-stems/${input.stem.stem.role}`, extensionFromMimeType(input.stem.mimeType)),
    1,
    input.stem.mimeType,
  )
  const media = await ensureMediaObjectFromStorageKey(storageKey, {
    mimeType: input.stem.mimeType,
    sizeBytes: input.stem.buffer.byteLength,
    durationMs: Math.round(input.stem.stem.durationSec * 1000),
  })
  return {
    role: input.stem.stem.role,
    reason: input.stem.stem.reason,
    startSec: input.stem.stem.startSec,
    durationSec: input.stem.stem.durationSec,
    gainDb: input.stem.stem.gainDb,
    fadeInSec: input.stem.stem.fadeInSec,
    fadeOutSec: input.stem.stem.fadeOutSec,
    prompt: input.stem.stem.prompt,
    negativePrompt: input.stem.stem.negativePrompt ?? null,
    mediaId: media.id,
    url: media.url,
    storageKey,
    mimeType: input.stem.mimeType,
    durationMs: Math.round(input.stem.stem.durationSec * 1000),
  }
}

function buildStemPrompt(plan: BgmScorePlan, stem: BgmScorePlan['stems'][number]): string {
  const negativePrompt = stem.negativePrompt?.trim()
  const stemRule = plan.blueprint.stemRules.find((rule) => rule.role === stem.role)
  return [
    stem.prompt,
    '',
    `Generate an isolated ${stem.role} BGM stem only, not a full soundtrack or full mix.`,
    `Target stem duration: ${Math.ceil(stem.durationSec)} seconds.`,
    `Global BGM direction: ${plan.global.genre}, ${plan.global.mood}.`,
    plan.global.bpm ? `Tempo: ${plan.global.bpm} BPM.` : '',
    plan.global.key ? `Key / tonal center: ${plan.global.key}.` : '',
    '',
    'Shared Score Blueprint source of truth. Follow this exactly; do not create an independent cue:',
    `Tempo map: ${JSON.stringify(plan.blueprint.tempoMap)}.`,
    `Key map: ${JSON.stringify(plan.blueprint.keyMap)}.`,
    `Chord map: ${JSON.stringify(plan.blueprint.chordMap)}.`,
    `Hit points: ${JSON.stringify(plan.blueprint.hitPoints)}.`,
    plan.blueprint.motif ? `Motif rule: ${JSON.stringify(plan.blueprint.motif)}.` : 'Motif rule: no independent motif.',
    `Orchestration map: ${JSON.stringify(plan.blueprint.orchestrationMap)}.`,
    stemRule ? `This stem rule: ${JSON.stringify(stemRule)}.` : '',
    '',
    'Stay locked to the blueprint downbeat, BPM, time signature, bar ranges, chord progression, and hit points.',
    'Do not invent independent harmony, independent bass movement, off-grid rhythm, extra melody, or full arrangement.',
    'Leave room for video dialogue, native video sound, and source audio.',
    'No vocals, no lyrics, no dialogue, no Foley, no literal sound effects, no complete song arrangement.',
    negativePrompt ? `Avoid: ${negativePrompt}.` : '',
  ].filter(Boolean).join('\n')
}

async function generateStemBuffer(input: {
  readonly userId: string
  readonly musicModel: string
  readonly outputFormat: 'mp3' | 'wav'
  readonly plan: BgmScorePlan
  readonly stem: BgmScorePlan['stems'][number]
  readonly stemIndex: number
  readonly workspaceDir: string
}): Promise<GeneratedStemBuffer> {
  const generated = await generateMusic(input.userId, input.musicModel, buildStemPrompt(input.plan, input.stem), {
    durationSeconds: selectFinalRenderMusicDurationSeconds(input.musicModel, input.stem.durationSec),
    vocalMode: 'instrumental',
    outputFormat: input.outputFormat,
  })
  if (!generated.success) {
    throw new Error(generated.error || `BGM_SCORE_STEM_PROVIDER_FAILED:${input.stem.role}`)
  }
  const audio = await loadAudioBuffer({
    audioBase64: generated.audioBase64,
    audioUrl: generated.audioUrl,
    mimeType: generated.audioMimeType,
  })
  const inputPath = path.join(input.workspaceDir, `stem-${input.stemIndex}.${extensionFromMimeType(audio.mimeType)}`)
  await writeFile(inputPath, audio.buffer)
  return {
    stem: input.stem,
    buffer: audio.buffer,
    mimeType: audio.mimeType,
    inputPath,
  }
}

async function settleStemGeneration(input: {
  readonly userId: string
  readonly musicModel: string
  readonly outputFormat: 'mp3' | 'wav'
  readonly plan: BgmScorePlan
  readonly stem: BgmScorePlan['stems'][number]
  readonly stemIndex: number
  readonly workspaceDir: string
  readonly onCompleted: (stem: BgmScorePlan['stems'][number]) => Promise<void>
}): Promise<StemGenerationOutcome> {
  try {
    const stem = await generateStemBuffer(input)
    await input.onCompleted(input.stem)
    return {
      status: 'fulfilled',
      stem,
    }
  } catch (error) {
    return {
      status: 'rejected',
      role: input.stem.role,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function handleBgmScoreGenerateTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as BgmScoreGeneratePayload
  const episodeId = readString(payload.episodeId) || readString(job.data.episodeId)
  const musicModel = readString(payload.musicModel)
  if (!episodeId) throw new Error('BGM_SCORE_EPISODE_REQUIRED')
  if (!musicModel) throw new Error('BGM_SCORE_MUSIC_MODEL_REQUIRED')

  const workspaceDir = await mkdtemp(path.join(tmpdir(), `waoowaoo-bgm-score-${randomUUID()}-`))
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
    ensureCompleteTimeline(clips)
    editScriptId = editScript.id
    durationSeconds = clips.reduce((total, clip) => total + clip.durationSeconds, 0)
    signature = timelineSignature(clips)

    await writeBgmScoreProjectData({
      episodeId,
      bgmScore: {
        schemaVersion: 1,
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
    let completedStemCount = 0
    await reportTaskProgress(job, 25, {
      stage: 'bgm_score_generate_stem',
      stemCount: plan.stems.length,
      completedStemCount,
      generationMode: 'parallel',
    })
    const stemOutcomes = await Promise.all(plan.stems.map((stem, index) =>
      settleStemGeneration({
        userId: job.data.userId,
        musicModel,
        outputFormat,
        plan,
        stem,
        stemIndex: index,
        workspaceDir,
        onCompleted: async (completedStem) => {
          completedStemCount += 1
          const progress = 25 + Math.round((completedStemCount / plan.stems.length) * 45)
          await reportTaskProgress(job, progress, {
            stage: 'bgm_score_generate_stem',
            stemRole: completedStem.role,
            stemCount: plan.stems.length,
            completedStemCount,
            generationMode: 'parallel',
          })
        },
      })
    ))
    const failedStem = stemOutcomes.find((outcome): outcome is StemGenerationFailure =>
      outcome.status === 'rejected')
    if (failedStem) {
      throw new Error(failedStem.message || `BGM_SCORE_STEM_PROVIDER_FAILED:${failedStem.role}`)
    }
    const generatedStems = stemOutcomes.map((outcome) => {
      if (outcome.status !== 'fulfilled') {
        throw new Error(`BGM_SCORE_STEM_PROVIDER_FAILED:${outcome.role}`)
      }
      return outcome.stem
    })

    await reportTaskProgress(job, 76, { stage: 'bgm_score_mix' })
    const mixPath = path.join(workspaceDir, 'bgm-score.m4a')
    await renderBgmScoreMix({
      runCommand,
      stems: generatedStems.map((item) => ({
        inputPath: item.inputPath,
        startSec: item.stem.startSec,
        durationSec: item.stem.durationSec,
        gainDb: item.stem.gainDb,
        fadeInSec: item.stem.fadeInSec,
        fadeOutSec: item.stem.fadeOutSec,
      })),
      outputPath: mixPath,
      durationSeconds,
    })

    await reportTaskProgress(job, 88, { stage: 'bgm_score_persist' })
    const uploadedStems: BgmScoreGeneratedStem[] = []
    for (const stem of generatedStems) {
      uploadedStems.push(await uploadGeneratedStem({ stem }))
    }
    const mixBuffer = await readFile(mixPath)
    const mixStorageKey = await uploadObject(
      mixBuffer,
      generateUniqueKey('music/bgm-score', 'm4a'),
      1,
      'audio/mp4',
    )
    const mixMedia = await ensureMediaObjectFromStorageKey(mixStorageKey, {
      mimeType: 'audio/mp4',
      sizeBytes: mixBuffer.byteLength,
      durationMs: Math.round(durationSeconds * 1000),
    })
    const bgmScore: BgmScoreProjectData = {
      schemaVersion: 1,
      status: BGM_SCORE_STATUS.COMPLETED,
      taskId: job.data.taskId,
      editScriptId,
      timelineSignature: signature,
      durationSeconds,
      musicModel,
      plan,
      stems: uploadedStems,
      mix: {
        mediaId: mixMedia.id,
        url: mixMedia.url,
        storageKey: mixStorageKey,
        mimeType: 'audio/mp4',
        durationMs: Math.round(durationSeconds * 1000),
      },
    }
    await writeBgmScoreProjectData({ episodeId, bgmScore })

    return {
      episodeId,
      mediaId: mixMedia.id,
      audioUrl: mixMedia.url,
      storageKey: mixStorageKey,
      musicModel,
      stemCount: uploadedStems.length,
      durationMs: Math.round(durationSeconds * 1000),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (editScriptId && signature && durationSeconds > 0) {
      await writeBgmScoreProjectData({
        episodeId,
        bgmScore: {
          schemaVersion: 1,
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
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
}
