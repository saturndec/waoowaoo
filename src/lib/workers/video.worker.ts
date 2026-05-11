import { Worker, type Job } from 'bullmq'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { queueRedis } from '@/lib/redis'
import { QUEUE_NAME } from '@/lib/task/queues'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { getUserWorkflowConcurrencyConfig } from '@/lib/config-service'
import { reportTaskProgress, withTaskLifecycle } from './shared'
import { withUserConcurrencyGate } from './user-concurrency-gate'
import {
  assertTaskActive,
  getProjectModels,
  resolveLipSyncVideoSource,
  resolveVideoSourceFromGeneration,
  toSignedUrlIfCos,
  uploadVideoSourceToCos,
} from './utils'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { resolveBuiltinCapabilitiesByModelKey } from '@/lib/ai-registry/capabilities-catalog'
import { parseModelKeyStrict } from '@/lib/ai-registry/selection'
import { getProviderConfig } from '@/lib/user-api/runtime-config'
import { handleFinalVideoRenderTask } from './final-video-render'
import { composeAndStoreGridReferenceImage } from '@/lib/video-groups/grid-image'
import { buildVideoGroupPromptInstruction, totalVideoGroupDuration } from '@/lib/video-groups/core'
import type { VideoGridMode, VideoGroupShot } from '@/lib/video-groups/types'
import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'

type AnyObj = Record<string, unknown>
type VideoOptionValue = string | number | boolean
type VideoOptionMap = Record<string, VideoOptionValue>
type VideoGenerationMode = 'normal' | 'firstlastframe'
type PanelRecord = NonNullable<Awaited<ReturnType<typeof prisma.projectPanel.findUnique>>>

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toDurationMs(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return value > 1000 ? Math.round(value) : Math.round(value * 1000)
}

function extractGenerationOptions(payload: AnyObj): VideoOptionMap {
  const fromEnvelope = payload.generationOptions
  if (!fromEnvelope || typeof fromEnvelope !== 'object' || Array.isArray(fromEnvelope)) {
    return {}
  }

  const next: VideoOptionMap = {}
  for (const [key, value] of Object.entries(fromEnvelope as Record<string, unknown>)) {
    if (key === 'aspectRatio') continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      next[key] = value
    }
  }
  return next
}

function toPersistedVideoGenerationOptions(options: VideoOptionMap): VideoOptionMap | typeof Prisma.DbNull {
  const persisted: VideoOptionMap = {}
  for (const [key, value] of Object.entries(options)) {
    if (key === 'aspectRatio' || key === 'generationMode') continue
    persisted[key] = value
  }
  return Object.keys(persisted).length > 0 ? persisted : Prisma.DbNull
}

async function fetchPanelByStoryboardIndex(storyboardId: string, panelIndex: number) {
  return await prisma.projectPanel.findFirst({
    where: {
      storyboardId,
      panelIndex,
    },
  })
}

async function getPanelForVideoTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj

  // 优先使用 targetType=ProjectPanel 直接定位
  if (job.data.targetType === 'ProjectPanel') {
    const panel = await prisma.projectPanel.findUnique({ where: { id: job.data.targetId } })
    if (!panel) throw new Error('Panel not found')
    return panel
  }

  // 兜底：通过 storyboardId + panelIndex 定位
  const storyboardId = payload.storyboardId
  const panelIndex = payload.panelIndex
  if (typeof storyboardId !== 'string' || !storyboardId || panelIndex === undefined || panelIndex === null) {
    throw new Error('Missing storyboardId/panelIndex for video task')
  }

  const panel = await fetchPanelByStoryboardIndex(storyboardId, Number(panelIndex))
  if (!panel) throw new Error('Panel not found by storyboardId/panelIndex')
  return panel
}

