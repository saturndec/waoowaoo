import sharp from 'sharp'
import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { generateImage } from '@/lib/generator-api'
import { queryFalStatus } from '@/lib/async-submit'
import { fetchWithTimeoutAndRetry } from '@/lib/ark-api'
import { getProviderConfig } from '@/lib/api-config'
import { executeAiVisionStep } from '@/lib/ai-runtime'
import { getUserModelConfig } from '@/lib/config-service'
import {
  CHARACTER_IMAGE_BANANA_RATIO,
  addCharacterPromptSuffix,
  getArtStylePrompt,
} from '@/lib/constants'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { generateUniqueKey, getSignedUrl, uploadToCOS } from '@/lib/cos'
import { initializeFonts, createLabelSVG } from '@/lib/fonts'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'
import {
  parseReferenceImages,
  readBoolean,
  readString,
} from './reference-to-character-helpers'
const POLL_MAX_ATTEMPTS = 60
const POLL_INTERVAL_MS = 2000
async function generateLabeledImage(params: {
  job: Job<TaskJobData>
  imageIndex: number
  userId: string
  imageModel: string
  prompt: string
  referenceImages?: string[]
  falApiKey?: string | null
  keyPrefix: string
  labelText: string
}): Promise<string | null> {
  const {
    job,
    imageIndex,
    userId,
    imageModel,
    prompt,
    referenceImages,
    falApiKey,
    keyPrefix,
    labelText,
  } = params

  try {
    await assertTaskActive(job, `reference_to_character_generate_${imageIndex + 1}`)
    const result = await generateImage(
      userId,
      imageModel,
      prompt,
      {
        referenceImages,
        aspectRatio: CHARACTER_IMAGE_BANANA_RATIO,
      },
    )

    let finalImageUrl = result.imageUrl
    const requestId = typeof result.requestId === 'string' ? result.requestId : ''
    const endpoint = typeof result.endpoint === 'string' ? result.endpoint : ''
    if (result.async && requestId && endpoint) {
      if (!falApiKey) {
        throw new Error('reference_to_character async result requires falApiKey')
      }
      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
        await assertTaskActive(job, `reference_to_character_poll_${imageIndex + 1}_${attempt + 1}`)
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        const status = await queryFalStatus(endpoint, requestId, falApiKey)
        if (status.completed && status.resultUrl) {
          finalImageUrl = status.resultUrl
          break
        }
        if (status.failed) {
          return null
        }
      }
    }

    if (!result.success || !finalImageUrl) {
      return null
    }

    const imgRes = await fetchWithTimeoutAndRetry(finalImageUrl, {
      logPrefix: `[reference-to-character:${imageIndex + 1}]`,
    })
    const buffer = Buffer.from(await imgRes.arrayBuffer())
    const meta = await sharp(buffer).metadata()
    const width = meta.width || 2160
    const height = meta.height || 2160
    const fontSize = Math.floor(height * 0.04)
    const pad = Math.floor(fontSize * 0.5)
    const barHeight = fontSize + pad * 2

    const svg = await createLabelSVG(width, barHeight, fontSize, pad, labelText)
    const processed = await sharp(buffer)
      .extend({
        top: barHeight,
        bottom: 0,
        left: 0,
        right: 0,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      })
      .composite([{ input: svg, top: 0, left: 0 }])
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer()

    const key = generateUniqueKey(`${keyPrefix}-${Date.now()}-${imageIndex}`, 'jpg')
    return await uploadToCOS(processed, key)
  } catch {
    return null
  }
}

