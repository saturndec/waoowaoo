import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@/lib/cos'
import { logVideoGeneration, logError } from '@/lib/logger'
import { recordVideoUsage, handleBillingError } from '@/lib/pricing'
import { createAsyncTask, TASK_TYPES } from '@/lib/async-task-manager'
import { getProjectModelConfig } from '@/lib/config-service'
import { apiHandler, ApiError, normalizeError } from '@/lib/api-errors'
import { generateVideo } from '@/lib/generator-api'

// 🔥 所有视频生成现在使用统一的 generateVideo 接口
// FAL 模型：fal-wan25, fal-veo31, fal-sora2, fal-kling25
// Ark 模型：seedance, seedance1.5, seedance-batch 等


/**
 * 生成首尾帧视频（使用两张图片）
 */
async function generateFirstLastFrameVideo(
  firstStoryboardId: string,
  firstPanelIndex: number,
  lastStoryboardId: string,
  lastPanelIndex: number,
  novelPromotionData: any,
  project: any,
  userId: string,
  username: string,
  projectName: string,
  flModel: string,
  customPrompt?: string,
  generateAudio?: boolean  // 仅 Seedance 1.5 Pro 支持
): Promise<string> {
  // 获取首帧 panel
  const firstPanel = await prisma.novelPromotionPanel.findFirst({
    where: { storyboardId: firstStoryboardId, panelIndex: firstPanelIndex }
  })
  if (!firstPanel) {
    throw new Error('First panel not found')
  }
  if (!firstPanel.imageUrl) {
    throw new Error('First panel image not found')
  }

  // 获取尾帧 panel
  const lastPanel = await prisma.novelPromotionPanel.findFirst({
    where: { storyboardId: lastStoryboardId, panelIndex: lastPanelIndex }
  })
  if (!lastPanel) {
    throw new Error('Last panel not found')
  }
  if (!lastPanel.imageUrl) {
    throw new Error('Last panel image not found')
  }

  // 构建提示词
  let videoPrompt: string
  if (customPrompt) {
    videoPrompt = customPrompt
  } else {
    // 合并两个镜头的提示词
    const firstPrompt = firstPanel.videoPrompt || firstPanel.description || ''
    const lastPrompt = lastPanel.videoPrompt || lastPanel.description || ''
    videoPrompt = lastPrompt
      ? `${firstPrompt} 然后镜头转换到: ${lastPrompt}`
      : firstPrompt
  }

  if (!videoPrompt) {
    throw new Error('Video prompt not found')
  }

  // 标记首帧 panel 为生成中
  await prisma.novelPromotionPanel.update({
    where: { id: firstPanel.id },
    data: { generatingVideo: true, videoErrorMessage: null }
  })

  const panelId = `${firstStoryboardId}-${firstPanelIndex}`
  const videoResolution = novelPromotionData.videoResolution || '720p'

  // 记录视频生成请求
  logVideoGeneration(
    userId,
    username,
    project.id,
    projectName,
    {
      shotId: panelId,
      prompt: videoPrompt,
      imageUrl: firstPanel.imageUrl,
      model: flModel,
      firstLastFrame: {
        firstImage: firstPanel.imageUrl,
        lastImage: lastPanel.imageUrl
      }
    }
  )

  try {
    // 首尾帧只支持 Ark API (Seedance)
    console.log(`[首尾帧视频] 模型: ${flModel}`)

    // 获取视频比例
    const videoRatio = novelPromotionData.videoRatio || '16:9'

    // 🔥 使用统一的 generateVideo 接口（支持首尾帧模式）
    const result = await generateVideo(
      userId,
      flModel,
      firstPanel.imageUrl,
      {
        prompt: videoPrompt,
        resolution: videoResolution,
        aspectRatio: videoRatio,
        generateAudio,
        lastFrameImageUrl: lastPanel.imageUrl  // 首尾帧模式的尾帧图片
      }
    )

    if (!result.success) {
      throw new Error(`首尾帧视频生成失败: ${result.error}`)
    }

    if (!result.async || !result.requestId) {
      throw new Error('首尾帧视频生成未返回任务 ID')
    }

    const taskId = result.requestId
    console.log(`[首尾帧视频] 任务已创建: ${taskId}`)

    // 创建异步任务记录
    await createAsyncTask({
      type: TASK_TYPES.VIDEO_PANEL,
      targetId: firstPanel.id,
      targetType: 'NovelPromotionPanel',
      externalId: taskId,
      payload: { prompt: videoPrompt, model: flModel, mode: 'first-last-frame' },
      userId
    })
    await prisma.novelPromotionPanel.update({
      where: { id: firstPanel.id },
      data: { generatingVideo: true, videoErrorMessage: null, updatedAt: new Date() }
    })

    console.log(`[异步首尾帧视频] 任务已提交: ${taskId}，由 Cron Job 轮询处理`)

    // 记录生成请求（异步模式）
    logVideoGeneration(
      userId,
      username,
      project.id,
      projectName,
      {
        shotId: panelId,
        prompt: videoPrompt,
        imageUrl: firstPanel.imageUrl,
        model: flModel,
        firstLastFrame: { firstImage: firstPanel.imageUrl, lastImage: lastPanel.imageUrl },
        result: { asyncTaskId: taskId, status: 'pending' }
      }
    )

    return `ASYNC_TASK:${taskId}`
  } catch (error: any) {
    // 清除生成中状态
    await prisma.novelPromotionPanel.update({
      where: { id: firstPanel.id },
      data: { generatingVideo: false }
    })

    // 记录失败
    logVideoGeneration(
      userId,
      username,
      project.id,
      projectName,
      {
        shotId: panelId,
        prompt: videoPrompt,
        imageUrl: firstPanel.imageUrl,
        model: flModel,
        result: { error: error.message }
      }
    )

    throw error
  }
}

