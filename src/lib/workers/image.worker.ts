import { Worker, type Job } from 'bullmq'
import { queueConnection } from '@/lib/redis'
import { QUEUE_NAME } from '@/lib/task/queues'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { reportTaskProgress, withTaskLifecycle } from './shared'
import {
  handleAssetHubImageTask,
  handleAssetHubModifyTask,
  handleCharacterImageTask,
  handleLocationImageTask,
  handleModifyAssetImageTask,
  handlePanelImageTask,
  handlePanelVariantTask,
} from './handlers/image-task-handlers'

type AnyObj = Record<string, unknown>

async function processImageTask(job: Job<TaskJobData>) {
  await reportTaskProgress(job, 5, { stage: 'received' })

  switch (job.data.type) {
    case TASK_TYPE.IMAGE_CHARACTER:
      return await handleCharacterImageTask(job)
    case TASK_TYPE.IMAGE_LOCATION:
      return await handleLocationImageTask(job)
    case TASK_TYPE.REGENERATE_GROUP: {
      const payload = (job.data.payload || {}) as AnyObj
      if (payload.type === 'character') {
        return await handleCharacterImageTask(job)
      }
      return await handleLocationImageTask(job)
    }
    case TASK_TYPE.MODIFY_ASSET_IMAGE:
      return await handleModifyAssetImageTask(job)
    case TASK_TYPE.ASSET_HUB_IMAGE:
      return await handleAssetHubImageTask(job)
    case TASK_TYPE.ASSET_HUB_MODIFY:
      return await handleAssetHubModifyTask(job)
    case TASK_TYPE.IMAGE_PANEL:
      return await handlePanelImageTask(job)
    case TASK_TYPE.PANEL_VARIANT:
      return await handlePanelVariantTask(job)
    default:
      throw new Error(`Unsupported image task type: ${job.data.type}`)
  }
}

export function createImageWorker() {
  return new Worker<TaskJobData>(
    QUEUE_NAME.IMAGE,
    async (job) => await withTaskLifecycle(job, processImageTask),
    {
      connection: queueConnection,
      concurrency: Number.parseInt(process.env.QUEUE_CONCURRENCY_IMAGE || '20', 10) || 20,
    },
  )
}
