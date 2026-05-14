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
  const videoModel = isRecord(body) && typeof body.videoModel === 'string' ? body.videoModel.trim() : ''
  if (!videoModel) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'VIDEO_MODEL_REQUIRED',
      field: 'videoModel',
    })
  }

  const input: Record<string, unknown> = {
    videoModel,
  }
  if (body.all === true) input.all = true
  if (body.mode === 'grid') input.mode = 'grid'
  if (body.mode === 'auto') input.mode = 'auto'
  if (body.mode === 'asset-reference') input.mode = 'asset-reference'
  if (body.mode === 'auto' && body.all !== true) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'AUTO_VIDEO_REQUIRES_BATCH',
      field: 'mode',
    })
  }
  if (body.mode === 'asset-reference' && body.all !== true && typeof body.blockIndex !== 'number') {
    throw new ApiError('INVALID_PARAMS', {
      code: 'ASSET_REFERENCE_VIDEO_BLOCK_REQUIRED',
      field: 'blockIndex',
    })
  }
  if (body.gridMode === '2x2' || body.gridMode === '3x3') input.gridMode = body.gridMode
  if (typeof body.groupVideoModel === 'string') input.groupVideoModel = body.groupVideoModel
  if (Array.isArray(body.shotNumbers)) input.shotNumbers = body.shotNumbers
  if (Array.isArray(body.referenceImageUrls)) input.referenceImageUrls = body.referenceImageUrls
  if (typeof body.blockIndex === 'number') input.blockIndex = body.blockIndex
  if (typeof body.episodeId === 'string') input.episodeId = body.episodeId
  if (typeof body.panelId === 'string') input.panelId = body.panelId
  if (typeof body.storyboardId === 'string') input.storyboardId = body.storyboardId
  if (typeof body.panelIndex === 'number') input.panelIndex = body.panelIndex
  if (typeof body.limit === 'number') input.limit = body.limit
  if (body.firstLastFrame !== undefined) input.firstLastFrame = body.firstLastFrame
  if (isRecord(body.generationOptions)) input.generationOptions = body.generationOptions

  const operationId = body.mode === 'auto'
    ? 'generate_episode_videos_auto'
    : body.mode === 'asset-reference'
      ? (body.all === true ? 'generate_episode_asset_reference_videos' : 'generate_asset_reference_video')
      : body.mode === 'grid'
        ? (body.all === true ? 'generate_episode_video_groups' : 'generate_video_group')
        : (body.all === true ? 'generate_episode_videos' : 'generate_panel_video')

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId,
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
