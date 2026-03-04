/**
 * Task Reconciliation — DB ↔ BullMQ 状态对账
 *
 * 解决 DB 任务状态与 BullMQ Job 状态脱节导致的任务永久卡死问题。
 * 提供三个层次的对账能力：
 *   1. isJobAlive   — 单任务即时检查（供 createTask 去重时调用）
 *   2. reconcileActiveTasks — 批量对账（供 watchdog 定时调用）
 *   3. startTaskWatchdog    — 定时巡检入口（在 instrumentation.ts 启动）
 */

import { prisma } from '@/lib/prisma'
import { createScopedLogger } from '@/lib/logging/core'
import { TASK_STATUS, TASK_EVENT_TYPE } from './types'
import { publishTaskEvent } from './publisher'
import { rollbackTaskBillingForTask } from './service'
import {
    imageQueue,
    videoQueue,
    voiceQueue,
    textQueue,
} from './queues'

// ────────────────────── 常量 ──────────────────────

const ACTIVE_STATUSES = [TASK_STATUS.QUEUED, TASK_STATUS.PROCESSING]

/** watchdog 巡检间隔 */
const WATCHDOG_INTERVAL_MS = 60_000

/** processing 心跳超时阈值 */
const PROCESSING_TIMEOUT_MS = 5 * 60_000

/** queued 卡死超时阈值 */
const QUEUED_TIMEOUT_MS = 10 * 60_000

/** 每次对账扫描上限 */
const RECONCILE_BATCH_SIZE = 200

/** terminal 态短暂竞态保护窗口，避免 worker 刚结束时被误判为孤儿任务 */
const TERMINAL_RECONCILE_GRACE_MS = 90_000

/** missing 态短暂竞态保护窗口，避免 createTask→enqueue 之间被误判为孤儿任务 */
const MISSING_RECONCILE_GRACE_MS = 30_000

// ────────────────────── BullMQ Job 状态检查 ──────────────────────

type JobState = 'alive' | 'terminal' | 'missing'

const ALL_QUEUES = [imageQueue, videoQueue, voiceQueue, textQueue]

/**
 * 检查 BullMQ 中某个 Job 的真实状态。
 * - alive:    Job 存在且仍可执行（waiting / active / delayed / waiting-children）
 * - terminal: Job 存在但已终态（completed / failed）
 * - missing:  Job 在所有队列中均不存在
 */
async function getJobState(taskId: string): Promise<JobState> {
    for (const queue of ALL_QUEUES) {
        try {
            const job = await queue.getJob(taskId)
            if (!job) continue
            const state = await job.getState()
            if (state === 'completed' || state === 'failed') {
                return 'terminal'
            }
            // waiting | active | delayed | waiting-children → 仍然活着
            return 'alive'
        } catch {
            // 单个队列查询失败不影响其他队列
            continue
        }
    }
    return 'missing'
}

/**
 * 检查 BullMQ Job 是否仍然活着。
 * 供 createTask 去重时调用——如果 Job 已死，则不应复用旧的 active 任务。
 */
export async function isJobAlive(taskId: string): Promise<boolean> {
    const state = await getJobState(taskId)
    return state === 'alive'
}

// ────────────────────── 孤儿任务终止 ──────────────────────

/**
 * 将一个孤儿任务标记为 failed 并发送 SSE 事件通知前端。
 */
async function failOrphanedTask(
    task: {
        id: string
        userId: string
        projectId: string
        episodeId: string | null
        type: string
        targetType: string
        targetId: string
        billingInfo: unknown
    },
    reason: string,
): Promise<boolean> {
    const rollbackResult = await rollbackTaskBillingForTask({
        taskId: task.id,
        billingInfo: task.billingInfo,
    })
    const compensationFailed = rollbackResult.attempted && !rollbackResult.rolledBack
    const errorCode = compensationFailed ? 'BILLING_COMPENSATION_FAILED' : 'RECONCILE_ORPHAN'
    const errorMessage = compensationFailed
        ? `${reason}; billing rollback failed`
        : reason

    const result = await prisma.task.updateMany({
        where: {
            id: task.id,
            status: { in: ACTIVE_STATUSES },
        },
        data: {
            status: TASK_STATUS.FAILED,
            errorCode,
            errorMessage,
            finishedAt: new Date(),
            heartbeatAt: null,
            dedupeKey: null,
        },
    })

    if (result.count > 0) {
        // 发送 FAILED 事件，触发前端 SSE 更新 + 数据刷新
        await publishTaskEvent({
            taskId: task.id,
            projectId: task.projectId,
            userId: task.userId,
            type: TASK_EVENT_TYPE.FAILED,
            taskType: task.type,
            targetType: task.targetType,
            targetId: task.targetId,
            episodeId: task.episodeId,
            payload: {
                stage: 'reconciled',
                stageLabel: '任务已自动恢复',
                message: errorMessage,
                compensationFailed,
            },
            persist: false,
        })
    }

    return result.count > 0
}

// ────────────────────── 批量对账 ──────────────────────

/**
 * 对账所有 DB 中 active 的任务与 BullMQ 的真实状态。
 * 任何 DB 里 active 但 BullMQ 里 terminal / missing 的任务会被标记为 failed。
 */
