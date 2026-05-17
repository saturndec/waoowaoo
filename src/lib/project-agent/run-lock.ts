import { randomUUID } from 'node:crypto'
import { redis } from '@/lib/redis'
import { createScopedLogger } from '@/lib/logging/core'
import type { ProjectAssistantId } from './types'
import { buildProjectAssistantScopeRef } from './persistence'

interface ProjectAgentRunLockScope {
  projectId: string
  userId: string
  episodeId?: string | null
  assistantId?: ProjectAssistantId
}

export interface ProjectAgentRunLock {
  key: string
  token: string
}

const RUN_LOCK_TTL_MS = 10 * 60 * 1000

const projectAgentRunLockLogger = createScopedLogger({
  module: 'project-agent.run-lock',
})

function buildProjectAgentRunLockKey(input: ProjectAgentRunLockScope): string {
  const assistantId = input.assistantId ?? 'workspace-command'
  const scopeRef = buildProjectAssistantScopeRef({
    projectId: input.projectId,
    episodeId: input.episodeId ?? null,
  })
  return [
    'project-agent-run',
    input.projectId,
    input.userId,
    assistantId,
    scopeRef,
  ].join(':')
}

export async function acquireProjectAgentRunLock(input: ProjectAgentRunLockScope): Promise<ProjectAgentRunLock | null> {
  const key = buildProjectAgentRunLockKey(input)
  const token = randomUUID()
  const acquired = await redis.set(key, token, 'PX', RUN_LOCK_TTL_MS, 'NX')
  if (acquired !== 'OK') return null
  return { key, token }
}

export async function releaseProjectAgentRunLock(lock: ProjectAgentRunLock): Promise<void> {
  const releaseScript = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    end
    return 0
  `
  await redis.eval(releaseScript, 1, lock.key, lock.token)
}

export async function safelyReleaseProjectAgentRunLock(lock: ProjectAgentRunLock): Promise<void> {
  try {
    await releaseProjectAgentRunLock(lock)
  } catch (error) {
    projectAgentRunLockLogger.error({
      action: 'assistant.run-lock.release.failed',
      message: 'Failed to release project agent run lock',
      details: {
        key: lock.key,
        error: error instanceof Error ? error.message : String(error),
      },
    })
  }
}
