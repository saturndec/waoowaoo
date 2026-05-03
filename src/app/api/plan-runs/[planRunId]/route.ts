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

  const snapshot = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'get_plan_run_snapshot',
    projectId: 'system',
    userId: session.user.id,
    input: { planRunId },
    source: 'project-ui',
  })

  return NextResponse.json(snapshot)
})
