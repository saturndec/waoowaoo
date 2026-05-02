import { TASK_STATUS, TASK_TYPE } from './types'
import type { OperationResultStatus, RecentOperationMedia, RecentOperationMediaType, RecentOperationResult } from './operation-result-types'

export interface OperationResultTaskRow {
  id: string
  type: string
  status: string
  targetType: string
  targetId: string
  episodeId: string | null
  payload: unknown
  result: unknown
  errorCode: string | null
  errorMessage: string | null
  operationId: string | null
  operationSource: string | null
  operationConfirmed: boolean | null
  queuedAt: Date
  finishedAt: Date | null
  updatedAt: Date
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(source: Record<string, unknown> | null, key: string): string | null {
  const value = source?.[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function readNumber(source: Record<string, unknown> | null, key: string): number | null {
  const value = source?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readBoolean(source: Record<string, unknown> | null, key: string): boolean | null {
  const value = source?.[key]
  return typeof value === 'boolean' ? value : null
}

function normalizeStatus(status: string): OperationResultStatus {
  if (
    status === TASK_STATUS.QUEUED
    || status === TASK_STATUS.PROCESSING
    || status === TASK_STATUS.COMPLETED
    || status === TASK_STATUS.FAILED
    || status === TASK_STATUS.CANCELED
  ) {
    return status
  }
  throw new Error(`UNSUPPORTED_OPERATION_RESULT_STATUS:${status}`)
}

function readSafeUrl(result: Record<string, unknown> | null, keys: string[]): string | null {
  for (const key of keys) {
    const value = readString(result, key)
    if (!value) continue
    if (value.startsWith('data:')) continue
    return value
  }
  return null
}

function inferMediaType(taskType: string, result: Record<string, unknown> | null): RecentOperationMediaType | null {
  if (taskType === TASK_TYPE.MUSIC_GENERATE) return 'music'
  if (taskType === TASK_TYPE.VOICE_LINE || taskType === TASK_TYPE.VOICE_DESIGN || taskType === TASK_TYPE.ASSET_HUB_VOICE_DESIGN) return 'audio'
  if (taskType === TASK_TYPE.VIDEO_PANEL || taskType === TASK_TYPE.LIP_SYNC) return 'video'
  if (readString(result, 'audioUrl')) return 'audio'
  if (readString(result, 'videoUrl') || readString(result, 'lipSyncVideoUrl')) return 'video'
  if (readString(result, 'imageUrl')) return 'image'
  return null
}

function buildMedia(taskType: string, result: Record<string, unknown> | null): RecentOperationMedia | null {
  const mediaType = inferMediaType(taskType, result)
  if (!mediaType) return null

  const url = mediaType === 'audio' || mediaType === 'music'
    ? readSafeUrl(result, ['audioUrl', 'url'])
    : mediaType === 'video'
      ? readSafeUrl(result, ['videoUrl', 'lipSyncVideoUrl', 'url'])
      : readSafeUrl(result, ['imageUrl', 'url'])

  const mediaId = readString(result, 'mediaId') || readString(result, 'audioMediaId') || readString(result, 'imageMediaId') || readString(result, 'videoMediaId')
  const storageKey = readString(result, 'storageKey')
  const mimeType = readString(result, 'mimeType') || readString(result, 'audioMimeType')
  const width = readNumber(result, 'width')
  const height = readNumber(result, 'height')
  const durationMs = readNumber(result, 'durationMs')

  if (!url && !mediaId && !storageKey) return null
  return {
    mediaType,
    ...(mediaId ? { mediaId } : {}),
    ...(url ? { url } : {}),
    ...(storageKey ? { storageKey } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(width !== null ? { width } : {}),
    ...(height !== null ? { height } : {}),
    ...(durationMs !== null ? { durationMs } : {}),
  }
}

function readModel(payload: Record<string, unknown> | null, result: Record<string, unknown> | null): string | null {
  return readString(result, 'model')
    || readString(result, 'modelKey')
    || readString(result, 'musicModel')
    || readString(payload, 'model')
    || readString(payload, 'imageModel')
    || readString(payload, 'videoModel')
    || readString(payload, 'audioModel')
    || readString(payload, 'lipSyncModel')
    || readString(payload, 'musicModel')
    || readString(payload, 'analysisModel')
}

function readProvider(model: string | null, result: Record<string, unknown> | null): string | null {
  return readString(result, 'provider') || (model?.includes('::') ? model.split('::')[0] || null : null)
}

function readMutationBatchId(payload: Record<string, unknown> | null, result: Record<string, unknown> | null): string | null {
  return readString(result, 'mutationBatchId') || readString(payload, 'mutationBatchId')
}

export function normalizeTaskOperationResult(task: OperationResultTaskRow): RecentOperationResult | null {
  const operationId = task.operationId?.trim() || null
  if (!operationId) return null

  const payload = isRecord(task.payload) ? task.payload : null
  const result = isRecord(task.result) ? task.result : null
  const model = readModel(payload, result)
  const errorMessage = task.errorMessage?.trim() || readString(result, 'errorMessage')
  const errorCode = task.errorCode?.trim() || readString(result, 'errorCode')
  const mutationBatchId = readMutationBatchId(payload, result)

  return {
    operationId,
    taskId: task.id,
    runId: readString(payload, 'runId'),
    taskType: task.type,
    status: normalizeStatus(task.status),
    source: task.operationSource,
    confirmed: task.operationConfirmed,
    targetType: task.targetType,
    targetId: task.targetId,
    episodeId: task.episodeId,
    provider: readProvider(model, result),
    model,
    media: buildMedia(task.type, result),
    error: errorMessage
      ? {
          ...(errorCode ? { code: errorCode } : {}),
          message: errorMessage,
          ...(readBoolean(result, 'retryable') !== null ? { retryable: readBoolean(result, 'retryable') } : {}),
        }
      : null,
    submittedAt: task.queuedAt.toISOString(),
    completedAt: task.finishedAt?.toISOString() ?? null,
    ...(mutationBatchId ? { mutationBatchId, canUndo: true } : {}),
  }
}
