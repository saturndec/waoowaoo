import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateUniqueKey, getSignedUrl, uploadToCOS, deleteCOSObject, imageUrlToBase64 } from '@/lib/cos'
import { addCharacterPromptSuffix, addLocationPromptSuffix, CHARACTER_IMAGE_SIZE, CHARACTER_IMAGE_BANANA_RATIO, LOCATION_IMAGE_SIZE, LOCATION_IMAGE_BANANA_RATIO, getArtStylePrompt } from '@/lib/constants'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import { generateImage } from '@/lib/generator-api'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { initializeFonts, createLabelSVG } from '@/lib/fonts'
import { fetchWithTimeoutAndRetry } from '@/lib/ark-api'
import { getModelResolution } from '@/lib/api-config'
import { createAsyncTask, TASK_TYPES } from '@/lib/async-task-manager'
import { getProjectModelConfig } from '@/lib/config-service'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

// 子形象图生图的提示词（与 generate-image 保持一致）
const CHILD_STATE_PROMPT_PREFIX = '根据参考图片中的人物，生成该人物的新状态形象：'
const CHILD_STATE_PROMPT_SUFFIX = `。
【要求】
1. 人物面部特征、五官、发型、发色、肤色、体型必须与参考图完全一致
2. 根据上述描述调整人物的服装、姿态、状态等
3. 保持与参考图相同的构图布局（左侧面部近景特写，右侧三视图全身照）
4. 纯白色背景`

// 🔥 移除 DEFAULT_LLM_MODEL - 零信任配置：必须用户明确配置

// 🔥 获取项目用户ID的辅助函数
async function getProjectUserId(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } })
  return project?.userId || 'system'
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 初始化字体（在 Vercel 环境中需要）
  await initializeFonts()

  // 🔐 统一权限验证
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const session = authResult.session
  const novelPromotionData = authResult.novelData

  const { type, id, appearanceId } = await request.json()

  if (!type || !id) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing required parameters' })
  }

  // 角色重新生成需要提供 appearanceId
  if (type === 'character' && !appearanceId) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing required parameter: appearanceId' })
  }

  // 🔥 使用统一配置服务获取模型配置
  const modelConfig = await getProjectModelConfig(projectId, session.user.id)

  // 使用全局资产文本作为上下文（资产是项目级别的）
  const novelText = novelPromotionData.globalAssetText || ''

  if (type === 'character') {
    return await regenerateCharacterGroup(id, appearanceId, novelPromotionData, novelText, projectId, modelConfig)
  } else if (type === 'location') {
    return await regenerateLocationGroup(id, novelPromotionData, projectId, modelConfig)
  }

  throw new ApiError('INVALID_PARAMS', { message: 'Invalid type' })
})

