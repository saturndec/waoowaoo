import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { validateProfileData, stringifyProfileData } from '@/types/character-profile'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import {
  type AnyObj,
  parseVisualResponse,
  readRequiredString,
  readText,
  resolveProjectModel,
} from './character-profile-helpers'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'

type ConfirmProfileOptions = {
  suppressProgress?: boolean
}

async function handleConfirmProfile(
  job: Job<TaskJobData>,
  payload: AnyObj,
  options: ConfirmProfileOptions = {},
) {
  const suppressProgress = options.suppressProgress === true
  const characterId = readRequiredString(payload.characterId, 'characterId')
  const project = await resolveProjectModel(job.data.projectId)

  const character = await prisma.novelPromotionCharacter.findFirst({
    where: {
      id: characterId,
      novelPromotionProjectId: project.novelPromotionData!.id,
    },
  })
  if (!character) {
    throw new Error('Character not found')
  }

  let finalProfileData = character.profileData
  if (payload.profileData) {
    if (!validateProfileData(payload.profileData)) {
      throw new Error('档案数据格式错误')
    }
    finalProfileData = stringifyProfileData(payload.profileData)
    await assertTaskActive(job, 'character_profile_confirm_update_profile')
    await prisma.novelPromotionCharacter.update({
      where: { id: characterId },
      data: { profileData: finalProfileData },
    })
  }

  if (!finalProfileData) {
    throw new Error('角色缺少档案数据')
  }

  const parsedProfile = JSON.parse(finalProfileData) as AnyObj
  const promptTemplate = buildPrompt({
    promptId: PROMPT_IDS.NP_AGENT_CHARACTER_VISUAL,
    locale: job.data.locale,
    variables: {
      character_profiles: JSON.stringify(
        [
          {
            name: character.name,
            ...parsedProfile,
          },
        ],
        null,
        2,
      ),
    },
  })

  if (!suppressProgress) {
    await reportTaskProgress(job, 20, {
      stage: 'character_profile_confirm_prepare',
      stageLabel: '准备角色档案确认参数',
      displayMode: 'detail',
    })
  }
  await assertTaskActive(job, 'character_profile_confirm_prepare')

  const streamContext = createWorkerLLMStreamContext(job, 'character_profile_confirm')
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)
  const completion = await withInternalLLMStreamCallbacks(
    streamCallbacks,
    async () =>
      await executeAiTextStep({
        userId: job.data.userId,
        model: project.novelPromotionData!.analysisModel!,
        messages: [{ role: 'user', content: promptTemplate }],
        temperature: 0.7,
        projectId: job.data.projectId,
        action: 'generate_character_visual',
        meta: {
          stepId: 'character_profile_confirm',
          stepTitle: '角色档案确认',
          stepIndex: 1,
          stepTotal: 1,
        },
      }),
  )
  await streamCallbacks.flush()
  await assertTaskActive(job, 'character_profile_confirm_parse')

  const responseText = completion.text
  const visualData = parseVisualResponse(responseText)
  const visualCharacters = Array.isArray(visualData.characters)
    ? (visualData.characters as Array<AnyObj>)
    : []
  const firstCharacter = visualCharacters[0]
  const appearances = Array.isArray(firstCharacter?.appearances)
    ? (firstCharacter!.appearances as Array<AnyObj>)
    : []
  if (appearances.length === 0) {
    throw new Error('AI返回格式错误: 缺少 appearances')
  }

  if (!suppressProgress) {
    await reportTaskProgress(job, 78, {
      stage: 'character_profile_confirm_persist',
      stageLabel: '保存角色档案确认结果',
      displayMode: 'detail',
    })
  }
  await assertTaskActive(job, 'character_profile_confirm_persist')

  for (let appIndex = 0; appIndex < appearances.length; appIndex++) {
    const app = appearances[appIndex]
    await assertTaskActive(job, 'character_profile_confirm_create_appearance')
    const descriptions = Array.isArray(app.descriptions) ? app.descriptions : []
    const normalizedDescriptions = descriptions.map((item) => readText(item)).filter(Boolean)
    await prisma.characterAppearance.create({
      data: {
        characterId: character.id,
        appearanceIndex: appIndex,
        changeReason: readText(app.change_reason) || '初始形象',
        description: normalizedDescriptions[0] || '',
        descriptions: JSON.stringify(normalizedDescriptions),
        imageUrls: encodeImageUrls([]),
        previousImageUrls: encodeImageUrls([]),
      },
    })
  }

  await prisma.novelPromotionCharacter.update({
    where: { id: characterId },
    data: { profileConfirmed: true },
  })

  if (!suppressProgress) {
    await reportTaskProgress(job, 96, {
      stage: 'character_profile_confirm_done',
      stageLabel: '角色档案确认完成',
      displayMode: 'detail',
      meta: { characterId },
    })
  }

  return {
    success: true,
    character: {
      ...character,
      profileConfirmed: true,
      appearances,
    },
  }
}

async function handleBatchConfirmProfile(job: Job<TaskJobData>) {
  const project = await resolveProjectModel(job.data.projectId)

  const unconfirmedCharacters = await prisma.novelPromotionCharacter.findMany({
    where: {
      novelPromotionProjectId: project.novelPromotionData!.id,
      profileConfirmed: false,
      profileData: { not: null },
    },
  })

  if (unconfirmedCharacters.length === 0) {
    return {
      success: true,
      count: 0,
      message: '没有待确认的角色',
    }
  }

  await reportTaskProgress(job, 18, {
    stage: 'character_profile_batch_prepare',
    stageLabel: '准备批量角色档案确认参数',
    displayMode: 'detail',
    message: `共 ${unconfirmedCharacters.length} 个角色`,
  })
  await assertTaskActive(job, 'character_profile_batch_prepare')

  let successCount = 0
  const totalCount = unconfirmedCharacters.length

  for (let index = 0; index < unconfirmedCharacters.length; index++) {
    const character = unconfirmedCharacters[index]
    await assertTaskActive(job, 'character_profile_batch_loop_character')
    const progress = 18 + Math.floor(((index + 1) / totalCount) * 78)
    await reportTaskProgress(job, progress, {
      stage: 'character_profile_batch_loop_character',
      stageLabel: '批量角色档案确认中',
      displayMode: 'detail',
      message: `${index + 1}/${totalCount} ${character.name}`,
      meta: { characterId: character.id, index: index + 1, total: totalCount },
    })
    await handleConfirmProfile(job, { characterId: character.id }, { suppressProgress: true })
    successCount += 1
  }

  await reportTaskProgress(job, 96, {
    stage: 'character_profile_batch_done',
    stageLabel: '批量角色档案确认完成',
    displayMode: 'detail',
    meta: { count: successCount },
  })

  return {
    success: true,
    count: successCount,
  }
}

export async function handleCharacterProfileTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  switch (job.data.type) {
    case TASK_TYPE.CHARACTER_PROFILE_CONFIRM:
      return await handleConfirmProfile(job, payload)
    case TASK_TYPE.CHARACTER_PROFILE_BATCH_CONFIRM:
      return await handleBatchConfirmProfile(job)
    default:
      throw new Error(`Unsupported character profile task type: ${job.data.type}`)
  }
}
