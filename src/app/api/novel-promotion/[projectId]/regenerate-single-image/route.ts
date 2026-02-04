import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateUniqueKey, getSignedUrl, uploadToCOS, deleteCOSObject } from '@/lib/cos'
import { addCharacterPromptSuffix, addLocationPromptSuffix, getArtStylePrompt } from '@/lib/constants'
import { chatCompletion } from '@/lib/llm-client'
import { generateImage } from '@/lib/generator-api'
import { getModelResolution } from '@/lib/api-config'
import { withImageBilling, InsufficientBalanceError, handleBillingError } from '@/lib/pricing'
import sharp from 'sharp'
import { initializeFonts, createLabelSVG } from '@/lib/fonts'
import { fetchWithTimeoutAndRetry } from '@/lib/ark-api'
import { createAsyncTask, TASK_TYPES } from '@/lib/async-task-manager'
import { getProjectModelConfig } from '@/lib/config-service'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

async function desensitizePrompt(userId: string, originalPrompt: string): Promise<string> {
  try {
    const completion = await chatCompletion(
      userId,
      'google/gemini-3-pro-preview',
      [
        { role: 'system', content: '你是提示词优化专家。将敏感内容替换为安全描述，保持核心特征。只输出修改后的描述。' },
        { role: 'user', content: originalPrompt }
      ],
      { reasoning: false, temperature: 0.3, skipBilling: true }
    )
    return completion.choices[0]?.message?.content?.trim() || originalPrompt
  } catch {
    return originalPrompt
  }
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 初始化字体（在 Vercel 环境中需要）
  await initializeFonts()

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const session = authResult.session

  const { type, id, appearanceId, imageIndex } = await request.json()

  if (!type || !id || imageIndex === undefined) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing required parameters' })
  }

  const novelPromotionData = await prisma.novelPromotionProject.findUnique({ where: { projectId } })
  if (!novelPromotionData) {
    throw new ApiError('NOT_FOUND', { message: 'Novel promotion data not found' })
  }

  // 由于有 billing 和内部的复杂逻辑，保留内部 try-catch
  try {
    if (type === 'character') {
      // 使用 UUID 直接查询
      const appearance = await (prisma as any).characterAppearance.findUnique({
        where: { id: appearanceId },
        include: { character: true }
      })

      if (!appearance) {
        throw new ApiError('NOT_FOUND', { message: 'Appearance not found' })
      }

      // 检查是否正在生成（防止并发冲突）
      if (appearance.generating) {
        throw new ApiError('CONFLICT', { message: '该形象正在生成中，请稍候...' })
      }

      const selectedModel = novelPromotionData.characterModel
      if (!selectedModel) {
        throw new ApiError('INVALID_PARAMS', { message: '请先在项目设置中配置"角色图像模型"' })
      }

      // 使用 withImageBilling 包装整个生成逻辑
      const result = await withImageBilling(
        session.user.id,
        selectedModel,
        1,  // 生成1张图片
        {
          projectId,
          action: 'single_character_image_regenerate',
          metadata: {
            characterId: id,
            characterName: appearance.character.name,
            appearanceId,
            imageIndex
          }
        },
        async () => {
          // 获取描述
          let descriptions: string[] = []
          if (appearance.descriptions) {
            try { descriptions = JSON.parse(appearance.descriptions) } catch { }
          }
          if (descriptions.length === 0) {
            descriptions = [appearance.description || '']
          }

          const prompt = descriptions[imageIndex]
          if (!prompt) {
            throw new Error('Description not found')
          }

          // 获取旧图片
          let imageUrls: (string | null)[] = []
          if (appearance.imageUrls) {
            try { imageUrls = JSON.parse(appearance.imageUrls) } catch { }
          }
          const oldImageKey = imageUrls[imageIndex] || ''

          // 使用事务原子性设置生成状态
          await prisma.$transaction(async (tx) => {
            const currentAppearance = await (tx as any).characterAppearance.findUnique({
              where: { id: appearance.id }
            })
            if (currentAppearance?.generating) {
              throw new Error('该形象正在生成中，请稍候...')
            }
            await (tx as any).characterAppearance.update({
              where: { id: appearance.id },
              data: { generating: true }
            })
          })

          try {
            // 🔥 实时从常量获取风格 prompt
            const artStylePrompt = getArtStylePrompt(novelPromotionData.artStyle)
            const seedreamModel = selectedModel === 'seedream4' ? 'doubao-seedream-4-0-250828' : 'doubao-seedream-4-5-251128'

            const fullPrompt = artStylePrompt
              ? `${addCharacterPromptSuffix(prompt)}，${artStylePrompt}`
              : addCharacterPromptSuffix(prompt)

            console.log(`Regenerating single character image ${imageIndex + 1} for "${appearance.character.name}"`)

            const newImageKey = await generateSingleImage(
              session.user.id,  // 🔥 传入真实用户ID
              fullPrompt, selectedModel, seedreamModel,
              `char-${id}-${appearanceId}-v${imageIndex}`,
              `${appearance.character.name} - ${appearance.changeReason}`,
              'character'
            )

            if (!newImageKey) {
              throw new Error('图片生成失败')
            }

            // 检测异步返回
            if (newImageKey.startsWith('ASYNC:')) {
              // 解析异步任务类型和ID
              const asyncParts = newImageKey.substring(6)  // 移除 "ASYNC:"
              const isGeminiBatch = asyncParts.startsWith('GEMINI_BATCH:')
              const externalId = isGeminiBatch
                ? asyncParts.substring('GEMINI_BATCH:'.length)  // 提取 batchName
                : asyncParts  // FAL 格式: FAL:endpoint:requestId

              // 创建异步任务记录
              await createAsyncTask({
                type: isGeminiBatch ? TASK_TYPES.IMAGE_GEMINI_BATCH : TASK_TYPES.IMAGE_CHARACTER,
                targetId: appearance.id,
                targetType: 'CharacterAppearance',
                externalId,
                payload: { prompt: fullPrompt, model: selectedModel },
                userId: session.user.id
              })
              await (prisma as any).characterAppearance.update({
                where: { id: appearance.id },
                data: { generating: true }
              })
              return {
                success: true,
                async: true,
                message: '图片生成任务已提交，请稍后查看'
              }
            }

            // 删除旧图片
            if (oldImageKey) {
              try { await deleteCOSObject(oldImageKey) } catch { }
            }

            // 使用事务原子性更新结果并清除生成状态
            await prisma.$transaction(async (tx) => {
              imageUrls[imageIndex] = newImageKey

              const selectedIndex = appearance.selectedIndex
              const shouldUpdateImageUrl =
                selectedIndex === imageIndex ||
                (selectedIndex === null && imageIndex === 0) ||
                imageUrls.length === 1

              const updateData: any = {
                imageUrls: JSON.stringify(imageUrls),
                generating: false
              }

              if (shouldUpdateImageUrl) {
                updateData.imageUrl = newImageKey
              }

              await (tx as any).characterAppearance.update({
                where: { id: appearance.id },
                data: updateData
              })
            })

            return {
              success: true,
              imageUrl: getSignedUrl(newImageKey, 7 * 24 * 3600),
              imageIndex
            }
          } catch (error: any) {
            // 重置生成状态
            await prisma.$transaction(async (tx) => {
              await (tx as any).characterAppearance.update({
                where: { id: appearance.id },
                data: { generating: false }
              })
            }).catch(() => { })
            throw error
          }
        }
      )

      return NextResponse.json(result)

    } else if (type === 'location') {
      // 新结构：使用独立的 LocationImage 表
      const locationImage = await (prisma as any).locationImage.findFirst({
        where: { locationId: id, imageIndex },
        include: { location: true }
      })

      if (!locationImage) {
        throw new ApiError('NOT_FOUND', { message: 'Location image not found' })
      }

      // 检查是否正在生成（防止并发冲突）
      if (locationImage.generating) {
        throw new ApiError('CONFLICT', { message: '该场景图片正在生成中，请稍候...' })
      }

      const selectedModel = novelPromotionData.locationModel
      if (!selectedModel) {
        throw new ApiError('INVALID_PARAMS', { message: '请先在项目设置中配置"场景图像模型"' })
      }

      // 使用 withImageBilling 包装整个生成逻辑
      const result = await withImageBilling(
        session.user.id,
        selectedModel,
        1,
        {
          projectId,
          action: 'single_location_image_regenerate',
          metadata: {
            locationId: id,
            locationName: locationImage.location.name,
            imageIndex
          }
        },
        async () => {
          const prompt = locationImage.description
          if (!prompt) {
            throw new Error('Description not found')
          }

          const oldImageKey = locationImage.imageUrl || ''

          // 使用事务原子性设置生成状态
          await prisma.$transaction(async (tx) => {
            const currentLocationImage = await (tx as any).locationImage.findUnique({
              where: { id: locationImage.id }
            })
            if (currentLocationImage?.generating) {
              throw new Error('该场景图片正在生成中，请稍候...')
            }
            await (tx as any).locationImage.update({
              where: { id: locationImage.id },
              data: { generating: true }
            })
          })

          try {
            // 🔥 实时从常量获取风格 prompt
            const artStylePrompt = getArtStylePrompt(novelPromotionData.artStyle)
            const seedreamModel = selectedModel === 'seedream4' ? 'doubao-seedream-4-0-250828' : 'doubao-seedream-4-5-251128'

            const fullPrompt = artStylePrompt
              ? `${addLocationPromptSuffix(prompt)}，${artStylePrompt}`
              : addLocationPromptSuffix(prompt)

            console.log(`Regenerating single location image ${imageIndex + 1} for "${locationImage.location.name}"`)

            const newImageKey = await generateSingleImage(
              session.user.id,  // 🔥 传入真实用户ID
              fullPrompt, selectedModel, seedreamModel,
              `loc-${id}-v${imageIndex}`,
              locationImage.location.name,
              'location'
            )

            if (!newImageKey) {
              throw new Error('图片生成失败')
            }

            // 检测异步返回
            if (newImageKey.startsWith('ASYNC:')) {
              // 解析异步任务类型和ID
              const asyncParts = newImageKey.substring(6)  // 移除 "ASYNC:"
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

              // 创建异步任务记录
              await createAsyncTask({
                type: isGeminiBatch ? TASK_TYPES.IMAGE_GEMINI_BATCH : TASK_TYPES.IMAGE_LOCATION,
                targetId: locationImage.id,
                targetType: 'LocationImage',
                externalId,
                payload: { prompt: fullPrompt, model: selectedModel },
                userId: session.user.id
              })
              await (prisma as any).locationImage.update({
                where: { id: locationImage.id },
                data: { generating: true }
              })
              return {
                success: true,
                async: true,
                message: '图片生成任务已提交，请稍后查看'
              }
            }

            // 删除旧图片
            if (oldImageKey) {
              try { await deleteCOSObject(oldImageKey) } catch { }
            }

            // 使用事务原子性更新结果并清除生成状态
            await prisma.$transaction(async (tx) => {
              await (tx as any).locationImage.update({
                where: { id: locationImage.id },
                data: { imageUrl: newImageKey, generating: false }
              })
            })

            return {
              success: true,
              imageUrl: getSignedUrl(newImageKey, 7 * 24 * 3600),
              imageIndex
            }
          } catch (error: any) {
            // 重置生成状态
            await prisma.$transaction(async (tx) => {
              await (tx as any).locationImage.update({
                where: { id: locationImage.id },
                data: { generating: false }
              })
            }).catch(() => { })
            throw error
          }
        }
      )

      return NextResponse.json(result)

    } else {
      throw new ApiError('INVALID_PARAMS', { message: 'Invalid type' })
    }
  } catch (error: any) {
    // 处理 billing 错误
    const billingError = handleBillingError(error)
    if (billingError) return billingError
    throw error  // 重新抛出让 apiHandler 处理
  }
})