async function regenerateCharacterGroup(characterId: string, appearanceId: string, novelPromotionData: any, novelText: string, projectId: string, modelConfig: Awaited<ReturnType<typeof getProjectModelConfig>>) {
  // 获取角色和形象 - 使用 UUID 直接查询
  const character = await (prisma as any).novelPromotionCharacter.findUnique({
    where: { id: characterId },
    include: { appearances: true }
  })

  if (!character) {
    throw new ApiError('NOT_FOUND', { message: 'Character not found' })
  }

  const appearance = await (prisma as any).characterAppearance.findUnique({
    where: { id: appearanceId }
  })
  if (!appearance) {
    throw new ApiError('NOT_FOUND', { message: 'Appearance not found' })
  }

  // 如果正在生成，记录日志但允许覆盖（处理卡住的情况）
  if (appearance.generating) {
    console.log(`[重新生成] 覆盖卡住的生成状态: 角色 "${character.name}" 形象 ${appearance.appearanceIndex}`)
  }

  // 使用事务原子性设置生成状态（直接设置，允许覆盖）
  await prisma.$transaction(async (tx) => {
    // 原子性设置生成状态
    await (tx as any).characterAppearance.update({
      where: { id: appearance.id },
      data: { generating: true }
    })
  })

  try {
    // 判断是否是子形象（子形象 appearanceIndex > 1）
    const isPrimary = appearance.appearanceIndex === 1

    // 获取当前描述
    let currentDescriptions: string[] = []
    if (appearance.descriptions) {
      try { currentDescriptions = JSON.parse(appearance.descriptions) } catch { }
    }
    if (currentDescriptions.length === 0) {
      currentDescriptions = [appearance.description || '']
    }

    let newDescriptions: string[] = []
    let primaryImageBase64: string | null = null

    if (isPrimary) {
      // ========== 主形象：调用 LLM 生成新描述 ==========
      const currentDescriptionsText = currentDescriptions.map((d: string, i: number) => `${i + 1}. ${d}`).join('\n')

      const promptPath = path.join(process.cwd(), 'lib/prompts/novel-promotion/character_regenerate.txt')
      let promptTemplate = fs.readFileSync(promptPath, 'utf-8')
      promptTemplate = promptTemplate
        .replace('{character_name}', character.name)
        .replace('{change_reason}', appearance.changeReason)
        .replace('{current_descriptions}', currentDescriptionsText)
        .replace('{novel_text}', novelText.substring(0, 10000))

      console.log(`[重新生成-主形象] "${character.name}" - ${appearance.changeReason}`)

      // 🔥 统一配置服务：严格要求配置，不使用默认值
      if (!modelConfig.analysisModel) {
        await prisma.$transaction(async (tx) => {
          await (tx as any).characterAppearance.update({
            where: { id: appearance.id },
            data: { generating: false }
          })
        })
        throw new ApiError('MISSING_CONFIG', { message: '请先在项目设置中配置"AI分析模型"' })
      }
      const userId = await getProjectUserId(projectId)
      const completion = await chatCompletion(
        userId,
        modelConfig.analysisModel,
        [{ role: 'user', content: promptTemplate }],
        { temperature: 0.8, projectId, action: 'regenerate_character_group' }
      )

      const llmResponse = getCompletionContent(completion)
      console.log(`[重新生成-主形象] LLM响应长度: ${llmResponse.length}`)

      try {
        const jsonMatch = llmResponse.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          newDescriptions = parsed.descriptions || []
        } else {
          console.error('[重新生成-主形象] LLM响应中未找到JSON:', llmResponse)
        }
      } catch (e) {
        console.error('[重新生成-主形象] 解析LLM响应失败:', llmResponse)
        throw new Error(`解析 LLM 响应失败: ${llmResponse.substring(0, 100)}`)
      }

      if (newDescriptions.length === 0) {
        throw new Error(`未能生成新的描述，LLM返回: ${llmResponse.substring(0, 100)}`)
      }

      console.log(`[重新生成-主形象] 成功生成 ${newDescriptions.length} 条新描述`)
    } else {
      // ========== 子形象：保持现有描述，只重新生成图片 ==========
      newDescriptions = currentDescriptions  // 子形象描述不变
      console.log(`[重新生成-子形象] "${character.name}" - ${appearance.changeReason}，使用现有描述: ${currentDescriptions[0]?.substring(0, 50)}...`)

      // 获取主形象图片并裁剪标签
      const primaryAppearance = character.appearances?.find((a: any) => a.appearanceIndex === 1)
      if (!primaryAppearance?.imageUrl) {
        throw new Error('子形象重新生成需要主形象图片，请先生成主形象')
      }

      try {
        const originalDataUrl = await imageUrlToBase64(primaryAppearance.imageUrl)
        const base64Data = originalDataUrl.replace(/^data:image\/\w+;base64,/, '')
        const imgBuffer = Buffer.from(base64Data, 'base64')
        const meta = await sharp(imgBuffer).metadata()
        if (meta.width && meta.height) {
          const fontSize = Math.floor(meta.height * 0.04)
          const padding = Math.floor(fontSize * 0.5)
          const barHeight = fontSize + padding * 2
          const croppedBuffer = await sharp(imgBuffer)
            .extract({ left: 0, top: barHeight, width: meta.width, height: meta.height - barHeight })
            .toBuffer()
          primaryImageBase64 = croppedBuffer.toString('base64')
          console.log(`[重新生成-子形象] 已裁剪主形象标签区域，原尺寸 ${meta.width}x${meta.height}，裁剪高度 ${barHeight}`)
        } else {
          primaryImageBase64 = base64Data
        }
      } catch (cropError) {
        console.error('[重新生成-子形象] 裁剪主形象标签失败:', cropError)
        throw new Error('无法处理主形象图片')
      }
    }

    // 保存当前图片到previous字段（用于撤回功能），不再删除旧图片
    let oldImageUrls: string[] = []
    if (appearance.imageUrls) {
      try { oldImageUrls = JSON.parse(appearance.imageUrls) } catch { }
    }
    const previousImageUrl = appearance.imageUrl || null
    const previousImageUrls = oldImageUrls.length > 0 ? oldImageUrls : null

    const useImageToImage = !isPrimary && primaryImageBase64 !== null

    // 生成新图片
    // 🔥 统一配置服务：从配置获取模型
    const artStylePrompt = getArtStylePrompt(modelConfig.artStyle || novelPromotionData.artStyle)
    const selectedModel = modelConfig.characterModel
    if (!selectedModel) {
      await prisma.$transaction(async (tx) => {
        await (tx as any).characterAppearance.update({
          where: { id: appearance.id },
          data: { generating: false }
        })
      })
      throw new ApiError('MISSING_CONFIG', { message: '请先在项目设置中配置"角色图像模型"' })
    }
    console.log(`[模型配置调试] 使用统一配置服务 characterModel=${selectedModel}`)
    const seedreamModel = selectedModel === 'seedream4' ? 'doubao-seedream-4-0-250828' : 'doubao-seedream-4-5-251128'

    // 🔥 获取项目所有者的真实用户ID（用于API Key配置）
    const projectUserId = await getProjectUserId(projectId)

    // 子形象只生成1张（基于主形象图生图），主形象生成3张
    const toGenerate = useImageToImage ? [newDescriptions[0]] : newDescriptions

    const generatePromises = toGenerate.map(async (desc, i) => {
      let fullPrompt: string
      if (useImageToImage) {
        // 子形象：使用图生图提示词
        fullPrompt = `${CHILD_STATE_PROMPT_PREFIX}${desc}${CHILD_STATE_PROMPT_SUFFIX}`
        if (artStylePrompt) fullPrompt = `${fullPrompt}，${artStylePrompt}`
      } else {
        // 主形象：使用左侧面部特写+右侧全身提示词
        fullPrompt = artStylePrompt
          ? `${addCharacterPromptSuffix(desc)}，${artStylePrompt}`
          : addCharacterPromptSuffix(desc)
      }

      const imageKey = await generateSingleImageForGroup(
        projectUserId,  // 🔥 传入真实用户ID
        fullPrompt,
        selectedModel,
        seedreamModel,
        `char-${characterId}-${appearance.appearanceIndex}-v${i}`,
        `${character.name} - ${appearance.changeReason}`,
        CHARACTER_IMAGE_BANANA_RATIO,  // 🔥 角色使用 3:2 比例
        useImageToImage ? primaryImageBase64 : null
      )
      return { index: i, key: imageKey }
    })

    const results = await Promise.all(generatePromises)
    results.sort((a, b) => a.index - b.index)

    // 🔥 分离同步完成的 URL 和异步任务
    const completedUrls: (string | null)[] = []
    const pendingTasks: string[] = []

    for (const r of results) {
      if (r.key === null) {
        completedUrls.push(null)
      } else if (r.key.startsWith('ASYNC:')) {
        pendingTasks.push(r.key)
        completedUrls.push(null)
      } else {
        completedUrls.push(r.key)
      }
    }

    const newImageUrls = completedUrls.filter(k => k !== null) as string[]

    // 如果有异步任务，创建 AsyncTask 记录
    if (pendingTasks.length > 0) {
      for (const pendingTask of pendingTasks) {
        const asyncParts = pendingTask.substring(6)  // 移除 "ASYNC:"
        const isGeminiBatch = asyncParts.startsWith('GEMINI_BATCH:')

        let externalId: string
        if (isGeminiBatch) {
          // Gemini Batch 格式：直接使用 batchName
          externalId = asyncParts.substring('GEMINI_BATCH:'.length)
        } else if (asyncParts.startsWith('banana:')) {
          // 🔥 修复：将 banana:requestId 转换为正确的 FAL:IMAGE:endpoint:requestId 格式
          const requestId = asyncParts.substring('banana:'.length)
          externalId = `FAL:IMAGE:fal-ai/nano-banana-pro:${requestId}`
        } else {
          // 其他格式（如 seedream 等），保持原样
          externalId = asyncParts
        }

        await createAsyncTask({
          type: isGeminiBatch ? TASK_TYPES.IMAGE_GEMINI_BATCH : TASK_TYPES.IMAGE_CHARACTER,
          targetId: appearance.id,
          targetType: 'CharacterAppearance',
          externalId,
          payload: { characterName: character.name, appearanceIndex: appearance.appearanceIndex, model: selectedModel },
          userId: projectUserId
        })
        console.log(`[角色组图] 创建 AsyncTask: ${externalId}`)
      }

      // 设置 generating 状态
      await (prisma as any).characterAppearance.update({
        where: { id: appearance.id },
        data: { generating: true }
      })

      return NextResponse.json({
        success: true,
        async: true,
        asyncCount: pendingTasks.length,
        message: '图片生成任务已提交，请稍后查看'
      })
    }

    if (newImageUrls.length === 0) {
      throw new Error('图片生成全部失败')
    }

    // 使用事务原子性更新结果并清除生成状态，同时保存旧图片用于撤回
    await prisma.$transaction(async (tx) => {
      await (tx as any).characterAppearance.update({
        where: { id: appearance.id },
        data: {
          descriptions: JSON.stringify(newDescriptions),
          description: newDescriptions[0],
          imageUrls: JSON.stringify(newImageUrls),
          imageUrl: newImageUrls[0],
          previousImageUrl: previousImageUrl,
          previousImageUrls: previousImageUrls ? JSON.stringify(previousImageUrls) : null,
          selectedIndex: null,
          generating: false
        }
      })
    })

    return NextResponse.json({
      success: true,
      descriptions: newDescriptions,
      imageUrls: newImageUrls.map(key => getSignedUrl(key, 7 * 24 * 3600))
    })
  } catch (error: any) {
    // 使用事务原子性重置生成状态
    await prisma.$transaction(async (tx) => {
      await (tx as any).characterAppearance.update({
        where: { id: appearance.id },
        data: { generating: false }
      })
    }).catch(() => { })

    throw error  // 重新抛出让 apiHandler 处理
  }
}

