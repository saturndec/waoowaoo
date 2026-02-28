import sharp from 'sharp'
import { type Job } from 'bullmq'
import { createScopedLogger } from '@/lib/logging/core'
import { withLogContext } from '@/lib/logging/context'
import { generateImage, generateVideo } from '@/lib/generator-api'
import { generateLipSync } from '@/lib/kling'
import { pollAsyncTask } from '@/lib/async-poll'
import { getSignedUrl, toFetchableUrl } from '@/lib/cos'
import { initializeFonts, createLabelSVG } from '@/lib/fonts'
import { processMediaResult } from '@/lib/media-process'
import {
  getProjectModelConfig,
  getUserModelConfig,
  resolveProjectModelCapabilityGenerationOptions,
} from '@/lib/config-service'
import { TaskTerminatedError } from '@/lib/task/errors'
import { isTaskActive, trySetTaskExternalId } from '@/lib/task/service'
import { type TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from './shared'
import { prisma } from '@/lib/prisma'

const DEFAULT_POLL_TIMEOUT_MS = Number.parseInt(process.env.WORKER_EXTERNAL_TIMEOUT_MS || String(20 * 60 * 1000), 10)
const DEFAULT_POLL_INTERVAL_MS = Number.parseInt(process.env.WORKER_EXTERNAL_POLL_MS || '3000', 10)

/**
 * 查询 DB 中任务是否已有 externalId（服务重启后续接轮询用，避免重复提交外部 API）
 */
async function getTaskExistingExternalId(taskId: string): Promise<string | null> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { externalId: true },
    })
    const val = task?.externalId?.trim()
    return val || null
  } catch {
    return null
  }
}

function scopedWorkerUtilLogger(job: Job<TaskJobData>, action: string) {
  return createScopedLogger({
    module: 'worker.utils',
    action,
    requestId: job.data.trace?.requestId || undefined,
    taskId: job.data.taskId,
    projectId: job.data.projectId,
    userId: job.data.userId,
  })
}

