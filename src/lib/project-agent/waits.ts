import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { TASK_EVENT_TYPE, type TaskLifecycleEventType } from '@/lib/task/types'
import { createScopedLogger } from '@/lib/logging/core'
import type { ProjectAssistantId } from './types'
import { buildProjectAssistantScopeRef } from './persistence'

export type ProjectAgentWaitStatus = 'pending' | 'resolved' | 'claimed' | 'followed'
export type ProjectAgentWaitTerminalStatus = 'completed' | 'failed'

interface ProjectAgentWaitScopeInput {
  projectId: string
  userId: string
  episodeId?: string | null
  assistantId?: ProjectAssistantId
}

export interface CreateProjectAgentWaitInput extends ProjectAgentWaitScopeInput {
  operationId: string
  taskIds: string[]
}

interface ProjectAgentWaitRow {
  id: string
  projectId: string
  userId: string
  assistantId: string
  scopeRef: string
  episodeId: string | null
  operationId: string
  taskIds: unknown
  status: string
  terminalStatus: string | null
  terminalTaskIds: unknown | null
  failedTaskIds: unknown | null
  followUpKey: string | null
  claimId: string | null
  claimedAt: Date | null
  claimExpiresAt: Date | null
  followedAt: Date | null
  createdAt: Date
  resolvedAt: Date | null
}

export interface ProjectAgentWaitFollowUp {
  waitId: string
  followUpKey: string
  operationId: string
  taskIds: string[]
  failedTaskIds: string[]
  terminalStatus: ProjectAgentWaitTerminalStatus
  total: number
  successCount: number
  failedCount: number
  claimId: string
}

const WAIT_CLAIM_TTL_MS = 2 * 60 * 1000

const projectAgentWaitLogger = createScopedLogger({
  module: 'project-agent.waits',
})

function normalizeTaskIds(taskIds: string[]): string[] {
  return Array.from(new Set(taskIds.map((taskId) => taskId.trim()).filter(Boolean))).sort()
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return normalizeTaskIds(value.flatMap((item) => typeof item === 'string' ? [item] : []))
  }
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return parseStringArray(parsed)
  } catch {
    return []
  }
}

function buildFollowUpKey(waitId: string, terminalStatus: ProjectAgentWaitTerminalStatus): string {
  return `project-agent-wait:${waitId}:${terminalStatus}`
}

function buildWaitScope(input: ProjectAgentWaitScopeInput): {
  assistantId: ProjectAssistantId
  scopeRef: string
} {
  const assistantId = input.assistantId ?? 'workspace-command'
  return {
    assistantId,
    scopeRef: buildProjectAssistantScopeRef({
      projectId: input.projectId,
      episodeId: input.episodeId ?? null,
    }),
  }
}

export async function createProjectAgentWait(input: CreateProjectAgentWaitInput): Promise<string | null> {
  const taskIds = normalizeTaskIds(input.taskIds)
  if (taskIds.length === 0) return null
  const { assistantId, scopeRef } = buildWaitScope(input)
  const id = randomUUID()

  await prisma.$executeRaw`
    INSERT INTO project_agent_waits (
      id,
      projectId,
      userId,
      assistantId,
      scopeRef,
      episodeId,
      operationId,
      taskIds,
      status,
      createdAt,
      updatedAt
    )
    VALUES (
      ${id},
      ${input.projectId},
      ${input.userId},
      ${assistantId},
      ${scopeRef},
      ${input.episodeId ?? null},
      ${input.operationId},
      ${JSON.stringify(taskIds)},
      'pending',
      NOW(3),
      NOW(3)
    )
  `
  return id
}

export interface ApplyProjectAgentWaitTerminalEventInput {
  taskId: string
  lifecycleType: TaskLifecycleEventType
  taskIds: string[]
  terminalTaskIds: string[]
  failedTaskIds: string[]
}

export interface ApplyProjectAgentWaitTerminalEventResult {
  terminalTaskIds: string[]
  failedTaskIds: string[]
  terminalStatus: ProjectAgentWaitTerminalStatus | null
}