async function regenerateLocationGroup(locationId: string, novelPromotionData: any, projectId: string, modelConfig: Awaited<ReturnType<typeof getProjectModelConfig>>) {
  // 获取场景和图片 - 新结构：使用独立表
  const location = await (prisma as any).novelPromotionLocation.findUnique({
    where: { id: locationId },
    include: { images: { orderBy: { imageIndex: 'asc' } } }
  })

  if (!location) {
    throw new ApiError('NOT_FOUND', { message: 'Location not found' })
  }

  // 如果正在生成，记录日志但允许覆盖（处理卡住的情况）
  const isGenerating = (location as any).images?.some((img: any) => img.generating)
  if (isGenerating) {
    console.log(`[重新生成] 覆盖卡住的生成状态: 场景 "${location.name}"`)
  }

  // 使用事务原子性设置所有图片为生成中（直接设置，允许覆盖）
  await prisma.$transaction(async (tx) => {
    // 原子性设置所有图片为生成中
    await (tx as any).locationImage.updateMany({
      where: { locationId },
      data: { generating: true }
    })
  })

  try {
    // 获取当前描述（从 images 表）
    const currentDescriptions = location.images?.map((img: any) => img.description || '') || ['']
    const currentDescriptionsText = currentDescriptions.map((d: string, i: number) => `${i + 1}. ${d}`).join('\n')

    // 读取提示词模板
    const promptPath = path.join(process.cwd(), 'lib/prompts/novel-promotion/location_regenerate.txt')
    let promptTemplate = fs.readFileSync(promptPath, 'utf-8')
    promptTemplate = promptTemplate
      .replace('{location_name}', location.name)
      .replace('{current_descriptions}', currentDescriptionsText)

    console.log(`Regenerating location group for "${location.name}"`)

    // 🔥 统一配置服务：严格要求配置，不使用默认值
    if (!modelConfig.analysisModel) {
      await prisma.$transaction(async (tx) => {
        await (tx as any).locationImage.updateMany({
          where: { locationId },
          data: { generating: false }
        })
      })
      throw new ApiError('MISSING_CONFIG', { message: '请先在项目设置中配置"AI分析模型"' })
    }
    // 调用 LLM 生成新描述
    const userId = await getProjectUserId(projectId)
    const completion = await chatCompletion(
      userId,
      modelConfig.analysisModel,
      [{ role: 'user', content: promptTemplate }],
      { temperature: 0.8, projectId, action: 'regenerate_location_group' }
    )

    const llmResponse = getCompletionContent(completion)
    let newDescriptions: string[] = []
    try {
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        newDescriptions = parsed.descriptions || []
      }
    } catch (e) {
      console.error('Failed to parse LLM response:', llmResponse)
      throw new Error('解析 LLM 响应失败')
    }

    if (newDescriptions.length === 0) {
      throw new Error('未能生成新的描述')
    }

    // 保存当前图片到previous字段（用于撤回功能），不再删除旧图片
    const previousImages = (location.images || []).map((img: any) => ({
      imageIndex: img.imageIndex,
      previousImageUrl: img.imageUrl
    }))

    // 先在事务外生成图片（这是耗时操作，不能放在事务里）
    // 🔥 统一配置服务：从配置获取模型
    const artStylePrompt = getArtStylePrompt(modelConfig.artStyle || novelPromotionData.artStyle)
    const selectedModel = modelConfig.locationModel
    if (!selectedModel) {
      await prisma.$transaction(async (tx) => {
        await (tx as any).locationImage.updateMany({
          where: { locationId },
          data: { generating: false }
        })
      })
      throw new ApiError('MISSING_CONFIG', { message: '请先在项目设置中配置"场景图像模型"' })
    }
    const seedreamModel = selectedModel === 'seedream4' ? 'doubao-seedream-4-0-250828' : 'doubao-seedream-4-5-251128'

    // 🔥 获取项目所有者的真实用户ID（用于API Key配置）
    const projectUserId = await getProjectUserId(projectId)

    const generatePromises = newDescriptions.map(async (desc, i) => {
      const fullPrompt = artStylePrompt
        ? `${addLocationPromptSuffix(desc)}，${artStylePrompt}`
        : addLocationPromptSuffix(desc)
      const imageKey = await generateSingleImageForGroup(
        projectUserId,  // 🔥 传入真实用户ID
        fullPrompt,
        selectedModel,
        seedreamModel,
        `loc-${locationId}-v${i}`,
        location.name,
        LOCATION_IMAGE_BANANA_RATIO  // 🔥 场景使用 1:1 比例
      )
      return { index: i, key: imageKey, description: desc }
    })

    const generateResults = await Promise.all(generatePromises)

    // 🔥 分离同步完成的结果和异步任务
    const completedResults: { index: number; key: string | null; description: string }[] = []
    const pendingTasks: { index: number; task: string; description: string }[] = []

    for (const result of generateResults) {
      if (result.key === null) {
        completedResults.push({ index: result.index, key: null, description: result.description })
      } else if (result.key.startsWith('ASYNC:')) {
        pendingTasks.push({ index: result.index, task: result.key, description: result.description })
        completedResults.push({ index: result.index, key: null, description: result.description })  // 暂时为 null
      } else {
        completedResults.push({ index: result.index, key: result.key, description: result.description })
      }
    }

    console.log(`[场景重新生成] 完成${completedResults.filter(r => r.key).length}张，异步${pendingTasks.length}张`)

    // 如果有异步任务，创建 AsyncTask 记录
    if (pendingTasks.length > 0) {
      // 先更新描述和 generating 状态
      await prisma.$transaction(async (tx) => {
        // 删除旧的图片记录
        await (tx as any).locationImage.deleteMany({ where: { locationId } })

        // 创建新的图片记录，保持 generating=true
        for (const result of completedResults) {
          const prevImg = previousImages.find((p: any) => p.imageIndex === result.index)
          const newImage = await (tx as any).locationImage.create({
            data: {
              locationId,
              imageIndex: result.index,
              description: result.description,
              imageUrl: result.key,  // 可能为 null（异步任务）
              previousImageUrl: prevImg?.previousImageUrl || null,
              isSelected: result.index === 0,
              generating: result.key === null  // 异步任务保持 generating=true
            }
          })

          // 为每个异步任务创建 AsyncTask
          const pendingTask = pendingTasks.find(p => p.index === result.index)
          if (pendingTask) {
            const asyncParts = pendingTask.task.substring(6)  // 移除 "ASYNC:"
            const isGeminiBatch = asyncParts.startsWith('GEMINI_BATCH:')

            let externalId: string
            if (isGeminiBatch) {
              // Gemini Batch 格式：直接使用 batchName
              externalId = asyncParts.substring('GEMINI_BATCH:'.length)
            } else if (asyncParts.startsWith('banana:')) {
              // 🔥 修复：将 banana:requestId 转换为正确的 FAL:IMAGE:endpoint:requestId 格式
              const requestId = asyncParts.substring('banana:'.length)
              externalId = `FAL:IMAGE:fal-ai/nano-banana-pro:${requestId}`
            } else {
              // 其他格式（如 seedream 等），保持原样
              externalId = asyncParts
            }

            await createAsyncTask({
              type: isGeminiBatch ? TASK_TYPES.IMAGE_GEMINI_BATCH : TASK_TYPES.IMAGE_LOCATION,
              targetId: newImage.id,
              targetType: 'LocationImage',
              externalId,
              payload: { locationName: location.name, model: selectedModel },
              userId: projectUserId
            })
            console.log(`[场景组图] 创建 AsyncTask: ${externalId}, imageId=${newImage.id}`)
          }
        }
      })

      return NextResponse.json({
        success: true,
        async: true,
        asyncCount: pendingTasks.length,
        descriptions: newDescriptions,
        message: '图片生成任务已提交，请稍后查看'
      })
    }

    // 所有图片都是同步完成的情况，更新数据库
    await prisma.$transaction(async (tx) => {
      // 删除旧的图片记录
      await (tx as any).locationImage.deleteMany({ where: { locationId } })

      // 创建新的图片记录，同时保存旧图片用于撤回
      for (const result of completedResults) {
        const prevImg = previousImages.find((p: any) => p.imageIndex === result.index)
        await (tx as any).locationImage.create({
          data: {
            locationId,
            imageIndex: result.index,
            description: result.description,
            imageUrl: result.key,
            previousImageUrl: prevImg?.previousImageUrl || null,
            isSelected: result.index === 0,
            generating: false
          }
        })
      }
    })

    const newImageUrls = completedResults.filter(r => r.key).map(r => r.key as string)

    return NextResponse.json({
      success: true,
      descriptions: newDescriptions,
      imageUrls: newImageUrls.map(key => getSignedUrl(key, 7 * 24 * 3600))
    })
  } catch (error: any) {
    // 使用事务原子性重置生成状态
    await prisma.$transaction(async (tx) => {
      await (tx as any).locationImage.updateMany({
        where: { locationId },
        data: { generating: false }
      })
    }).catch(() => { })

    throw error  // 重新抛出让 apiHandler 处理
  }
}