export async function handleReferenceToCharacterTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const allReferenceImages = parseReferenceImages(payload)
  if (allReferenceImages.length === 0) {
    throw new Error('Missing referenceImageUrl or referenceImageUrls')
  }

  const isAssetHub = job.data.type === TASK_TYPE.ASSET_HUB_REFERENCE_TO_CHARACTER
  const isProject = job.data.type === TASK_TYPE.REFERENCE_TO_CHARACTER
  if (!isAssetHub && !isProject) {
    throw new Error(`Unsupported task type: ${job.data.type}`)
  }

  const isBackgroundJob = readBoolean(payload.isBackgroundJob)
  const appearanceId = readString(payload.appearanceId)
  const characterId = readString(payload.characterId)
  const extractOnly = readBoolean(payload.extractOnly)
  const customDescription = readString(payload.customDescription)
  const characterName = readString(payload.characterName) || '新角色 - 初始形象'
  const artStyle = readString(payload.artStyle)

  if (isBackgroundJob && (!characterId || !appearanceId)) {
    throw new Error('Missing characterId or appearanceId for background job')
  }

  await reportTaskProgress(job, 15, {
    stage: 'reference_to_character_prepare',
    stageLabel: '准备参考图转换参数',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'reference_to_character_prepare')

  await initializeFonts()

  const userConfig = await getUserModelConfig(job.data.userId)
  const imageModel = readString(userConfig.characterModel)
  const analysisModel = readString(userConfig.analysisModel)
  if (!imageModel && !extractOnly) {
    throw new Error('请先在设置页面配置角色图片模型')
  }
  if (!analysisModel && extractOnly) {
    throw new Error('请先在设置页面配置分析模型')
  }

  if (extractOnly) {
    await reportTaskProgress(job, 45, {
      stage: 'reference_to_character_extract',
      stageLabel: '提取参考图描述',
      displayMode: 'detail',
    })
    const completion = await executeAiVisionStep({
      userId: job.data.userId,
      model: analysisModel,
      prompt: buildPrompt({
        promptId: PROMPT_IDS.CHARACTER_IMAGE_TO_DESCRIPTION,
        locale: job.data.locale,
      }),
      imageUrls: allReferenceImages,
      temperature: 0.3,
      ...(isProject ? { projectId: job.data.projectId } : {}),
    })
    await assertTaskActive(job, 'reference_to_character_extract_done')
    await reportTaskProgress(job, 96, {
      stage: 'reference_to_character_extract_done',
      stageLabel: '参考图描述提取完成',
      displayMode: 'detail',
    })
    return {
      success: true,
      description: completion.text,
    }
  }

  const artStylePrompt = getArtStylePrompt(artStyle, job.data.locale)

  const basePrompt = customDescription || buildPrompt({
    promptId: PROMPT_IDS.CHARACTER_REFERENCE_TO_SHEET,
    locale: job.data.locale,
  })
  let prompt = addCharacterPromptSuffix(basePrompt)
  if (artStylePrompt) {
    prompt = `${prompt}，${artStylePrompt}`
  }

  const useReferenceImages = !customDescription
  const { apiKey: falApiKey } = await getProviderConfig(job.data.userId, 'fal')
  const keyPrefix = isAssetHub ? 'ref-char' : `proj-ref-char-${job.data.projectId}`

  await reportTaskProgress(job, 35, {
    stage: 'reference_to_character_generate',
    stageLabel: '生成角色三视图',
    displayMode: 'detail',
  })

  const imageResults = await Promise.all([0, 1, 2].map(async (index) =>
    await generateLabeledImage({
      job,
      imageIndex: index,
      userId: job.data.userId,
      imageModel,
      prompt,
      referenceImages: useReferenceImages ? allReferenceImages : undefined,
      falApiKey,
      keyPrefix,
      labelText: characterName,
    }),
  ))

  let description: string | null = null
  if (analysisModel) {
    const analysisPrompt = buildPrompt({
      promptId: PROMPT_IDS.CHARACTER_IMAGE_TO_DESCRIPTION,
      locale: job.data.locale,
    })
    const completion = await executeAiVisionStep({
      userId: job.data.userId,
      model: analysisModel,
      prompt: analysisPrompt,
      imageUrls: allReferenceImages,
      temperature: 0.3,
      ...(isProject ? { projectId: job.data.projectId } : {}),
    })
    description = completion.text
  }

  const successfulCosKeys = imageResults.filter((item): item is string => Boolean(item))
  if (successfulCosKeys.length === 0) {
    throw new Error('图片生成失败')
  }

  await assertTaskActive(job, 'reference_to_character_persist')
  if (isBackgroundJob && appearanceId) {
    if (isAssetHub) {
      await prisma.globalCharacterAppearance.update({
        where: { id: appearanceId },
        data: {
          imageUrl: successfulCosKeys[0],
          imageUrls: encodeImageUrls(successfulCosKeys),
          description: description || undefined,
        },
      })
    } else {
      await prisma.characterAppearance.update({
        where: { id: appearanceId },
        data: {
          imageUrl: successfulCosKeys[0],
          imageUrls: encodeImageUrls(successfulCosKeys),
          description: description || undefined,
        },
      })
    }
    await reportTaskProgress(job, 96, {
      stage: 'reference_to_character_done',
      stageLabel: '参考图转换完成',
      displayMode: 'detail',
    })
    return { success: true }
  }

  const mainCosKey = successfulCosKeys[0]
  const mainSignedUrl = getSignedUrl(mainCosKey, 7 * 24 * 3600)

  await reportTaskProgress(job, 96, {
    stage: 'reference_to_character_done',
    stageLabel: '参考图转换完成',
    displayMode: 'detail',
  })

  return {
    success: true,
    imageUrl: mainSignedUrl,
    cosKey: mainCosKey,
    cosKeys: successfulCosKeys,
    description,
  }
}
