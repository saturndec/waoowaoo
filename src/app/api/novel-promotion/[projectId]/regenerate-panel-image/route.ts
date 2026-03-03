import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { hasPanelImageOutput } from '@/lib/task/has-output'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { getProjectModelConfig } from '@/lib/config-service'
import { resolveProjectModelCapabilityGenerationOptions } from '@/lib/config-service'
import { resolveModelSelection } from '@/lib/api-config'
import { createScopedLogger } from '@/lib/logging/core'

const DEFAULT_CANDIDATE_COUNT = 1

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const requestId = getRequestId(request)

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const logger = createScopedLogger({
    module: 'api.novel-promotion.regenerate-panel-image',
    action: 'submit',
    requestId,
    projectId,
    userId: session.user.id,
  })

  const body = await request.json()
  const locale = resolveRequiredTaskLocale(request, body)
  const panelId = body?.panelId
  const count = body?.count
  const candidateCount = Math.max(1, Math.min(4, Number(count ?? DEFAULT_CANDIDATE_COUNT)))
  logger.info({
    message: 'regenerate panel image request received',
    details: {
      panelId: typeof panelId === 'string' ? panelId : null,
      countRaw: count ?? null,
      candidateCount,
      locale,
    },
  })

  if (!panelId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const projectModelConfig = await getProjectModelConfig(projectId, session.user.id)
  logger.info({
    message: 'regenerate panel image model config loaded',
    details: {
      storyboardModel: projectModelConfig.storyboardModel || null,
    },
  })
  if (!projectModelConfig.storyboardModel) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'STORYBOARD_MODEL_NOT_CONFIGURED'})
  }
  try {
    await resolveModelSelection(session.user.id, projectModelConfig.storyboardModel, 'image')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Storyboard image model is invalid'
    throw new ApiError('INVALID_PARAMS', {
      code: 'STORYBOARD_MODEL_INVALID',
      message})
  }

  let capabilityOptions: Record<string, string | number | boolean>
  try {
    capabilityOptions = await resolveProjectModelCapabilityGenerationOptions({
      projectId,
      userId: session.user.id,
      modelType: 'image',
      modelKey: projectModelConfig.storyboardModel})
  } catch (error) {
    logger.error({
      message: 'resolve panel image capability options failed',
      errorCode: 'PANEL_IMAGE_CAPABILITY_RESOLVE_FAILED',
      retryable: false,
      details: {
        panelId,
        storyboardModel: projectModelConfig.storyboardModel,
      },
      error: error instanceof Error
        ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
        : undefined,
    })
    throw error
  }
  logger.info({
    message: 'panel image capability options resolved',
    details: {
      optionKeys: Object.keys(capabilityOptions),
      capabilityOptions,
    },
  })
  const billingPayload = {
    ...body,
    candidateCount,
    imageModel: projectModelConfig.storyboardModel,
    ...(Object.keys(capabilityOptions).length > 0 ? { generationOptions: capabilityOptions } : {})}

  const hasOutputAtStart = await hasPanelImageOutput(panelId)

  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId,
    projectId,
    type: TASK_TYPE.IMAGE_PANEL,
    targetType: 'NovelPromotionPanel',
    targetId: panelId,
    payload: withTaskUiPayload(billingPayload, {
      intent: 'regenerate',
      hasOutputAtStart}),
    dedupeKey: `image_panel:${panelId}:${candidateCount}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.IMAGE_PANEL, billingPayload)})
  logger.info({
    message: 'panel image task submitted',
    details: {
      panelId,
      candidateCount,
      hasOutputAtStart,
      taskId: (result as { taskId?: string }).taskId || null,
      async: (result as { async?: boolean }).async ?? null,
    },
  })

  return NextResponse.json(result)
})
