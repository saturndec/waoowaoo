import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { prisma } from '@/lib/prisma'

function parseHoursArg(): number {
  const raw = process.argv.find((arg) => arg.startsWith('--hours='))
  const parsed = raw ? Number.parseInt(raw.split('=')[1], 10) : 72
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 72
}

async function main() {
  const hours = parseHoursArg()
  const since = new Date(Date.now() - hours * 60 * 60 * 1000)

  const quickMangaTasks = await prisma.task.findMany({
    where: {
      dedupeKey: { startsWith: 'quick_manga:' },
      createdAt: { gte: since },
    },
    select: {
      id: true,
      type: true,
      status: true,
      errorCode: true,
      createdAt: true,
      finishedAt: true,
      dedupeKey: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  const quickMangaStatusRows = await prisma.task.groupBy({
    by: ['status'],
    where: {
      dedupeKey: { startsWith: 'quick_manga:' },
      createdAt: { gte: since },
    },
    _count: { _all: true },
  })

  const quickMangaEventRows = await prisma.taskEvent.groupBy({
    by: ['eventType'],
    where: {
      createdAt: { gte: since },
      task: {
        dedupeKey: { startsWith: 'quick_manga:' },
      },
    },
    _count: { _all: true },
  })

  const coreFlowStatusRows = await prisma.task.groupBy({
    by: ['type', 'status'],
    where: {
      createdAt: { gte: since },
      type: {
        in: ['story_to_script_run', 'script_to_storyboard_run'],
      },
    },
    _count: { _all: true },
    orderBy: [{ type: 'asc' }, { status: 'asc' }],
  })

  const coreFlowErrorRows = await prisma.task.groupBy({
    by: ['type', 'errorCode'],
    where: {
      createdAt: { gte: since },
      type: {
        in: ['story_to_script_run', 'script_to_storyboard_run'],
      },
      status: 'failed',
    },
    _count: { _all: true },
    orderBy: [{ type: 'asc' }],
  })

  const quickTotals = quickMangaStatusRows.reduce((acc, row) => {
    const count = row._count?._all || 0
    acc.total += count
    if (row.status === 'completed') acc.completed += count
    if (row.status === 'failed') acc.failed += count
    return acc
  }, { total: 0, completed: 0, failed: 0 })

  const quickSuccessRate = quickTotals.total > 0
    ? Number(((quickTotals.completed / quickTotals.total) * 100).toFixed(1))
    : null

  const payload = {
    windowHours: hours,
    since: since.toISOString(),
    quickManga: {
      totals: {
        ...quickTotals,
        successPct: quickSuccessRate,
      },
      byStatus: quickMangaStatusRows.map((row) => ({
        status: row.status,
        count: row._count?._all || 0,
      })),
      events: quickMangaEventRows.map((row) => ({
        eventType: row.eventType,
        count: row._count?._all || 0,
      })),
      latestTasks: quickMangaTasks,
    },
    fallbackCoreFlows: {
      byTypeStatus: coreFlowStatusRows.map((row) => ({
        type: row.type,
        status: row.status,
        count: row._count?._all || 0,
      })),
      failedByErrorCode: coreFlowErrorRows.map((row) => ({
        type: row.type,
        errorCode: row.errorCode || 'UNKNOWN',
        count: row._count?._all || 0,
      })),
    },
  }

  _ulogInfo('[QuickMangaTelemetryBaseline] ' + JSON.stringify(payload))
}

main()
  .catch((error) => {
    _ulogError('[QuickMangaTelemetryBaseline] failed:', error?.message || error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
