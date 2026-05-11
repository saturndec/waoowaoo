import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  if (!isRecord(body)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'BODY_PARSE_FAILED',
      field: 'body',
    })
  }

  const input: Record<string, unknown> = {
    confirmed: body.confirmed === true,
  }
  if (typeof body.episodeId === 'string') input.episodeId = body.episodeId
  if (typeof body.musicModel === 'string') input.musicModel = body.musicModel
  if (body.outputFormat === 'mp3' || body.outputFormat === 'wav') input.outputFormat = body.outputFormat
  if (typeof body.bgmVolume === 'number') input.bgmVolume = body.bgmVolume

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'render_final_video',
    projectId,
    userId: authResult.session.user.id,
    context: {
      episodeId: typeof body.episodeId === 'string' ? body.episodeId : null,
    },
    input,
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
