import type { Locale } from '@/i18n/routing'
import { prisma } from '@/lib/prisma'
import { resolveTaskLocaleFromBody } from './resolve-locale'

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readRunId(payload: unknown): string | null {
  const payloadObj = toObject(payload)
  const fromTop = typeof payloadObj.runId === 'string' ? payloadObj.runId.trim() : ''
  if (fromTop) return fromTop
  const meta = toObject(payloadObj.meta)
  const fromMeta = typeof meta.runId === 'string' ? meta.runId.trim() : ''
  return fromMeta || null
}

function withLocaleInPayload(payload: unknown, locale: Locale): Record<string, unknown> {
  const payloadObj = toObject(payload)
  const payloadMeta = toObject(payloadObj.meta)
  const currentTopLocale = typeof payloadObj.locale === 'string' ? payloadObj.locale.trim() : ''
  const currentMetaLocale = typeof payloadMeta.locale === 'string' ? payloadMeta.locale.trim() : ''

  return {
    ...payloadObj,
    locale: currentTopLocale || locale,
    meta: {
      ...payloadMeta,
      locale: currentMetaLocale || locale,
    },
  }
}

async function resolveLocaleFromGraphRunTaskId(taskId: string): Promise<Locale | null> {
  const run = await prisma.graphRun.findUnique({
    where: { taskId },
    select: { input: true },
  })
  if (!run) return null
  return resolveTaskLocaleFromBody(run.input)
}

async function resolveLocaleFromGraphRunId(runId: string): Promise<Locale | null> {
  const run = await prisma.graphRun.findUnique({
    where: { id: runId },
    select: { input: true },
  })
  if (!run) return null
  return resolveTaskLocaleFromBody(run.input)
}

async function resolveLocaleFromTaskEvents(taskId: string): Promise<Locale | null> {
  const events = await prisma.taskEvent.findMany({
    where: { taskId },
    orderBy: { id: 'desc' },
    take: 10,
    select: { payload: true },
  })
  for (const event of events) {
    const locale = resolveTaskLocaleFromBody(event.payload)
    if (locale) return locale
  }
  return null
}

export async function resolveRecoverableTaskLocale(params: {
  taskId: string
  payload?: unknown
}): Promise<Locale | null> {
  const fromPayload = resolveTaskLocaleFromBody(params.payload)
  if (fromPayload) return fromPayload

  const runId = readRunId(params.payload)
  if (runId) {
    const fromRunId = await resolveLocaleFromGraphRunId(runId)
    if (fromRunId) return fromRunId
  }

  const fromRunTask = await resolveLocaleFromGraphRunTaskId(params.taskId)
  if (fromRunTask) return fromRunTask

  return await resolveLocaleFromTaskEvents(params.taskId)
}

export function normalizeTaskPayloadLocale(payload: unknown, locale: Locale): Record<string, unknown> {
  return withLocaleInPayload(payload, locale)
}