export function parseJsonArray(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function assertTaskActive(job: Job<TaskJobData>, stage: string) {
  const active = await isTaskActive(job.data.taskId)
  if (active) return
  throw new TaskTerminatedError(job.data.taskId, `Task terminated during ${stage}`)
}

function normalizeExternalId(result: {
  async?: boolean
  externalId?: string
  requestId?: string
  endpoint?: string
}, mediaType: 'IMAGE' | 'VIDEO') {
  if (!result.async) return null
  const externalId = typeof result.externalId === 'string' ? result.externalId.trim() : ''
  if (externalId) return externalId
  throw new Error(`ASYNC_EXTERNAL_ID_MISSING: async ${mediaType} task returned without standard externalId`)
}

export async function waitExternalResult(
  job: Job<TaskJobData>,
  externalId: string,
  userId: string,
  opts?: { timeoutMs?: number; intervalMs?: number; progressStart?: number; progressEnd?: number },
) {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS
  const intervalMs = opts?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const progressStart = opts?.progressStart ?? 40
  const progressEnd = opts?.progressEnd ?? 90
  const startAt = Date.now()
  const logger = scopedWorkerUtilLogger(job, 'worker.external.poll')

  logger.info({
    message: 'external poll started',
    details: {
      externalId,
      timeoutMs,
      intervalMs,
    },
  })

  await trySetTaskExternalId(job.data.taskId, externalId)

  while (Date.now() - startAt <= timeoutMs) {
    await assertTaskActive(job, 'polling_external')
    const status = await pollAsyncTask(externalId, userId)

    if (status.status === 'completed') {
      const url = status.resultUrl || status.imageUrl || status.videoUrl
      if (!url) {
        throw new Error(`External task completed but no result URL: ${externalId}`)
      }
      logger.info({
        message: 'external poll completed',
        durationMs: Date.now() - startAt,
        details: {
          externalId,
        },
      })
      return { url, status, ...(status.downloadHeaders ? { downloadHeaders: status.downloadHeaders } : {}) }
    }

    if (status.status === 'failed') {
      logger.error({
        message: status.error || 'external task failed',
        errorCode: 'EXTERNAL_ERROR',
        retryable: true,
        durationMs: Date.now() - startAt,
        details: {
          externalId,
        },
      })
      throw new Error(status.error || `External task failed: ${externalId}`)
    }

    const elapsed = Date.now() - startAt
    const ratio = Math.max(0, Math.min(1, elapsed / timeoutMs))
    const progress = progressStart + Math.floor((progressEnd - progressStart) * ratio)
    await reportTaskProgress(job, progress, { stage: 'polling_external', externalId })
    await assertTaskActive(job, 'polling_external_wait')
    await sleep(intervalMs)
  }

  logger.error({
    message: 'external task polling timeout',
    errorCode: 'GENERATION_TIMEOUT',
    retryable: true,
    durationMs: Date.now() - startAt,
    details: {
      externalId,
      timeoutMs,
    },
  })
  throw new Error(`External task polling timeout (${Math.round(timeoutMs / 1000)}s): ${externalId}`)
}

export async function resolveImageSourceFromGeneration(
  job: Job<TaskJobData>,
  params: {
    userId: string
    modelId: string
    prompt: string
    options?: {
      referenceImages?: string[]
      aspectRatio?: string
      resolution?: string
      size?: string
      provider?: string
    }
    pollProgress?: { start?: number; end?: number }
  },
): Promise<string> {
  const logger = scopedWorkerUtilLogger(job, 'worker.image.generate_source')
  const startedAt = Date.now()

  // 服务重启续接：若 DB 中已有 externalId，直接恢复轮询，不重新提交外部 API
  const resumeExternalId = await getTaskExistingExternalId(job.data.taskId)
  if (resumeExternalId) {
    logger.info({
      message: 'image source generation resumed from existing external id',
      details: { externalId: resumeExternalId },
    })
    const polled = await waitExternalResult(job, resumeExternalId, params.userId, {
      progressStart: params.pollProgress?.start ?? 40,
      progressEnd: params.pollProgress?.end ?? 92,
    })
    return polled.url
  }

  logger.info({
    message: 'image source generation started',
    provider: params.options?.provider || undefined,
    details: {
      model: params.modelId,
    },
  })

  const runtimeSelections: Record<string, string | number | boolean> = {}
  if (typeof params.options?.resolution === 'string') {
    runtimeSelections.resolution = params.options.resolution
  }

  const capabilityOptions = await resolveProjectModelCapabilityGenerationOptions({
    projectId: job.data.projectId,
    userId: params.userId,
    modelType: 'image',
    modelKey: params.modelId,
    runtimeSelections,
  })

  logger.info({
    message: 'image source generation calling generateImage',
    details: {
      model: params.modelId,
      referenceImageCount: params.options?.referenceImages?.length ?? 0,
      capabilityOptions,
      optionKeys: Object.keys(params.options || {}),
    },
  })

  const result = await withLogContext(
    { projectId: job.data.projectId, taskId: job.data.taskId, userId: params.userId },
    () => generateImage(params.userId, params.modelId, params.prompt, {
      ...params.options,
      ...capabilityOptions,
    }),
  )
  if (!result.success) {
    throw new Error(result.error || 'Image generation failed')
  }

  if (result.imageUrl) {
    logger.info({
      message: 'image source generation completed',
      provider: params.options?.provider || undefined,
      durationMs: Date.now() - startedAt,
    })
    return result.imageUrl
  }
  if (result.imageBase64) {
    logger.info({
      message: 'image source generation completed (base64)',
      provider: params.options?.provider || undefined,
      durationMs: Date.now() - startedAt,
    })
    return `data:image/png;base64,${result.imageBase64}`
  }

  const externalId = normalizeExternalId(result, 'IMAGE')
  if (!externalId) {
    throw new Error('Image generation returned no image and no external id')
  }

  const polled = await waitExternalResult(job, externalId, params.userId, {
    progressStart: params.pollProgress?.start ?? 40,
    progressEnd: params.pollProgress?.end ?? 92,
  })
  logger.info({
    message: 'image source generation completed (async)',
    provider: params.options?.provider || undefined,
    durationMs: Date.now() - startedAt,
    details: {
      externalId,
    },
  })
  return polled.url
}

export async function resolveVideoSourceFromGeneration(
  job: Job<TaskJobData>,
  params: {
    userId: string
    modelId: string
    imageUrl: string
    options?: {
      prompt?: string
      duration?: number
      fps?: number
      resolution?: string
      aspectRatio?: string
      generateAudio?: boolean
      lastFrameImageUrl?: string
      generationMode?: 'normal' | 'firstlastframe'
      [key: string]: string | number | boolean | undefined
    }
    pollProgress?: { start?: number; end?: number }
  },
): Promise<{ url: string; downloadHeaders?: Record<string, string> }> {
  const logger = scopedWorkerUtilLogger(job, 'worker.video.generate_source')
  const startedAt = Date.now()

  // 服务重启续接：若 DB 中已有 externalId，直接恢复轮询，不重新提交外部 API（避免重复扣费）
  const resumeExternalId = await getTaskExistingExternalId(job.data.taskId)
  if (resumeExternalId) {
    logger.info({
      message: 'video source generation resumed from existing external id',
      details: { externalId: resumeExternalId, model: params.modelId },
    })
    const polled = await waitExternalResult(job, resumeExternalId, params.userId, {
      progressStart: params.pollProgress?.start ?? 45,
      progressEnd: params.pollProgress?.end ?? 94,
    })
    logger.info({
      message: 'video source generation completed (resumed)',
      durationMs: Date.now() - startedAt,
      details: { externalId: resumeExternalId },
    })
    return {
      url: polled.url,
      ...(polled.downloadHeaders ? { downloadHeaders: polled.downloadHeaders } : {}),
    }
  }

  logger.info({
    message: 'video source generation started',
    details: {
      model: params.modelId,
    },
  })

  const runtimeSelections: Record<string, string | number | boolean> = {}
  if (typeof params.options?.duration === 'number') {
    runtimeSelections.duration = params.options.duration
  }
  if (typeof params.options?.resolution === 'string') {
    runtimeSelections.resolution = params.options.resolution
  }
  if (
    params.options?.generationMode === 'normal'
    || params.options?.generationMode === 'firstlastframe'
  ) {
    runtimeSelections.generationMode = params.options.generationMode
  }
  if (typeof params.options?.generateAudio === 'boolean') {
    runtimeSelections.generateAudio = params.options.generateAudio
  }

  const capabilityOptions = await resolveProjectModelCapabilityGenerationOptions({
    projectId: job.data.projectId,
    userId: params.userId,
    modelType: 'video',
    modelKey: params.modelId,
    runtimeSelections,
  })

  const providerCapabilityOptions: Record<string, string | number | boolean> = { ...capabilityOptions }
  delete providerCapabilityOptions.generationMode
  const providerRequestOptions: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(params.options || {})) {
    if (key === 'generationMode' || value === undefined) continue
    providerRequestOptions[key] = value
  }

  const result = await withLogContext(
    { projectId: job.data.projectId, taskId: job.data.taskId, userId: params.userId },
    () => generateVideo(params.userId, params.modelId, params.imageUrl, {
      ...providerRequestOptions,
      ...providerCapabilityOptions,
    }),
  )
  if (!result.success) {
    throw new Error(result.error || 'Video generation failed')
  }

  if (result.videoUrl) {
    logger.info({
      message: 'video source generation completed',
      durationMs: Date.now() - startedAt,
    })
    return { url: result.videoUrl }
  }

  const externalId = normalizeExternalId(result, 'VIDEO')
  if (!externalId) {
    throw new Error('Video generation returned no video and no external id')
  }

  const polled = await waitExternalResult(job, externalId, params.userId, {
    progressStart: params.pollProgress?.start ?? 45,
    progressEnd: params.pollProgress?.end ?? 94,
  })
  logger.info({
    message: 'video source generation completed (async)',
    durationMs: Date.now() - startedAt,
    details: {
      externalId,
    },
  })
  return {
    url: polled.url,
    ...(polled.downloadHeaders ? { downloadHeaders: polled.downloadHeaders } : {}),
  }
}

