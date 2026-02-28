import type { Job } from 'bullmq'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { getUserModelConfig } from '@/lib/config-service'
import { removeCharacterPromptSuffix, removeLocationPromptSuffix } from '@/lib/constants'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import type { TaskJobData } from '@/lib/task/types'
import { TASK_TYPE } from '@/lib/task/types'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`)
  }
  return value.trim()
}

function parseJsonPrompt(responseText: string): string {
  let cleaned = responseText.trim()
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('No JSON found in response')
  }

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
  const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : ''
  if (!prompt) {
    throw new Error('No prompt field in response')
  }
  return prompt
}

export async function handleAssetHubAIModifyTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const userConfig = await getUserModelConfig(job.data.userId)
  if (!userConfig.analysisModel) {
    throw new Error('请先在用户配置中设置分析模型')
  }

  const isCharacter = job.data.type === TASK_TYPE.ASSET_HUB_AI_MODIFY_CHARACTER
  const isLocation = job.data.type === TASK_TYPE.ASSET_HUB_AI_MODIFY_LOCATION
  if (!isCharacter && !isLocation) {
    throw new Error(`Unsupported task type: ${job.data.type}`)
  }

  const targetIdField = isCharacter ? 'characterId' : 'locationId'
  const targetId = readRequiredString(payload[targetIdField], targetIdField)
  const modifyInstruction = readRequiredString(payload.modifyInstruction, 'modifyInstruction')
  const currentDescriptionRaw = readRequiredString(payload.currentDescription, 'currentDescription')

  const finalPrompt = isCharacter
    ? buildPrompt({
      promptId: PROMPT_IDS.NP_CHARACTER_MODIFY,
      locale: job.data.locale,
      variables: {
        character_input: removeCharacterPromptSuffix(currentDescriptionRaw),
        user_input: modifyInstruction,
      },
    })
    : buildPrompt({
      promptId: PROMPT_IDS.NP_LOCATION_MODIFY,
      locale: job.data.locale,
      variables: {
        location_name: readRequiredString(payload.locationName || '场景', 'locationName'),
        location_input: removeLocationPromptSuffix(currentDescriptionRaw),
        user_input: modifyInstruction,
      },
    })

  await reportTaskProgress(job, 25, {
    stage: 'asset_hub_ai_modify_prepare',
    stageLabel: '准备资产修改参数',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'asset_hub_ai_modify_prepare')

  const streamContext = createWorkerLLMStreamContext(job, isCharacter ? 'asset_hub_ai_modify_character' : 'asset_hub_ai_modify_location')
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)

  const completion = await withInternalLLMStreamCallbacks(
    streamCallbacks,
    async () =>
      await executeAiTextStep({
        userId: job.data.userId,
        model: userConfig.analysisModel!,
        messages: [{ role: 'user', content: finalPrompt }],
        temperature: 0.7,
        projectId: 'asset-hub',
        action: isCharacter ? 'ai_modify_character' : 'ai_modify_location',
        meta: {
          stepId: isCharacter ? 'asset_hub_ai_modify_character' : 'asset_hub_ai_modify_location',
          stepTitle: isCharacter ? '角色描述修改' : '场景描述修改',
          stepIndex: 1,
          stepTotal: 1,
        },
      }),
  )
  await streamCallbacks.flush()
  await assertTaskActive(job, 'asset_hub_ai_modify_parse')

  const modifiedDescription = parseJsonPrompt(completion.text)

  await reportTaskProgress(job, 96, {
    stage: 'asset_hub_ai_modify_done',
    stageLabel: '资产修改结果已生成',
    displayMode: 'detail',
    meta: {
      targetType: isCharacter ? 'character' : 'location',
      targetId,
    },
  })

  return {
    success: true,
    modifiedDescription,
  }
}
