import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { getProviderKey } from '@/lib/api-config'
import { probeModelLlmProtocol } from '@/lib/user-api/model-llm-protocol-probe'

type ProbeRequestBody = {
  providerId?: unknown
  modelId?: unknown
}

function isOpenAICompatProviderKey(providerKey: string): boolean {
  return providerKey === 'openai-compatible' || providerKey === 'grok-compatible'
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_LLM_PROTOCOL_PROBE_INVALID',
      field,
    })
  }
  return value.trim()
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  let body: ProbeRequestBody
  try {
    body = (await request.json()) as ProbeRequestBody
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'BODY_PARSE_FAILED',
      field: 'body',
    })
  }

  const providerId = readRequiredString(body.providerId, 'providerId')
  const modelId = readRequiredString(body.modelId, 'modelId')

  if (!isOpenAICompatProviderKey(getProviderKey(providerId))) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_LLM_PROTOCOL_PROBE_PROVIDER_INVALID',
      field: 'providerId',
    })
  }

  const result = await probeModelLlmProtocol({
    userId: authResult.session.user.id,
    providerId,
    modelId,
  })

  return NextResponse.json(result)
})
