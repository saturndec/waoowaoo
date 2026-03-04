import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loggerInfoMock = vi.hoisted(() => vi.fn())
const loggerErrorMock = vi.hoisted(() => vi.fn())
const queueGetJobMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/logging/core', () => ({
  createScopedLogger: () => ({
    info: loggerInfoMock,
    error: loggerErrorMock,
  }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/task/publisher', () => ({
  publishTaskEvent: vi.fn(),
}))

vi.mock('@/lib/task/service', () => ({
  rollbackTaskBillingForTask: vi.fn(async () => ({ attempted: false, rolledBack: true })),
  sweepStaleTasks: vi.fn(async () => []),
  sweepStaleQueuedTasks: vi.fn(async () => []),
}))

vi.mock('@/lib/task/queues', () => ({
  imageQueue: { getJob: queueGetJobMock },
  videoQueue: { getJob: queueGetJobMock },
  voiceQueue: { getJob: queueGetJobMock },
  textQueue: { getJob: queueGetJobMock },
}))

import { startTaskWatchdog, stopTaskWatchdog } from '@/lib/task/reconcile'

describe('task watchdog singleton', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    loggerInfoMock.mockReset()
    loggerErrorMock.mockReset()
    queueGetJobMock.mockReset()
    stopTaskWatchdog()
  })

  afterEach(() => {
    stopTaskWatchdog()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('重复启动时只保留一个定时器实例', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    startTaskWatchdog()
    startTaskWatchdog()

    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(clearIntervalSpy).toHaveBeenCalledTimes(0)
  })

  it('停止后再次启动会创建新的定时器实例', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    startTaskWatchdog()
    stopTaskWatchdog()
    startTaskWatchdog()

    expect(setIntervalSpy).toHaveBeenCalledTimes(2)
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
  })
})
