import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateUniqueKey, getSignedUrl, uploadToCOS, imageUrlToBase64 } from '@/lib/cos'
import { addCharacterPromptSuffix, addLocationPromptSuffix, CHARACTER_IMAGE_SIZE, CHARACTER_IMAGE_BANANA_RATIO, LOCATION_IMAGE_SIZE, LOCATION_IMAGE_BANANA_RATIO, getArtStylePrompt } from '@/lib/constants'
import { chatCompletion } from '@/lib/llm-client'
import { generateImage } from '@/lib/generator-api'
import { recordImageUsage, calcImage, InsufficientBalanceError } from '@/lib/pricing'
import sharp from 'sharp'
import { initializeFonts, createLabelSVG } from '@/lib/fonts'
import { fetchWithTimeoutAndRetry } from '@/lib/ark-api'
import { createAsyncTask, TASK_TYPES } from '@/lib/async-task-manager'
import { logAIAnalysis } from '@/lib/logger'
import { getGoogleAiKey, getModelResolution } from '@/lib/api-config'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

const CHILD_STATE_PROMPT_PREFIX = '根据参考图片中的人物，生成该人物的新状态形象：'
const CHILD_STATE_PROMPT_SUFFIX = `。
【要求】
1. 人物面部特征、五官、发型、发色、肤色、体型必须与参考图完全一致
2. 根据上述描述调整人物的服装、姿态、状态等
3. 保持与参考图相同的构图布局（左侧面部近景特写，右侧三视图全身照）
4. 纯白色背景`

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
  let type: string | undefined
  let id: string | undefined

  // 初始化字体（在 Vercel 环境中需要）
  await initializeFonts()

  // 🔐 统一权限验证
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session, novelData } = authResult

  const body = await request.json()
  type = body.type
  id = body.id
  // 🔥 V6.6: 将 appearanceId 提升到 try 块外，确保错误处理代码可以访问
  let appearanceId: string | undefined = body.appearanceId

  // 🔒 UUID 格式验证辅助函数
  const isValidUUID = (str: any): boolean => {
    if (typeof str !== 'string') return false
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return uuidRegex.test(str)
  }

  try {
    if (type === 'character') {
      // 🔒 验证 appearanceId 是有效的 UUID，防止传入整数索引
      if (appearanceId !== undefined && !isValidUUID(appearanceId)) {
        console.error(`[generate-image] 收到无效的 appearanceId: ${appearanceId} (类型: ${typeof appearanceId})`)
        throw new ApiError('INVALID_PARAMS', {
          message: `appearanceId 必须是有效的 UUID，但收到: ${appearanceId}。请确保前端传递的是 appearance.id 而非 appearanceIndex。`
        })
      }
      // 获取角色
      const character = await (prisma as any).novelPromotionCharacter.findUnique({
        where: { id },
        include: { appearances: true }
      })
      if (!character) {
        throw new ApiError('NOT_FOUND', { message: 'Character not found' })
      }

      // 使用 UUID 直接查询形象
      const appearance = await (prisma as any).characterAppearance.findUnique({
        where: { id: appearanceId }
      })
      if (!appearance) {
        throw new ApiError('NOT_FOUND', { message: 'Appearance not found' })
      }

      // 检查是否正在生成（防止并发冲突）
      if (appearance.generating) {
        throw new ApiError('CONFLICT', { message: '该形象正在生成中，请稍候...' })
      }

      // 使用事务原子性设置生成状态
      await prisma.$transaction(async (tx) => {
        // 重新查询以确保获取最新状态
        const currentAppearance = await (tx as any).characterAppearance.findUnique({
          where: { id: appearance.id }
        })
        if (currentAppearance?.generating) {
          throw new Error('该形象正在生成中，请稍候...')
        }
        // 原子性设置生成状态 + 清除之前的错误
        await (tx as any).characterAppearance.update({
          where: { id: appearance.id },
          data: { generating: true, imageErrorMessage: null }
        })
      })

      // 获取描述
      let descriptions: string[] = []
      if (appearance.descriptions) {
        try { descriptions = JSON.parse(appearance.descriptions) } catch { }
      }
      if (descriptions.length === 0 && appearance.description) {
        descriptions = [appearance.description]
      }
      if (descriptions.length === 0) {
        throw new ApiError('INVALID_PARAMS', { message: 'No description found' })
      }

      // 判断是否是子状态
      const isPrimary = appearance.appearanceIndex === 1
      let primaryImageBase64: string | null = null

      if (!isPrimary) {
        const primaryAppearance = (character as any).appearances?.find((a: any) => a.appearanceIndex === 1)
        if (primaryAppearance?.imageUrl) {
          try {
            // 获取主形象图片并裁剪掉顶部标签区域
            const originalDataUrl = await imageUrlToBase64(primaryAppearance.imageUrl)
            // 去掉 data:image/xxx;base64, 前缀，获取纯 base64 数据
            const base64Data = originalDataUrl.replace(/^data:image\/\w+;base64,/, '')
            const imgBuffer = Buffer.from(base64Data, 'base64')
            const meta = await sharp(imgBuffer).metadata()
            if (meta.width && meta.height) {
              // 计算标签高度（与添加标签时的计算方式一致）
              const fs = Math.floor(meta.height * 0.04)
              const pad = Math.floor(fs * 0.5)
              const barH = fs + pad * 2
              // 裁剪掉顶部标签区域，只保留纯净的人物图片
              const croppedBuffer = await sharp(imgBuffer)
                .extract({ left: 0, top: barH, width: meta.width, height: meta.height - barH })
                .toBuffer()
              primaryImageBase64 = croppedBuffer.toString('base64')
              console.log(`[子形象] 已裁剪主形象标签区域，原尺寸 ${meta.width}x${meta.height}，裁剪高度 ${barH}`)
            } else {
              primaryImageBase64 = base64Data
            }
          } catch (cropError) {
            console.error('[子形象] 裁剪主形象标签失败:', cropError)
          }
        }
      }

      const useImageToImage = !isPrimary && primaryImageBase64 !== null
      // 🔥 实时从常量获取风格 prompt（不再依赖数据库存储）
      const artStylePrompt = getArtStylePrompt(novelData.artStyle)

      // 🔥 子形象使用改图模型,主形象使用生图模型
      const selectedModel = useImageToImage
        ? novelData.editModel  // 子形象:改图模型
        : novelData.characterModel       // 主形象:生图模型

      if (!selectedModel) {
        // 🔥 不使用虚假默认值，必须用户明确配置
        await prisma.characterAppearance.update({
          where: { id: appearance.id },
          data: { generating: false }
        })
        const modelType = useImageToImage ? '角色改图模型' : '角色图像模型'
        throw new ApiError('MISSING_CONFIG', { message: `请先在项目设置中配置"${modelType}"` })
      }
      console.log(`[模型配置] 模式=${useImageToImage ? '改图' : '生图'}, 选择模型=${selectedModel}`)
      const seedreamModel = selectedModel === 'seedream4' ? 'doubao-seedream-4-0-250828' : 'doubao-seedream-4-5-251128'

      // 子状态只生成1张，主形象生成3张
      const toGenerate = useImageToImage ? [descriptions[0]] : descriptions

      // === 批量/异步模式检测 ===
      // banana → FAL异步队列
      // gemini-batch → Google Batch异步
      // gemini → **同步模式**（不进入批量模式）
      const isBatchMode = selectedModel === 'banana' || selectedModel === 'gemini-3-pro-image-preview-batch'

      if (isBatchMode) {
        console.log(`[异步模式] 使用模型: ${selectedModel}，提交异步任务`)

        // 设置生成中状态
        await prisma.characterAppearance.update({
          where: { id: appearance.id },
          data: {
            generating: true
          }
        })

        // 🔥 修复：为每条描述提交一个任务，生成3张候选图片
        const taskIds: string[] = []

        for (let i = 0; i < toGenerate.length; i++) {
          const desc = toGenerate[i]

          // 构建完整提示词
          let fullPrompt: string
          if (useImageToImage) {
            // 🔥 子形象:使用前后缀约束保持形象一致性和三视图
            fullPrompt = `${CHILD_STATE_PROMPT_PREFIX}${desc}${CHILD_STATE_PROMPT_SUFFIX}`
          } else {
            fullPrompt = addCharacterPromptSuffix(desc)
          }
          if (artStylePrompt) fullPrompt = `${fullPrompt}，${artStylePrompt}`

          if (selectedModel === 'banana') {
            // 🔥 FAL Banana 异步队列（通过统一接口）
            console.log(`[异步模式] 提交FAL Banana任务 ${i + 1}/${toGenerate.length}，图生图=${useImageToImage}`)

            // 🔥 构建参考图数组（子形象需要传主形象图片）
            const referenceImages = useImageToImage && primaryImageBase64
              ? [`data:image/jpeg;base64,${primaryImageBase64}`]
              : []

            const result = await generateImage(
              session.user.id,
              'banana',
              fullPrompt,
              {
                referenceImages,  // 🔥 传递参考图
                aspectRatio: CHARACTER_IMAGE_BANANA_RATIO,
                resolution: await getModelResolution(session.user.id, selectedModel)
              }
            )

            if (!result.success) {
              console.error(`[异步模式] 任务 ${i + 1} 提交失败: ${result.error}`)
              continue  // 继续提交其他任务
            }

            let taskId: string
            if (!result.async || !result.requestId) {
              // 如果是同步返回，直接返回结果
              if (result.imageUrl) {
                taskId = `SYNC:${result.imageUrl}`
              } else {
                continue
              }
            } else {
              taskId = result.requestId
            }

            taskIds.push(taskId)

            // 创建异步任务记录（包含计费信息和索引）
            const externalId = `FAL:IMAGE:fal-ai/nano-banana-pro:${taskId}`
            await createAsyncTask({
              type: TASK_TYPES.IMAGE_CHARACTER,
              targetId: appearance.id,
              targetType: 'CharacterAppearance',
              externalId,
              payload: { prompt: fullPrompt, model: selectedModel, descriptionIndex: i },
              // 📊 计费相关
              userId: session.user.id,
              billingInfo: {
                projectId,
                model: selectedModel,
                action: 'character',
                quantity: 1,
                unit: 'image'
              }
            })

          } else if (selectedModel === 'gemini-3-pro-image-preview-batch') {
            // Google Gemini Batch 异步模式（省50%成本）
            console.log(`[异步模式] 提交Google Gemini Batch任务 ${i + 1}/${toGenerate.length}`)
            const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

            const batchRequest = {
              batch: {
                display_name: `char-batch-${Date.now()}-${i}`,
                input_config: {
                  requests: {
                    requests: [{
                      request: {
                        contents: [{ parts: [{ text: fullPrompt }] }],
                        generationConfig: {
                          responseModalities: ['TEXT', 'IMAGE']
                        }
                      },
                      metadata: { key: `request-${i}` }
                    }]
                  }
                }
              }
            }

            const googleApiKey = await getGoogleAiKey(session.user.id)
            const createUrl = `${BASE_URL}/models/gemini-3-pro-image-preview:batchGenerateContent?key=${googleApiKey}`

            const submitRes = await fetch(createUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(batchRequest)
            })

            if (!submitRes.ok) {
              console.error(`[异步模式] Gemini Batch 任务 ${i + 1} 提交失败`)
              continue
            }

            const submitData = await submitRes.json()
            const taskId = submitData.name
            taskIds.push(taskId)

            // 创建异步任务记录
            await createAsyncTask({
              type: TASK_TYPES.IMAGE_CHARACTER,
              targetId: appearance.id,
              targetType: 'CharacterAppearance',
              externalId: taskId,
              payload: { prompt: fullPrompt, model: selectedModel, descriptionIndex: i },
              userId: session.user.id,
              billingInfo: {
                projectId,
                model: selectedModel,
                action: 'character',
                quantity: 1,
                unit: 'image'
              }
            })
          }
        }

        if (taskIds.length === 0) {
          await prisma.characterAppearance.update({
            where: { id: appearance.id },
            data: { generating: false }
          })
          throw new ApiError('GENERATION_FAILED', { message: '所有任务提交失败' })
        }

        console.log(`[批量模式] 已提交 ${taskIds.length}/${toGenerate.length} 个任务`)

        // 立即返回
        return NextResponse.json({
          success: true,
          async: true,
          taskCount: taskIds.length,
          message: `已提交 ${taskIds.length} 个生成任务，预计几分钟后完成`
        })
      }


      // === 同步模式（现有逻辑）===
      // 预扣费：计算预估费用
      const estimatedCost = calcImage(selectedModel, toGenerate.length)

      console.log(`Generating ${toGenerate.length} images for "${character.name}" appearance ${appearance.appearanceIndex}, estimated cost: ¥${estimatedCost.toFixed(4)}`)

      // 🔥 返回类型改为包含 url 和 error 的对象，便于收集错误信息
      type ImageResult = { url: string | null; error?: string }
      const generateSingleImage = async (i: number, retry = false): Promise<ImageResult> => {
        let prompt = retry ? await desensitizePrompt(session.user.id, descriptions[i]) : descriptions[i]

        let fullPrompt: string
        if (useImageToImage) {
          // 🔥 子形象:使用前后缀约束保持形象一致性和三视图
          fullPrompt = `${CHILD_STATE_PROMPT_PREFIX}${prompt}${CHILD_STATE_PROMPT_SUFFIX}`
        } else {
          fullPrompt = addCharacterPromptSuffix(prompt)
        }
        if (artStylePrompt) fullPrompt = `${fullPrompt}，${artStylePrompt}`

        try {
          let tempUrl: string | undefined

          // 🔥 统一使用 generateImage 接口（无论是否是图生图）
          console.log(`[图片生成] 使用模型: ${selectedModel}，索引 ${i}，图生图=${useImageToImage}`)

          const resolution = await getModelResolution(session.user.id, selectedModel)
          const referenceImages = useImageToImage && primaryImageBase64
            ? [`data:image/jpeg;base64,${primaryImageBase64}`]
            : []

          const result = await generateImage(
            session.user.id,
            selectedModel,
            fullPrompt,
            {
              referenceImages,
              aspectRatio: CHARACTER_IMAGE_BANANA_RATIO,
              size: useImageToImage ? CHARACTER_IMAGE_SIZE : undefined,  // 图生图使用固定尺寸
              resolution
            }
          )

          if (!result.success) {
            console.error(`[图片生成失败] ${selectedModel} 索引${i}: ${result.error}`)
            if (!retry && result.error?.includes('Sensitive')) {
              console.log(`[图片生成] 检测到敏感词，尝试脱敏重试，索引 ${i}`)
              return generateSingleImage(i, true)
            }
            // 🔥 返回错误信息而不是 null
            return { url: null, error: result.error || '图片生成失败' }
          }

          // 检测异步返回
          if (result.async && result.requestId) {
            return { url: `ASYNC:${selectedModel}:${result.requestId}` }
          }

          // 处理不同的返回格式
          if (result.imageBase64) {
            // Base64格式（如 Gemini），需要上传到 COS
            const imageBuffer = Buffer.from(result.imageBase64, 'base64')
            const cosKey = generateUniqueKey(`char-${id}-${appearance.appearanceIndex}-${i}`, 'jpg')
            await uploadToCOS(imageBuffer, cosKey)
            tempUrl = getSignedUrl(cosKey, 3600)
          } else if (result.imageUrl) {
            // URL格式（如 FAL/ARK）
            tempUrl = result.imageUrl
          }

          console.log(`[图片生成] ${selectedModel}成功，索引 ${i}`)

          if (!tempUrl) {
            console.error(`[图片生成失败] 未获取到图片URL，索引 ${i}`)
            return { url: null, error: '未获取到图片URL' }
          }

          // 下载并添加标签（使用带超时和重试的fetch）
          const imgRes = await fetchWithTimeoutAndRetry(tempUrl, { logPrefix: `[下载角色图片 ${i}]` })
          const buffer = Buffer.from(await imgRes.arrayBuffer())
          const meta = await sharp(buffer).metadata()
          const w = meta.width || 2160, h = meta.height || 2160
          const fontSize = Math.floor(h * 0.04), pad = Math.floor(fontSize * 0.5), barH = fontSize + pad * 2

          const svg = await createLabelSVG(w, barH, fontSize, pad, `${character.name} - ${appearance.changeReason}`)

          const processed = await sharp(buffer)
            .extend({ top: barH, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
            .composite([{ input: svg, top: 0, left: 0 }])
            .jpeg({ quality: 90, mozjpeg: true })
            .toBuffer()

          const key = generateUniqueKey(`char-${id}-${appearance.appearanceIndex}-v${i}`, 'jpg')
          return { url: await uploadToCOS(processed, key) }
        } catch (e: any) {
          console.error(`Error generating image ${i}:`, e)
          return { url: null, error: e?.message || '图片生成异常' }
        }
      }

      // 💰 直接执行生成逻辑（费用通过 recordImageUsage 记录）
      const results = await Promise.all(toGenerate.map((_, i) => generateSingleImage(i)))

      // 🔥 分离同步完成的 URL、异步任务和错误信息
      const completedUrls: (string | null)[] = []
      const pendingTasks: string[] = []
      const errors: string[] = []

      for (const result of results) {
        if (result.url === null) {
          completedUrls.push(null)
          if (result.error) {
            errors.push(result.error)
          }
        } else if (result.url.startsWith('ASYNC:')) {
          // 异步任务标识，需要创建 AsyncTask
          pendingTasks.push(result.url)
          completedUrls.push(null)  // 暂时为 null，等待异步完成
        } else {
          // 正常的 COS key
          completedUrls.push(result.url)
        }
      }

      const successCount = completedUrls.filter(r => r !== null).length
      const asyncCount = pendingTasks.length
      const failCount = errors.length
      console.log(`[图片生成完成] "${character.name}" 形象${appearance.appearanceIndex}: 成功${successCount}张，异步${asyncCount}张，失败${failCount}张`)

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
            userId: session.user.id
          })
          console.log(`[异步任务] 创建角色图片 AsyncTask: ${externalId}`)
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

      // 只有同步完成的情况才保存结果
      const imageUrls = JSON.stringify(completedUrls)
      const firstUrl = completedUrls.find((u: string | null) => u !== null) || null
      // 🔥 汇总错误信息（去重后取第一个）
      const uniqueErrors = [...new Set(errors)]
      const errorMessage = uniqueErrors.length > 0 ? uniqueErrors.join('; ') : null
      console.log(`[图片生成完成] 保存数据: imageUrls=${imageUrls}, imageUrl=${firstUrl}, error=${errorMessage}`)

      // 使用事务原子性保存结果并清除生成状态
      await prisma.$transaction(async (tx) => {
        await (tx as any).characterAppearance.update({
          where: { id: appearance.id },
          data: {
            imageUrls,
            imageUrl: firstUrl,
            generating: false,
            imageErrorMessage: errorMessage  // 🔥 保存错误信息
          }
        })
      })
      console.log(`[数据库更新] "${character.name}" 形象${appearance.appearanceIndex}: generating=false, id=${appearance.id}`)

      // 💰 记录计费（只记录成功生成的图片数量）
      if (successCount > 0) {
        await recordImageUsage(
          projectId,
          session.user.id,
          selectedModel,
          'character',
          successCount,
          { characterId: id, characterName: character.name, appearanceIndex: appearance.appearanceIndex }
        )
      }

      const signedUrls = completedUrls.map((k: string | null) => k ? getSignedUrl(k, 7 * 24 * 3600) : null)

      // 🔥 如果有错误且没有成功的图片，返回错误
      if (errorMessage && successCount === 0) {
        throw new ApiError('GENERATION_FAILED', { message: errorMessage })
      }

      return NextResponse.json({ success: true, imageUrls: signedUrls, imageUrl: signedUrls.find((u: string | null) => u) || null })

    } else if (type === 'location') {
      // 获取场景和所有图片记录
      const location = await (prisma as any).novelPromotionLocation.findUnique({
        where: { id },
        include: { images: { orderBy: { imageIndex: 'asc' } } }
      })
      if (!location) {
        throw new ApiError('NOT_FOUND', { message: 'Location not found' })
      }

      if (!location.images || location.images.length === 0) {
        throw new ApiError('INVALID_PARAMS', { message: 'No image records found' })
      }

      // 检查是否正在生成（防止并发冲突）
      const isGenerating = (location as any).images.some((img: any) => img.generating)
      if (isGenerating) {
        throw new ApiError('CONFLICT', { message: '该场景正在生成中，请稍候...' })
      }

      // 使用事务原子性设置所有图片为生成中
      await prisma.$transaction(async (tx) => {
        // 重新查询以确保获取最新状态
        const currentLocation = await (tx as any).novelPromotionLocation.findUnique({
          where: { id },
          include: { images: true }
        })
        const isCurrentlyGenerating = currentLocation?.images?.some((img: any) => img.generating)
        if (isCurrentlyGenerating) {
          throw new Error('该场景正在生成中，请稍候...')
        }
        // 原子性设置所有图片为生成中 + 清除之前的错误
        await (tx as any).locationImage.updateMany({
          where: { locationId: id },
          data: { generating: true, imageErrorMessage: null }
        })
      })

      // 🔥 实时从常量获取风格 prompt
      const artStylePrompt = getArtStylePrompt(novelData.artStyle)
      const selectedModel = novelData.locationModel
      if (!selectedModel) {
        // 🔥 不使用虚假默认值，必须用户明确配置
        await (prisma as any).locationImage.updateMany({
          where: { locationId: id },
          data: { generating: false }
        })
        throw new ApiError('MISSING_CONFIG', { message: '请先在项目设置中配置"场景图像模型"' })
      }
      const seedreamModel = selectedModel === 'seedream4' ? 'doubao-seedream-4-0-250828' : 'doubao-seedream-4-5-251128'

      // 预扣费：计算预估费用
      const imageCount = (location as any).images.length
      const estimatedCost = calcImage(selectedModel, imageCount)

      console.log(`Generating ${imageCount} images for location "${location.name}", estimated cost: ¥${estimatedCost.toFixed(4)}`)

      // 🔥 返回类型改为包含 url 和 error 的对象
      type LocationImageResult = { url: string | null; error?: string }
      const generateSingleLocationImage = async (img: any, retry = false): Promise<LocationImageResult> => {
        if (!img.description) return { url: null, error: '无描述词' }
        let prompt = retry ? await desensitizePrompt(session.user.id, img.description) : img.description
        const fullPrompt = artStylePrompt ? `${addLocationPromptSuffix(prompt)}，${artStylePrompt}` : addLocationPromptSuffix(prompt)

        try {
          let tempUrl: string | undefined

          // ✅ 使用统一的新架构生成场景图片
          console.log(`[场景图片生成] 使用模型: ${selectedModel}，索引 ${img.imageIndex}`)

          const resolution = await getModelResolution(session.user.id, selectedModel)
          const result = await generateImage(
            session.user.id,
            selectedModel,
            fullPrompt,
            {
              aspectRatio: LOCATION_IMAGE_BANANA_RATIO,
              resolution
            }
          )

          if (!result.success) {
            console.error(`[场景图片生成失败] ${selectedModel} 索引${img.imageIndex}: ${result.error}`)
            return { url: null, error: result.error || '场景图片生成失败' }
          }

          // 检测异步返回
          if (result.async && result.requestId) {
            return { url: `ASYNC:${selectedModel}:${result.requestId}` }
          }

          // 处理不同的返回格式
          if (result.imageBase64) {
            // Base64格式（如 Gemini），需要上传到 COS
            const imageBuffer = Buffer.from(result.imageBase64, 'base64')
            const cosKey = generateUniqueKey(`loc-${id}-${img.imageIndex}`, 'jpg')
            await uploadToCOS(imageBuffer, cosKey)
            tempUrl = getSignedUrl(cosKey, 3600)
          } else if (result.imageUrl) {
            // URL格式（如 FAL/ARK）
            tempUrl = result.imageUrl
          }

          console.log(`[场景图片生成] ${selectedModel}成功，索引 ${img.imageIndex}`)

          if (!tempUrl) {
            console.error(`[场景图片生成失败] 未获取到图片URL，索引 ${img.imageIndex}`)
            return { url: null, error: '未获取到图片URL' }
          }

          // 下载并添加标签（使用带超时和重试的fetch）
          const imgRes = await fetchWithTimeoutAndRetry(tempUrl, { logPrefix: `[下载场景图片 ${img.imageIndex}]` })
          const buffer = Buffer.from(await imgRes.arrayBuffer())
          const meta = await sharp(buffer).metadata()
          const w = meta.width || 2160, h = meta.height || 2160
          const fontSize = Math.floor(h * 0.04), pad = Math.floor(fontSize * 0.5), barH = fontSize + pad * 2

          const svg = await createLabelSVG(w, barH, fontSize, pad, location.name)

          const processed = await sharp(buffer)
            .extend({ top: barH, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
            .composite([{ input: svg, top: 0, left: 0 }])
            .jpeg({ quality: 90, mozjpeg: true })
            .toBuffer()

          const key = generateUniqueKey(`loc-${id}-v${img.imageIndex}`, 'jpg')
          return { url: await uploadToCOS(processed, key) }
        } catch (e: any) {
          console.error(`Error generating location image ${img.imageIndex}:`, e)
          return { url: null, error: e?.message || '场景图片生成异常' }
        }
      }

      // 💰 直接执行生成逻辑（费用通过 recordImageUsage 记录）
      // 并行生成所有图片
      const results = await Promise.all((location as any).images.map((img: any) => generateSingleLocationImage(img)))

      // 🔥 分离同步完成的 URL、异步任务和错误信息
      const completedResults: (string | null)[] = []
      const pendingTasks: { task: string; imageId: string }[] = []
      const locationErrors: { imageId: string; error: string }[] = []

      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        const imageRecord = (location as any).images[i]

        if (result.url === null) {
          completedResults.push(null)
          if (result.error) {
            locationErrors.push({ imageId: imageRecord.id, error: result.error })
          }
        } else if (result.url.startsWith('ASYNC:')) {
          // 异步任务标识
          pendingTasks.push({ task: result.url, imageId: imageRecord.id })
          completedResults.push(null)
        } else {
          completedResults.push(result.url)
        }
      }

      const successCount = completedResults.filter((r: any) => r !== null).length
      const asyncCount = pendingTasks.length
      const failCount = locationErrors.length
      console.log(`[场景图片生成完成] "${location.name}": 成功${successCount}张，异步${asyncCount}张，失败${failCount}张`)

      // 如果有异步任务，创建 AsyncTask 记录
      if (pendingTasks.length > 0) {
        for (const { task: pendingTask, imageId } of pendingTasks) {
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
            type: isGeminiBatch ? TASK_TYPES.IMAGE_GEMINI_BATCH : TASK_TYPES.IMAGE_LOCATION,
            targetId: imageId,
            targetType: 'LocationImage',
            externalId,
            payload: { locationName: location.name, model: selectedModel },
            // 📊 计费相关
            userId: session.user.id,
            billingInfo: {
              projectId,
              model: selectedModel,
              action: 'location',
              quantity: 1,
              unit: 'image'
            }
          })
          console.log(`[场景图片] 创建 AsyncTask: ${externalId}, imageId=${imageId}`)
        }

        // 设置所有图片的 generating 状态
        await (prisma as any).locationImage.updateMany({
          where: { locationId: id },
          data: { generating: true }
        })

        return NextResponse.json({
          success: true,
          async: true,
          asyncCount: pendingTasks.length,
          message: '图片生成任务已提交，请稍后查看'
        })
      }

      // 🔥 汇总错误信息（去重）
      const uniqueLocationErrors = [...new Set(locationErrors.map(e => e.error))]
      const locationErrorMessage = uniqueLocationErrors.length > 0 ? uniqueLocationErrors.join('; ') : null

      // 使用事务原子性保存所有结果并清除生成状态
      await prisma.$transaction(async (tx) => {
        const currentLocation = await (tx as any).novelPromotionLocation.findUnique({
          where: { id },
          include: { images: { orderBy: { imageIndex: 'asc' } } }
        })
        if (!currentLocation?.images) return

        // 批量更新所有图片
        for (let i = 0; i < currentLocation.images.length; i++) {
          const imageId = currentLocation.images[i].id
          const errorForImage = locationErrors.find(e => e.imageId === imageId)?.error || null
          await (tx as any).locationImage.update({
            where: { id: imageId },
            data: {
              imageUrl: completedResults[i],
              generating: false,
              imageErrorMessage: errorForImage  // 🔥 保存每张图片的错误信息
            }
          })
        }
      })
      console.log(`[数据库更新] 场景 "${location.name}": generating=false, errors=${locationErrorMessage}`)

      // 💰 记录计费（只记录成功生成的图片数量）
      const successLocationCount = completedResults.filter((r: any) => r !== null).length
      if (successLocationCount > 0) {
        await recordImageUsage(
          projectId,
          session.user.id,
          selectedModel,
          'location',
          successLocationCount,
          { locationId: id, locationName: location.name }
        )
      }

      const signedUrls = completedResults.map((k: any) => k ? getSignedUrl(k, 7 * 24 * 3600) : null)

      // 🔥 如果有错误且没有成功的图片，返回错误
      if (locationErrorMessage && successCount === 0) {
        throw new ApiError('GENERATION_FAILED', { message: locationErrorMessage })
      }

      return NextResponse.json({ success: true, imageUrls: signedUrls, imageUrl: signedUrls.find((u: any) => u) || null })

    } else {
      throw new ApiError('INVALID_PARAMS', { message: 'Invalid type' })
    }
  } catch (error: any) {
    // 处理余额不足错误
    if (error instanceof InsufficientBalanceError) {
      throw new ApiError('INSUFFICIENT_BALANCE', { message: error.message })
    }
    console.error('[图片生成异常]', error?.message || error)
    console.error('[图片生成异常堆栈]', error?.stack)
    // 使用事务原子性重置生成状态（确保失败时也能清除状态）
    try {
      // 🔥 V6.6: 只有在 appearanceId 是有效 UUID 时才尝试重置状态
      if (type === 'character' && id && appearanceId && isValidUUID(appearanceId)) {
        console.log(`[重置状态] 角色 ${id} 形象 ${appearanceId}`)
        await prisma.$transaction(async (tx) => {
          await (tx as any).characterAppearance.update({
            where: { id: appearanceId },
            data: { generating: false }
          })
        })
      } else if (type === 'location' && id) {
        console.log(`[重置状态] 场景 ${id}`)
        await prisma.$transaction(async (tx) => {
          await (tx as any).locationImage.updateMany({
            where: { locationId: id },
            data: { generating: false }
          })
        })
      }
    } catch (resetError) {
      console.error('[重置状态失败]', resetError)
    }
    throw error  // 重新抛出让 apiHandler 处理
  }
})