/**
 * 生成单个Panel视频
 */
async function generatePanelVideo(
  storyboardId: string,
  panelIndex: number,
  novelPromotionData: any,
  project: any,
  userId: string,
  username: string,
  projectName: string,
  videoModel?: string,
  generateAudio?: boolean  // 仅 Seedance 1.5 Pro 支持
): Promise<string> {
  // 获取storyboard信息
  const storyboard = await prisma.novelPromotionStoryboard.findUnique({
    where: { id: storyboardId }
  })

  if (!storyboard) {
    throw new Error('Storyboard not found')
  }

  // 获取 panel 信息（Panel 表是唯一数据源）
  const panel = await prisma.novelPromotionPanel.findFirst({
    where: { storyboardId, panelIndex }
  })

  if (!panel) {
    throw new Error('Panel not found. Please generate storyboard text first.')
  }

  // 获取图片 URL（以 panel.imageUrl 为唯一数据源）
  const imageUrl = panel.imageUrl
  if (!imageUrl) {
    throw new Error('Panel image not found. Please generate storyboard image first.')
  }

  // 获取视频提示词
  let videoPrompt = panel.videoPrompt
  if (!videoPrompt) {
    // 使用描述作为备选
    videoPrompt = panel.description || null
  }

  if (!videoPrompt) {
    throw new Error('Video prompt not found. Please ensure storyboard text has video_prompt field.')
  }

  // 标记为生成中
  await prisma.novelPromotionPanel.update({
    where: { id: panel.id },
    data: { generatingVideo: true, videoErrorMessage: null }
  })

  // 🔥 统一配置服务：不使用默认值，优先使用前端传入的 videoModel
  const actualVideoModel = videoModel || novelPromotionData.videoModel
  if (!actualVideoModel) {
    await prisma.novelPromotionPanel.update({
      where: { id: panel.id },
      data: { generatingVideo: false }
    })
    throw new Error('请先在项目设置中配置"视频模型"')
  }
  const panelId = `${storyboardId}-${panelIndex}`
  const isFalModel = actualVideoModel.startsWith('fal-')

  try {
    // 获取视频分辨率配置
    const videoResolution = novelPromotionData.videoResolution || '720p'

    // 记录视频生成请求
    logVideoGeneration(
      userId,
      username,
      project.id,
      projectName,
      {
        shotId: panelId,
        prompt: videoPrompt,
        imageUrl: imageUrl,
        model: actualVideoModel
      }
    )

    // 根据项目配置获取视频比例
    const videoRatio = novelPromotionData.videoRatio || '16:9'
    console.log(`[视频生成] 模型: ${actualVideoModel}, 比例: ${videoRatio}, 分辨率: ${videoResolution}`)

    // 🔥 使用统一的 generateVideo 接口
    // FAL、MiniMax 和 Vidu 模型需要签名URL（公网可访问），ARK 模型直接使用COS key
    const isFalModel = actualVideoModel.startsWith('fal-')
    const isMinimaxModel = actualVideoModel.startsWith('minimax-') || actualVideoModel.startsWith('t2v-') || actualVideoModel.startsWith('image-')
    const isViduModel = actualVideoModel.startsWith('viduq') || actualVideoModel.startsWith('vidu2.')
    const needsSignedUrl = isFalModel || isMinimaxModel || isViduModel
    const signedImageUrl = needsSignedUrl ? getSignedUrl(imageUrl, 3600) : imageUrl

    const result = await generateVideo(
      userId,
      actualVideoModel,
      signedImageUrl,
      {
        prompt: videoPrompt,
        resolution: videoResolution,
        aspectRatio: videoRatio,
        generateAudio
      }
    )

    if (!result.success) {
      logVideoGeneration(userId, username, project.id, projectName, {
        shotId: panelId,
        prompt: videoPrompt,
        imageUrl: imageUrl,
        model: actualVideoModel,
        result: { error: result.error }
      })
      throw new Error(`视频生成失败: ${result.error}`)
    }

    // 统一处理异步返回
    if (result.async && result.externalId) {
      // 🔥 使用生成器返回的标准格式 externalId（不再手动构造)
      // 创建异步任务记录
      await createAsyncTask({
        type: TASK_TYPES.VIDEO_PANEL,
        targetId: panel.id,
        targetType: 'NovelPromotionPanel',
        externalId: result.externalId,
        payload: { prompt: videoPrompt, model: actualVideoModel },
        userId
      })

      await prisma.novelPromotionPanel.update({
        where: { id: panel.id },
        data: { generatingVideo: true, videoErrorMessage: null, updatedAt: new Date() }
      })

      logVideoGeneration(userId, username, project.id, projectName, {
        shotId: panelId,
        prompt: videoPrompt,
        imageUrl: imageUrl,
        model: actualVideoModel,
        result: { asyncTaskId: result.requestId, status: 'pending' }
      })

      console.log(`[异步视频] 任务已提交: ${result.requestId}`)
      return result.endpoint ? `ASYNC_FAL:${result.requestId}` : `ASYNC_TASK:${result.requestId}`
    }

    // 同步模式（备用，正常不会走到这里）
    if (!result.videoUrl) {
      throw new Error('视频生成失败: 未返回视频 URL')
    }

    const videoUrl = result.videoUrl

    // FAL 模型：下载视频并上传到COS
    // 🔥 使用统一的媒体处理服务
    let cosVideoUrl: string
    try {
      const { processMediaResult } = await import('@/lib/services/media-handler')
      cosVideoUrl = await processMediaResult({
        source: videoUrl,
        type: 'video',
        keyPrefix: 'panel-video',
        targetId: panel.id
      })
      console.log(`Video uploaded to COS: ${cosVideoUrl}`)
    } catch (uploadError: any) {
      console.error('COS upload error:', uploadError)
      throw new Error(`视频生成成功但保存失败，请重试: ${uploadError.message}`)
    }

    // FAL 模型：更新数据库
    await prisma.novelPromotionPanel.update({
      where: { id: panel.id },
      data: {
        videoUrl: cosVideoUrl,
        generatingVideo: false
      }
    })

    // 记录成功结果
    logVideoGeneration(
      userId,
      username,
      project.id,
      projectName,
      {
        shotId: panelId,
        prompt: videoPrompt,
        imageUrl: imageUrl,
        model: actualVideoModel,
        result: { videoUrl: cosVideoUrl }
      }
    )

    // 记录计费
    await recordVideoUsage(
      project.id,
      userId,
      actualVideoModel,
      'video',
      videoResolution,
      1,
      { panelId, model: actualVideoModel }
    )

    return cosVideoUrl

  } catch (error: any) {
    // 🔥 标准化错误并写入数据库
    const apiError = normalizeError(error)

    await prisma.novelPromotionPanel.update({
      where: { id: panel.id },
      data: {
        generatingVideo: false,
        videoErrorMessage: apiError.code  // 持久化错误消息
      }
    })

    logVideoGeneration(
      userId,
      username,
      project.id,
      projectName,
      {
        shotId: panelId,
        prompt: videoPrompt || '',
        imageUrl: imageUrl,
        model: actualVideoModel,
        result: { error: apiError.message, code: apiError.code }
      }
    )

    throw error
  }
}

