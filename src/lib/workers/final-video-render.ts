import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep, generateMusic } from '@/lib/ai-exec/engine'
import { parseModelKeyStrict } from '@/lib/ai-registry/selection'
import { ensureMediaObjectFromStorageKey, resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { generateUniqueKey, getObjectBuffer, toFetchableUrl, uploadObject } from '@/lib/storage'
import type { TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from './shared'
import {
  buildFinalRenderClips,
  buildFinalRenderMusicPrompt,
  parseFinalRenderEditScriptShots,
  resolveFinalRenderDimensions,
  selectFinalRenderMusicDurationSeconds,
  type FinalRenderClipPlan,
  type FinalRenderEditScriptInput,
} from '@/lib/video-compose/final-render-plan'

type FinalVideoRenderPayload = {
  readonly episodeId?: unknown
  readonly musicModel?: unknown
  readonly outputFormat?: unknown
  readonly bgmVolume?: unknown
}

type GeneratedMusicBuffer = {
  readonly buffer: Buffer
  readonly mimeType: string
}

type CommandResult = {
  readonly stdout: string
  readonly stderr: string
}

const execFileAsync = promisify(execFile)

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readBgmVolume(value: unknown): number {
  if (value === undefined || value === null) return 0.42
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('FINAL_VIDEO_RENDER_BGM_VOLUME_INVALID')
  }
  return value
}

function readOutputFormat(value: unknown): 'mp3' | 'wav' {
  if (value === undefined || value === null || value === '') return 'mp3'
  if (value === 'mp3' || value === 'wav') return value
  throw new Error('FINAL_VIDEO_RENDER_OUTPUT_FORMAT_INVALID')
}

function normalizeGeneratedMusicPrompt(value: string): string {
  const trimmed = value.trim()
  const fenced = /^```(?:text|markdown)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  return (fenced?.[1] ?? trimmed).trim()
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a'
  return 'mp3'
}

function decodeAudioDataUrl(dataUrl: string): GeneratedMusicBuffer | null {
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
}): Promise<GeneratedMusicBuffer> {
  const explicitMimeType = readString(input.mimeType) || 'audio/mpeg'
  if (input.audioBase64) {
    return {
      buffer: Buffer.from(input.audioBase64, 'base64'),
      mimeType: explicitMimeType,
    }
  }

  const audioUrl = readString(input.audioUrl)
  if (!audioUrl) throw new Error('FINAL_VIDEO_RENDER_EMPTY_AUDIO_RESULT')
  const decoded = decodeAudioDataUrl(audioUrl)
  if (decoded) return decoded

  const response = await fetch(toFetchableUrl(audioUrl))
  if (!response.ok) {
    throw new Error(`FINAL_VIDEO_RENDER_AUDIO_DOWNLOAD_FAILED:${response.status}`)
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get('content-type') || explicitMimeType,
  }
}

async function runCommand(command: string, args: readonly string[]): Promise<CommandResult> {
  const result = await execFileAsync(command, [...args], {
    maxBuffer: 32 * 1024 * 1024,
  })
  return {
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
  }
}

async function probeDurationSeconds(filePath: string): Promise<number> {
  const result = await runCommand('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ])
  const duration = Number.parseFloat(result.stdout.trim())
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('FINAL_VIDEO_RENDER_PROBE_DURATION_FAILED')
  }
  return duration
}

function escapeConcatPath(filePath: string): string {
  return filePath.replace(/'/g, "'\\''")
}

async function writeVideoSourceToFile(source: FinalRenderClipPlan['source'], outputPath: string): Promise<void> {
  const storageKey = await resolveStorageKeyFromMediaValue(source)
  if (storageKey) {
    await writeFile(outputPath, await getObjectBuffer(storageKey))
    return
  }

  if (typeof source !== 'string' || !source.trim()) {
    throw new Error('FINAL_VIDEO_RENDER_SOURCE_INVALID')
  }

  const response = await fetch(toFetchableUrl(source))
  if (!response.ok) {
    throw new Error(`FINAL_VIDEO_RENDER_VIDEO_DOWNLOAD_FAILED:${response.status}`)
  }
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()))
}

async function resolveMusicModel(input: {
  readonly payloadMusicModel: unknown
  readonly projectId: string
  readonly userId: string
}): Promise<string> {
  const requested = readString(input.payloadMusicModel)
  if (requested) {
    const parsed = parseModelKeyStrict(requested)
    if (!parsed) throw new Error('FINAL_VIDEO_RENDER_MUSIC_MODEL_INVALID')
    return parsed.modelKey
  }

  const [project, pref] = await Promise.all([
    prisma.project.findUnique({
      where: { id: input.projectId },
      select: { musicModel: true },
    }),
    prisma.userPreference.findUnique({
      where: { userId: input.userId },
      select: { musicModel: true },
    }),
  ])
  const configured = readString(project?.musicModel) || readString(pref?.musicModel)
  if (!configured) throw new Error('FINAL_VIDEO_RENDER_MUSIC_MODEL_REQUIRED')
  const parsed = parseModelKeyStrict(configured)
  if (!parsed) throw new Error('FINAL_VIDEO_RENDER_MUSIC_MODEL_INVALID')
  return parsed.modelKey
}

async function buildEditScript(episodeId: string): Promise<FinalRenderEditScriptInput | null> {
  const script = await prisma.projectEditScript.findUnique({
    where: { episodeId },
    select: {
      id: true,
      title: true,
      logline: true,
      durationSec: true,
      shotsJson: true,
    },
  })
  if (!script) return null
  const shots = parseFinalRenderEditScriptShots(script.shotsJson)
  if (shots.length === 0) return null
  return {
    id: script.id,
    title: script.title,
    logline: script.logline,
    durationSec: script.durationSec,
    shots,
  }
}

async function normalizeClip(input: {
  readonly sourcePath: string
  readonly outputPath: string
  readonly durationSeconds: number
  readonly width: number
  readonly height: number
}): Promise<void> {
  await runCommand('ffmpeg', [
    '-y',
    '-i',
    input.sourcePath,
    '-t',
    input.durationSeconds.toFixed(3),
    '-vf',
    `scale=${input.width}:${input.height}:force_original_aspect_ratio=decrease,pad=${input.width}:${input.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`,
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    input.outputPath,
  ])
}

async function concatClips(input: {
  readonly clipPaths: readonly string[]
  readonly listPath: string
  readonly outputPath: string
}): Promise<void> {
  const lines = input.clipPaths.map((clipPath) => `file '${escapeConcatPath(clipPath)}'`).join('\n')
  await writeFile(input.listPath, `${lines}\n`, 'utf8')
  await runCommand('ffmpeg', [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    input.listPath,
    '-c',
    'copy',
    input.outputPath,
  ])
}

async function muxBgm(input: {
  readonly stitchedPath: string
  readonly musicPath: string
  readonly outputPath: string
  readonly durationSeconds: number
  readonly volume: number
}): Promise<void> {
  const fadeDuration = Math.min(2, Math.max(0.4, input.durationSeconds / 8))
  const fadeOutStart = Math.max(0, input.durationSeconds - fadeDuration)
  await runCommand('ffmpeg', [
    '-y',
    '-i',
    input.stitchedPath,
    '-stream_loop',
    '-1',
    '-i',
    input.musicPath,
    '-filter_complex',
    `[1:a]volume=${input.volume.toFixed(3)},atrim=0:${input.durationSeconds.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${fadeDuration.toFixed(3)},afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeDuration.toFixed(3)}[bgm]`,
    '-map',
    '0:v:0',
    '-map',
    '[bgm]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-shortest',
    input.outputPath,
  ])
}

async function upsertEditorProject(input: {
  readonly episodeId: string
  readonly renderStatus: string
  readonly taskId: string
  readonly outputUrl?: string | null
  readonly projectData?: Record<string, unknown>
}): Promise<void> {
  const projectData = JSON.stringify(input.projectData ?? {
    schemaVersion: 1,
    updatedBy: 'final_video_render',
  })
  await prisma.videoEditorProject.upsert({
    where: { episodeId: input.episodeId },
    update: {
      renderStatus: input.renderStatus,
      renderTaskId: input.taskId,
      ...(input.outputUrl !== undefined ? { outputUrl: input.outputUrl } : {}),
      ...(input.projectData ? { projectData } : {}),
    },
    create: {
      episodeId: input.episodeId,
      projectData,
      renderStatus: input.renderStatus,
      renderTaskId: input.taskId,
      outputUrl: input.outputUrl ?? null,
    },
  })
}

export async function handleFinalVideoRenderTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as FinalVideoRenderPayload
  const episodeId = readString(payload.episodeId) || readString(job.data.episodeId)
  if (!episodeId) throw new Error('FINAL_VIDEO_RENDER_EPISODE_REQUIRED')

  await upsertEditorProject({
    episodeId,
    renderStatus: 'rendering',
    taskId: job.data.taskId,
  })

  const workspaceDir = await mkdtemp(path.join(tmpdir(), `waoowaoo-final-render-${randomUUID()}-`))
  try {
    await reportTaskProgress(job, 10, { stage: 'final_render_prepare' })
    const [project, episode, editScript, panels, videoGroups] = await Promise.all([
      prisma.project.findUnique({
        where: { id: job.data.projectId },
        select: { videoRatio: true, analysisModel: true },
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
              clip: {
                select: { createdAt: true },
              },
            },
          },
        },
      }),
      prisma.projectVideoGroup.findMany({
        where: { episodeId, projectId: job.data.projectId },
        include: { videoMedia: true },
      }),
    ])
    if (!project) throw new Error('FINAL_VIDEO_RENDER_PROJECT_NOT_FOUND')
    if (!episode) throw new Error('FINAL_VIDEO_RENDER_EPISODE_NOT_FOUND')

    const clips = buildFinalRenderClips({ panels, videoGroups, editScript })
    if (clips.length === 0) throw new Error('FINAL_VIDEO_RENDER_NO_VIDEO_CLIPS')
    const missingClip = clips.find((clip) =>
      typeof clip.source === 'string'
        ? !clip.source.trim()
        : !readString(clip.source.url) && !readString(clip.source.storageKey))
    if (missingClip) {
      throw new Error(`FINAL_VIDEO_RENDER_MISSING_VIDEO:${missingClip.groupId ?? missingClip.panelId}`)
    }

    const dimensions = resolveFinalRenderDimensions(project.videoRatio)
    const normalizedPaths: string[] = []
    for (const clip of clips) {
      const sourcePath = path.join(workspaceDir, `source-${clip.order}.mp4`)
      const normalizedPath = path.join(workspaceDir, `clip-${clip.order}.mp4`)
      await writeVideoSourceToFile(clip.source, sourcePath)
      await normalizeClip({
        sourcePath,
        outputPath: normalizedPath,
        durationSeconds: clip.durationSeconds,
        width: dimensions.width,
        height: dimensions.height,
      })
      normalizedPaths.push(normalizedPath)
    }

    const stitchedPath = path.join(workspaceDir, 'stitched.mp4')
    await concatClips({
      clipPaths: normalizedPaths,
      listPath: path.join(workspaceDir, 'concat.txt'),
      outputPath: stitchedPath,
    })
    const stitchedDurationSeconds = await probeDurationSeconds(stitchedPath)

    await reportTaskProgress(job, 55, { stage: 'final_render_music' })
    const musicModel = await resolveMusicModel({
      payloadMusicModel: payload.musicModel,
      projectId: job.data.projectId,
      userId: job.data.userId,
    })
    const promptWriterInstruction = buildFinalRenderMusicPrompt({
      editScript,
      clips,
      totalDurationSeconds: stitchedDurationSeconds,
      locale: job.data.locale,
    })
    const analysisModel = readString(project.analysisModel)
    if (!analysisModel) throw new Error('FINAL_VIDEO_RENDER_ANALYSIS_MODEL_REQUIRED')
    const promptCompletion = await executeAiTextStep({
      userId: job.data.userId,
      model: analysisModel,
      messages: [{ role: 'user', content: promptWriterInstruction }],
      temperature: 0.4,
      projectId: job.data.projectId,
      action: 'final_render_bgm_prompt',
      meta: {
        stepId: 'final_render_bgm_prompt',
        stepTitle: 'AI剪辑 BGM 提示词',
        stepIndex: 1,
        stepTotal: 1,
      },
    })
    const musicPrompt = normalizeGeneratedMusicPrompt(promptCompletion.text)
    if (!musicPrompt) throw new Error('FINAL_VIDEO_RENDER_MUSIC_PROMPT_EMPTY')
    const musicDurationSeconds = selectFinalRenderMusicDurationSeconds(musicModel, stitchedDurationSeconds)
    const generated = await generateMusic(job.data.userId, musicModel, musicPrompt, {
      durationSeconds: musicDurationSeconds,
      vocalMode: 'instrumental',
      outputFormat: readOutputFormat(payload.outputFormat),
    })
    if (!generated.success) {
      throw new Error(generated.error || 'FINAL_VIDEO_RENDER_MUSIC_PROVIDER_FAILED')
    }
    const audio = await loadAudioBuffer({
      audioBase64: generated.audioBase64,
      audioUrl: generated.audioUrl,
      mimeType: generated.audioMimeType,
    })
    const musicPath = path.join(workspaceDir, `bgm.${extensionFromMimeType(audio.mimeType)}`)
    await writeFile(musicPath, audio.buffer)

    await reportTaskProgress(job, 78, { stage: 'final_render_compose' })
    const finalPath = path.join(workspaceDir, 'final.mp4')
    await muxBgm({
      stitchedPath,
      musicPath,
      outputPath: finalPath,
      durationSeconds: stitchedDurationSeconds,
      volume: readBgmVolume(payload.bgmVolume),
    })
    const outputBuffer = await readFile(finalPath)

    await reportTaskProgress(job, 92, { stage: 'final_render_persist' })
    const storageKey = await uploadObject(
      outputBuffer,
      generateUniqueKey('final-video', 'mp4'),
      1,
      'video/mp4',
    )
    const media = await ensureMediaObjectFromStorageKey(storageKey, {
      mimeType: 'video/mp4',
      sizeBytes: outputBuffer.byteLength,
      width: dimensions.width,
      height: dimensions.height,
      durationMs: Math.round(stitchedDurationSeconds * 1000),
    })

    const projectData = {
      schemaVersion: 1,
      type: 'linear_final_render',
      taskId: job.data.taskId,
      dimensions,
      durationSeconds: stitchedDurationSeconds,
      music: {
        model: musicModel,
        requestedDurationSeconds: musicDurationSeconds,
        prompt: musicPrompt,
        providerMetadata: generated.metadata || {},
      },
      timeline: clips.map((clip) => ({
        order: clip.order,
        sourceKind: clip.sourceKind,
        panelId: clip.panelId,
        groupId: clip.groupId ?? null,
        shotNumber: clip.shotNumber,
        durationSeconds: clip.durationSeconds,
      })),
    }
    await upsertEditorProject({
      episodeId,
      renderStatus: 'completed',
      taskId: job.data.taskId,
      outputUrl: media.url,
      projectData,
    })

    return {
      videoMediaId: media.id,
      outputUrl: media.url,
      storageKey,
      episodeId,
      clipCount: clips.length,
      durationSeconds: stitchedDurationSeconds,
      width: dimensions.width,
      height: dimensions.height,
      musicModel,
    }
  } catch (error) {
    await upsertEditorProject({
      episodeId,
      renderStatus: 'failed',
      taskId: job.data.taskId,
    })
    throw error
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
}
