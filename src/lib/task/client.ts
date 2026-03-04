import { resolveTaskErrorMessage } from './error-message'

type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed'

type TaskSnapshot = {
  id: string
  status: TaskStatus
  progress?: number | null
  result?: Record<string, unknown> | null
  errorMessage?: string | null
}

type TaskSnapshotResponse = {
  success: boolean
  task?: TaskSnapshot | null
}

type WaitTaskOptions = {
  intervalMs?: number
  timeoutMs?: number
  maxQueuedMs?: number
  onTaskUpdate?: (task: TaskSnapshot) => void
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isAsyncTaskResponse(data: unknown): data is { async: true; taskId: string } {
  if (!data || typeof data !== 'object') return false
  const payload = data as Record<string, unknown>
  return payload.async === true && typeof payload.taskId === 'string' && payload.taskId.length > 0
}

export async function waitForTaskResult(taskId: string, options: WaitTaskOptions = {}) {
  const intervalMs = options.intervalMs ?? 1500
  const timeoutMs = options.timeoutMs ?? 0
  const maxQueuedMs = options.maxQueuedMs ?? 0
  const onTaskUpdate = options.onTaskUpdate
  const startedAt = Date.now()
  let queuedStartedAt = 0

  while (true) {
    if (timeoutMs > 0 && Date.now() - startedAt > timeoutMs) {
      throw new Error(`Task timeout: ${taskId}`)
    }

    const response = await fetch(`/api/tasks/${taskId}`, {
      method: 'GET',
      cache: 'no-store',
    })
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null)
      throw new Error(resolveTaskErrorMessage(errorPayload, `Task fetch failed: ${taskId}`))
    }

    const payload = (await response.json()) as TaskSnapshotResponse
    const task = payload.task
    if (!task) {
      throw new Error(`Task not found: ${taskId}`)
    }

    onTaskUpdate?.(task)

    if (task.status === 'completed') {
      return task.result || { success: true }
    }
    if (task.status === 'failed') {
      throw new Error(resolveTaskErrorMessage(task, `Task ${task.status}`))
    }
    if (task.status === 'queued') {
      if (queuedStartedAt <= 0) {
        queuedStartedAt = Date.now()
      }
      if (maxQueuedMs > 0 && Date.now() - queuedStartedAt > maxQueuedMs) {
        throw new Error(resolveTaskErrorMessage(task, '任务排队超时，请检查 worker 或稍后重试'))
      }
    } else {
      queuedStartedAt = 0
    }
    if (task.status !== 'queued' && task.status !== 'processing') {
      throw new Error(resolveTaskErrorMessage(task, `Task ${task.status}`))
    }

    await sleep(intervalMs)
  }
}

export async function resolveTaskResponse<T = Record<string, unknown>>(response: Response, options?: WaitTaskOptions) {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(resolveTaskErrorMessage(data, 'Request failed'))
  }
  if (isAsyncTaskResponse(data)) {
    return await waitForTaskResult(data.taskId, options) as T
  }
  return (data || {}) as T
}
