import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ planRunId: string }> },
) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const { planRunId } = await context.params

  const search = request.nextUrl.searchParams
  const input = {
    planRunId,
    afterSeq: search.get('afterSeq'),
    limit: search.get('limit'),
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'list_plan_run_events',
    projectId: 'system',
    userId: session.user.id,
    input,
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
