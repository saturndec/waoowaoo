import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { listOpenAICompatibleModels } from '@/lib/user-api/openai-compatible-models'

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getProviderKey(providerId: string): string {
  const index = providerId.indexOf(':')
  return index === -1 ? providerId : providerId.slice(0, index)
}

function parseFetchStatusFromMessage(message: string): number | null {
  const match = message.match(/^OPENAI_COMPATIBLE_FETCH_FAILED:(\d{3}):/)
  if (!match) return null
  const parsed = Number.parseInt(match[1], 10)
  return Number.isFinite(parsed) ? parsed : null
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({}))
  const apiKey = readTrimmedString((body as { apiKey?: unknown }).apiKey)
  const baseUrl = readTrimmedString((body as { baseUrl?: unknown }).baseUrl)
  const providerId = readTrimmedString((body as { providerId?: unknown }).providerId)

  if (providerId && getProviderKey(providerId) !== 'openai-compatible') {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_TYPE_INVALID',
      message: 'providerId must be openai-compatible',
    })
  }
  if (!apiKey) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_API_KEY_MISSING',
      message: '缺少 API Key',
    })
  }
  if (!baseUrl) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_BASE_URL_MISSING',
      message: '缺少 Base URL',
    })
  }

  try {
    const models = await listOpenAICompatibleModels({
      apiKey,
      baseUrl,
    })
    return NextResponse.json({
      success: true,
      providerId: providerId || null,
      count: models.length,
      models,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const fetchStatus = parseFetchStatusFromMessage(message)

    if (message === 'OPENAI_COMPATIBLE_BASE_URL_REQUIRED' || message === 'OPENAI_COMPATIBLE_BASE_URL_INVALID') {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_BASE_URL_INVALID',
        message: 'Base URL 无效',
      })
    }
    if (message === 'OPENAI_COMPATIBLE_API_KEY_REQUIRED') {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_API_KEY_MISSING',
        message: '缺少 API Key',
      })
    }
    if (message === 'OPENAI_COMPATIBLE_FETCH_TIMEOUT') {
      throw new ApiError('EXTERNAL_ERROR', {
        code: 'OPENAI_COMPATIBLE_FETCH_TIMEOUT',
        message: '模型列表获取超时，请稍后重试',
      })
    }
    if (fetchStatus === 401) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_API_KEY_INVALID',
        message: 'API Key 无效或已过期',
      })
    }

    throw new ApiError('EXTERNAL_ERROR', {
      code: 'OPENAI_COMPATIBLE_FETCH_FAILED',
      message: `模型列表获取失败: ${message}`,
    })
  }
})
