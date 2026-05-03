import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuth } from '@/lib/api-auth'
import { rejectProjectPlan } from '@/lib/command-center/executor'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string; planId: string }> },
) => {
  const { projectId, planId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const resolvedPlanId = planId.trim()
  if (!resolvedPlanId) {
    throw new ApiError('INVALID_PARAMS', { field: 'planId', message: 'planId is required' })
  }

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const note = typeof (body as { note?: unknown }).note === 'string'
    ? ((body as { note: string }).note.trim() || undefined)
    : undefined
  if (note !== undefined && note.length > 5000) {
    throw new ApiError('INVALID_PARAMS', {
      field: 'note',
      message: 'note is too long',
    })
  }

  const result = await rejectProjectPlan({
    planId: resolvedPlanId,
    ...(note ? { note } : {}),
  })

  return NextResponse.json({
    success: true,
    commandId: result.commandId,
    planId: result.planId,
    status: result.status,
    summary: result.summary,
    steps: result.steps,
  })
})
