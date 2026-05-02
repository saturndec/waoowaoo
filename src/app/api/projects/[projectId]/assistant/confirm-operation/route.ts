import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuth } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'
import { normalizeConfirmedOperationRequest } from '@/lib/project-agent/confirmed-operation-request'

export const runtime = 'nodejs'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'BODY_PARSE_FAILED',
      field: 'body',
      message: 'request body must be valid JSON',
    })
  }

  const confirmedRequest = normalizeConfirmedOperationRequest(body)
  const result = await executeProjectAgentOperationFromApi({
    request,
    projectId,
    userId: authResult.session.user.id,
    operationId: confirmedRequest.operationId,
    input: confirmedRequest.input,
    context: confirmedRequest.context,
    source: 'assistant-confirmation',
  })

  return NextResponse.json({
    success: true,
    operationId: confirmedRequest.operationId,
    result,
  })
})
