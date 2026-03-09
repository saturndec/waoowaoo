import { createScopedLogger } from '@/lib/logging/core'
import { withLogContext } from '@/lib/logging/context'
import { NextRequest, NextResponse } from 'next/server'
import { getErrorSpec, type UnifiedErrorCode } from '@/lib/errors/codes'
import { buildErrorMessageContract } from '@/lib/errors/contract'
import { normalizeAnyError } from '@/lib/errors/normalize'
import { publishTaskEvent, publishTaskStreamEvent } from '@/lib/task/publisher'
import { TASK_EVENT_TYPE } from '@/lib/task/types'
import {
  withInternalLLMStreamCallbacks,
  type InternalLLMStreamCallbacks,
  type InternalLLMStreamStepMeta,
} from '@/lib/llm-observe/internal-stream-context'
import { getTaskFlowMeta } from '@/lib/llm-observe/stage-pipeline'

type RouteParamValue = string | string[] | undefined
type RouteParams = Record<string, RouteParamValue>

type ApiHandler<TParams extends RouteParams = RouteParams> = (
  req: NextRequest,
  ctx: { params: Promise<TParams> }
) => Promise<Response | NextResponse>

const REQUEST_ID_SYMBOL = Symbol.for('waoowaoo.request_id')
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const GENERATION_OPERATION_PATTERNS = [
  /\/generate(?:-|\/|$)/,
  /\/regenerate(?:-|\/|$)/,
  /\/analyze(?:-|\/|$)/,
  /\/tts(?:\/|$)/,
  /\/lip-sync(?:\/|$)/,
  /\/story-to-script(?:-|\/|$)/,
  /\/script-to-storyboard(?:-|\/|$)/,
  /\/screenplay-conversion(?:\/|$)/,
  /\/voice-(?:analyze|design|generate)(?:\/|$)/,
  /\/ai-(?:create|modify)-/,
  /\/modify-(?:asset|storyboard)-image(?:\/|$)/,
  /\/asset-hub\/(?:generate-image|modify-image|voice-design)(?:\/|$)/,
]

function isGenerationOperationPath(pathname: string): boolean {
  const normalizedPath = pathname.toLowerCase()
  return GENERATION_OPERATION_PATTERNS.some((pattern) => pattern.test(normalizedPath))
}