export function applyProjectAgentWaitTerminalEvent(
  input: ApplyProjectAgentWaitTerminalEventInput,
): ApplyProjectAgentWaitTerminalEventResult {
  const taskIds = normalizeTaskIds(input.taskIds)
  if (!taskIds.includes(input.taskId)) {
    return {
      terminalTaskIds: normalizeTaskIds(input.terminalTaskIds),
      failedTaskIds: normalizeTaskIds(input.failedTaskIds),
      terminalStatus: null,
    }
  }

  const terminalTaskIds = normalizeTaskIds([...input.terminalTaskIds, input.taskId])
  const failedTaskIds = input.lifecycleType === TASK_EVENT_TYPE.FAILED
    ? normalizeTaskIds([...input.failedTaskIds, input.taskId])
    : normalizeTaskIds(input.failedTaskIds)
  const allTerminal = taskIds.every((taskId) => terminalTaskIds.includes(taskId))

  return {
    terminalTaskIds,
    failedTaskIds,
    terminalStatus: allTerminal ? (failedTaskIds.length > 0 ? 'failed' : 'completed') : null,
  }
}

export async function resolveProjectAgentWaitsForTaskEvent(input: {
  taskId: string
  projectId: string
  userId: string
  lifecycleType: TaskLifecycleEventType
}): Promise<void> {
  if (input.lifecycleType !== TASK_EVENT_TYPE.COMPLETED && input.lifecycleType !== TASK_EVENT_TYPE.FAILED) return

  const rows = await prisma.$queryRaw<ProjectAgentWaitRow[]>`
    SELECT
      id,
      projectId,
      userId,
      assistantId,
      scopeRef,
      episodeId,
      operationId,
      taskIds,
      status,
      terminalStatus,
      terminalTaskIds,
      failedTaskIds,
      followUpKey,
      claimId,
      claimedAt,
      claimExpiresAt,
      followedAt,
      createdAt,
      resolvedAt
    FROM project_agent_waits
    WHERE projectId = ${input.projectId}
      AND userId = ${input.userId}
      AND status = 'pending'
      AND JSON_CONTAINS(taskIds, JSON_QUOTE(${input.taskId}))
  `

  for (const row of rows) {
    const result = applyProjectAgentWaitTerminalEvent({
      taskId: input.taskId,
      lifecycleType: input.lifecycleType,
      taskIds: parseStringArray(row.taskIds),
      terminalTaskIds: parseStringArray(row.terminalTaskIds),
      failedTaskIds: parseStringArray(row.failedTaskIds),
    })

    if (!result.terminalStatus) {
      await prisma.$executeRaw`
        UPDATE project_agent_waits
        SET terminalTaskIds = ${JSON.stringify(result.terminalTaskIds)},
            failedTaskIds = ${JSON.stringify(result.failedTaskIds)},
            updatedAt = NOW(3)
        WHERE id = ${row.id}
          AND status = 'pending'
      `
      continue
    }

    await prisma.$executeRaw`
      UPDATE project_agent_waits
      SET status = 'resolved',
          terminalStatus = ${result.terminalStatus},
          terminalTaskIds = ${JSON.stringify(result.terminalTaskIds)},
          failedTaskIds = ${JSON.stringify(result.failedTaskIds)},
          followUpKey = ${buildFollowUpKey(row.id, result.terminalStatus)},
          resolvedAt = NOW(3),
          updatedAt = NOW(3)
      WHERE id = ${row.id}
        AND status = 'pending'
    `
  }
}

export async function safelyResolveProjectAgentWaitsForTaskEvent(input: {
  taskId: string
  projectId: string
  userId: string
  lifecycleType: TaskLifecycleEventType
}): Promise<void> {
  try {
    await resolveProjectAgentWaitsForTaskEvent(input)
  } catch (error) {
    projectAgentWaitLogger.error({
      action: 'assistant.wait.resolve.failed',
      message: 'Failed to resolve project agent wait from task event',
      projectId: input.projectId,
      userId: input.userId,
      details: {
        taskId: input.taskId,
        lifecycleType: input.lifecycleType,
        error: error instanceof Error ? error.message : String(error),
      },
    })
  }
}

export async function listResolvedProjectAgentWaitFollowUps(input: ProjectAgentWaitScopeInput & {
  limit?: number
}): Promise<ProjectAgentWaitFollowUp[]> {
  const { assistantId, scopeRef } = buildWaitScope(input)
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 10), 1), 50)
  const rows = await prisma.$queryRaw<ProjectAgentWaitRow[]>(Prisma.sql`
    SELECT
      id,
      projectId,
      userId,
      assistantId,
      scopeRef,
      episodeId,
      operationId,
      taskIds,
      status,
      terminalStatus,
      terminalTaskIds,
      failedTaskIds,
      followUpKey,
      followedAt,
      createdAt,
      resolvedAt
    FROM project_agent_waits
    WHERE projectId = ${input.projectId}
      AND userId = ${input.userId}
      AND assistantId = ${assistantId}
      AND scopeRef = ${scopeRef}
      AND status = 'resolved'
      AND followedAt IS NULL
      AND followUpKey IS NOT NULL
    ORDER BY resolvedAt ASC
    LIMIT ${limit}
  `)

  return rows.flatMap((row) => {
    if (row.terminalStatus !== 'completed' && row.terminalStatus !== 'failed') return []
    if (!row.followUpKey) return []
    const taskIds = parseStringArray(row.taskIds)
    const failedTaskIds = parseStringArray(row.failedTaskIds)
    return [{
      waitId: row.id,
      followUpKey: row.followUpKey,
      operationId: row.operationId,
      taskIds,
      failedTaskIds,
      terminalStatus: row.terminalStatus,
      total: taskIds.length,
      successCount: Math.max(taskIds.length - failedTaskIds.length, 0),
      failedCount: failedTaskIds.length,
      claimId: row.claimId ?? '',
    }]
  })
}

