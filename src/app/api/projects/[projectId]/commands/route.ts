import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuth } from '@/lib/api-auth'
import { executeProjectCommand } from '@/lib/command-center/executor'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const runtime = 'nodejs'

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const episodeId = request.nextUrl.searchParams.get('episodeId')?.trim() || null
  const limitRaw = request.nextUrl.searchParams.get('limit')?.trim() || ''
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20
  const resolvedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 50)) : 20

  const refreshedCommands = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'list_recent_commands',
    projectId,
    userId: authResult.session.user.id,
    context: {
      episodeId,
    },
    input: {
      limit: resolvedLimit,
      syncRunning: true,
    },
    source: 'project-ui',
  })

  return NextResponse.json({
    commands: refreshedCommands,
  })
})

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
    })
  }

  const result = await executeProjectCommand({
    request,
    projectId,
    userId: authResult.session.user.id,
    body,
  })

  if (result.requiresApproval) {
    return NextResponse.json({
      success: true,
      commandId: result.commandId,
      planId: result.planId,
      status: result.status,
      requiresApproval: true,
      summary: result.summary,
      steps: result.steps,
    })
  }

  return NextResponse.json({
    success: true,
    async: true,
    commandId: result.commandId,
    planId: result.planId,
    taskId: result.linkedTaskId,
    status: result.status,
    summary: result.summary,
    steps: result.steps,
  })
})
