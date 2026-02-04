import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { downloadAndUploadToCOS, generateUniqueKey, imageUrlToBase64, getSignedUrl, uploadToCOS } from '@/lib/cos'
import { generateImage } from '@/lib/generator-api'
import { getModelResolution } from '@/lib/api-config'
import { logAIAnalysis } from '@/lib/logger'
import { recordImageUsage, handleBillingError } from '@/lib/pricing'
import { chatCompletionWithVision, getCompletionContent } from '@/lib/llm-client'
import { removeCharacterPromptSuffix } from '@/lib/constants'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { initializeFonts, createLabelSVG } from '@/lib/fonts'
import { fetchWithTimeoutAndRetry } from '@/lib/ark-api'
import { createAsyncTask, TASK_TYPES } from '@/lib/async-task-manager'
import { getProjectModelConfig } from '@/lib/config-service'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/novel-promotion/[projectId]/modify-asset-image
 * 统一的资产图片编辑接口（支持人物和场景）
 * 
 * 请求体：
 * - type: 'character' | 'location'
 * - modifyPrompt: string (用户的修改指令)
 * - extraImageUrls?: string[] (额外的参考图片URL)
 * 
 * 人物专用字段：
 * - characterId: string
 * - appearanceId: string (UUID)
 * - imageIndex: number
 * 
 * 场景专用字段：
 * - locationId: string
 * - imageIndex: number
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔥 提前解析 body，避免在 catch 块中无法读取已消费的 request
  let body: any = {}
  try {
    body = await request.json()
  } catch (e) {
    throw new ApiError('INVALID_PARAMS', { message: 'Invalid JSON body' })
  }

  // 由于有 billing 和状态重置的复杂逻辑，保留内部 try-catch
  try {
    // 初始化字体（在 Vercel 环境中需要）
    await initializeFonts()

    // 🔐 统一权限验证
    const authResult = await requireProjectAuth(projectId)
    if (isErrorResponse(authResult)) return authResult
    const session = authResult.session
    const project = authResult.project
    const novelPromotionData = authResult.novelData

    const { type, modifyPrompt, extraImageUrls } = body

    if (!type || !modifyPrompt) {
      throw new ApiError('INVALID_PARAMS', { message: 'Missing required fields: type, modifyPrompt' })
    }

    if (type !== 'character' && type !== 'location') {
      throw new ApiError('INVALID_PARAMS', { message: 'Invalid type. Must be "character" or "location"' })
    }

    // 🔥 使用统一配置服务获取模型配置
    const modelConfig = await getProjectModelConfig(projectId, session.user.id)
    if (!modelConfig.editModel) {
      throw new ApiError('INVALID_PARAMS', {
        message: '请先在项目设置中配置"修图/编辑模型"或"分镜图像模型"'
      })
    }
    const editModelConfig = modelConfig.editModel

    let currentImageKey: string
    let assetName: string
    let updateCallback: (cosKey: string, newDescription?: string) => Promise<void>
    let usageType: string
    let usageMetadata: Record<string, any>
    let currentDescription: string | null = null  // 用于人物描述词更新
    let descriptionIndex: number | undefined = undefined  // 多描述时的索引
    let appearanceRecord: any = null  // 保存形象记录用于后续更新
    let charImageUrls: string[] = []  // 🔥 提升作用域，用于异步任务记录
    let locationImageRecord: any = null  // 🔥 提升作用域，用于场景异步任务记录

    if (type === 'character') {
      // 人物图片编辑
      const { characterId, appearanceId, imageIndex } = body

      if (!characterId || !appearanceId || imageIndex === undefined) {
        return NextResponse.json({ error: 'Missing required fields for character: characterId, appearanceId, imageIndex' }, { status: 400 })
      }

      const character = await (prisma as any).novelPromotionCharacter.findUnique({
        where: { id: characterId },
        include: { appearances: { orderBy: { appearanceIndex: 'asc' } } }
      })

      if (!character) {
        return NextResponse.json({ error: 'Character not found' }, { status: 404 })
      }

      // 使用 UUID 直接查找 appearance
      const appearance = character.appearances.find((a: any) => a.id === appearanceId)
      if (!appearance) {
        return NextResponse.json({ error: 'Character appearance not found' }, { status: 404 })
      }

      // 保存形象记录用于后续描述词更新
      appearanceRecord = appearance

      // 解析 imageUrls（兼容单图模式）
      try {
        if (appearance.imageUrls) {
          charImageUrls = typeof appearance.imageUrls === 'string'
            ? JSON.parse(appearance.imageUrls)
            : appearance.imageUrls
        }
      } catch (e) {
        console.error('Failed to parse imageUrls:', e)
        charImageUrls = []
      }

      // 🔥 兼容单图模式：如果 imageUrls 为空但有 imageUrl，则用 imageUrl
      if (charImageUrls.length === 0 && appearance.imageUrl) {
        charImageUrls = [appearance.imageUrl]
      }

      // 兼容旧代码的 imageUrls 变量
      const imageUrls = charImageUrls

      currentImageKey = imageUrls[imageIndex]
      if (!currentImageKey) {
        return NextResponse.json({ error: 'No image to modify at this index' }, { status: 400 })
      }

      // 获取当前描述词（用于后续更新）
      // 优先使用 descriptions 数组中的对应项，否则使用 description
      if (appearance.descriptions) {
        try {
          const descriptions = typeof appearance.descriptions === 'string'
            ? JSON.parse(appearance.descriptions)
            : appearance.descriptions
          if (descriptions && descriptions[imageIndex]) {
            currentDescription = descriptions[imageIndex]
            descriptionIndex = imageIndex
          } else {
            currentDescription = appearance.description
          }
        } catch (e) {
          currentDescription = appearance.description
        }
      } else {
        currentDescription = appearance.description
      }

      assetName = character.name
      usageType = 'character_edit'
      usageMetadata = { characterId, characterName: character.name }

      // 🔥 立即设置 generating 状态，让前端显示"修改中"
      await (prisma as any).characterAppearance.update({
        where: { id: appearance.id },
        data: { generating: true }
      })

      updateCallback = async (cosKey: string, newDescription?: string) => {
        const newImageUrls = [...imageUrls]
        newImageUrls[imageIndex] = cosKey

        // 构建更新数据
        const updateData: any = {
          imageUrls: JSON.stringify(newImageUrls),
          previousImageUrl: appearance.imageUrl || null,
          previousImageUrls: appearance.imageUrls || null,
          // 🔥 同时保存旧的描述词，支持撤回时同步恢复
          previousDescription: appearance.description || null,
          previousDescriptions: appearance.descriptions || null
        }

        // 🔥 关键修复：同步更新 imageUrl 字段
        // 当修改的图片是当前选中的图片时，或者是第一张图片且没有选中任何图片时
        // 需要同时更新 imageUrl 以确保分镜生成等功能能获取到最新图片
        const selectedIndex = appearance.selectedIndex
        const shouldUpdateImageUrl =
          selectedIndex === imageIndex ||  // 修改的是选中的图片
          (selectedIndex === null && imageIndex === 0) ||  // 没有选中任何图片，修改的是第一张
          imageUrls.length === 1  // 只有一张图片

        if (shouldUpdateImageUrl) {
          updateData.imageUrl = cosKey
          console.log(`[角色编辑] 同步更新 imageUrl (selectedIndex=${selectedIndex}, imageIndex=${imageIndex})`)
        }

        // 如果有新的描述词，也更新描述词
        if (newDescription) {
          if (descriptionIndex !== undefined && appearance.descriptions) {
            // 更新 descriptions 数组中的对应项
            try {
              const descriptions = typeof appearance.descriptions === 'string'
                ? JSON.parse(appearance.descriptions)
                : [...appearance.descriptions]
              descriptions[descriptionIndex] = newDescription
              updateData.descriptions = JSON.stringify(descriptions)
              // 如果更新的是第一个，同时更新 description
              if (descriptionIndex === 0) {
                updateData.description = newDescription
              }
            } catch (e) {
              // 如果解析失败，只更新 description
              updateData.description = newDescription
            }
          } else {
            // 只更新 description
            updateData.description = newDescription
          }
        }

        await (prisma as any).characterAppearance.update({
          where: { id: appearance.id },
          data: {
            ...updateData,
            generating: false  // 🔥 清除生成中状态
          }
        })
        console.log(`[数据库更新] "${character.name}" 形象${appearanceId}: generating=false, 编辑完成`)
      }

      // 记录日志
      logAIAnalysis(session.user.id, session.user.name, projectId, project.name, {
        action: 'MODIFY_CHARACTER_IMAGE' as any,
        input: {
          characterId,
          characterName: character.name,
          appearanceId,
          imageIndex,
          modifyPrompt,
          extraImageCount: extraImageUrls?.length || 0,
          editModel: editModelConfig
        },
        model: editModelConfig
      })

    } else {
      // 场景图片编辑
      const { locationId, imageIndex } = body

      if (!locationId || imageIndex === undefined) {
        return NextResponse.json({ error: 'Missing required fields for location: locationId, imageIndex' }, { status: 400 })
      }

      const location = await (prisma as any).novelPromotionLocation.findUnique({
        where: { id: locationId },
        include: { images: { orderBy: { imageIndex: 'asc' } } }
      })

      if (!location) {
        return NextResponse.json({ error: 'Location not found' }, { status: 404 })
      }

      // 使用 find 根据 imageIndex 字段查找图片
      const locationImage = location.images.find((img: any) => img.imageIndex === imageIndex)
      if (!locationImage) {
        return NextResponse.json({ error: 'Location image not found at this index' }, { status: 404 })
      }

      // 🔥 保存到外部变量，供异步任务创建时使用
      locationImageRecord = locationImage

      currentImageKey = locationImage.imageUrl
      if (!currentImageKey) {
        return NextResponse.json({ error: 'No image to modify' }, { status: 400 })
      }

      // 获取当前描述词（用于后续更新）
      currentDescription = locationImage.description

      assetName = location.name
      usageType = 'location_edit'
      usageMetadata = { locationId, locationName: location.name }

      // 🔥 立即设置 generating 状态，让前端显示"修改中"
      await (prisma as any).locationImage.update({
        where: { id: locationImage.id },
        data: { generating: true }
      })

      updateCallback = async (cosKey: string, newDescription?: string) => {
        // 构建更新数据
        const updateData: any = {
          imageUrl: cosKey,
          previousImageUrl: locationImage.imageUrl || null,
          // 🔥 同时保存旧的描述词，支持撤回时同步恢复
          previousDescription: locationImage.description || null
        }

        // 如果有新的描述词，也更新描述词
        if (newDescription) {
          updateData.description = newDescription
        }

        await (prisma as any).locationImage.update({
          where: { id: locationImage.id },
          data: {
            ...updateData,
            generating: false  // 🔥 清除生成中状态
          }
        })
        console.log(`[数据库更新] "${location.name}" 场景图${imageIndex}: generating=false, 编辑完成`)
      }

      // 记录日志
      logAIAnalysis(session.user.id, session.user.name, projectId, project.name, {
        action: 'MODIFY_LOCATION_IMAGE' as any,
        input: {
          locationId,
          locationName: location.name,
          imageIndex,
          modifyPrompt,
          extraImageCount: extraImageUrls?.length || 0,
          editModel: editModelConfig
        },
        model: editModelConfig
      })
    }

    // ========== 第一步：裁剪掉顶部黑边标签 ==========
    // 下载原图（使用带超时和重试的fetch）
    const signedOriginalUrl = getSignedUrl(currentImageKey, 3600)
    const originalResponse = await fetchWithTimeoutAndRetry(signedOriginalUrl, { logPrefix: `[下载原图]` })
    if (!originalResponse.ok) {
      throw new Error('Failed to download original image')
    }
    const originalBuffer = Buffer.from(await originalResponse.arrayBuffer())

    // 获取图片元数据
    const meta = await sharp(originalBuffer).metadata()
    const originalWidth = meta.width || 2160
    const originalHeight = meta.height || 2160

    // 计算标签条高度（与生成时一致：高度的 4%）
    const fontSize = Math.floor(originalHeight * 0.04)
    const pad = Math.floor(fontSize * 0.5)
    const barH = fontSize + pad * 2

    // 裁剪掉顶部的黑边标签，得到纯净图片
    const croppedBuffer = await sharp(originalBuffer)
      .extract({ left: 0, top: barH, width: originalWidth, height: originalHeight - barH })
      .toBuffer()

    console.log(`[${type}编辑] 已裁剪顶部标签，原尺寸 ${originalWidth}x${originalHeight}，标签高度 ${barH}`)

    // ========== 计算原图的比例（裁剪后的纯内容比例）==========
    const croppedWidth = originalWidth
    const croppedHeight = originalHeight - barH

    // 计算最接近的标准比例
    const ratio = croppedWidth / croppedHeight
    let aspectRatio: string
    let size: string

    if (ratio > 1.4) {
      // 横版 3:2 (1.5)
      aspectRatio = '3:2'
      size = '2048x1365'
    } else if (ratio > 1.1) {
      // 横版 4:3 (1.33)
      aspectRatio = '4:3'
      size = '2048x1536'
    } else if (ratio > 0.9) {
      // 接近正方形 1:1
      aspectRatio = '1:1'
      size = '2048x2048'
    } else if (ratio > 0.65) {
      // 竖版 3:4 (0.75)
      aspectRatio = '3:4'
      size = '1536x2048'
    } else {
      // 竖版 9:16 (0.5625)
      aspectRatio = '9:16'
      size = '1152x2048'
    }

    console.log(`[${type}编辑] 裁剪后尺寸 ${croppedWidth}x${croppedHeight}，比例 ${ratio.toFixed(2)}，使用 ${aspectRatio} (${size})`)

    // 将裁剪后的图片上传到临时位置，供模型使用
    const tempKey = generateUniqueKey(`${type}-temp-cropped-${Date.now()}`, 'jpg')
    const croppedJpeg = await sharp(croppedBuffer).jpeg({ quality: 95 }).toBuffer()
    await uploadToCOS(croppedJpeg, tempKey)
    const croppedImageUrl = getSignedUrl(tempKey, 3600)

    // ========== 第二步：调用模型编辑 ==========
    // 构建编辑提示词 - 强调保持原图结构不变
    const prompt = `你是一个专业的${type === 'character' ? '角色' : '场景'}图片编辑专家。请根据以下指令精确修改图片：

【⚠️ 严格保持原图结构】
这是一张资产设定图，具有特定的布局结构。除非用户要求，你必须严格保持原图的整体结构，构图，分镜不变！
- 不得改变原图的分区布局和比例
- 不得移动、缩放或重新排列任何元素的位置
- 不得改变任何元素的朝向和姿势
- 只在用户指定的部分进行修改

【核心原则】
1. 只修改用户明确指定要修改的部分，其他所有内容必须100%保持原样
2. 保持原图的构图、布局、分区比例完全不变
3. 保持${type === 'character' ? '人物的面部特征、五官、神态、体型、姿势' : '场景的整体风格、氛围、透视关系'}一致
4. 不要添加任何文字、水印或标识
5. 保持图片的分辨率和比例不变

【用户修改指令】
${modifyPrompt}

请严格按照用户指令，只对指定部分进行修改，确保构图结构和其他内容与原图完全一致。`

    let newImageUrl: string

    if (editModelConfig === 'banana') {
      // 使用裁剪后的图片作为输入
      const inputImageUrls = [croppedImageUrl]
      if (extraImageUrls?.length) {
        inputImageUrls.push(...extraImageUrls)
      }

      // ✅ 使用统一的新架构生成图片
      // 🔥 传入精确的像素尺寸，避免比例变化
      const croppedSize = `${croppedWidth}x${croppedHeight}`
      const result = await generateImage(
        session.user.id,
        'banana',
        prompt,
        {
          referenceImages: inputImageUrls,
          aspectRatio,
          size: croppedSize,  // 🔥 保持原图精确比例
          resolution: await getModelResolution(session.user.id, 'banana')
        }
      )

      if (!result.success) {
        throw new Error(`图片生成失败: ${result.error}`)
      }

      // 检测异步返回
      if (result.async && result.requestId) {
        // 创建异步任务记录
        const externalId = `FAL:${result.endpoint}:${result.requestId}`
        if (type === 'character' && appearanceRecord) {
          await createAsyncTask({
            type: TASK_TYPES.IMAGE_CHARACTER,
            targetId: appearanceRecord.id,
            targetType: 'CharacterAppearance',
            externalId,
            userId: session.user.id,  // 🔥 传递 userId 用于获取 API Key
            payload: {
              prompt,
              model: 'banana',
              action: 'modify',
              // 🔥 保存标签信息用于异步完成时添加黑边
              labelInfo: {
                assetName: assetName,
                changeReason: appearanceRecord.changeReason
              },
              // 🔥 保存 imageIndex 和 imageUrls 用于正确更新数组
              imageIndex: body.imageIndex,
              currentImageUrls: charImageUrls,
              selectedIndex: appearanceRecord.selectedIndex
            }
          })
          await (prisma as any).characterAppearance.update({
            where: { id: appearanceRecord.id },
            data: { generating: true }
          })
        } else if (type === 'location') {
          // location图片也使用新的AsyncTask系统
          // 🔥 修复：使用外部作用域的 locationImageRecord，而不是 body.locationImage
          if (locationImageRecord) {
            await createAsyncTask({
              type: TASK_TYPES.IMAGE_LOCATION,
              targetId: locationImageRecord.id,
              targetType: 'LocationImage',
              externalId,
              userId: session.user.id,  // 🔥 传递 userId 用于获取 API Key
              payload: {
                prompt,
                model: 'banana',
                action: 'modify',
                // 🔥 保存标签信息
                labelInfo: {
                  assetName: assetName
                }
              }
            })
            await (prisma as any).locationImage.update({
              where: { id: locationImageRecord.id },
              data: { generating: true }
            })
          }
        }

        // ========== 异步任务提交后，立即更新描述词（不需要等待图片生成完成）==========
        let asyncUpdatedDescription: string | undefined = undefined

        // 日志：记录描述词更新开始
        logAIAnalysis(session.user.id, session.user.name, projectId, project.name, {
          action: 'UPDATE_DESCRIPTION_ASYNC_START' as any,
          input: {
            type,
            hasCurrentDescription: !!currentDescription,
            currentDescriptionPreview: currentDescription?.substring(0, 50) + '...',
            modifyPrompt,
            extraImageCount: extraImageUrls?.length || 0
          },
          model: novelPromotionData.analysisModel || 'unknown'
        })

        if (currentDescription) {
          try {
            const assetType = type === 'character' ? '角色' : '场景'
            console.log(`[${assetType}编辑-异步] 开始更新描述词...`)

            // 根据资产类型选择提示词模板
            const promptFileName = type === 'character'
              ? 'character_description_update.txt'
              : 'location_description_update.txt'
            const promptPath = path.join(process.cwd(), 'lib/prompts/novel-promotion', promptFileName)
            let promptTemplate = fs.readFileSync(promptPath, 'utf-8')

            // 移除描述词中的系统后缀（仅人物需要）
            const cleanDescription = type === 'character'
              ? removeCharacterPromptSuffix(currentDescription)
              : currentDescription

            // 构建图片上下文（如果有参考图片）
            let imageContext = ''
            if (extraImageUrls && extraImageUrls.length > 0) {
              if (type === 'character') {
                imageContext = '【参考图片】\n请仔细分析以下参考图片的内容，识别其中的关键视觉特征（如服装款式、颜色、材质、配饰等），并将这些特征融入更新后的描述中。'
              } else {
                imageContext = '【参考图片】\n请仔细分析以下参考图片的内容，识别其中的关键视觉特征（如建筑风格、装饰元素、光线氛围、色调等），并将这些特征融入更新后的描述中。'
              }
            }

            // 替换占位符
            const finalDescPrompt = promptTemplate
              .replace('{location_name}', assetName)
              .replace('{original_description}', cleanDescription)
              .replace('{modify_instruction}', modifyPrompt)
              .replace('{image_context}', imageContext)

            // 选择视觉模型（使用用户配置的分析模型）
            const analysisModel = novelPromotionData.analysisModel

            // 调用 AI 更新描述词（带视觉能力，支持参考图片）
            const completion = await chatCompletionWithVision(
              session.user.id,
              analysisModel,
              finalDescPrompt,
              extraImageUrls,  // 传入参考图片
              { temperature: 0.7, reasoning: false }
            )

            const responseText = getCompletionContent(completion)

            // 解析 JSON 响应
            try {
              let cleanedResponse = responseText.trim()
              if (cleanedResponse.startsWith('```json')) {
                cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '')
              } else if (cleanedResponse.startsWith('```')) {
                cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '')
              }

              const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/)
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0])
                if (parsed.prompt) {
                  asyncUpdatedDescription = parsed.prompt
                  console.log(`[${assetType}编辑-异步] 描述词更新成功:`, asyncUpdatedDescription?.substring(0, 50) + '...')

                  // 日志：记录描述词更新成功
                  logAIAnalysis(session.user.id, session.user.name, projectId, project.name, {
                    action: 'UPDATE_DESCRIPTION_ASYNC_SUCCESS' as any,
                    input: {
                      type,
                      originalDescription: currentDescription?.substring(0, 100) + '...',
                      newDescription: asyncUpdatedDescription?.substring(0, 100) + '...'
                    },
                    output: { success: true },
                    model: analysisModel
                  })
                }
              }
            } catch (parseError) {
              console.error(`[${assetType}编辑-异步] 解析描述词更新响应失败:`, parseError)

              // 日志：记录解析失败
              logAIAnalysis(session.user.id, session.user.name, projectId, project.name, {
                action: 'UPDATE_DESCRIPTION_ASYNC_PARSE_ERROR' as any,
                input: { type, rawResponse: responseText?.substring(0, 200) },
                output: { error: String(parseError) },
                model: analysisModel
              })
            }
          } catch (descError) {
            console.error(`[${type === 'character' ? '角色' : '场景'}编辑-异步] 更新描述词失败:`, descError)

            // 日志：记录描述词更新失败
            logAIAnalysis(session.user.id, session.user.name, projectId, project.name, {
              action: 'UPDATE_DESCRIPTION_ASYNC_ERROR' as any,
              input: { type, modifyPrompt },
              output: { error: String(descError) },
              model: novelPromotionData.analysisModel || 'unknown'
            })
          }
        } else {
          // 日志：没有描述词，跳过更新
          logAIAnalysis(session.user.id, session.user.name, projectId, project.name, {
            action: 'UPDATE_DESCRIPTION_ASYNC_SKIPPED' as any,
            input: { type, reason: 'currentDescription is empty or null' },
            model: 'N/A'
          })
        }

        // 如果描述词更新成功，保存到数据库
        if (asyncUpdatedDescription) {
          if (type === 'character' && appearanceRecord) {
            const updateData: any = {}
            if (descriptionIndex !== undefined && appearanceRecord.descriptions) {
              // 更新 descriptions 数组中的对应项
              try {
                const descriptions = typeof appearanceRecord.descriptions === 'string'
                  ? JSON.parse(appearanceRecord.descriptions)
                  : [...appearanceRecord.descriptions]
                descriptions[descriptionIndex] = asyncUpdatedDescription
                updateData.descriptions = JSON.stringify(descriptions)
                // 如果更新的是第一个，同时更新 description
                if (descriptionIndex === 0) {
                  updateData.description = asyncUpdatedDescription
                }
              } catch (e) {
                // 如果解析失败，只更新 description
                updateData.description = asyncUpdatedDescription
              }
            } else {
              // 只更新 description
              updateData.description = asyncUpdatedDescription
            }

            if (Object.keys(updateData).length > 0) {
              await (prisma as any).characterAppearance.update({
                where: { id: appearanceRecord.id },
                data: updateData
              })
              console.log(`[角色编辑-异步] 描述词已保存到数据库`)

              // 日志：记录数据库保存成功
              logAIAnalysis(session.user.id, session.user.name, projectId, project.name, {
                action: 'UPDATE_DESCRIPTION_ASYNC_DB_SAVED' as any,
                input: { type: 'character', appearanceId: appearanceRecord.id },
                output: { saved: true, newDescription: asyncUpdatedDescription?.substring(0, 100) + '...' },
                model: 'N/A'
              })
            }
          } else if (type === 'location') {
            // 场景描述词更新需要找到对应的 locationImage
            const { locationId, imageIndex: locImageIndex } = body
            const location = await (prisma as any).novelPromotionLocation.findUnique({
              where: { id: locationId },
              include: { images: { orderBy: { imageIndex: 'asc' } } }
            })
            if (location) {
              const locationImage = location.images.find((img: any) => img.imageIndex === locImageIndex)
              if (locationImage) {
                await (prisma as any).locationImage.update({
                  where: { id: locationImage.id },
                  data: { description: asyncUpdatedDescription }
                })
                console.log(`[场景编辑-异步] 描述词已保存到数据库`)
              }
            }
          }
        }

        return NextResponse.json({
          success: true,
          async: true,
          message: '图片编辑任务已提交，请稍后查看',
          descriptionUpdated: !!asyncUpdatedDescription,
          newDescription: asyncUpdatedDescription
        })
      }

      newImageUrl = result.imageUrl!
    } else {
      // 🔥 使用新的统一图片生成 API（支持 gemini, seedream 等）
      const inputImageUrls = [croppedImageUrl]
      if (extraImageUrls?.length) {
        inputImageUrls.push(...extraImageUrls)
      }

      // 🔥 传入精确的像素尺寸，避免比例变化
      const croppedSize = `${croppedWidth}x${croppedHeight}`
      const result = await generateImage(
        session.user.id,
        editModelConfig,
        prompt,
        {
          referenceImages: inputImageUrls,
          aspectRatio,
          size: croppedSize,  // 🔥 保持原图精确比例
          resolution: await getModelResolution(session.user.id, editModelConfig)
        }
      )

      if (!result.success) {
        throw new Error(`图片生成失败: ${result.error}`)
      }

      // 检测异步返回
      if (result.async && result.requestId) {
        // 构建 externalId
        let externalId: string
        let model: string

        if (editModelConfig.includes('gemini') && editModelConfig.includes('batch')) {
          // Gemini Batch: 使用 batchName 格式
          externalId = result.requestId
          model = 'gemini-3-pro-image-preview-batch'
        } else {
          // FAL 或其他: 使用 FAL:endpoint:requestId 格式
          externalId = `FAL:${result.endpoint}:${result.requestId}`
          model = editModelConfig
        }

        if (type === 'character' && appearanceRecord) {
          await createAsyncTask({
            type: TASK_TYPES.IMAGE_CHARACTER,
            targetId: appearanceRecord.id,
            targetType: 'CharacterAppearance',
            externalId,
            userId: session.user.id,  // 🔥 传递 userId 用于获取 API Key
            payload: {
              prompt,
              model,
              action: 'modify',
              labelInfo: {
                assetName: assetName,
                changeReason: appearanceRecord.changeReason
              },
              imageIndex: body.imageIndex,
              currentImageUrls: charImageUrls,
              selectedIndex: appearanceRecord.selectedIndex
            }
          })
          await (prisma as any).characterAppearance.update({
            where: { id: appearanceRecord.id },
            data: { generating: true }
          })
        } else if (type === 'location' && locationImageRecord) {
          await createAsyncTask({
            type: TASK_TYPES.IMAGE_LOCATION,
            targetId: locationImageRecord.id,
            targetType: 'LocationImage',
            externalId,
            userId: session.user.id,  // 🔥 传递 userId 用于获取 API Key
            payload: {
              prompt,
              model,
              action: 'modify',
              labelInfo: {
                assetName: assetName
              }
            }
          })
          await (prisma as any).locationImage.update({
            where: { id: locationImageRecord.id },
            data: { generating: true }
          })
        }

        return NextResponse.json({
          success: true,
          async: true,
          message: '图片编辑任务已提交，请稍后查看'
        })
      }

      // 处理同步返回
      if (result.imageBase64) {
        // Base64 格式需要转换为 data URL
        newImageUrl = `data:image/png;base64,${result.imageBase64}`
      } else if (result.imageUrl) {
        newImageUrl = result.imageUrl
      } else {
        throw new Error('图片生成未返回 URL')
      }
    }

    // ========== 第三步：下载编辑后的图片并添加回黑边标签（使用带超时和重试的fetch）==========
    const editedResponse = await fetchWithTimeoutAndRetry(newImageUrl, { logPrefix: `[下载编辑后图片]` })
    if (!editedResponse.ok) {
      throw new Error('Failed to download edited image')
    }
    const editedBuffer = Buffer.from(await editedResponse.arrayBuffer())

    // 获取编辑后图片的尺寸
    const editedMeta = await sharp(editedBuffer).metadata()
    const editedWidth = editedMeta.width || originalWidth
    const editedHeight = editedMeta.height || (originalHeight - barH)

    // 重新计算新图片的标签高度（基于新图片高度 + 标签高度后的总高度）
    // 为了保持一致性，我们使用原图的标签高度比例
    const newTotalHeight = editedHeight + barH
    const newFontSize = Math.floor(newTotalHeight * 0.04)
    const newPad = Math.floor(newFontSize * 0.5)
    const newBarH = newFontSize + newPad * 2

    // 创建新的 SVG 标签条
    const svg = await createLabelSVG(editedWidth, newBarH, newFontSize, newPad, assetName)

    // 添加新标签条到图片顶部
    const finalBuffer = await sharp(editedBuffer)
      .extend({ top: newBarH, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
      .composite([{ input: svg, top: 0, left: 0 }])
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer()

    console.log(`[${type}编辑] 已添加回标签，最终尺寸 ${editedWidth}x${editedHeight + newBarH}`)

    // 上传最终图片到COS
    const key = generateUniqueKey(`${type}-modified-${Date.now()}`, 'jpg')
    const cosKey = await uploadToCOS(finalBuffer, key)

    // ========== 第四步：更新描述词（人物和场景资产）==========
    let updatedDescription: string | undefined = undefined

    if (currentDescription) {
      try {
        const assetType = type === 'character' ? '角色' : '场景'
        console.log(`[${assetType}编辑] 开始更新描述词...`)

        // 根据资产类型选择提示词模板
        const promptFileName = type === 'character'
          ? 'character_description_update.txt'
          : 'location_description_update.txt'
        const promptPath = path.join(process.cwd(), 'lib/prompts/novel-promotion', promptFileName)
        let promptTemplate = fs.readFileSync(promptPath, 'utf-8')

        // 移除描述词中的系统后缀（仅人物需要）
        const cleanDescription = type === 'character'
          ? removeCharacterPromptSuffix(currentDescription)
          : currentDescription

        // 构建图片上下文（如果有参考图片）
        let imageContext = ''
        if (extraImageUrls && extraImageUrls.length > 0) {
          if (type === 'character') {
            imageContext = '【参考图片】\n请仔细分析以下参考图片的内容，识别其中的关键视觉特征（如服装款式、颜色、材质、配饰等），并将这些特征融入更新后的描述中。'
          } else {
            imageContext = '【参考图片】\n请仔细分析以下参考图片的内容，识别其中的关键视觉特征（如建筑风格、装饰元素、光线氛围、色调等），并将这些特征融入更新后的描述中。'
          }
        }

        // 替换占位符
        const finalPrompt = promptTemplate
          .replace('{location_name}', assetName)
          .replace('{original_description}', cleanDescription)
          .replace('{modify_instruction}', modifyPrompt)
          .replace('{image_context}', imageContext)

        // 选择视觉模型（使用用户配置的分析模型）
        const analysisModel = novelPromotionData.analysisModel

        // 调用 AI 更新描述词（带视觉能力，支持参考图片）
        const completion = await chatCompletionWithVision(
          session.user.id,
          analysisModel,
          finalPrompt,
          extraImageUrls,  // 传入参考图片
          { temperature: 0.7, reasoning: false }
        )

        const responseText = getCompletionContent(completion)

        // 解析 JSON 响应
        try {
          let cleanedResponse = responseText.trim()
          if (cleanedResponse.startsWith('```json')) {
            cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '')
          } else if (cleanedResponse.startsWith('```')) {
            cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '')
          }

          const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            if (parsed.prompt) {
              updatedDescription = parsed.prompt
              console.log(`[${assetType}编辑] 描述词更新成功:`, updatedDescription?.substring(0, 50) + '...')
            }
          }
        } catch (parseError) {
          console.error(`[${assetType}编辑] 解析描述词更新响应失败:`, parseError)
          // 描述词更新失败不影响图片编辑结果
        }
      } catch (descError) {
        console.error(`[${type === 'character' ? '角色' : '场景'}编辑] 更新描述词失败:`, descError)
        // 描述词更新失败不影响图片编辑结果
      }
    }

    // 更新数据库（包含图片和描述词）
    await updateCallback(cosKey, updatedDescription)

    // 💰 记录计费
    await recordImageUsage(
      projectId,
      session.user.id,
      editModelConfig === 'banana' ? 'banana-2k' : editModelConfig,
      usageType,
      1,
      usageMetadata
    )

    // 返回签名URL
    const signedUrl = getSignedUrl(cosKey, 3600)

    return NextResponse.json({
      success: true,
      imageUrl: signedUrl,
      cosKey,
      descriptionUpdated: !!updatedDescription,
      newDescription: updatedDescription
    })

  } catch (error: any) {
    console.error('Modify asset image error:', error)

    // 🔥 重置 generating 状态，防止僵尸任务
    // 注意：body 已在函数开头解析并保存，这里直接使用
    try {
      if (body.type === 'character' && body.characterId && body.appearanceId) {
        await (prisma as any).characterAppearance.update({
          where: { id: body.appearanceId },
          data: { generating: false }
        })
        console.log(`[Modify Asset] 🔄 重置角色形象 generating 状态`)
      } else if (body.type === 'location' && body.locationId && body.imageIndex !== undefined) {
        const location = await (prisma as any).novelPromotionLocation.findUnique({
          where: { id: body.locationId },
          include: { images: true }
        })
        if (location) {
          const img = location.images.find((i: any) => i.imageIndex === body.imageIndex)
          if (img) {
            await (prisma as any).locationImage.update({
              where: { id: img.id },
              data: { generating: false }
            })
            console.log(`[Modify Asset] 🔄 重置场景图片 generating 状态`)
          }
        }
      }
    } catch (resetErr) {
      console.error('[Modify Asset] 重置 generating 状态失败:', resetErr)
    }

    const billingError = handleBillingError(error)
    if (billingError) return billingError
    throw error  // 重新抛出让 apiHandler 处理
  }
})

/**
 * 转义 XML 特殊字符
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