export async function claimResolvedProjectAgentWaitFollowUps(input: ProjectAgentWaitScopeInput & {
  limit?: number
  claimTtlMs?: number
}): Promise<ProjectAgentWaitFollowUp[]> {
  const { assistantId, scopeRef } = buildWaitScope(input)
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 1), 1), 10)
  const claimTtlMs = Math.min(Math.max(Math.floor(input.claimTtlMs ?? WAIT_CLAIM_TTL_MS), 30_000), 10 * 60 * 1000)
  const claimId = randomUUID()
  const claimExpiresAt = new Date(Date.now() + claimTtlMs)

  await prisma.$executeRaw`
    UPDATE project_agent_waits
    SET status = 'resolved',
        claimId = NULL,
        claimedAt = NULL,
        claimExpiresAt = NULL,
        updatedAt = NOW(3)
    WHERE projectId = ${input.projectId}
      AND userId = ${input.userId}
      AND assistantId = ${assistantId}
      AND scopeRef = ${scopeRef}
      AND status = 'claimed'
      AND followedAt IS NULL
      AND claimExpiresAt < NOW(3)
  `

  await prisma.$executeRaw`
    UPDATE project_agent_waits
    SET status = 'claimed',
        claimId = ${claimId},
        claimedAt = NOW(3),
        claimExpiresAt = ${claimExpiresAt},
        updatedAt = NOW(3)
    WHERE projectId = ${input.projectId}
      AND userId = ${input.userId}
      AND assistantId = ${assistantId}
      AND scopeRef = ${scopeRef}
      AND status = 'resolved'
      AND followedAt IS NULL
      AND followUpKey IS NOT NULL
    ORDER BY resolvedAt ASC
    LIMIT ${limit}
  `

  const rows = await prisma.$queryRaw<ProjectAgentWaitRow[]>`
    SELECT
      id,
      projectId,
      userId,
      assistantId,
      scopeRef,
      episodeId,
      operationId,
      taskIds,
      status,
      terminalStatus,
      terminalTaskIds,
      failedTaskIds,
      followUpKey,
      claimId,
      claimedAt,
      claimExpiresAt,
      followedAt,
      createdAt,
      resolvedAt
    FROM project_agent_waits
    WHERE projectId = ${input.projectId}
      AND userId = ${input.userId}
      AND assistantId = ${assistantId}
      AND scopeRef = ${scopeRef}
      AND status = 'claimed'
      AND claimId = ${claimId}
    ORDER BY resolvedAt ASC
  `

  return rows.flatMap((row) => {
    if (row.terminalStatus !== 'completed' && row.terminalStatus !== 'failed') return []
    if (!row.followUpKey || !row.claimId) return []
    const taskIds = parseStringArray(row.taskIds)
    const failedTaskIds = parseStringArray(row.failedTaskIds)
    return [{
      waitId: row.id,
      followUpKey: row.followUpKey,
      operationId: row.operationId,
      taskIds,
      failedTaskIds,
      terminalStatus: row.terminalStatus,
      total: taskIds.length,
      successCount: Math.max(taskIds.length - failedTaskIds.length, 0),
      failedCount: failedTaskIds.length,
      claimId: row.claimId,
    }]
  })
}

export async function markProjectAgentWaitFollowed(input: {
  waitId: string
  claimId: string
  projectId: string
  userId: string
}): Promise<void> {
  await prisma.$executeRaw`
    UPDATE project_agent_waits
    SET status = 'followed',
        followedAt = NOW(3),
        updatedAt = NOW(3)
    WHERE id = ${input.waitId}
      AND projectId = ${input.projectId}
      AND userId = ${input.userId}
      AND status = 'claimed'
      AND claimId = ${input.claimId}
      AND followedAt IS NULL
  `
}