// POST - 生成Panel视频
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params
  let session: { user: { id: string; name?: string | null } } | null = null

  // 由于有 billing 和状态管理的复杂逻辑，保留内部 try-catch
  try {
    // 🔐 统一权限验证
    const { requireProjectAuth, isErrorResponse } = await import('@/lib/api-auth')
    const authResult = await requireProjectAuth(projectId)
    if (isErrorResponse(authResult)) return authResult
    session = authResult.session
    const project = authResult.project
    const novelPromotionData = authResult.novelData

    const body = await request.json()
    const { storyboardId, panelIndex, videoModel, all, firstLastFrame, generateAudio, episodeId } = body

    if (project.mode !== 'novel-promotion') {
      throw new ApiError('INVALID_PARAMS', { message: 'Not a novel promotion project' })
    }

    // 获取 episodes 数据
    const novelDataWithEpisodes = await prisma.novelPromotionProject.findUnique({
      where: { projectId },
      include: {
        episodes: {
          include: {
            storyboards: {
              include: {
                panels: {
                  orderBy: { panelIndex: 'asc' }
                }
              }
            }
          }
        }
      }
    })

    if (!novelDataWithEpisodes) {
      throw new ApiError('NOT_FOUND', { message: 'Novel promotion data not found' })
    }

    // ✅ 使用包含 episodes 的完整数据作为唯一来源
    const fullNovelData = novelDataWithEpisodes

    // 💰 费用在视频生成函数内部统一记录
    const videoResolution = fullNovelData.videoResolution || '720p'
    // 🔥 统一配置服务：不使用默认值，优先使用前端传入的 videoModel
    const actualVideoModel = videoModel || fullNovelData.videoModel
    if (!actualVideoModel) {
      throw new ApiError('INVALID_PARAMS', { message: '请先在项目设置中配置"视频模型"' })
    }

    // 从 episodes 中收集所有 storyboards
    const allStoryboards: any[] = []
    for (const episode of fullNovelData.episodes || []) {
      allStoryboards.push(...(episode.storyboards || []))
    }

    // 构建完整项目对象（添加 storyboards 以保持兼容性）
    const fullProject = {
      ...project,
      novelPromotionData: {
        ...fullNovelData,
        storyboards: allStoryboards
      }
    }

    // 如果是生成所有Panel视频 - 使用并发10控制
    if (all) {
      // 如果指定了 episodeId，只处理该剧集的 storyboards
      let targetStoryboards = allStoryboards
      if (episodeId) {
        const targetEpisode = fullNovelData.episodes?.find((ep: any) => ep.id === episodeId)
        if (targetEpisode) {
          targetStoryboards = targetEpisode.storyboards || []
          console.log(`Filtering to episode ${episodeId}: ${targetStoryboards.length} storyboards`)
        } else {
          console.log(`Episode ${episodeId} not found, will generate for all episodes`)
        }
      }

      // 收集所有有图片且未生成视频的 panels（以 panel.imageUrl 为唯一数据源）
      const allPanels: { storyboardId: string, panelIndex: number }[] = []
      for (const sb of targetStoryboards) {
        const panels = sb.panels || []
        for (const panel of panels) {
          // 只有有图片且没有视频的才能生成
          if (panel.imageUrl && !panel.videoUrl) {
            allPanels.push({ storyboardId: sb.id, panelIndex: panel.panelIndex })
          }
        }
      }

      console.log(`[batch video] storyboards=${targetStoryboards.length}, panels=${allPanels.length}`)
      console.log(`Starting video generation for ${allPanels.length} panels with concurrency limit of 10`)

      const CONCURRENCY_LIMIT = 10
      const results: any[] = []

      // 并发控制函数
      async function processBatch(startIndex: number) {
        const batch = allPanels.slice(startIndex, startIndex + CONCURRENCY_LIMIT)
        if (batch.length === 0) return

        const batchResults = await Promise.all(
          batch.map(async (item) => {
            try {
              const videoUrl = await generatePanelVideo(
                item.storyboardId,
                item.panelIndex,
                fullNovelData,
                fullProject,
                session.user.id,
                session.user.name || 'Unknown',
                project.name
              )
              console.log(`✓ Generated video for panel ${item.storyboardId}-${item.panelIndex}`)
              return { panelId: `${item.storyboardId}-${item.panelIndex}`, success: true, videoUrl }
            } catch (error: any) {
              console.error(`✗ Failed to generate video for panel ${item.storyboardId}-${item.panelIndex}:`, error.message)

              // 🔥 标准化错误为 ApiError
              const apiError = normalizeError(error)

              // 🔥 写入错误到数据库
              const panel = await prisma.novelPromotionPanel.findFirst({
                where: {
                  storyboardId: item.storyboardId,
                  panelIndex: item.panelIndex
                }
              })

              if (panel) {
                await prisma.novelPromotionPanel.update({
                  where: { id: panel.id },
                  data: {
                    generatingVideo: false,
                    videoErrorMessage: apiError.code
                  }
                })
              }

              return {
                panelId: `${item.storyboardId}-${item.panelIndex}`,
                success: false,
                error: error.message,      // 保留原始消息(向后兼容)
                errorCode: apiError.code   // 新增标准错误码
              }
            }
          })
        )

        results.push(...batchResults)

        // 处理下一批
        if (startIndex + CONCURRENCY_LIMIT < allPanels.length) {
          await processBatch(startIndex + CONCURRENCY_LIMIT)
        }
      }

      // 开始处理
      await processBatch(0)

      const successCount = results.filter(r => r.success).length
      console.log(`Completed: ${successCount}/${allPanels.length} panel videos generated successfully`)

      return NextResponse.json({
        success: true,
        results,
        total: allPanels.length,
        successCount
      })
    }

    // 生成单个Panel视频
    if (storyboardId === undefined || panelIndex === undefined) {
      return NextResponse.json({ error: 'Missing storyboardId or panelIndex' }, { status: 400 })
    }

    let cosKey: string

    // 检查是否是首尾帧模式
    if (firstLastFrame) {
      cosKey = await generateFirstLastFrameVideo(
        storyboardId,
        panelIndex,
        firstLastFrame.lastFrameStoryboardId,
        firstLastFrame.lastFramePanelIndex,
        fullNovelData,
        fullProject,
        session.user.id,
        session.user.name || 'Unknown',
        project.name,
        firstLastFrame.flModel,
        firstLastFrame.customPrompt,
        firstLastFrame.generateAudio
      )
    } else {
      cosKey = await generatePanelVideo(
        storyboardId,
        panelIndex,
        fullNovelData,
        fullProject,
        session.user.id,
        session.user.name || 'Unknown',
        project.name,
        videoModel,
        generateAudio
      )
    }

    // 检查返回值是否为异步任务标记
    if (cosKey.startsWith('ASYNC_TASK:')) {
      const taskId = cosKey.replace('ASYNC_TASK:', '')
      return NextResponse.json({
        success: true,
        async: true,
        taskId,
        message: '视频生成任务已提交，请等待处理完成'
      })
    }

    // 同步完成（FAL模型等）：生成签名URL返回给前端
    const signedUrl = getSignedUrl(cosKey)

    return NextResponse.json({
      success: true,
      videoUrl: signedUrl
    })

  } catch (error: any) {
    logError('GENERATE_PANEL_VIDEO_API', error, session?.user?.id, session?.user?.name || undefined, projectId)
    const billingError = handleBillingError(error)
    if (billingError) return billingError
    throw error  // 重新抛出让 apiHandler 处理
  }
})
