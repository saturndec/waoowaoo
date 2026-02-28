import type { Job } from 'bullmq'
import { getUserModelConfig } from '@/lib/config-service'
import { aiDesign } from '@/lib/asset-utils'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

function resolveUserInstruction(payload: Record<string, unknown>) {
  const value = payload.userInstruction
  return typeof value === 'string' ? value.trim() : ''
}

export async function handleAssetHubAIDesignTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const userInstruction = resolveUserInstruction(payload)
  if (!userInstruction) {
    throw new Error('userInstruction is required')
  }

  const assetType =
    job.data.type === TASK_TYPE.ASSET_HUB_AI_DESIGN_CHARACTER
      || job.data.type === TASK_TYPE.AI_CREATE_CHARACTER
      ? 'character'
      : job.data.type === TASK_TYPE.ASSET_HUB_AI_DESIGN_LOCATION
        || job.data.type === TASK_TYPE.AI_CREATE_LOCATION
        ? 'location'
        : null
  if (!assetType) {
    throw new Error(`Unsupported asset hub ai design task type: ${job.data.type}`)
  }

  const userConfig = await getUserModelConfig(job.data.userId)
  const analysisModelFromPayload =
    typeof payload.analysisModel === 'string' && payload.analysisModel.trim()
      ? payload.analysisModel.trim()
      : null
  const analysisModel = analysisModelFromPayload || userConfig.analysisModel || ''
  if (!analysisModel) {
    throw new Error('ANALYSIS_MODEL_NOT_CONFIGURED: 请先在设置页面配置分析模型')
  }

  await reportTaskProgress(job, 25, {
    stage: 'asset_hub_ai_design_prepare',
    stageLabel: '准备资产设计参数',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'asset_hub_ai_design_prepare')

  const result = await aiDesign({
    userId: job.data.userId,
    locale: job.data.locale,
    analysisModel,
    userInstruction,
    assetType,
    projectId: job.data.projectId || 'asset-hub',
    skipBilling: true,
  })

  if (!result.success || !result.prompt) {
    throw new Error(result.error || 'Generation failed')
  }

  await reportTaskProgress(job, 96, {
    stage: 'asset_hub_ai_design_done',
    stageLabel: '资产设计结果已生成',
    displayMode: 'detail',
  })

  return {
    prompt: result.prompt,
  }
}