function shouldAuditUserOperation(method: string, status: number, pathname: string): boolean {
  if (!MUTATION_METHODS.has(method.toUpperCase()) || status >= 500) {
    return false
  }
  return isGenerationOperationPath(pathname)
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function parseTrueFlag(value: string | null): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function buildInternalLLMStreamCallbacks(req: NextRequest): InternalLLMStreamCallbacks | null {
  if (!parseTrueFlag(req.headers.get('x-internal-task-stream'))) return null
  const expectedToken = process.env.INTERNAL_TASK_TOKEN || ''
  const token = req.headers.get('x-internal-task-token') || ''
  if (expectedToken) {
    if (token !== expectedToken) return null
  } else if (process.env.NODE_ENV === 'production') {
    return null
  }

  const taskId = req.headers.get('x-internal-task-id') || ''
  const projectId = req.headers.get('x-internal-project-id') || ''
  const userId = req.headers.get('x-internal-user-id') || ''
  const taskType = req.headers.get('x-internal-task-type') || null
  const targetType = req.headers.get('x-internal-target-type') || null
  const targetId = req.headers.get('x-internal-target-id') || null
  const episodeId = req.headers.get('x-internal-episode-id') || null
  if (!taskId || !projectId || !userId) return null

  const route = req.nextUrl.pathname
  const streamRunId = `run:${taskId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
  const flowMeta = getTaskFlowMeta(taskType)
  const streamSeqByStepLane = new Map<string, number>()
  let activeStepMeta: InternalLLMStreamStepMeta | undefined
  let publishQueue: Promise<void> = Promise.resolve()
  const MAX_CHUNK_CHARS = 128

  const normalizeStepMeta = (step?: InternalLLMStreamStepMeta) => {
    const id = typeof step?.id === 'string' && step.id.trim() ? step.id.trim() : null
    const title = typeof step?.title === 'string' && step.title.trim() ? step.title.trim() : null
    const index =
      typeof step?.index === 'number' && Number.isFinite(step.index) ? Math.max(1, Math.floor(step.index)) : null
    const total =
      typeof step?.total === 'number' && Number.isFinite(step.total)
        ? Math.max(index || 1, Math.floor(step.total))
        : null
    return {
      id,
      title,
      index,
      total,
    }
  }

  const hasStepMeta = (step?: InternalLLMStreamStepMeta | null) => {
    if (!step) return false
    return !!(
      (typeof step.id === 'string' && step.id.trim()) ||
      (typeof step.title === 'string' && step.title.trim()) ||
      (typeof step.index === 'number' && Number.isFinite(step.index)) ||
      (typeof step.total === 'number' && Number.isFinite(step.total))
    )
  }

  const mergeStepMeta = (
    prev?: InternalLLMStreamStepMeta,
    next?: InternalLLMStreamStepMeta,
  ): InternalLLMStreamStepMeta | undefined => {
    if (!hasStepMeta(prev) && !hasStepMeta(next)) return undefined
    const merged: InternalLLMStreamStepMeta = {
      id:
        (typeof next?.id === 'string' && next.id.trim()) ||
        (typeof prev?.id === 'string' && prev.id.trim()) ||
        undefined,
      title:
        (typeof next?.title === 'string' && next.title.trim()) ||
        (typeof prev?.title === 'string' && prev.title.trim()) ||
        undefined,
      index:
        typeof next?.index === 'number' && Number.isFinite(next.index)
          ? Math.max(1, Math.floor(next.index))
          : typeof prev?.index === 'number' && Number.isFinite(prev.index)
            ? Math.max(1, Math.floor(prev.index))
            : undefined,
      total:
        typeof next?.total === 'number' && Number.isFinite(next.total)
          ? Math.max(1, Math.floor(next.total))
          : typeof prev?.total === 'number' && Number.isFinite(prev.total)
            ? Math.max(1, Math.floor(prev.total))
            : undefined,
    }
    if (typeof merged.index === 'number' && typeof merged.total === 'number') {
      merged.total = Math.max(merged.index, merged.total)
    }
    return merged
  }

  const withDefaultFlowAndStep = (
    payload: Record<string, unknown>,
    step?: InternalLLMStreamStepMeta,
  ) => {
    const normalizedStep = normalizeStepMeta(step)
    return {
      ...payload,
      ...(normalizedStep.id ? { stepId: normalizedStep.id } : {}),
      ...(normalizedStep.title ? { stepTitle: normalizedStep.title } : {}),
      ...(normalizedStep.index ? { stepIndex: normalizedStep.index } : {}),
      ...(normalizedStep.total ? { stepTotal: normalizedStep.total } : {}),
      flowId:
        typeof payload.flowId === 'string' && payload.flowId
          ? payload.flowId
          : flowMeta.flowId,
      flowStageIndex:
        typeof payload.flowStageIndex === 'number' && Number.isFinite(payload.flowStageIndex)
          ? payload.flowStageIndex
          : flowMeta.flowStageIndex,
      flowStageTotal:
        typeof payload.flowStageTotal === 'number' && Number.isFinite(payload.flowStageTotal)
          ? payload.flowStageTotal
          : flowMeta.flowStageTotal,
      flowStageTitle:
        typeof payload.flowStageTitle === 'string' && payload.flowStageTitle
          ? payload.flowStageTitle
          : flowMeta.flowStageTitle,
    }
  }

  const enqueueProgress = (
    payload: Record<string, unknown>,
    persist = false,
    step?: InternalLLMStreamStepMeta,
  ) => {
    const nextPayload = withDefaultFlowAndStep(payload, step)
    publishQueue = publishQueue
      .catch(() => undefined)
      .then(async () => {
        await publishTaskEvent({
          taskId,
          projectId,
          userId,
          type: TASK_EVENT_TYPE.PROGRESS,
          taskType,
          targetType,
          targetId,
          episodeId,
          payload: nextPayload,
          persist,
        })
      })
  }

  const enqueueStreamChunk = (
    payload: Record<string, unknown>,
    step?: InternalLLMStreamStepMeta,
  ) => {
    const nextPayload = withDefaultFlowAndStep(payload, step)
    publishQueue = publishQueue
      .catch(() => undefined)
      .then(async () => {
        await publishTaskStreamEvent({
          taskId,
          projectId,
          userId,
          taskType,
          targetType,
          targetId,
          episodeId,
          payload: nextPayload,
        })
      })
  }

  const nextStreamSeq = (step: InternalLLMStreamStepMeta | undefined, lane: string) => {
    const stepId = typeof step?.id === 'string' && step.id.trim() ? step.id.trim() : '__default'
    const key = `${stepId}|${lane}`
    const current = streamSeqByStepLane.get(key) || 1
    streamSeqByStepLane.set(key, current + 1)
    return current
  }

  const emitStreamChunk = (
    kind: 'text' | 'reasoning',
    delta: string,
    lane?: string | null,
    step?: InternalLLMStreamStepMeta,
  ) => {
    if (!delta) return
    const laneKey = lane || (kind === 'reasoning' ? 'reasoning' : 'main')
    for (let i = 0; i < delta.length; i += MAX_CHUNK_CHARS) {
      const piece = delta.slice(i, i + MAX_CHUNK_CHARS)
      if (!piece) continue
      enqueueStreamChunk(
        {
          displayMode: 'detail',
          done: false,
          message: kind === 'reasoning' ? 'progress.runtime.llm.reasoning' : 'progress.runtime.llm.output',
          stream: {
            kind,
            delta: piece,
            seq: nextStreamSeq(step, laneKey),
            lane: laneKey,
          },
          streamRunId,
          meta: {
            route,
          },
        },
        step,
      )
    }
  }

  const stageLabelMap: Record<string, string> = {
    submit: 'progress.runtime.stage.llmSubmit',
    streaming: 'progress.runtime.stage.llmStreaming',
    fallback: 'progress.runtime.stage.llmFallbackNonStream',
    completed: 'progress.runtime.stage.llmCompleted',
  }

  return {
    onStage(stage) {
      activeStepMeta = mergeStepMeta(activeStepMeta, stage.step)
      enqueueProgress({
        displayMode: 'detail',
        stage: `llm_${stage.stage}`,
        stageLabel: stageLabelMap[stage.stage] || stage.stage,
        message: stage.stage === 'completed' ? 'progress.runtime.llm.completed' : 'progress.runtime.llm.processing',
        streamRunId,
        meta: {
          route,
          provider: stage.provider || null,
        },
      }, false, stage.step || activeStepMeta)
    },
    onChunk(chunk) {
      if (typeof chunk.delta !== 'string' || !chunk.delta) return
      activeStepMeta = mergeStepMeta(activeStepMeta, chunk.step)
      if (chunk.kind === 'reasoning') {
        emitStreamChunk('reasoning', chunk.delta, 'reasoning', chunk.step || activeStepMeta)
        return
      }
      emitStreamChunk('text', chunk.delta, 'main', chunk.step || activeStepMeta)
    },
    onComplete() {
      enqueueProgress({
        displayMode: 'detail',
        done: true,
        stage: 'llm_completed',
        stageLabel: stageLabelMap.completed,
        message: 'progress.runtime.llm.completed',
        streamRunId,
        meta: {
          route,
        },
      }, false, activeStepMeta)
    },
    onError(error) {
      enqueueProgress({
        displayMode: 'detail',
        stage: 'llm_error',
        stageLabel: 'progress.runtime.stage.llmFailed',
        message: error instanceof Error ? error.message : String(error),
        streamRunId,
        meta: {
          route,
        },
      }, false, activeStepMeta)
    },
    async flush() {
      await publishQueue.catch(() => undefined)
    },
  }
}

function setRequestId(req: NextRequest, requestId: string) {
  ;(req as NextRequest & { [REQUEST_ID_SYMBOL]?: string })[REQUEST_ID_SYMBOL] = requestId
}

export function getRequestId(req: NextRequest): string | undefined {
  const fromSymbol = (req as NextRequest & { [REQUEST_ID_SYMBOL]?: string })[REQUEST_ID_SYMBOL]
  if (typeof fromSymbol === 'string' && fromSymbol) return fromSymbol
  const fromHeader = req.headers.get('x-request-id')
  if (typeof fromHeader === 'string' && fromHeader) return fromHeader
  return undefined
}

export function getIdempotencyKey(req: NextRequest): string | undefined {
  const key =
    req.headers.get('idempotency-key')
    || req.headers.get('x-idempotency-key')
  if (typeof key !== 'string') return undefined
  const trimmed = key.trim()
  return trimmed || undefined
}

async function extractRouteContext<TParams extends RouteParams>(
  req: NextRequest,
  ctx: { params: Promise<TParams> },
) {
  let params: Record<string, unknown> = {}
  try {
    params = (await ctx.params) || {}
  } catch {}

  const projectId =
    (typeof params.projectId === 'string' && params.projectId) ||
    req.nextUrl.searchParams.get('projectId') ||
    undefined
  const taskId =
    (typeof params.taskId === 'string' && params.taskId) ||
    req.nextUrl.searchParams.get('taskId') ||
    undefined

  return { projectId, taskId }
}

export const API_ERROR_CODES = {
  UNAUTHORIZED: { status: getErrorSpec('UNAUTHORIZED').httpStatus },
  FORBIDDEN: { status: getErrorSpec('FORBIDDEN').httpStatus },
  NOT_FOUND: { status: getErrorSpec('NOT_FOUND').httpStatus },
  INSUFFICIENT_BALANCE: { status: getErrorSpec('INSUFFICIENT_BALANCE').httpStatus },
  RATE_LIMIT: { status: getErrorSpec('RATE_LIMIT').httpStatus },
  QUOTA_EXCEEDED: { status: getErrorSpec('QUOTA_EXCEEDED').httpStatus },
  GENERATION_FAILED: { status: getErrorSpec('GENERATION_FAILED').httpStatus },
  GENERATION_TIMEOUT: { status: getErrorSpec('GENERATION_TIMEOUT').httpStatus },
  SENSITIVE_CONTENT: { status: getErrorSpec('SENSITIVE_CONTENT').httpStatus },
  INVALID_PARAMS: { status: getErrorSpec('INVALID_PARAMS').httpStatus },
  MISSING_CONFIG: { status: getErrorSpec('MISSING_CONFIG').httpStatus },
  TASK_NOT_READY: { status: getErrorSpec('TASK_NOT_READY').httpStatus },
  NO_RESULT: { status: getErrorSpec('NO_RESULT').httpStatus },
  EXTERNAL_ERROR: { status: getErrorSpec('EXTERNAL_ERROR').httpStatus },
  CONFLICT: { status: getErrorSpec('CONFLICT').httpStatus },
  INTERNAL_ERROR: { status: getErrorSpec('INTERNAL_ERROR').httpStatus },
  NETWORK_ERROR: { status: getErrorSpec('NETWORK_ERROR').httpStatus },
} as const

export type ApiErrorCode = UnifiedErrorCode

export class ApiError extends Error {
  code: ApiErrorCode
  status: number
  details?: Record<string, unknown>
  retryable: boolean
  category: string
  messageKey: string
  userMessageKey: string
  defaultMessage: string

  constructor(code: ApiErrorCode, details?: Record<string, unknown>) {
    const spec = getErrorSpec(code)
    const contract = buildErrorMessageContract({
      code,
      message: details?.message,
      messageKey: details?.messageKey,
      userMessageKey: details?.userMessageKey,
    })

    super(contract.message)
    this.name = 'ApiError'
    this.code = code
    this.status = spec.httpStatus
    this.details = details
    this.retryable = spec.retryable
    this.category = spec.category
    this.messageKey = contract.messageKey
    this.userMessageKey = contract.messageKey
    this.defaultMessage = contract.defaultMessage
  }
}

export function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error
  }

  const normalized = normalizeAnyError(error, { context: 'api' })
  const details = {
    ...(normalized.details || {}),
    retryable: normalized.retryable,
    category: normalized.category,
    messageKey: normalized.messageKey,
    userMessageKey: normalized.userMessageKey,
    defaultMessage: normalized.defaultMessage,
    provider: normalized.provider || undefined,
    message: normalized.message,
  }

  return new ApiError(normalized.code, details)
}

export function apiHandler<TParams extends RouteParams>(handler: ApiHandler<TParams>): ApiHandler<TParams> {
  return async (req, ctx) => {
    const startedAt = Date.now()
    const requestId = getRequestId(req) || createRequestId()
    setRequestId(req, requestId)
    const routeContext = await extractRouteContext(req, ctx)
    const logger = createScopedLogger({
      module: 'api',
      requestId,
      projectId: routeContext.projectId,
      taskId: routeContext.taskId,
    })

    return await withLogContext(
      {
        requestId,
        projectId: routeContext.projectId,
        taskId: routeContext.taskId,
        module: 'api',
        action: `${req.method} ${req.nextUrl.pathname}`,
      },
      async () => {
        logger.debug({
          action: 'api.request.start',
          message: 'api request start',
          details: {
            method: req.method,
            path: req.nextUrl.pathname,
          },
        })
        const streamCallbacks = buildInternalLLMStreamCallbacks(req)

        try {
          const response = await withInternalLLMStreamCallbacks(streamCallbacks, async () => await handler(req, ctx))
          await streamCallbacks?.flush?.()
          response.headers.set('x-request-id', requestId)

          logger.debug({
            action: 'api.request.finish',
            message: 'api request finished',
            durationMs: Date.now() - startedAt,
            details: {
              method: req.method,
              path: req.nextUrl.pathname,
              status: response.status,
            },
          })
          if (shouldAuditUserOperation(req.method, response.status, req.nextUrl.pathname)) {
            logger.event({
              level: 'INFO',
              audit: true,
              module: 'user.operation',
              action: 'user.operation',
              message: 'user operation completed',
              durationMs: Date.now() - startedAt,
              details: {
                method: req.method,
                path: req.nextUrl.pathname,
                status: response.status,
              },
            })
          }

          return response
        } catch (error: unknown) {
          await streamCallbacks?.flush?.()
          const apiError = normalizeError(error)
          const errorType = error instanceof Error ? error.constructor.name : typeof error
          logger.error({
            action: 'api.request.error',
            message: apiError.message,
            errorCode: apiError.code,
            retryable: apiError.retryable,
            durationMs: Date.now() - startedAt,
            details: {
              method: req.method,
              path: req.nextUrl.pathname,
              errorType,
            },
            error:
              error instanceof Error
                ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                    code: typeof (error as Error & { code?: unknown }).code === 'string'
                      ? ((error as Error & { code?: string }).code as string)
                      : undefined,
                  }
                : undefined,
          })

          const rawDetails = (apiError.details || {}) as Record<string, unknown>

          const response = NextResponse.json(
            {
              success: false,
              requestId,
              error: {
                code: apiError.code,
                message: apiError.message,
                messageKey: apiError.messageKey,
                defaultMessage: apiError.defaultMessage,
                retryable: apiError.retryable,
                category: apiError.category,
                userMessageKey: apiError.userMessageKey,
                details: {
                  ...rawDetails,
                  requestId,
                },
              },
              // Backward-compatible flattened fields.
              // Keep canonical top-level code/message stable and never allow details to overwrite them.
              ...rawDetails,
              code: apiError.code,
              message: apiError.message,
            },
            { status: apiError.status }
          )
          response.headers.set('x-request-id', requestId)
          return response
        }
      },
    )
  }
}

export function throwApiError(code: ApiErrorCode, details?: Record<string, unknown>): never {
  throw new ApiError(code, details)
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
