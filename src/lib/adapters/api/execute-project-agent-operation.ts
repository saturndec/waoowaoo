import type { NextRequest } from 'next/server'
import { ApiError } from '@/lib/api-errors'
import { createProjectAgentOperationRegistryForApi } from '@/lib/operations/registry'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message?.trim() || 'OPERATION_FAILED'
  if (typeof error === 'string') return error.trim() || 'OPERATION_FAILED'
  try {
    const serialized = JSON.stringify(error)
    if (typeof serialized === 'string' && serialized.trim()) return serialized.trim()
    return 'OPERATION_FAILED'
  } catch {
    return 'OPERATION_FAILED'
  }
}

function extractPrismaMissingColumn(error: unknown): string | null {
  if (!isRecord(error)) return null
  if (error.code !== 'P2022') return null
  const meta = isRecord(error.meta) ? error.meta : null
  const column = typeof meta?.column === 'string' ? meta.column.trim() : ''
  return column || null
}

function inferApiErrorCodeFromMessage(message: string): 'NOT_FOUND' | 'INVALID_PARAMS' | 'FORBIDDEN' | 'UNAUTHORIZED' | 'CONFLICT' | null {
  const lower = message.toLowerCase()
  if (lower.includes('unauthorized') || lower.includes('need login') || lower.includes('not authenticated')) return 'UNAUTHORIZED'
  if (lower.includes('forbidden') || lower.includes('permission denied')) return 'FORBIDDEN'
  if (lower.includes('not found') || lower.includes('不存在') || lower.includes('missing record') || lower.includes('not_found')) return 'NOT_FOUND'
  if (lower.includes('conflict') || lower.includes('already exists') || lower.includes('duplicate')) return 'CONFLICT'
  if (lower.includes('invalid') || lower.includes('missing') || lower.includes('required') || lower.includes('bad request')) return 'INVALID_PARAMS'
  return null
}

export async function executeProjectAgentOperationFromApi(params: {
  request: NextRequest
  operationId: string
  projectId: string
  userId: string
  context?: {
    locale?: string | null
    episodeId?: string | null
    currentStage?: string | null
    selectedScopeRef?: string | null
    selectedPanelId?: string | null
    selectedClipId?: string | null
    selectedAssetId?: string | null
  }
  input: unknown
  source?: string
}) {
  const registry = createProjectAgentOperationRegistryForApi()
  const operation = registry[params.operationId]
  if (!operation) {
    throw new ApiError('NOT_FOUND', {
      message: `operation not found: ${params.operationId}`,
    })
  }

  const parsed = operation.inputSchema.safeParse(params.input)
  if (!parsed.success) {
    throw new ApiError('INVALID_PARAMS', {
      message: 'INVALID_PARAMS',
      issues: parsed.error.issues,
    })
  }

  try {
    const result = await operation.execute({
      request: params.request,
      userId: params.userId,
      projectId: params.projectId,
      context: {
        ...(params.context?.locale ? { locale: params.context.locale } : {}),
        ...(params.context?.episodeId ? { episodeId: params.context.episodeId } : {}),
        ...(params.context?.currentStage ? { currentStage: params.context.currentStage } : {}),
        ...(params.context?.selectedScopeRef ? { selectedScopeRef: params.context.selectedScopeRef } : {}),
        ...(params.context?.selectedPanelId ? { selectedPanelId: params.context.selectedPanelId } : {}),
        ...(params.context?.selectedClipId ? { selectedClipId: params.context.selectedClipId } : {}),
        ...(params.context?.selectedAssetId ? { selectedAssetId: params.context.selectedAssetId } : {}),
      },
      source: params.source || 'project-ui',
      writer: null,
    }, parsed.data)
    const outputParsed = operation.outputSchema.safeParse(result)
    if (!outputParsed.success) {
      throw new ApiError('EXTERNAL_ERROR', {
        code: 'OPERATION_OUTPUT_INVALID',
        message: `operation output schema mismatch: ${params.operationId}`,
        issues: outputParsed.error.issues,
      })
    }
    return outputParsed.data
  } catch (error) {
    if (error instanceof ApiError) throw error
    const missingColumn = extractPrismaMissingColumn(error)
    if (missingColumn) {
      throw new ApiError('EXTERNAL_ERROR', {
        code: 'DATABASE_SCHEMA_MISMATCH',
        field: missingColumn,
        message: `database schema mismatch: missing column ${missingColumn}; run the latest Prisma migration before starting the app`,
      })
    }
    const message = toMessage(error)
    const inferred = inferApiErrorCodeFromMessage(message)
    if (inferred) {
      throw new ApiError(inferred, { message })
    }
    throw new ApiError('EXTERNAL_ERROR', {
      code: 'OPERATION_EXECUTION_FAILED',
      message,
    })
  }
}
