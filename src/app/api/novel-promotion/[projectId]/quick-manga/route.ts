import { NextRequest } from 'next/server'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'
import {
  parseQuickMangaFacadeRequest,
  resolveQuickMangaTaskType,
  type QuickMangaStage,
} from '@/lib/novel-promotion/quick-manga-contract'
import { buildQuickMangaStoryInput } from '@/lib/novel-promotion/quick-manga'

export const runtime = 'nodejs'

function buildDedupeKey(params: {
  stage: QuickMangaStage
  episodeId: string
  options: {
    preset: string
    layout: string
    colorMode: string
    style: string | null
  }
}) {
  return [
    'quick_manga',
    params.stage,
    params.episodeId,
    params.options.preset,
    params.options.layout,
    params.options.colorMode,
    params.options.style || 'auto',
  ].join(':')
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const body = await request.json().catch(() => ({}))

  const parsed = parseQuickMangaFacadeRequest(body)
  if (!parsed) {
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

  const taskType = resolveQuickMangaTaskType(parsed.stage)

  const quickMangaPayload = {
    enabled: parsed.options.enabled,
    preset: parsed.options.preset,
    layout: parsed.options.layout,
    colorMode: parsed.options.colorMode,
    style: parsed.options.style,
  }

  const normalizedBody = {
    ...body,
    episodeId: parsed.episodeId,
    quickManga: quickMangaPayload,
    quickMangaStage: parsed.stage,
    content: parsed.stage === 'story-to-script'
      ? buildQuickMangaStoryInput({
        storyContent: parsed.content || '',
        options: quickMangaPayload,
        artStyle: parsed.options.style,
      })
      : undefined,
    displayMode: 'detail' as const,
  }

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId,
    episodeId: parsed.episodeId,
    type: taskType,
    targetType: 'NovelPromotionEpisode',
    targetId: parsed.episodeId,
    routePath: `/api/novel-promotion/${projectId}/quick-manga`,
    body: normalizedBody,
    dedupeKey: buildDedupeKey({
      stage: parsed.stage,
      episodeId: parsed.episodeId,
      options: {
        preset: parsed.options.preset,
        layout: parsed.options.layout,
        colorMode: parsed.options.colorMode,
        style: parsed.options.style,
      },
    }),
    priority: 2,
  })
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