async function generateSingleImageForGroup(
  userId: string,  // 🔥 新增：真实用户ID，用于获取API Key配置
  fullPrompt: string,
  selectedModel: string,
  seedreamModel: string,
  keyPrefix: string,
  labelText: string,
  aspectRatio: string,  // 🔥 新增：宽高比参数（角色用3:2，场景用1:1）
  referenceImageBase64: string | null = null  // 参考图片（用于图生图）
): Promise<string | null> {
  try {
    let tempImageUrl: string | undefined
    const useImageToImage = referenceImageBase64 !== null
    console.log(`[生成单张图片调试] selectedModel=${selectedModel}, useImageToImage=${useImageToImage}`)

    if (useImageToImage) {
      // 🔥 子形象：使用 Seedream 4.5 图生图模式（通过统一接口）
      console.log(`[重新生成] 使用Seedream图生图模式（通过统一接口）`)

      const result = await generateImage(
        userId,
        selectedModel,  // 使用 selectedModel 而不是固定的 seedreamModel
        fullPrompt,
        {
          referenceImages: [`data:image/jpeg;base64,${referenceImageBase64}`],
          aspectRatio,
          size: CHARACTER_IMAGE_SIZE,
          resolution: await getModelResolution(userId, selectedModel)
        }
      )

      if (!result.success) {
        console.error(`[重新生成失败] Seedream图生图:`, result.error)
        return null
      }

      // 检测异步返回
      if (result.async && result.requestId) {
        return `ASYNC:${selectedModel}:${result.requestId}`
      }

      // 处理返回
      if (result.imageBase64) {
        const imageBuffer = Buffer.from(result.imageBase64, 'base64')
        const cosKey = generateUniqueKey(keyPrefix, 'jpg')
        await uploadToCOS(imageBuffer, cosKey)
        tempImageUrl = getSignedUrl(cosKey, 3600)
      } else if (result.imageUrl) {
        tempImageUrl = result.imageUrl
      }

      console.log(`[重新生成] Seedream图生图成功`)
    } else {
      // 使用统一的新架构生成图片
      console.log(`[重新生成] 使用模型: ${selectedModel}`)

      const result = await generateImage(
        userId,  // 🔥 使用真实用户ID
        selectedModel,
        fullPrompt,
        {
          referenceImages: referenceImageBase64 ? [`data:image/jpeg;base64,${referenceImageBase64}`] : [],
          aspectRatio,  // 🔥 使用传入的比例参数
          resolution: await getModelResolution(userId, selectedModel)
        }
      )

      if (!result.success) {
        console.error(`[重新生成失败] ${selectedModel}:`, result.error)
        return null
      }

      // 检测异步返回
      if (result.async && result.requestId) {
        return `ASYNC:${selectedModel}:${result.requestId}`
      }

      // 处理不同的返回格式
      if (result.imageBase64) {
        // Base64格式（如 Gemini），需要上传到 COS
        const imageBuffer = Buffer.from(result.imageBase64, 'base64')
        const cosKey = generateUniqueKey(keyPrefix, 'jpg')
        await uploadToCOS(imageBuffer, cosKey)
        tempImageUrl = getSignedUrl(cosKey, 3600)
      } else if (result.imageUrl) {
        // URL格式（如 FAL/ARK）
        tempImageUrl = result.imageUrl
      }
    }

    if (!tempImageUrl) return null

    // 下载并添加标签（使用带超时和重试的fetch）
    const imgRes = await fetchWithTimeoutAndRetry(tempImageUrl, { logPrefix: `[下载重生成图片]` })
    if (!imgRes.ok) return null
    const buffer = Buffer.from(await imgRes.arrayBuffer())
    const meta = await sharp(buffer).metadata()
    const w = meta.width || 2160, h = meta.height || 2160
    const fontSize = Math.floor(h * 0.04), pad = Math.floor(fontSize * 0.5), barH = fontSize + pad * 2

    const svg = await createLabelSVG(w, barH, fontSize, pad, labelText)

    const processed = await sharp(buffer)
      .extend({ top: barH, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
      .composite([{ input: svg, top: 0, left: 0 }])
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer()

    const key = generateUniqueKey(keyPrefix, 'jpg')
    return await uploadToCOS(processed, key)
  } catch (e) {
    console.error('Error generating image:', e)
    return null
  }
}
