import type { Job } from 'bullmq'
import { removeCharacterPromptSuffix } from '@/lib/constants'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import type { TaskJobData } from '@/lib/task/types'
import { resolveAnalysisModel } from './shot-ai-persist'
import { runShotPromptCompletion } from './shot-ai-prompt-runtime'
import { parseJsonObject, readRequiredString, type AnyObj } from './shot-ai-prompt-utils'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'

export async function handleModifyAppearanceTask(job: Job<TaskJobData>, payload: AnyObj) {
  const characterId = readRequiredString(payload.characterId, 'characterId')
  const appearanceId = readRequiredString(payload.appearanceId, 'appearanceId')
  const currentDescription = readRequiredString(payload.currentDescription, 'currentDescription')
  const modifyInstruction = readRequiredString(payload.modifyInstruction, 'modifyInstruction')
  const novelData = await resolveAnalysisModel(job.data.projectId, job.data.userId)

  const finalPrompt = buildPrompt({
    promptId: PROMPT_IDS.NP_CHARACTER_MODIFY,
    locale: job.data.locale,
    variables: {
      character_input: removeCharacterPromptSuffix(currentDescription),
      user_input: modifyInstruction,
    },
  })

  await reportTaskProgress(job, 22, {
    stage: 'ai_modify_appearance_prepare',
    stageLabel: '准备角色描述修改参数',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'ai_modify_appearance_prepare')

  const responseText = await runShotPromptCompletion({
    job,
    model: novelData.analysisModel,
    prompt: finalPrompt,
    action: 'ai_modify_appearance',
    streamContextKey: 'ai_modify_appearance',
    streamStepId: 'ai_modify_appearance',
    streamStepTitle: '角色描述修改',
  })
  await assertTaskActive(job, 'ai_modify_appearance_parse')

  const parsed = parseJsonObject(responseText)
  const modifiedDescription = readRequiredString(parsed.prompt, 'prompt')

  await reportTaskProgress(job, 96, {
    stage: 'ai_modify_appearance_done',
    stageLabel: '角色描述修改完成',
    displayMode: 'detail',
    meta: { characterId, appearanceId },
  })

  return {
    success: true,
    modifiedDescription,
    originalPrompt: finalPrompt,
    rawResponse: responseText,
  }
}
