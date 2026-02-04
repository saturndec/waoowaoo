/**
 * POST /api/novel-promotion/[projectId]/storyboard-text
 * 
 * 多阶段分镜生成API（Clip并行优化版）
 * - Phase 1: 为所有clips生成Plan，然后触发每个clip的独立Phase 2
 * - Phase 2: 每个clip独立执行 Cinematography + Detail 并行，然后保存
 * 
 * 所有clips并行处理，每个clip有独立的5分钟时间限制
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { after } from 'next/server'
import { logError } from '@/lib/logger'
import { handleBillingError } from '@/lib/pricing'
import {
  createAsyncTask,
  markTaskCompleted,
  markTaskFailed,
  updateTaskProgress,
  TASK_TYPES
} from '@/lib/async-task-manager'
import {
  executePhase1,
  executePhase2,
  executePhase2Acting,
  executePhase3,
  formatClipId
} from '@/lib/storyboard-phases'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params
  let session: any = null

  const body = await request.json()
  const {
    episodeId,
    async: asyncMode,
    phase,           // 阶段号：1 或 2
    clipId,          // Phase 2时指定要处理的clip
    phaseData,       // Phase 1的结果数据
    _internal,
    _taskId
  } = body

  // === 内部调用模式（来自after()）跳过session验证 ===
  if (_internal) {
    const task = await (prisma as any).asyncTask.findUnique({
      where: { id: _taskId }
    })
    if (!task) {
      throw new ApiError('NOT_FOUND', { message: 'Task not found' })
    }
    const payload = task.payload as any
    session = { user: { id: payload.userId, name: 'Internal' } }
  } else {
    // 🔐 统一权限验证
    const authResult = await requireProjectAuth(projectId)
    if (isErrorResponse(authResult)) return authResult
    session = authResult.session
  }

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS', { message: 'episodeId is required' })
  }

  // 获取项目数据（内部调用时需要单独获取，否则从 authResult 中已经验证过）
  const project = _internal ? await prisma.project.findUnique({ where: { id: projectId }, include: { user: true } }) : await prisma.project.findUnique({ where: { id: projectId }, include: { user: true } })
  if (!project) {
    throw new ApiError('NOT_FOUND', { message: 'Project not found' })
  }

  // 获取全局配置和资产
  const novelPromotionData = await (prisma as any).novelPromotionProject.findUnique({
    where: { projectId },
    include: {
      characters: { include: { appearances: { orderBy: { appearanceIndex: 'asc' } } } },
      locations: { include: { images: { orderBy: { imageIndex: 'asc' } } } }
    }
  })

  if (!novelPromotionData) {
    throw new ApiError('NOT_FOUND', { message: 'Novel promotion data not found' })
  }

  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId },
    include: { clips: { orderBy: { createdAt: 'asc' } } }
  })

  if (!episode) {
    throw new ApiError('NOT_FOUND', { message: 'Episode not found' })
  }

  if (episode.clips.length === 0) {
    throw new ApiError('INVALID_PARAMS', { message: 'No clips found' })
  }

  // === 异步模式：创建任务并立即返回 ===
  if (asyncMode && !_internal) {
    const asyncTask = await createAsyncTask({
      type: TASK_TYPES.STORYBOARD_TEXT,
      targetId: episodeId,
      targetType: 'NovelPromotionEpisode',
      payload: {
        projectId,
        episodeId,
        userId: session.user.id,
        totalClips: episode.clips.length,
        completedClips: 0
      },
      userId: session.user.id
    })

    // 删除旧分镜板
    await prisma.novelPromotionStoryboard.deleteMany({
      where: { episodeId }
    })

    // 使用 after() 触发Phase 1
    after(async () => {
      try {
        await triggerPhase1(projectId, episodeId, asyncTask.id)
      } catch (error: any) {
        await markTaskFailed(asyncTask.id, error.message)
      }
    })

    return NextResponse.json({
      success: true,
      async: true,
      taskId: asyncTask.id,
      message: '分镜生成任务已创建'
    })
  }

  // 以下是同步执行逻辑 - 由于 billing 函数有特殊处理，保留内部 try-catch
  try {
    // === Phase 1: 为所有clips生成Plan ===
    if (!phase || phase === 1) {
      console.log(`[Phase 1] 开始并行为 ${episode.clips.length} 个clips生成Plan...`)

      // 更新进度状态
      if (_taskId) {
        const task = await (prisma as any).asyncTask.findUnique({ where: { id: _taskId } })
        const existingPayload = task?.payload || {}
        await (prisma as any).asyncTask.update({
          where: { id: _taskId },
          data: {
            payload: {
              ...existingPayload,
              phase: 1,
              phaseLabel: '规划分镜',
              totalClips: episode.clips.length
            }
          }
        })
        await updateTaskProgress(_taskId, 10)
      }

      // 🚀 并行为所有clips生成Plan
      const planResults = await Promise.all(
        episode.clips.map(async (clip: any, index: number) => {
          const clipIdStr = formatClipId(clip)
          console.log(`[Phase 1] Clip ${clipIdStr} (${index + 1}/${episode.clips.length}): 开始规划...`)

          const result = await executePhase1(
            clip, novelPromotionData, session, projectId, project.name, _taskId
          )

          console.log(`[Phase 1] Clip ${clipIdStr}: 规划完成`)
          return { clipIdStr, result }
        })
      )

      // 构建 allPlans 映射
      const allPlans: Record<string, any> = {}
      for (const { clipIdStr, result } of planResults) {
        allPlans[clipIdStr] = result
      }

      // 更新进度到50%
      if (_taskId) {
        await updateTaskProgress(_taskId, 50)
      }

      console.log(`[Phase 1] 并行完成所有clips的Plan，触发${episode.clips.length}个独立Phase 2...`)

      // 为每个clip触发独立的Phase 2
      for (const clip of episode.clips) {
        const clipIdStr = formatClipId(clip)
        after(async () => {
          try {
            await triggerPhase2(projectId, episodeId, _taskId!, clip.id, allPlans[clipIdStr])
          } catch (error: any) {
            console.error(`[Phase 2] Clip ${clipIdStr} 失败:`, error)
            // 单个clip失败不影响整体任务
          }
        })
      }

      return NextResponse.json({
        success: true,
        phase: 1,
        message: `Phase 1完成，已触发${episode.clips.length}个并行Phase 2`
      })
    }

    // === Phase 2: 单个clip的 Cinematography + Detail 并行执行 ===
    if (phase === 2 && clipId) {
      const clip = episode.clips.find((c: any) => c.id === clipId)
      if (!clip) {
        throw new ApiError('NOT_FOUND', { message: 'Clip not found' })
      }

      const clipIdStr = formatClipId(clip)
      console.log(`[Phase 2] Clip ${clipIdStr}: 开始并行执行 Cinematography + Detail...`)

      const planResult = phaseData
      if (!planResult?.planPanels) {
        throw new Error(`Clip ${clipIdStr} 缺少Plan数据`)
      }

      // 并行执行 Cinematography、Acting 和 Detail
      const [cinematographyResult, actingResult, detailResult] = await Promise.all([
        executePhase2(
          clip, planResult.planPanels, novelPromotionData, session, projectId, project.name, _taskId
        ),
        executePhase2Acting(
          clip, planResult.planPanels, novelPromotionData, session, projectId, project.name, _taskId
        ),
        executePhase3(
          clip, planResult.planPanels, [],
          novelPromotionData, session, projectId, project.name, _taskId
        )
      ])

      console.log(`[Phase 2] Clip ${clipIdStr}: 并行完成，合并结果...`)
      console.log(`[Phase 2] 📹 cinematographyResult:`, JSON.stringify(cinematographyResult, null, 2).substring(0, 500))
      console.log(`[Phase 2] 🎭 actingResult:`, JSON.stringify(actingResult, null, 2).substring(0, 500))

      // 合并摄影规则和演技指导到finalPanels
      const photographyRules = cinematographyResult.photographyRules || []
      const actingDirections = actingResult.actingDirections || []
      console.log(`[Phase 2] 📹 photographyRules 数量: ${photographyRules.length}`)
      console.log(`[Phase 2] 🎭 actingDirections 数量: ${actingDirections.length}`)

      const finalPanels = (detailResult.finalPanels || []).map((panel: any, index: number) => {
        // 合并摄影规则
        const rules = photographyRules.find((r: any) => r.panel_number === panel.panel_number) || photographyRules[index]
        // 合并演技指导
        const actingData = actingDirections.find((a: any) => a.panel_number === panel.panel_number) || actingDirections[index]

        const updatedPanel = { ...panel }

        if (rules) {
          updatedPanel.photographyPlan = {
            composition: rules.composition,
            lighting: rules.lighting,
            colorPalette: rules.color_palette,
            atmosphere: rules.atmosphere,
            technicalNotes: rules.technical_notes
          }
        }

        if (actingData?.characters) {
          updatedPanel.actingNotes = actingData.characters
          console.log(`[Phase 2] 🎭 Panel ${panel.panel_number}: 添加演技指导 - ${actingData.characters.length} 个角色`)
        } else {
          console.log(`[Phase 2] ⚠️ Panel ${panel.panel_number}: 没有演技指导数据!`)
        }

        return updatedPanel
      })

      // 保存到数据库
      await saveStoryboardToDatabase(clip, finalPanels, episode)

      // 更新完成计数
      const task = await (prisma as any).asyncTask.findUnique({ where: { id: _taskId } })
      const payload = task.payload as any
      const completedClips = (payload.completedClips || 0) + 1
      const totalClips = payload.totalClips || episode.clips.length

      await (prisma as any).asyncTask.update({
        where: { id: _taskId },
        data: {
          payload: {
            ...payload,
            completedClips,
            phase: 2,
            phaseLabel: '生成镜头'
          }
        }
      })

      const progress = 50 + Math.round(45 * completedClips / totalClips)
      await updateTaskProgress(_taskId!, progress)

      console.log(`[Phase 2] Clip ${clipIdStr}: 完成 (${completedClips}/${totalClips})`)

      // 如果所有clips都完成了，标记任务完成
      if (completedClips >= totalClips) {
        console.log(`[Storyboard] 所有clips完成，标记任务完成`)
        await markTaskCompleted(_taskId!, {
          success: true,
          totalClips,
          totalPanels: finalPanels.length * totalClips
        })
      }

      return NextResponse.json({
        success: true,
        phase: 2,
        clipId: clipIdStr,
        completedClips,
        totalClips
      })
    }

    throw new ApiError('INVALID_PARAMS', { message: 'Invalid phase' })
  } catch (error: any) {
    // 处理 billing 错误
    const billingError = handleBillingError(error)
    if (billingError) return billingError
    throw error  // 重新抛出让 apiHandler 处理
  }
})

async function triggerPhase1(
  projectId: string,
  episodeId: string,
  taskId: string
) {
  const { getBaseUrl } = await import('@/lib/env')
  const baseUrl = getBaseUrl()

  const res = await fetch(`${baseUrl}/api/novel-promotion/${projectId}/storyboard-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      episodeId,
      phase: 1,
      _internal: true,
      _taskId: taskId
    })
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Phase 1执行失败: ${error}`)
  }
}

async function triggerPhase2(
  projectId: string,
  episodeId: string,
  taskId: string,
  clipId: string,
  phaseData: any
) {
  const { getBaseUrl } = await import('@/lib/env')
  const baseUrl = getBaseUrl()

  const res = await fetch(`${baseUrl}/api/novel-promotion/${projectId}/storyboard-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      episodeId,
      phase: 2,
      clipId,
      phaseData,
      _internal: true,
      _taskId: taskId
    })
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Clip ${clipId} Phase 2执行失败: ${error}`)
  }
}

// 保存分镜到数据库
async function saveStoryboardToDatabase(
  clip: any,
  finalPanels: any[],
  episode: any
) {
  const clipId = formatClipId(clip)
  console.log(`[SaveDB] 🗃️ 开始保存分镜到数据库 - Clip ${clipId}`)
  console.log(`[SaveDB] 🗃️ finalPanels 数量: ${finalPanels.length}`)

  // 创建分镜板
  const storyboard = await (prisma as any).novelPromotionStoryboard.create({
    data: {
      clipId: clip.id,
      episodeId: episode.id
    }
  })

  // 创建panels
  for (let i = 0; i < finalPanels.length; i++) {
    const panel = finalPanels[i]

    console.log(`[SaveDB] Panel ${i + 1}: actingNotes = ${panel.actingNotes ? '有数据' : '无数据'}`)
    if (panel.actingNotes) {
      console.log(`[SaveDB] Panel ${i + 1}: actingNotes 内容预览: ${JSON.stringify(panel.actingNotes).substring(0, 200)}...`)
    }

    await prisma.novelPromotionPanel.create({
      data: {
        storyboardId: storyboard.id,
        panelIndex: i,
        panelNumber: panel.panel_number || i + 1,
        shotType: panel.shot_type || '中景',
        cameraMove: panel.camera_move || '固定',
        description: panel.description || '',
        videoPrompt: panel.video_prompt || '',
        location: panel.location || null,
        characters: JSON.stringify(panel.characters || []),
        srtSegment: panel.source_text || null,
        photographyRules: panel.photographyPlan ? JSON.stringify(panel.photographyPlan) : null,
        actingNotes: panel.actingNotes ? JSON.stringify(panel.actingNotes) : null,
        duration: panel.duration || null
      }
    })
  }

  console.log(`[Storyboard] Clip ${clipId}: 保存 ${finalPanels.length} 个panels`)
}