async function generateVideoForPanel(
  job: Job<TaskJobData>,
  panel: PanelRecord,
  payload: AnyObj,
  modelId: string,
  projectVideoRatio: string | null | undefined,
  generationOptions: VideoOptionMap,
): Promise<{ cosKey: string; generationMode: VideoGenerationMode; actualVideoTokens?: number }> {
  if (!panel.imageUrl) {
    throw new Error(`Panel ${panel.id} has no imageUrl`)
  }

  const firstLastFramePayload =
    typeof payload.firstLastFrame === 'object' && payload.firstLastFrame !== null
      ? (payload.firstLastFrame as AnyObj)
      : null
  const firstLastCustomPrompt = typeof firstLastFramePayload?.customPrompt === 'string' ? firstLastFramePayload.customPrompt : null
  const persistedFirstLastPrompt = firstLastFramePayload ? panel.firstLastFramePrompt : null
  const customPrompt = typeof payload.customPrompt === 'string' ? payload.customPrompt : null
  const prompt = firstLastCustomPrompt || persistedFirstLastPrompt || customPrompt || panel.videoPrompt || panel.description
  if (!prompt) {
    throw new Error(`Panel ${panel.id} has no video prompt`)
  }

  const sourceImageUrl = toSignedUrlIfCos(panel.imageUrl, 3600)
  if (!sourceImageUrl) {
    throw new Error(`Panel ${panel.id} image url invalid`)
  }
  const sourceImageBase64 = await normalizeToBase64ForGeneration(sourceImageUrl)

  let lastFrameImageBase64: string | undefined
  const generationMode: VideoGenerationMode = firstLastFramePayload ? 'firstlastframe' : 'normal'
  const requestedGenerateAudio = typeof generationOptions.generateAudio === 'boolean'
    ? generationOptions.generateAudio
    : undefined
  let model = modelId

  if (firstLastFramePayload) {
    model =
      typeof firstLastFramePayload.flModel === 'string' && firstLastFramePayload.flModel
        ? firstLastFramePayload.flModel
        : modelId
    const firstLastFrameCapabilities = resolveBuiltinCapabilitiesByModelKey('video', model)
    if (firstLastFrameCapabilities?.video?.firstlastframe !== true) {
      throw new Error(`VIDEO_FIRSTLASTFRAME_MODEL_UNSUPPORTED: ${model}`)
    }
    if (
      typeof firstLastFramePayload.lastFrameStoryboardId === 'string' &&
      firstLastFramePayload.lastFrameStoryboardId &&
      firstLastFramePayload.lastFramePanelIndex !== undefined
    ) {
      const lastPanel = await fetchPanelByStoryboardIndex(
        firstLastFramePayload.lastFrameStoryboardId,
        Number(firstLastFramePayload.lastFramePanelIndex),
      )
      if (lastPanel?.imageUrl) {
        const lastFrameUrl = toSignedUrlIfCos(lastPanel.imageUrl, 3600)
        if (lastFrameUrl) {
          lastFrameImageBase64 = await normalizeToBase64ForGeneration(lastFrameUrl)
        }
      }
    }
  }

  const generatedVideo = await resolveVideoSourceFromGeneration(job, {
    userId: job.data.userId,
    modelId: model,
    imageUrl: sourceImageBase64,
    options: {
      prompt,
      ...(projectVideoRatio ? { aspectRatio: projectVideoRatio } : {}),
      ...generationOptions,
      generationMode,
      ...(typeof requestedGenerateAudio === 'boolean' ? { generateAudio: requestedGenerateAudio } : {}),
      ...(lastFrameImageBase64 ? { lastFrameImageUrl: lastFrameImageBase64 } : {}),
    },
  })

  let downloadHeaders: Record<string, string> | undefined
  const videoSource = generatedVideo.url
  if (generatedVideo.downloadHeaders) {
    downloadHeaders = generatedVideo.downloadHeaders
  } else if (typeof videoSource === 'string') {
    const parsedModel = parseModelKeyStrict(model)
    const isGoogleDownloadUrl = videoSource.includes('generativelanguage.googleapis.com/')
      && videoSource.includes('/files/')
      && videoSource.includes(':download')
    if (parsedModel?.provider === 'google' && isGoogleDownloadUrl) {
      const { apiKey } = await getProviderConfig(job.data.userId, 'google')
      downloadHeaders = { 'x-goog-api-key': apiKey }
    }
  }

  const cosKey = await uploadVideoSourceToCos(videoSource, 'panel-video', panel.id, downloadHeaders)
  return {
    cosKey,
    generationMode,
    ...(typeof generatedVideo.actualVideoTokens === 'number'
      ? { actualVideoTokens: generatedVideo.actualVideoTokens }
      : {}),
  }
}