async function generateSingleImage(
  userId: string,  // 🔥 添加 userId 参数
  fullPrompt: string,
  selectedModel: string,
  seedreamModel: string,
  keyPrefix: string,
  labelText: string,
  assetType: 'character' | 'location' = 'character',
  retry = false
): Promise<string | null> {
  try {
    const prompt = retry ? await desensitizePrompt(userId, fullPrompt) : fullPrompt
    let tempImageUrl: string | undefined

    // 根据类型选择不同的图片尺寸
    const imageSize = assetType === 'character' ? '3840x2160' : '2160x2160'

    // ✅ 使用统一的新架构生成图片
    console.log(`[单图重生成] 使用模型: ${selectedModel}`)

    const result = await generateImage(
      userId,  // 🔥 使用真实用户ID
      selectedModel,
      prompt,
      {
        aspectRatio: assetType === 'character' ? '16:9' : '1:1',
        resolution: await getModelResolution(userId, selectedModel)
      }
    )

    if (!result.success) {
      console.error(`[单图重生成失败] ${selectedModel}: ${result.error}`)
      if (!retry && result.error?.includes('Sensitive')) {
        return generateSingleImage(userId, fullPrompt, selectedModel, seedreamModel, keyPrefix, labelText, assetType, true)
      }
      return null
    }

    // 检测异步返回
    if (result.async && result.externalId) {
      // 🔥 使用生成器返回的标准格式 externalId（不再手动构造）
      return `ASYNC:${result.externalId}`
    }

    // 处理不同的返回格式
    if (result.imageBase64) {
      // Base64格式（如 Gemini）
      const imageBuffer = Buffer.from(result.imageBase64, 'base64')
      const cosKey = generateUniqueKey(keyPrefix, 'jpg')
      await uploadToCOS(imageBuffer, cosKey)
      tempImageUrl = getSignedUrl(cosKey, 3600)
    } else if (result.imageUrl) {
      // URL格式（如 FAL/ARK）
      tempImageUrl = result.imageUrl
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
