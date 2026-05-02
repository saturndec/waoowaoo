export type OperationResultStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'canceled'

export type RecentOperationMediaType = 'image' | 'video' | 'audio' | 'music'

export interface RecentOperationMedia {
  mediaId?: string | null
  mediaType: RecentOperationMediaType
  url?: string | null
  storageKey?: string | null
  mimeType?: string | null
  width?: number | null
  height?: number | null
  durationMs?: number | null
}

export interface RecentOperationError {
  code?: string | null
  message: string
  retryable?: boolean | null
}

export interface RecentOperationResult {
  operationId: string
  taskId: string
  runId?: string | null
  taskType: string
  status: OperationResultStatus
  source?: string | null
  confirmed?: boolean | null
  targetType: string
  targetId: string
  episodeId?: string | null
  provider?: string | null
  model?: string | null
  media?: RecentOperationMedia | null
  error?: RecentOperationError | null
  submittedAt: string
  completedAt?: string | null
  mutationBatchId?: string | null
  canUndo?: boolean
}
