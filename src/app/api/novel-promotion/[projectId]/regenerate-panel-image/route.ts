import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logAIAnalysis } from '@/lib/logger'
import { getSignedUrl, generateUniqueKey, uploadToCOS, downloadAndUploadToCOS } from '@/lib/cos'
import { generateImage } from '@/lib/generator-api'
import { getModelResolution } from '@/lib/api-config'
import { createAsyncTask, TASK_TYPES } from '@/lib/async-task-manager'
import { recordImageUsage, handleBillingError } from '@/lib/pricing'
import { getProjectModelConfig } from '@/lib/config-service'
import { apiHandler, ApiError } from '@/lib/api-errors'
import fs from 'fs'
import path from 'path'

const DEFAULT_CANDIDATE_COUNT = 1 // 默认生成1张候选图片

/**
 * POST /api/novel-promotion/[projectId]/regenerate-panel-image
 * 使用分镜模型重新生成单个镜头图片（支持自定义数量）
 * 输入：panelId, count (可选，默认1)
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params
  let session: { user: { id: string; name?: string | null } } | null = null
  let panelId: string | null = null  // 🔥 提升到顶层作用域
  let shouldResetGenerating = false  // 🔥 标记是否需要重置状态

  const body = await request.json()
  panelId = body.panelId
  const { count = DEFAULT_CANDIDATE_COUNT, _internal, _userId, _userName } = body
  const candidateCount = Math.max(1, Math.min(4, count)) // 限制1-4张

  // === 内部调用模式（来自 insert-panel 等）===
  if (_internal && _userId) {
    session = { user: { id: _userId, name: _userName || 'Internal' } }
  } else {
    // 🔐 统一权限验证
    const { requireProjectAuthLight, isErrorResponse } = await import('@/lib/api-auth')
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult
    session = authResult.session
  }

  if (!panelId) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing panelId' })
  }

  // 获取项目及相关数据
  const project = await prisma.project.findUnique({
    where: { id: projectId, userId: session.user.id },
    include: {
      novelPromotionData: {
        include: {
          characters: { include: { appearances: { orderBy: { appearanceIndex: 'asc' } } } },
          locations: { include: { images: { orderBy: { imageIndex: 'asc' } } } }
        }
      }
    }
  })

  if (!project?.novelPromotionData) {
    throw new ApiError('NOT_FOUND', { message: 'Project not found' })
  }

  const novelPromotionData = project.novelPromotionData
  const projectName = project.name

  // 💰 费用在图片生成后统一记录
  const storyboardModelConfig = (novelPromotionData as any).storyboardModel
  if (!storyboardModelConfig) {
    throw new ApiError('INVALID_PARAMS', { message: '请先在项目设置中配置"分镜图像模型"' })
  }

  // 获取 panel 信息
  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId },
    include: {
      storyboard: {
        include: { clip: true }
      }
    }
  })

  if (!panel) {
    throw new ApiError('NOT_FOUND', { message: 'Panel not found' })
  }

  // 判断是否是首次生成（没有已有图片）
  const isFirstGeneration = !panel.imageUrl

  // ✅ 允许强制重新生成，即使正在生成中也可以覆盖（解决卡死问题）
  // 直接设置生成状态，覆盖之前的状态
  await prisma.novelPromotionPanel.update({
    where: { id: panelId },
    data: { generatingImage: true } as any
  })
  shouldResetGenerating = true  // 🔥 从这里开始，如果出错需要重置状态

  // 由于有 billing 和复杂的状态管理，保留内部 try-catch
  try {
    // 读取单镜头图片提示词模板
    const promptPath = path.join(process.cwd(), 'lib', 'prompts', 'novel-promotion', 'single_panel_image.txt')
    const promptTemplate = fs.readFileSync(promptPath, 'utf-8')

    // 获取模型配置
    const videoRatio = novelPromotionData.videoRatio || '16:9'

    // 🔥 解析角色列表 - 支持 {name, appearance} 对象格式和旧的字符串格式
    const parsedCharacters = panel.characters ? JSON.parse(panel.characters) : []
    // 用于提示词的角色名列表
    const characters = parsedCharacters.map((c: any) => typeof c === 'string' ? c : c.name)

    // 读取单镜头摄影规则（从 Panel 读取）
    let photographyRules: any = null
    if ((panel as any).photographyRules) {
      try {
        photographyRules = JSON.parse((panel as any).photographyRules as string)
      } catch (e) {
        console.warn('[regenerate-panel-image] Failed to parse photographyRules:', e)
      }
    }

    // 构建单镜头 JSON 格式（不包含 grid_* 字段，避免 AI 误解为多宫格/拼图）
    const storyboardJsonObj: any = {
      aspect_ratio: videoRatio,
      shot: {
        shot_type: panel.shotType,
        camera_move: panel.cameraMove,
        description: panel.description,
        location: panel.location,
        characters: characters,
        prompt_text: `A ${videoRatio} shot: ${panel.description || ''}. ${(panel as any).videoPrompt || ''}`
      }
    }

    // 如果有摄影方案，添加到JSON（供图片生成模型参考）
    if (photographyRules) {
      storyboardJsonObj.photography_rules = photographyRules
    }

    // 收集参考图片
    const referenceImageUrls: string[] = []

    // 优先使用草稿图作为参考（如果有的话）
    if ((panel as any).sketchImageUrl) {
      const sketchUrl = (panel as any).sketchImageUrl.startsWith('images/')
        ? getSignedUrl((panel as any).sketchImageUrl, 3600)
        : (panel as any).sketchImageUrl
      referenceImageUrls.push(sketchUrl)
      console.log('[regenerate-panel-image] Using sketch image as reference:', sketchUrl.substring(0, 100) + '...')
    }

    // 🔥 获取角色图片 - 支持子形象选择
    for (const charItem of parsedCharacters) {
      // 解析角色信息：支持 {name, appearance} 对象格式 和 字符串格式
      const charName = typeof charItem === 'string' ? charItem : charItem.name
      const requestedAppearance = typeof charItem === 'string' ? null : charItem.appearance

      const character = novelPromotionData.characters.find((c: any) => c.name.toLowerCase() === charName.toLowerCase())
      if (character) {
        const appearances = (character as any).appearances || []

        // 🔥 根据 appearance 字段匹配对应的子形象
        let targetAppearance = appearances[0] // 默认使用第一个（主形象）

        if (requestedAppearance) {
          // 按 changeReason 匹配子形象
          const matchedAppearance = appearances.find((a: any) =>
            a.changeReason === requestedAppearance ||
            a.changeReason?.toLowerCase() === requestedAppearance.toLowerCase()
          )
          if (matchedAppearance) {
            targetAppearance = matchedAppearance
            console.log(`[regenerate-panel-image] 角色 "${charName}" 使用子形象: "${requestedAppearance}"`)
          } else {
            console.log(`[regenerate-panel-image] 角色 "${charName}" 未找到形象 "${requestedAppearance}", 使用主形象`)
          }
        }

        if (targetAppearance) {
          // 🔥 优先使用选中的图片（从 imageUrls 数组中根据 selectedIndex 选择）
          let imageKey: string | null = null

          // 解析 imageUrls 数组
          let imageUrls: string[] = []
          if (targetAppearance.imageUrls) {
            try {
              imageUrls = typeof targetAppearance.imageUrls === 'string'
                ? JSON.parse(targetAppearance.imageUrls)
                : targetAppearance.imageUrls
            } catch { }
          }

          // 选择图片：优先使用 selectedIndex 指向的图片
          const selectedIndex = targetAppearance.selectedIndex
          if (selectedIndex !== null && selectedIndex !== undefined && imageUrls[selectedIndex]) {
            imageKey = imageUrls[selectedIndex]
          } else if (imageUrls.length > 0 && imageUrls[0]) {
            imageKey = imageUrls[0]
          } else if (targetAppearance.imageUrl) {
            imageKey = targetAppearance.imageUrl
          }

          if (imageKey) {
            const url = imageKey.startsWith('images/')
              ? getSignedUrl(imageKey, 3600)
              : imageKey
            referenceImageUrls.push(url)
          }
        }
      }
    }

    // 获取场景图片
    if (panel.location) {
      const location = novelPromotionData.locations.find((l: any) => l.name.toLowerCase() === panel.location?.toLowerCase())
      if (location) {
        const images = (location as any).images || []
        const selectedImage = images.find((img: any) => img.isSelected) || images[0]
        if (selectedImage?.imageUrl) {
          const url = selectedImage.imageUrl.startsWith('images/')
            ? getSignedUrl(selectedImage.imageUrl, 3600)
            : selectedImage.imageUrl
          referenceImageUrls.push(url)
        }
      }
    }


    // 构建文字分镜 JSON
    const storyboardTextJson = JSON.stringify(storyboardJsonObj, null, 2)

    // 获取 Panel 的原文片段（source_text）
    const sourceText = panel.srtSegment || ''

    // 🔥 实时从常量获取风格 prompt
    const { getArtStylePrompt } = await import('@/lib/constants')
    const artStylePrompt = getArtStylePrompt(novelPromotionData.artStyle)
    const prompt = promptTemplate
      .replace('{storyboard_text_json_input}', storyboardTextJson)
      .replace('{source_text}', sourceText)
      .replace('{style}', artStylePrompt)
      .replace('{aspect_ratio}', videoRatio)

    // 记录日志到文件
    logAIAnalysis(session.user.id, session.user.name, projectId, projectName, {
      action: 'REGENERATE_PANEL_IMAGE',
      input: {
        panelId,
        镜头序号: panel.panelNumber,
        镜头类型: panel.shotType,
        镜头运动: panel.cameraMove,
        画面描述: panel.description,
        角色: characters,
        场景: panel.location,
        参考图片数: referenceImageUrls.length,
        参考图片URL: referenceImageUrls,
        使用模型: storyboardModelConfig,
        候选数量: candidateCount,
        分辨率: '2K',
        画面比例: videoRatio,
        风格提示词: artStylePrompt,
        分镜JSON: storyboardJsonObj,
        完整提示词: prompt
      },
      model: storyboardModelConfig
    })

    // 并行生成多张候选图片
    // 返回值: { url: string | null, error?: string, async?: boolean, pendingTask?: string }
    const generateSingleCandidate = async (index: number): Promise<{ url: string | null; error?: string; async?: boolean; pendingTask?: string }> => {
      try {
        if (storyboardModelConfig === 'banana') {
          // ✅ 使用统一的新架构生成图片
          console.log(`[单镜头候选 ${index + 1}] 使用模型: banana`)

          const result = await generateImage(
            session.user.id,
            'banana',
            prompt,
            {
              referenceImages: referenceImageUrls,
              aspectRatio: videoRatio,
              resolution: await getModelResolution(session.user.id, 'banana')
            }
          )

          if (!result.success) {
            return { url: null, error: result.error }
          }

          // 检测异步返回
          if (result.async && result.externalId) {
            // 🔥 使用生成器返回的标准格式 externalId（不再手动构造）
            return {
              url: null,
              async: true,
              pendingTask: `PENDING:${result.externalId}`
            }
          }

          // 下载并上传到COS（防止URL过期）
          if (result.imageUrl) {
            const cosKey = generateUniqueKey(`panel-${panelId}-banana-${index}`, 'png')
            const cosUrl = await downloadAndUploadToCOS(result.imageUrl, cosKey)
            console.log(`[单镜头候选 ${index + 1}] 已上传到COS: ${cosKey}`)
            return { url: cosUrl }
          }
          return { url: null }
        } else if (storyboardModelConfig === 'gemini-3-pro-image-preview-batch') {
          // ✅ 使用统一的新架构生成图片
          console.log(`[单镜头候选 ${index + 1}] 使用模型: gemini-3-pro-image-preview-batch`)

          const result = await generateImage(
            session.user.id,
            'gemini-3-pro-image-preview-batch',
            prompt,
            {
              referenceImages: referenceImageUrls,
              aspectRatio: videoRatio,
              resolution: await getModelResolution(session.user.id, 'gemini-3-pro-image-preview-batch')
            }
          )

          if (!result.success) {
            return { url: null, error: result.error }
          }

          // 返回异步标识
          if (result.async && result.externalId) {
            // 🔥 使用生成器返回的标准格式 externalId（不再手动构造）
            return {
              url: null,
              async: true,
              pendingTask: `PENDING:${result.externalId}`
            }
          }

          // 🔥 处理同步返回（Gemini 返回 base64）
          if (result.imageBase64) {
            const imageBuffer = Buffer.from(result.imageBase64, 'base64')
            const cosKey = generateUniqueKey(`panel-${panelId}-gemini-batch-${index}`, 'png')
            const cosUrl = await uploadToCOS(imageBuffer, cosKey)
            console.log(`[单镜头候选 ${index + 1}] Gemini Batch 已上传到COS: ${cosKey}`)
            return { url: cosUrl }
          }

          return { url: null, error: 'Gemini Batch 未返回图片' }
        } else if (storyboardModelConfig === 'gemini-3-pro-image-preview') {
          // ✅ 使用统一的新架构生成图片
          console.log(`[单镜头候选 ${index + 1}] 使用模型: gemini-3-pro-image-preview`)

          const result = await generateImage(
            session.user.id,
            'gemini-3-pro-image-preview',
            prompt,
            {
              referenceImages: referenceImageUrls,
              aspectRatio: videoRatio,
              resolution: await getModelResolution(session.user.id, 'gemini-3-pro-image-preview')
            }
          )

          if (!result.success) {
            return { url: null, error: result.error }
          }

          // Gemini返回base64，需要上传到COS
          if (result.imageBase64) {
            const imageBuffer = Buffer.from(result.imageBase64, 'base64')
            const cosKey = generateUniqueKey(`panel-${panelId}-candidate`, 'png')
            const cosUrl = await uploadToCOS(imageBuffer, cosKey)
            return { url: cosUrl }  // 🔥 返回 COS key，不是签名 URL
          }

          return { url: null }
        } else {
          // ✅ 使用统一的新架构生成图片 - SeeDream（自动使用 4K 分辨率）
          console.log(`[单镜头候选 ${index + 1}] 使用模型: ${storyboardModelConfig}`)

          const result = await generateImage(
            session.user.id,
            storyboardModelConfig,
            prompt,
            {
              referenceImages: referenceImageUrls,
              aspectRatio: videoRatio,
              resolution: await getModelResolution(session.user.id, storyboardModelConfig)
            }
          )

          if (!result.success) {
            // 🔥 检查是否是敏感内容错误
            const errorMessage = result.error || ''
            if (errorMessage.includes('InputTextSensitiveContentDetected') || errorMessage.includes('sensitive')) {
              return { url: null, error: '⚠️ 提示词包含敏感内容，请修改后重试' }
            }
            return { url: null, error: result.error }
          }

          // 检测异步返回
          if (result.async && result.externalId) {
            // 🔥 使用生成器返回的标准格式 externalId（不再手动构造）
            return {
              url: null,
              async: true,
              pendingTask: `PENDING:${result.externalId}`
            }
          }

          // 返回图片 URL
          if (result.imageUrl) {
            // 🔥 如果返回的是外部 URL，需要上传到 COS
            if (result.imageUrl.startsWith('http')) {
              const cosKey = generateUniqueKey(`panel-${panelId}-candidate`, 'png')
              const cosUrl = await downloadAndUploadToCOS(result.imageUrl, cosKey)
              console.log(`[单镜头候选] 已上传到COS: ${cosKey}`)
              return { url: cosUrl }
            }
            // 🔥 如果是 data URL (base64)，需要提取并上传到 COS
            if (result.imageUrl.startsWith('data:')) {
              // 使用 indexOf 代替正则表达式，避免大字符串导致栈溢出
              const base64Marker = ';base64,'
              const base64Index = result.imageUrl.indexOf(base64Marker)
              if (base64Index !== -1) {
                const base64Data = result.imageUrl.substring(base64Index + base64Marker.length)
                const imageBuffer = Buffer.from(base64Data, 'base64')
                const cosKey = generateUniqueKey(`panel-${panelId}-candidate`, 'png')
                const cosUrl = await uploadToCOS(imageBuffer, cosKey)
                console.log(`[单镜头候选] Base64上传到COS: ${cosKey}`)
                return { url: cosUrl }
              }
            }
            // 🔥 其他情况（如已经是 COS key），直接返回
            return { url: result.imageUrl }
          }

          return { url: null }
        }
      } catch (error: any) {
        return { url: null, error: error.message }
      }
    }

    // 并行生成所有候选图片
    const candidatePromises = Array.from({ length: candidateCount }, (_, i) => generateSingleCandidate(i))
    const candidateResults = await Promise.all(candidatePromises)

    // 收集成功的 URL、失败的错误信息、以及异步任务
    const candidates: string[] = []
    const pendingTasks: string[] = []
    const errors: string[] = []

    for (const result of candidateResults) {
      if ((result as any).pendingTask) {
        // 异步任务 - 收集任务ID
        pendingTasks.push((result as any).pendingTask)
      } else if (result.url) {
        candidates.push(result.url)
      } else if (result.error) {
        errors.push(result.error)
      }
    }

    // 如果有异步任务，保存到candidateImages并设置生成状态
    if (pendingTasks.length > 0) {
      // 🔥 为异步任务创建 AsyncTask 记录
      for (const pendingTask of pendingTasks) {
        if (pendingTask.startsWith('PENDING:FAL:')) {
          // FAL 任务格式: PENDING:FAL:endpoint:requestId
          const parts = pendingTask.replace('PENDING:FAL:', '').split(':')
          const endpoint = parts.slice(0, -1).join(':')
          const requestId = parts[parts.length - 1]
          const externalId = `FAL:${endpoint}:${requestId}`
          await createAsyncTask({
            type: TASK_TYPES.IMAGE_FAL,
            targetId: panelId,
            targetType: 'NovelPromotionPanel',
            externalId: externalId,
            payload: { prompt, model: 'banana', videoRatio, endpoint, requestId, projectName },
            userId: session.user.id
          })
          console.log(`[FAL] 创建 AsyncTask: ${externalId}`)
        } else if (pendingTask.startsWith('PENDING:GEMINI_BATCH:')) {
          const batchName = pendingTask.replace('PENDING:GEMINI_BATCH:', '')
          await createAsyncTask({
            type: TASK_TYPES.IMAGE_GEMINI_BATCH,
            targetId: panelId,
            targetType: 'NovelPromotionPanel',
            externalId: batchName,
            payload: { prompt, model: 'gemini-3-pro-image-preview-batch', videoRatio, projectName },
            userId: session.user.id
          })
          console.log(`[Gemini Batch] 创建 AsyncTask: ${batchName}`)
        }
      }

      await prisma.novelPromotionPanel.update({
        where: { id: panelId },
        data: {
          candidateImages: JSON.stringify(pendingTasks),
          generatingImage: true
        }
      })
      console.log(`[Panel ${panelId}] 保存 ${pendingTasks.length} 个异步任务到candidateImages`)
      shouldResetGenerating = false  // 🔥 异步任务成功提交，不需要重置（由 Cron 处理）

      return NextResponse.json({
        success: true,
        async: true,
        pendingCount: pendingTasks.length,
        message: '图片生成任务已提交，请稍后查看'
      })
    }

    // 记录计费（只记录成功生成的图片数量）
    if (candidates.length > 0) {
      const billingModel = storyboardModelConfig === 'banana' ? 'banana-2k' : storyboardModelConfig
      await recordImageUsage(
        projectId,
        session.user.id,
        billingModel,
        'panel_regenerate_candidate',
        candidates.length,
        { panelId, candidateCount: candidateCount }
      )
    }

    if (candidates.length === 0) {
      // 🔥 打印详细的错误日志
      console.error(`[regenerate-panel-image] 所有候选图片生成失败!`)
      console.error(`  - panelId: ${panelId}`)
      console.error(`  - 使用模型: ${storyboardModelConfig}`)
      console.error(`  - 候选数量: ${candidateCount}`)
      console.error(`  - 错误详情:`, errors)

      await prisma.novelPromotionPanel.update({
        where: { id: panelId },
        data: { generatingImage: false } as any
      })

      // 返回具体的错误原因
      const uniqueErrors = [...new Set(errors)]
      const errorMessage = uniqueErrors.length > 0
        ? uniqueErrors.join('; ')
        : '所有候选图片生成失败'

      const errorMsgLower = errorMessage.toLowerCase()

      // 🔥 检查是否是敏感内容错误
      const isSensitiveError = errorMsgLower.includes('敏感内容') ||
        errorMsgLower.includes('sensitive') ||
        errorMsgLower.includes('unsafe')

      if (isSensitiveError) {
        throw new ApiError('SENSITIVE_CONTENT', { details: errorMessage })
      }

      // 🔥 检查是否是配额/限流错误（Google Gemini 429 RESOURCE_EXHAUSTED 等）
      const isRateLimitError = errorMsgLower.includes('quota') ||
        errorMsgLower.includes('rate limit') ||
        errorMsgLower.includes('rate_limit') ||
        errorMsgLower.includes('resource_exhausted') ||
        errorMsgLower.includes('429') ||
        errorMsgLower.includes('exceeded')

      if (isRateLimitError) {
        // 尝试从错误消息中提取重试时间
        const retryMatch = errorMessage.match(/retry.{0,20}?(\d+)/i)
        throw new ApiError('RATE_LIMIT', {
          retryAfter: retryMatch ? parseInt(retryMatch[1]) : 60,
          details: errorMessage
        })
      }

      throw new ApiError('GENERATION_FAILED', { details: errorMessage })
    }

    // 根据是否是首次生成决定保存方式
    if (isFirstGeneration) {

      // 首次生成：直接设置为 imageUrl，不需要确认
      await prisma.novelPromotionPanel.update({
        where: { id: panelId },
        data: {
          generatingImage: false,
          imageUrl: candidates[0],  // 直接使用第一张
          candidateImages: null     // 清空候选图片
        } as any
      })

      // 记录成功日志
      logAIAnalysis(session.user.id, session.user.name, projectId, projectName, {
        action: 'REGENERATE_PANEL_IMAGE',
        output: {
          panelId,
          mode: 'first_generation',
          imageUrl: candidates[0]
        },
        model: storyboardModelConfig
      })

      // 返回图片 URL（签名后返回给前端）
      const signedUrl = candidates[0].startsWith('images/') ? getSignedUrl(candidates[0], 7 * 24 * 3600) : candidates[0]
      shouldResetGenerating = false  // 🔥 成功完成，不需要在 finally 中重置
      return NextResponse.json({
        success: true,
        imageUrl: signedUrl,
        isFirstGeneration: true,
        message: '图片生成成功'
      })
    } else {
      // 重新生成：保存当前图片到previousImageUrl，保存候选到candidateImages
      await prisma.novelPromotionPanel.update({
        where: { id: panelId },
        data: {
          generatingImage: false,
          candidateImages: JSON.stringify(candidates),
          // 🔥 保存当前图片到previousImageUrl，支持撤回功能
          previousImageUrl: panel.imageUrl || null
        } as any
      })

      // 记录成功日志
      logAIAnalysis(session.user.id, session.user.name, projectId, projectName, {
        action: 'REGENERATE_PANEL_IMAGE',
        output: {
          panelId,
          mode: 'regeneration',
          成功数量: candidates.length,
          候选图片: candidates
        },
        model: storyboardModelConfig
      })

      // 返回候选图片 URL 列表（签名后返回给前端）
      const signedCandidates = candidates.map(c => c.startsWith('images/') ? getSignedUrl(c, 7 * 24 * 3600) : c)
      shouldResetGenerating = false  // 🔥 成功完成，不需要在 finally 中重置
      return NextResponse.json({
        success: true,
        candidateImages: signedCandidates,
        isFirstGeneration: false,
        message: `成功生成 ${candidates.length} 张候选图片`
      })
    }

  } catch (error: any) {
    // 🔥 处理 billing 错误
    const billingError = handleBillingError(error)
    if (billingError) return billingError

    // 重置状态
    if (shouldResetGenerating && panelId) {
      console.log(`[regenerate-panel-image] 🔄 重置 Panel ${panelId} 的 generatingImage 状态`)
      await prisma.novelPromotionPanel.update({
        where: { id: panelId },
        data: { generatingImage: false } as any
      }).catch((err) => {
        console.error(`[regenerate-panel-image] ❌ 重置状态失败:`, err.message)
      })
    }

    throw error  // 重新抛出让 apiHandler 处理
  }
})