async function handleVideoPanelTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const projectModels = await getProjectModels(job.data.projectId, job.data.userId)

  const modelId = typeof payload.videoModel === 'string' ? payload.videoModel.trim() : ''
  if (!modelId) throw new Error('VIDEO_MODEL_REQUIRED: payload.videoModel is required')

  const panel = await getPanelForVideoTask(job)

  const generationOptions = extractGenerationOptions(payload)

  await reportTaskProgress(job, 10, {
    stage: 'generate_panel_video',
    panelId: panel.id,
  })

  const { cosKey, generationMode, actualVideoTokens } = await generateVideoForPanel(
    job,
    panel,
    payload,
    modelId,
    projectModels.videoRatio,
    generationOptions,
  )

  await assertTaskActive(job, 'persist_panel_video')
  await prisma.projectPanel.update({
    where: { id: panel.id },
    data: {
      videoUrl: cosKey,
      videoGenerationMode: generationMode,
      lastVideoGenerationOptions: toPersistedVideoGenerationOptions(generationOptions),
    },
  })

  return {
    panelId: panel.id,
    videoUrl: cosKey,
    ...(typeof actualVideoTokens === 'number' ? { actualVideoTokens } : {}),
  }
}

function parseShotNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error('VIDEO_GROUP_SHOT_NUMBERS_REQUIRED')
  const numbers = value.map((item) => Number(item))
  if (numbers.some((item) => !Number.isInteger(item) || item <= 0)) {
    throw new Error('VIDEO_GROUP_SHOT_NUMBERS_INVALID')
  }
  return numbers
}

function parseEditScriptShots(value: unknown): VideoGroupShot[] {
  if (!Array.isArray(value)) throw new Error('VIDEO_GROUP_EDIT_SCRIPT_SHOTS_INVALID')
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('VIDEO_GROUP_EDIT_SCRIPT_SHOT_INVALID')
    }
    const record = item as Record<string, unknown>
    const shotNumber = Number(record.shotNumber)
    const durationSec = Number(record.durationSec)
    if (!Number.isInteger(shotNumber) || shotNumber <= 0) throw new Error('VIDEO_GROUP_EDIT_SCRIPT_SHOT_NUMBER_INVALID')
    if (!Number.isInteger(durationSec) || durationSec < 1 || durationSec > 5) throw new Error('VIDEO_GROUP_EDIT_SCRIPT_SHOT_DURATION_INVALID')
    return {
      shotNumber,
      durationSec,
      visualAction: normalizeString(record.visualAction),
      charactersAndScene: normalizeString(record.charactersAndScene),
      camera: normalizeString(record.camera),
      videoPrompt: normalizeString(record.videoPrompt),
      sound: normalizeString(record.sound),
    }
  })
}

function normalizeGeneratedVideoGroupPrompt(value: string): string {
  return value
    .replace(/^```(?:text|markdown)?/i, '')
    .replace(/```$/i, '')
    .trim()
}

