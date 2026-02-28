import { Worker, type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { queueRedis } from '@/lib/redis'
import { QUEUE_NAME } from '@/lib/task/queues'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { reportTaskProgress, withTaskLifecycle } from './shared'
import {
  assertTaskActive,
  getProjectModels,
  resolveLipSyncVideoSource,
  resolveVideoSourceFromGeneration,
  toSignedUrlIfCos,
  uploadVideoSourceToCos,
} from './utils'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { resolveBuiltinCapabilitiesByModelKey } from '@/lib/model-capabilities/lookup'
import { parseModelKeyStrict } from '@/lib/model-config-contract'
import { getProviderConfig } from '@/lib/api-config'

type AnyObj = Record<string, unknown>
type VideoOptionValue = string | number | boolean
type VideoOptionMap = Record<string, VideoOptionValue>
type VideoGenerationMode = 'normal' | 'firstlastframe'
type PanelRecord = NonNullable<Awaited<ReturnType<typeof prisma.novelPromotionPanel.findUnique>>>

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

async function fetchPanelByStoryboardIndex(storyboardId: string, panelIndex: number) {
  return await prisma.novelPromotionPanel.findFirst({
    where: {
      storyboardId,
      panelIndex,
    },
  })
}

async function getPanelForVideoTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj

  // 优先使用 targetType=NovelPromotionPanel 直接定位
  if (job.data.targetType === 'NovelPromotionPanel') {
    const panel = await prisma.novelPromotionPanel.findUnique({ where: { id: job.data.targetId } })
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
): Promise<{ cosKey: string; generationMode: VideoGenerationMode }> {
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
  return { cosKey, generationMode }
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

  const { cosKey, generationMode } = await generateVideoForPanel(
    job,
    panel,
    payload,
    modelId,
    projectModels.videoRatio,
    generationOptions,
  )

  await assertTaskActive(job, 'persist_panel_video')
  await prisma.novelPromotionPanel.update({
    where: { id: panel.id },
    data: {
      videoUrl: cosKey,
      videoGenerationMode: generationMode,
    },
  })

  return {
    panelId: panel.id,
    videoUrl: cosKey,
  }
}

async function handleLipSyncTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const lipSyncModel = typeof payload.lipSyncModel === 'string' && payload.lipSyncModel.trim()
    ? payload.lipSyncModel.trim()
    : undefined

  let panel: PanelRecord | null = null
  if (job.data.targetType === 'NovelPromotionPanel') {
    panel = await prisma.novelPromotionPanel.findUnique({ where: { id: job.data.targetId } })
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

  const voiceLine = await prisma.novelPromotionVoiceLine.findUnique({ where: { id: voiceLineId } })
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
    modelKey: lipSyncModel,
  })

  await reportTaskProgress(job, 93, { stage: 'persist_lip_sync' })

  const cosKey = await uploadVideoSourceToCos(source, 'lip-sync', panel.id)

  await assertTaskActive(job, 'persist_lip_sync_video')
  await prisma.novelPromotionPanel.update({
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
    case TASK_TYPE.LIP_SYNC:
      return await handleLipSyncTask(job)
    default:
      throw new Error(`Unsupported video task type: ${job.data.type}`)
  }
}

export function createVideoWorker() {
  return new Worker<TaskJobData>(
    QUEUE_NAME.VIDEO,
    async (job) => await withTaskLifecycle(job, processVideoTask),
    {
      connection: queueRedis,
      concurrency: Number.parseInt(process.env.QUEUE_CONCURRENCY_VIDEO || '4', 10) || 4,
    },
  )
}
