import { ApiError } from '@/lib/api-errors'

export type ConfirmedOperationRequest = {
  operationId: string
  input: Record<string, unknown>
  context?: {
    locale?: string
    episodeId?: string
    currentStage?: string
    selectedScopeRef?: string
    selectedPanelId?: string
    selectedClipId?: string
    selectedAssetId?: string
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CONFIRM_OPERATION_FIELD_REQUIRED',
      field: key,
      message: `${key} must be a non-empty string`,
    })
  }
  return value.trim()
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeContext(value: unknown): ConfirmedOperationRequest['context'] {
  if (!isRecord(value)) return undefined
  const locale = readOptionalString(value, 'locale')
  const episodeId = readOptionalString(value, 'episodeId')
  const currentStage = readOptionalString(value, 'currentStage')
  const selectedScopeRef = readOptionalString(value, 'selectedScopeRef')
  const selectedPanelId = readOptionalString(value, 'selectedPanelId')
  const selectedClipId = readOptionalString(value, 'selectedClipId')
  const selectedAssetId = readOptionalString(value, 'selectedAssetId')
  const context = {
    ...(locale ? { locale } : {}),
    ...(episodeId ? { episodeId } : {}),
    ...(currentStage ? { currentStage } : {}),
    ...(selectedScopeRef ? { selectedScopeRef } : {}),
    ...(selectedPanelId ? { selectedPanelId } : {}),
    ...(selectedClipId ? { selectedClipId } : {}),
    ...(selectedAssetId ? { selectedAssetId } : {}),
  }
  return Object.keys(context).length > 0 ? context : undefined
}

function normalizeInput(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return { confirmed: true }
  if (!isRecord(value)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CONFIRM_OPERATION_INPUT_INVALID',
      field: 'input',
      message: 'input must be an object',
    })
  }
  return {
    ...value,
    confirmed: true,
  }
}

export function normalizeConfirmedOperationRequest(body: unknown): ConfirmedOperationRequest {
  if (!isRecord(body)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CONFIRM_OPERATION_BODY_INVALID',
      field: 'body',
      message: 'request body must be an object',
    })
  }

  const context = normalizeContext(body.context)
  return {
    operationId: readRequiredString(body, 'operationId'),
    input: normalizeInput(body.input),
    ...(context ? { context } : {}),
  }
}