export async function reconcileActiveTasks(): Promise<string[]> {
    const now = Date.now()
    const activeTasks = await prisma.task.findMany({
        where: {
            status: { in: ACTIVE_STATUSES },
        },
        select: {
            id: true,
            userId: true,
            projectId: true,
            episodeId: true,
            type: true,
            targetType: true,
            targetId: true,
            billingInfo: true,
            updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
        take: RECONCILE_BATCH_SIZE,
    })

    if (activeTasks.length === 0) return []

    const reconciled: string[] = []
    for (const task of activeTasks) {
        const jobState = await getJobState(task.id)
        if (jobState === 'alive') continue
        if (
            jobState === 'terminal'
            && now - task.updatedAt.getTime() < TERMINAL_RECONCILE_GRACE_MS
        ) {
            continue
        }
        if (
            jobState === 'missing'
            && now - task.updatedAt.getTime() < MISSING_RECONCILE_GRACE_MS
        ) {
            continue
        }

        const reason =
            jobState === 'terminal'
                ? 'Queue job already terminated but DB was not updated'
                : 'Queue job missing (likely lost during restart)'

        const failed = await failOrphanedTask(task, reason)
        if (failed) {
            reconciled.push(task.id)
        }
    }

    return reconciled
}

// ────────────────────── Watchdog ──────────────────────

type WatchdogRuntimeState = {
    timer: ReturnType<typeof setInterval> | null
    instanceId: number
}

const WATCHDOG_GLOBAL_KEY = '__WAOOWAOO_TASK_WATCHDOG_STATE__' as const

type TaskWatchdogGlobal = typeof globalThis & {
    [WATCHDOG_GLOBAL_KEY]?: WatchdogRuntimeState
}

function getWatchdogRuntimeState(): WatchdogRuntimeState {
    const runtime = globalThis as TaskWatchdogGlobal
    const existing = runtime[WATCHDOG_GLOBAL_KEY]
    if (existing) {
        return existing
    }
    const nextState: WatchdogRuntimeState = {
        timer: null,
        instanceId: 0,
    }
    runtime[WATCHDOG_GLOBAL_KEY] = nextState
    return nextState
}

export function stopTaskWatchdog() {
    const state = getWatchdogRuntimeState()
    if (state.timer) {
        clearInterval(state.timer)
        state.timer = null
    }
    state.instanceId += 1
}

/**
 * 启动任务 watchdog 定时器。
 * 每个巡检周期执行：
 *   1. sweepStaleTasks — 心跳超时的 processing 任务 → failed
 *   2. sweepStaleQueuedTasks — 长时间 queued 的任务 → failed
 *   3. reconcileActiveTasks — DB active 但 BullMQ 已死的任务 → failed
 */
export function startTaskWatchdog() {
    const logger = createScopedLogger({ module: 'task.watchdog' })
    const runtimeState = getWatchdogRuntimeState()
    if (runtimeState.timer) return

    runtimeState.instanceId += 1
    const currentInstanceId = runtimeState.instanceId

    logger.info({
        action: 'watchdog.start',
        message: `Task watchdog started (interval: ${WATCHDOG_INTERVAL_MS}ms)`,
    })

    const timer = setInterval(async () => {
        const latestState = getWatchdogRuntimeState()
        if (
            latestState.instanceId !== currentInstanceId
            || latestState.timer !== timer
        ) {
            clearInterval(timer)
            return
        }
        try {
          // 1. 清理心跳超时的 processing 任务（已有逻辑，此前未被调用）
            const { sweepStaleTasks, sweepStaleQueuedTasks } = await import('./service')
            const sweptProcessing = await sweepStaleTasks({
                processingThresholdMs: PROCESSING_TIMEOUT_MS,
            })
            for (const task of sweptProcessing) {
                await publishTaskEvent({
                    taskId: task.id,
                    projectId: task.projectId,
                    userId: task.userId,
                    type: TASK_EVENT_TYPE.FAILED,
                    taskType: task.type,
                    targetType: task.targetType,
                    targetId: task.targetId,
                    episodeId: task.episodeId || null,
                    payload: {
                        stage: 'watchdog_timeout',
                        stageLabel: '任务超时已终止',
                        message: task.errorMessage,
                        errorCode: task.errorCode,
                        compensationFailed: task.errorCode === 'BILLING_COMPENSATION_FAILED',
                    },
                    persist: false,
                })
            }

            // 2. 清理长期 queued 卡死任务
            const sweptQueued = await sweepStaleQueuedTasks({
                queuedThresholdMs: QUEUED_TIMEOUT_MS,
            })
            for (const task of sweptQueued) {
                await publishTaskEvent({
                    taskId: task.id,
                    projectId: task.projectId,
                    userId: task.userId,
                    type: TASK_EVENT_TYPE.FAILED,
                    taskType: task.type,
                    targetType: task.targetType,
                    targetId: task.targetId,
                    episodeId: task.episodeId || null,
                    payload: {
                        stage: 'watchdog_queued_timeout',
                        stageLabel: '任务排队超时已终止',
                        message: task.errorMessage,
                        errorCode: task.errorCode,
                        compensationFailed: task.errorCode === 'BILLING_COMPENSATION_FAILED',
                    },
                    persist: false,
                })
            }

            // 3. 对账 DB vs BullMQ
            const reconciled = await reconcileActiveTasks()

            const total = sweptProcessing.length + sweptQueued.length + reconciled.length
            if (total > 0) {
                logger.info({
                    action: 'watchdog.cycle',
                    message: `Watchdog: ${sweptProcessing.length} heartbeat-timeout, ${sweptQueued.length} queued-timeout, ${reconciled.length} orphan-reconciled`,
                })
            }
        } catch (error) {
            logger.error({
                action: 'watchdog.error',
                message: 'Watchdog cycle failed',
                error:
                    error instanceof Error
                        ? { name: error.name, message: error.message, stack: error.stack }
                        : { message: String(error) },
            })
        }
    }, WATCHDOG_INTERVAL_MS)
    runtimeState.timer = timer
}
