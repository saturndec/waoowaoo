import { NextRequest } from 'next/server'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'
import { resolveTaskLocale } from '@/lib/task/resolve-locale'

export const runtime = 'nodejs'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const body = await request.json().catch(() => ({}))
  const episodeId = typeof body?.episodeId === 'string' ? body.episodeId.trim() : ''
  const content = typeof body?.content === 'string' ? body.content.trim() : ''

  // 🌐 记录当前传递的语言
  const locale = resolveTaskLocale(request, body)
  console.log(`[story-to-script] locale: ${locale || 'zh (default)'}`)

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS')
  }
  if (!content) {
    throw new ApiError('INVALID_PARAMS')
  }

  const authResult = await requireProjectAuth(projectId, {
    include: { characters: true, locations: true },
  })
  if (isErrorResponse(authResult)) return authResult
  const { session, project } = authResult

  if (project.mode !== 'novel-promotion') {
    throw new ApiError('INVALID_PARAMS')
  }

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId,
    episodeId,
    type: TASK_TYPE.STORY_TO_SCRIPT_RUN,
    targetType: 'NovelPromotionEpisode',
    targetId: episodeId,
    routePath: `/api/novel-promotion/${projectId}/story-to-script-stream`,
    body: {
      ...body,
      displayMode: 'detail',
    },
    dedupeKey: `story_to_script_run:${episodeId}`,
    priority: 2,
  })
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
