import 'dotenv/config'
import { setGlobalDispatcher, EnvHttpProxyAgent } from 'undici'

// Enable HTTP_PROXY / HTTPS_PROXY for Node.js native fetch
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  setGlobalDispatcher(new EnvHttpProxyAgent())
}

import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { createImageWorker } from './image.worker'
import { createVideoWorker } from './video.worker'
import { createVoiceWorker } from './voice.worker'
import { createTextWorker } from './text.worker'

const workers = [createImageWorker(), createVideoWorker(), createVoiceWorker(), createTextWorker()]

_ulogInfo('[Workers] started:', workers.length)

for (const worker of workers) {
  worker.on('ready', () => {
    _ulogInfo(`[Workers] ready: ${worker.name}`)
  })

  worker.on('error', (err) => {
    _ulogError(`[Workers] error: ${worker.name}`, err.message)
  })

  worker.on('failed', (job, err) => {
    _ulogError(`[Workers] job failed: ${worker.name}`, {
      jobId: job?.id,
      taskId: job?.data?.taskId,
      taskType: job?.data?.type,
      error: err.message,
    })
  })
}

async function shutdown(signal: string) {
  _ulogInfo(`[Workers] shutdown signal: ${signal}`)
  await Promise.all(workers.map(async (worker) => await worker.close()))
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