export async function resolveLipSyncVideoSource(
  job: Job<TaskJobData>,
  params: {
    userId: string
    videoUrl: string
    audioUrl: string
    modelKey?: string
    pollProgress?: { start?: number; end?: number }
  },
): Promise<string> {
  const logger = scopedWorkerUtilLogger(job, 'worker.video.lip_sync')
  const startedAt = Date.now()

  // 服务重启续接：若 DB 中已有 externalId，直接恢复轮询，不重新提交（避免重复扣费）
  const resumeExternalId = await getTaskExistingExternalId(job.data.taskId)
  if (resumeExternalId) {
    logger.info({
      message: 'lip sync generation resumed from existing external id',
      details: { externalId: resumeExternalId },
    })
    const polled = await waitExternalResult(job, resumeExternalId, params.userId, {
      progressStart: params.pollProgress?.start ?? 45,
      progressEnd: params.pollProgress?.end ?? 94,
    })
    logger.info({
      message: 'lip sync generation completed (resumed)',
      durationMs: Date.now() - startedAt,
      details: { externalId: resumeExternalId },
    })
    return polled.url
  }

  logger.info({
    message: 'lip sync generation started',
  })

  const result = await generateLipSync(
    {
      videoUrl: params.videoUrl,
      audioUrl: params.audioUrl,
    },
    params.userId,
    params.modelKey,
  )

  if (!result.requestId) {
    throw new Error('Lip sync request id missing')
  }

  const externalId = typeof result.externalId === 'string'
    ? result.externalId.trim()
    : ''
  if (!externalId) {
    throw new Error('Lip sync external id missing')
  }

  const polled = await waitExternalResult(job, externalId, params.userId, {
    progressStart: params.pollProgress?.start ?? 45,
    progressEnd: params.pollProgress?.end ?? 94,
  })

  logger.info({
    message: 'lip sync generation completed',
    durationMs: Date.now() - startedAt,
    details: {
      externalId,
    },
  })

  return polled.url
}

