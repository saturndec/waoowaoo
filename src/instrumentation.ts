// Next.js Instrumentation - 在应用启动时执行
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // 在 Edge Runtime 中直接返回，避免加载 Prisma（它使用了动态代码生成）
  if (process.env.NEXT_RUNTIME === 'edge') {
    return
  }

  // 只在 Node.js 服务端运行
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { prisma } = await import('@/lib/prisma')
    const { logInfo: _ulogInfo, logError: _ulogError } = await import('@/lib/logging/core')

    // Phase 1: 将 processing 任务打回 queued
    try {
      const resetResult = await prisma.task.updateMany({
        where: {
          status: 'processing',
        },
        data: {
          status: 'queued',
          startedAt: null,
          heartbeatAt: null,
          // 保留 externalId，让 worker 重启后能从中断处继续轮询
          // 而不是重新提交给外部 API（Kling 等），避免重复扣费
        },
      })

      if (resetResult.count > 0) {
        _ulogInfo(`[Instrumentation] Reset ${resetResult.count} processing tasks to queued`)
      }
    } catch (error) {
      _ulogError('[Instrumentation] Failed to reset processing tasks:', error)
    }

    // Phase 2: 将所有 queued 任务重新加入 BullMQ 队列
    // 解决 Redis 重启后 DB 仍为 queued 但 BullMQ Job 丢失的孤儿任务问题
    try {
      const { addTaskJob } = await import('@/lib/task/queues')
      const { normalizeTaskPayloadLocale, resolveRecoverableTaskLocale } = await import('@/lib/task/recover-locale')
      const { TASK_STATUS, TASK_TYPE } = await import('@/lib/task/types')
      type TaskBillingInfo = import('@/lib/task/types').TaskBillingInfo
      type TaskJobData = import('@/lib/task/types').TaskJobData
      type TaskType = import('@/lib/task/types').TaskType

      const TASK_TYPE_SET: ReadonlySet<string> = new Set(Object.values(TASK_TYPE))

      function toTaskType(value: unknown): TaskType | null {
        if (typeof value !== 'string') return null
        if (!TASK_TYPE_SET.has(value)) return null
        return value as TaskType
      }

      function toTaskPayload(value: unknown): Record<string, unknown> | null {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null
        return value as Record<string, unknown>
      }

      function toTaskBillingInfo(value: unknown): TaskBillingInfo | null {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null
        const billing = value as Record<string, unknown>
        if (billing.billable !== true && billing.billable !== false) return null
        return billing as TaskBillingInfo
      }

      async function markTaskEnqueueFailed(taskId: string, error: string) {
        await prisma.task.update({
          where: { id: taskId },
          data: {
            enqueueAttempts: { increment: 1 },
            lastEnqueueError: error.slice(0, 500),
          },
        })
      }

      const RE_ENQUEUE_BATCH_SIZE = 100
      const queuedTasks = await prisma.task.findMany({
        where: { status: 'queued' },
        select: {
          id: true,
          userId: true,
          projectId: true,
          episodeId: true,
          type: true,
          targetType: true,
          targetId: true,
          payload: true,
          billingInfo: true,
          priority: true,
        },
        orderBy: { createdAt: 'asc' },
        take: RE_ENQUEUE_BATCH_SIZE,
      })

      if (queuedTasks.length > 0) {
        _ulogInfo(`[Instrumentation] Found ${queuedTasks.length} queued tasks, re-enqueueing into BullMQ`)

        let enqueued = 0
        let failed = 0

        for (const task of queuedTasks) {
          try {
            const taskType = toTaskType(task.type)
            if (!taskType) {
              await prisma.task.update({
                where: { id: task.id },
                data: {
                  status: TASK_STATUS.FAILED,
                  errorCode: 'INVALID_TASK_TYPE',
                  errorMessage: `invalid task type: ${String(task.type)}`,
                  finishedAt: new Date(),
                },
              })
              failed++
              continue
            }

            const locale = await resolveRecoverableTaskLocale({
              taskId: task.id,
              payload: task.payload,
            })
            if (!locale) {
              await prisma.task.update({
                where: { id: task.id },
                data: {
                  status: TASK_STATUS.FAILED,
                  errorCode: 'TASK_LOCALE_REQUIRED',
                  errorMessage: 'task locale is missing',
                  finishedAt: new Date(),
                },
              })
              failed++
              continue
            }
            const normalizedPayload = normalizeTaskPayloadLocale(task.payload, locale)

            const jobData: TaskJobData = {
              taskId: task.id,
              type: taskType,
              locale,
              projectId: task.projectId,
              episodeId: task.episodeId || null,
              targetType: task.targetType,
              targetId: task.targetId,
              payload: toTaskPayload(normalizedPayload),
              billingInfo: toTaskBillingInfo(task.billingInfo),
              userId: task.userId,
              trace: null,
            }
            await addTaskJob(jobData, {
              priority: typeof task.priority === 'number' ? task.priority : 0,
            })
            await prisma.task.update({
              where: { id: task.id },
              data: {
                enqueuedAt: new Date(),
                lastEnqueueError: null,
                payload: normalizedPayload,
              },
            })
            enqueued++
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            await markTaskEnqueueFailed(task.id, message || 're-enqueue failed')
            _ulogError(`[Instrumentation] Failed to re-enqueue task ${task.id}:`, message)
            failed++
          }
        }

        if (enqueued > 0) {
          _ulogInfo(`[Instrumentation] Re-enqueued ${enqueued} orphaned tasks into BullMQ`)
        }
        if (failed > 0) {
          _ulogError(`[Instrumentation] Failed to re-enqueue ${failed} tasks`)
        }
      }
    } catch (error) {
      _ulogError('[Instrumentation] Failed to re-enqueue orphaned tasks:', error)
    }

    // ─── Phase 3: 启动 Task Watchdog（DB ↔ BullMQ 持续对账）───
    try {
      const { startTaskWatchdog, stopTaskWatchdog } = await import('@/lib/task/reconcile')
      stopTaskWatchdog()
      startTaskWatchdog()
      _ulogInfo('[Instrumentation] Task watchdog started')
    } catch (error) {
      _ulogError('[Instrumentation] Failed to start task watchdog:', error)
    }
  }
}
