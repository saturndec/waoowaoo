import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const query = request.nextUrl.searchParams
  const input = {
    projectId: query.get('projectId'),
    episodeId: query.get('episodeId'),
    status: query.getAll('status'),
    limit: query.get('limit'),
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'list_plan_runs',
    projectId: 'system',
    userId: session.user.id,
    input,
    source: 'project-ui',
  })

  return NextResponse.json(result)
})

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

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

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'create_plan_run',
    projectId: 'system',
    userId: session.user.id,
    input: body,
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
