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
import { listRuns } from '@/lib/run-runtime/service'

export const runtime = 'nodejs'

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function buildDedupeKey(params: {
  stage: QuickMangaStage
  episodeId: string
  options: {
    preset: string
    layout: string
    colorMode: string
    panelTemplateId: string | null
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
    params.options.panelTemplateId || 'none',
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
    panelTemplateId: parsed.options.panelTemplateId,
    style: parsed.options.style,
  }

  const quickMangaControls = parsed.controls

  let continuity = parsed.continuity
  if (continuity?.shortcut === 'history-regenerate') {
    const sourceRunId = readString(continuity.sourceRunId)
    if (!sourceRunId) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'QUICK_MANGA_SOURCE_RUN_REQUIRED',
        message: 'source run id is required for regenerate shortcut',
      })
    }

    const runs = await listRuns({
      userId: session.user.id,
      projectId,
      limit: 100,
    })
    const sourceRun = runs.find((run) => run.id === sourceRunId)
    if (!sourceRun) {
      throw new ApiError('NOT_FOUND', {
        code: 'QUICK_MANGA_SOURCE_RUN_NOT_FOUND',
        message: 'source run not found',
      })
    }

    const sourceQuickManga = toObject(toObject(sourceRun.input).quickManga)
    if (sourceQuickManga.enabled !== true) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'QUICK_MANGA_SOURCE_INVALID',
        message: 'source run quick manga metadata is missing',
      })
    }

    continuity = {
      sourceRunId,
      sourceStage: continuity.sourceStage,
      shortcut: 'history-regenerate',
      fallbackContentUsed: continuity.fallbackContentUsed === true,
      reusedOptions: {
        preset: continuity.reusedOptions.preset,
        layout: continuity.reusedOptions.layout,
        colorMode: continuity.reusedOptions.colorMode,
        panelTemplateId: continuity.reusedControls?.panelTemplateId || quickMangaPayload.panelTemplateId,
        style: continuity.reusedOptions.style || quickMangaPayload.style,
      },
      reusedControls: continuity.reusedControls || quickMangaControls,
    }
  }

  const normalizedBody = {
    ...body,
    episodeId: parsed.episodeId,
    quickManga: quickMangaPayload,
    quickMangaControls,
    quickMangaStage: parsed.stage,
    continuity,
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
        panelTemplateId: parsed.options.panelTemplateId,
        style: parsed.options.style,
      },
    }),
    priority: 2,
  })
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
