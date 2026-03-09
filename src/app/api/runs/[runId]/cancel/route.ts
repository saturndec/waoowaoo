import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { cancelTask } from '@/lib/task/service'
import { getRunById, requestRunCancel } from '@/lib/run-runtime/service'
import { publishRunEvent } from '@/lib/run-runtime/publisher'
import { RUN_EVENT_TYPE, RUN_STATUS } from '@/lib/run-runtime/types'

export const POST = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const { runId } = await context.params

  const run = await getRunById(runId)
  if (!run || run.userId !== session.user.id) {
    throw new ApiError('NOT_FOUND')
  }

  if (
    run.status === RUN_STATUS.CANCELING
    || run.status === RUN_STATUS.CANCELED
    || run.status === RUN_STATUS.COMPLETED
    || run.status === RUN_STATUS.FAILED
  ) {
    return NextResponse.json({
      success: true,
      run,
    })
  }

  const cancelledRun = await requestRunCancel({
    runId,
    userId: session.user.id,
  })
  if (!cancelledRun) {
    throw new ApiError('NOT_FOUND')
  }

  if (cancelledRun.taskId) {
    await cancelTask(cancelledRun.taskId, 'Run cancelled by user')
  }

  await publishRunEvent({
    runId: cancelledRun.id,
    projectId: cancelledRun.projectId,
    userId: cancelledRun.userId,
    eventType: RUN_EVENT_TYPE.RUN_CANCELED,
    payload: {
      message: 'Run cancelled by user',
    },
  })

  return NextResponse.json({
    success: true,
    run: cancelledRun,
  })
})