async function handleVideoGroupTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  if (job.data.targetType !== 'ProjectVideoGroup') throw new Error('VIDEO_GROUP_TARGET_REQUIRED')
  const groupId = job.data.targetId
  const modelId = normalizeString(payload.videoModel)
  if (!modelId) throw new Error('VIDEO_MODEL_REQUIRED: payload.videoModel is required')
  const gridMode: VideoGridMode = payload.gridMode === '3x3' ? '3x3' : '2x2'
  const shotNumbers = parseShotNumbers(payload.shotNumbers)
  const generationOptions = extractGenerationOptions(payload)

  await prisma.projectVideoGroup.update({
    where: { id: groupId },
    data: {
      status: 'processing',
      taskId: job.data.taskId,
      errorCode: null,
      errorMessage: null,
    },
  })

  await reportTaskProgress(job, 12, { stage: 'video_group_prepare', groupId })
  const [project, editScript, panels] = await Promise.all([
    prisma.project.findUnique({
      where: { id: job.data.projectId },
      select: {
        analysisModel: true,
        videoRatio: true,
        artStyle: true,
        directorStyleDoc: true,
      },
    }),
    prisma.projectEditScript.findFirst({
      where: { projectId: job.data.projectId, episodeId: job.data.episodeId || normalizeString(payload.episodeId) },
      select: {
        title: true,
        logline: true,
        shotsJson: true,
      },
    }),
    prisma.projectPanel.findMany({
      where: {
        storyboard: { episodeId: job.data.episodeId || normalizeString(payload.episodeId) },
        panelNumber: { in: shotNumbers },
      },
      include: {
        imageMedia: true,
      },
    }),
  ])
  if (!project) throw new Error('VIDEO_GROUP_PROJECT_NOT_FOUND')
  if (!editScript) throw new Error('VIDEO_GROUP_EDIT_SCRIPT_REQUIRED')
  const analysisModel = normalizeString(project.analysisModel)
  if (!analysisModel) throw new Error('VIDEO_GROUP_ANALYSIS_MODEL_REQUIRED')

  const allShots = parseEditScriptShots(editScript.shotsJson)
  const shots = shotNumbers.map((shotNumber) => {
    const shot = allShots.find((item) => item.shotNumber === shotNumber)
    if (!shot) throw new Error(`VIDEO_GROUP_SHOT_NOT_FOUND:${shotNumber}`)
    return shot
  })
  const panelByShotNumber = new Map<number, (typeof panels)[number]>()
  panels.forEach((panel) => {
    if (typeof panel.panelNumber === 'number') panelByShotNumber.set(panel.panelNumber, panel)
  })
  const orderedPanels = shotNumbers.map((shotNumber) => {
    const panel = panelByShotNumber.get(shotNumber)
    if (!panel) throw new Error(`VIDEO_GROUP_PANEL_NOT_FOUND:${shotNumber}`)
    if (!panel.imageUrl && !panel.imageMedia?.storageKey) {
      throw new Error(`VIDEO_GROUP_PANEL_IMAGE_MISSING:${shotNumber}`)
    }
    return panel
  })

  const referenceMedia = await composeAndStoreGridReferenceImage({
    gridMode,
    targetId: groupId,
    cells: orderedPanels.map((panel) => ({
      imageUrl: panel.imageUrl,
      storageKey: panel.imageMedia?.storageKey ?? null,
    })),
  })
  await prisma.projectVideoGroup.update({
    where: { id: groupId },
    data: {
      referenceImageUrl: referenceMedia.url,
      referenceImageMediaId: referenceMedia.id,
      durationSec: totalVideoGroupDuration(shots),
    },
  })

  await reportTaskProgress(job, 26, { stage: 'video_group_prompt', groupId })
  const promptInstruction = buildVideoGroupPromptInstruction({
    title: editScript.title,
    logline: editScript.logline,
    aspectRatio: project.videoRatio,
    gridMode,
    styleContext: [
      normalizeString(project.artStyle),
      normalizeString(project.directorStyleDoc),
    ].filter(Boolean).join('\n'),
    shots,
  }, job.data.locale)
  const promptCompletion = await executeAiTextStep({
    userId: job.data.userId,
    model: analysisModel,
    messages: [{ role: 'user', content: promptInstruction }],
    temperature: 0.4,
    projectId: job.data.projectId,
    action: 'video_group_prompt',
    meta: {
      stepId: 'video_group_prompt',
      stepTitle: '宫格连续视频提示词',
      stepIndex: 1,
      stepTotal: 1,
    },
  })
  const prompt = normalizeGeneratedVideoGroupPrompt(promptCompletion.text)
  if (!prompt) throw new Error('VIDEO_GROUP_PROMPT_EMPTY')
  await prisma.projectVideoGroup.update({
    where: { id: groupId },
    data: { prompt },
  })

  await reportTaskProgress(job, 38, { stage: 'video_group_generate', groupId })
  const sourceImageBase64 = await normalizeToBase64ForGeneration(referenceMedia.storageKey ?? referenceMedia.url)
  const requestedGenerateAudio = typeof generationOptions.generateAudio === 'boolean'
    ? generationOptions.generateAudio
    : undefined
  const generatedVideo = await resolveVideoSourceFromGeneration(job, {
    userId: job.data.userId,
    modelId,
    imageUrl: sourceImageBase64,
    options: {
      prompt,
      ...(project.videoRatio ? { aspectRatio: project.videoRatio } : {}),
      ...generationOptions,
      duration: totalVideoGroupDuration(shots),
      generationMode: 'normal',
      ...(typeof requestedGenerateAudio === 'boolean' ? { generateAudio: requestedGenerateAudio } : {}),
    },
  })

  let downloadHeaders: Record<string, string> | undefined
  const videoSource = generatedVideo.url
  if (generatedVideo.downloadHeaders) {
    downloadHeaders = generatedVideo.downloadHeaders
  } else if (typeof videoSource === 'string') {
    const parsedModel = parseModelKeyStrict(modelId)
    const isGoogleDownloadUrl = videoSource.includes('generativelanguage.googleapis.com/')
      && videoSource.includes('/files/')
      && videoSource.includes(':download')
    if (parsedModel?.provider === 'google' && isGoogleDownloadUrl) {
      const { apiKey } = await getProviderConfig(job.data.userId, 'google')
      downloadHeaders = { 'x-goog-api-key': apiKey }
    }
  }

  await reportTaskProgress(job, 92, { stage: 'video_group_persist', groupId })
  const cosKey = await uploadVideoSourceToCos(videoSource, 'group-video', groupId, downloadHeaders)
  const videoMedia = await ensureMediaObjectFromStorageKey(cosKey, {
    mimeType: 'video/mp4',
    durationMs: totalVideoGroupDuration(shots) * 1000,
  })
  await assertTaskActive(job, 'persist_video_group')
  await prisma.projectVideoGroup.update({
    where: { id: groupId },
    data: {
      status: 'completed',
      taskId: null,
      videoUrl: videoMedia.url,
      videoMediaId: videoMedia.id,
      errorCode: null,
      errorMessage: null,
    },
  })

  return {
    groupId,
    videoUrl: videoMedia.url,
    videoMediaId: videoMedia.id,
    referenceImageUrl: referenceMedia.url,
    referenceImageMediaId: referenceMedia.id,
    durationSec: totalVideoGroupDuration(shots),
    shotNumbers,
    ...(typeof generatedVideo.actualVideoTokens === 'number'
      ? { actualVideoTokens: generatedVideo.actualVideoTokens }
      : {}),
  }
}