/**
 * 裁掉图片顶部的黑边标签区域，返回纯净内容的 base64 data URL
 * 用于改图前去除旧黑边，避免 AI 参考图携带黑边导致叠加
 */
export async function stripLabelBar(imageSource: string): Promise<string> {
  const response = await fetch(toFetchableUrl(imageSource))
  if (!response.ok) {
    throw new Error(`Failed to download image for strip: ${response.status}`)
  }
  const raw = Buffer.from(await response.arrayBuffer())
  const meta = await sharp(raw).metadata()
  const w = meta.width || 2160
  const h = meta.height || 2160
  const fontSize = Math.floor(h * 0.04)
  const pad = Math.floor(fontSize * 0.5)
  const barH = fontSize + pad * 2

  const cropped = await sharp(raw)
    .extract({ left: 0, top: barH, width: w, height: h - barH })
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer()

  return `data:image/jpeg;base64,${cropped.toString('base64')}`
}

export async function withLabelBar(imageSource: string, labelText: string): Promise<Buffer> {
  await initializeFonts()

  const response = await fetch(toFetchableUrl(imageSource))
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`)
  }

  const raw = Buffer.from(await response.arrayBuffer())
  const meta = await sharp(raw).metadata()
  const width = meta.width || 2160
  const height = meta.height || 2160
  const fontSize = Math.floor(height * 0.04)
  const pad = Math.floor(fontSize * 0.5)
  const barHeight = fontSize + pad * 2
  const svg = await createLabelSVG(width, barHeight, fontSize, pad, labelText)

  return await sharp(raw)
    .extend({ top: barHeight, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer()
}

export async function uploadImageSourceToCos(source: string | Buffer, keyPrefix: string, targetId: string) {
  return await processMediaResult({
    source,
    type: 'image',
    keyPrefix,
    targetId,
  })
}

export async function uploadVideoSourceToCos(
  source: string | Buffer,
  keyPrefix: string,
  targetId: string,
  downloadHeaders?: Record<string, string>,
) {
  return await processMediaResult({
    source,
    type: 'video',
    keyPrefix,
    targetId,
    downloadHeaders,
  })
}

export async function uploadAudioSourceToCos(source: string | Buffer, keyPrefix: string, targetId: string) {
  return await processMediaResult({
    source,
    type: 'audio',
    keyPrefix,
    targetId,
  })
}

export function toSignedUrlIfCos(keyOrUrl: string | null | undefined, ttlSeconds = 3600) {
  if (!keyOrUrl) return null
  return keyOrUrl.startsWith('images/') || keyOrUrl.startsWith('voice/') || keyOrUrl.startsWith('video/')
    ? getSignedUrl(keyOrUrl, ttlSeconds)
    : keyOrUrl
}

export async function getProjectModels(projectId: string, userId: string) {
  return await getProjectModelConfig(projectId, userId)
}

export async function getUserModels(userId: string) {
  return await getUserModelConfig(userId)
}
