import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ planRunId: string; stepKey: string }> },
) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const { planRunId, stepKey: rawStepKey } = await context.params
  const stepKey = decodeURIComponent(rawStepKey || '').trim()

  if (!planRunId || !stepKey) throw new ApiError('INVALID_PARAMS')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const input = {
    ...(body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}),
    planRunId,
    stepKey,
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'retry_plan_step',
    projectId: 'system',
    userId: session.user.id,
    input,
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