async function handleLipSyncTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const lipSyncModel = typeof payload.lipSyncModel === 'string' && payload.lipSyncModel.trim()
    ? payload.lipSyncModel.trim()
    : undefined

  let panel: PanelRecord | null = null
  if (job.data.targetType === 'ProjectPanel') {
    panel = await prisma.projectPanel.findUnique({ where: { id: job.data.targetId } })
  }

  if (
    !panel &&
    typeof payload.storyboardId === 'string' &&
    payload.storyboardId &&
    payload.panelIndex !== undefined
  ) {
    panel = await fetchPanelByStoryboardIndex(payload.storyboardId, Number(payload.panelIndex))
  }

  if (!panel) throw new Error('Lip-sync panel not found')
  if (!panel.videoUrl) throw new Error('Panel has no base video')

  const voiceLineId = typeof payload.voiceLineId === 'string' ? payload.voiceLineId : null
  if (!voiceLineId) throw new Error('Lip-sync task missing voiceLineId')

  const voiceLine = await prisma.projectVoiceLine.findUnique({ where: { id: voiceLineId } })
  if (!voiceLine || !voiceLine.audioUrl) {
    throw new Error('Voice line or audioUrl not found')
  }

  const signedVideoUrl = toSignedUrlIfCos(panel.videoUrl, 7200)
  const signedAudioUrl = toSignedUrlIfCos(voiceLine.audioUrl, 7200)

  if (!signedVideoUrl || !signedAudioUrl) {
    throw new Error('Lip-sync input media url invalid')
  }

  await reportTaskProgress(job, 25, { stage: 'submit_lip_sync' })

  const source = await resolveLipSyncVideoSource(job, {
    userId: job.data.userId,
    videoUrl: signedVideoUrl,
    audioUrl: signedAudioUrl,
    audioDurationMs: typeof voiceLine.audioDuration === 'number' ? voiceLine.audioDuration : undefined,
    videoDurationMs: toDurationMs(panel.duration),
    modelKey: lipSyncModel,
  })

  await reportTaskProgress(job, 93, { stage: 'persist_lip_sync' })

  const cosKey = await uploadVideoSourceToCos(source, 'lip-sync', panel.id)

  await assertTaskActive(job, 'persist_lip_sync_video')
  await prisma.projectPanel.update({
    where: { id: panel.id },
    data: {
      lipSyncVideoUrl: cosKey,
      lipSyncTaskId: null,
    },
  })

  return {
    panelId: panel.id,
    voiceLineId,
    lipSyncVideoUrl: cosKey,
  }
}

async function processVideoTask(job: Job<TaskJobData>) {
  await reportTaskProgress(job, 5, { stage: 'received' })

  switch (job.data.type) {
    case TASK_TYPE.VIDEO_PANEL:
      return await handleVideoPanelTask(job)
    case TASK_TYPE.VIDEO_GROUP:
      try {
        return await handleVideoGroupTask(job)
      } catch (error) {
        if (job.data.targetType === 'ProjectVideoGroup') {
          await prisma.projectVideoGroup.update({
            where: { id: job.data.targetId },
            data: {
              status: 'failed',
              taskId: null,
              errorCode: error instanceof Error ? error.name : 'VIDEO_GROUP_FAILED',
              errorMessage: error instanceof Error ? error.message : String(error),
            },
          }).catch(() => undefined)
        }
        throw error
      }
    case TASK_TYPE.LIP_SYNC:
      return await handleLipSyncTask(job)
    case TASK_TYPE.FINAL_VIDEO_RENDER:
      return await handleFinalVideoRenderTask(job)
    default:
      throw new Error(`Unsupported video task type: ${job.data.type}`)
  }
}

export function createVideoWorker() {
  return new Worker<TaskJobData>(
    QUEUE_NAME.VIDEO,
    async (job) => await withTaskLifecycle(job, async (taskJob) => {
      const workflowConcurrency = await getUserWorkflowConcurrencyConfig(taskJob.data.userId)
      return await withUserConcurrencyGate({
        scope: 'video',
        userId: taskJob.data.userId,
        limit: workflowConcurrency.video,
        run: async () => await processVideoTask(taskJob),
      })
    }),
    {
      connection: queueRedis,
      concurrency: Number.parseInt(process.env.QUEUE_CONCURRENCY_VIDEO || '4', 10) || 4,
    },
  )
}
