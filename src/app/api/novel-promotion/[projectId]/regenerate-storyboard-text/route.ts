import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import fs from 'fs'
import path from 'path'
import { logAIAnalysis, logError } from '@/lib/logger'
import { recordTextUsage, handleBillingError } from '@/lib/pricing'
import { createAsyncTask, markTaskCompleted, markTaskFailed, updateTaskProgress, TASK_TYPES } from '@/lib/async-task-manager'
import { after } from 'next/server'
import { formatClipId } from '@/lib/storyboard-phases'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/novel-promotion/[projectId]/regenerate-storyboard-text
 * 重新生成单个clip的文字分镜（两阶段）
 * 会读取最新的提示词文件
 * 
 * Body: { storyboardId: string }
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params
  let session: { user: { id: string; name?: string | null } } | null = null

  const body = await request.json()
  const { storyboardId, async: asyncMode, _internal, _taskId } = body

  // 内部调用模式（来自after()）跳过session验证
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
    const { requireProjectAuthLight, isErrorResponse } = await import('@/lib/api-auth')
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult
    session = authResult.session
  }

  if (!storyboardId) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing storyboardId' })
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { user: true }
  })

  if (!project) {
    throw new ApiError('NOT_FOUND', { message: 'Project not found' })
  }

  if (!_internal && project.userId !== session.user.id) {
    throw new ApiError('FORBIDDEN')
  }

  if (project.mode !== 'novel-promotion') {
    throw new ApiError('INVALID_PARAMS', { message: 'Not a novel promotion project' })
  }

  // 获取当前storyboard和关联的clip
  const storyboard = await (prisma as any).novelPromotionStoryboard.findUnique({
    where: { id: storyboardId },
    include: {
      clip: true,
      panels: { orderBy: { panelIndex: 'asc' } }
    }
  })

  if (!storyboard) {
    throw new ApiError('NOT_FOUND', { message: 'Storyboard not found' })
  }

  const clip = storyboard.clip
  if (!clip) {
    throw new ApiError('NOT_FOUND', { message: 'Clip not found for this storyboard' })
  }

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

  // === 异步模式：创建任务并立即返回 ===
  if (asyncMode) {
    const asyncTask = await createAsyncTask({
      type: TASK_TYPES.STORYBOARD_TEXT,
      targetId: storyboardId,
      targetType: 'NovelPromotionStoryboard',
      payload: { projectId, storyboardId, userId: session.user.id },
      userId: session.user.id
    })

    after(async () => {
      try {
        await updateTaskProgress(asyncTask.id, 10)
        const { getBaseUrl } = await import('@/lib/env')
        const baseUrl = getBaseUrl()
        const workerRes = await fetch(`${baseUrl}/api/novel-promotion/${projectId}/regenerate-storyboard-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyboardId, _internal: true, _taskId: asyncTask.id })
        })

        if (workerRes.ok) {
          const result = await workerRes.json()
          await markTaskCompleted(asyncTask.id, result)
        } else {
          const error = await workerRes.text()
          await markTaskFailed(asyncTask.id, error)
        }
      } catch (error: any) {
        await markTaskFailed(asyncTask.id, error.message)
      }
    })

    return NextResponse.json({
      success: true,
      async: true,
      taskId: asyncTask.id,
      message: '分镜重新生成任务已创建'
    })
  }

  // 以下是同步执行逻辑 - 由于 billing 函数有特殊处理，保留内部 try-catch
  try {
    // 读取提示词模板 (Agent模式) - 每次重新读取文件以获取最新内容
    const planPromptPath = path.join(process.cwd(), 'lib', 'prompts', 'novel-promotion', 'agent_storyboard_plan.txt')
    const detailPromptPath = path.join(process.cwd(), 'lib', 'prompts', 'novel-promotion', 'agent_storyboard_detail.txt')
    const planPromptTemplate = fs.readFileSync(planPromptPath, 'utf-8')
    const detailPromptTemplate = fs.readFileSync(detailPromptPath, 'utf-8')

    console.log('[RegenerateStoryboard] 使用最新提示词模板: agent_storyboard_plan.txt, agent_storyboard_detail.txt')

    // 构建资产库名称列表
    const charactersLibName = novelPromotionData.characters.map((c: any) => c.name).join(', ') || '无'
    const locationsLibName = novelPromotionData.locations.map((l: any) => l.name).join(', ') || '无'

    // 第一阶段用：角色形象列表（供选择 appearance）
    const charactersAppearanceList = novelPromotionData.characters.map((c: any) => {
      const appearances = c.appearances || []
      if (appearances.length === 0) return `${c.name}: ["初始形象"]`
      const appearanceNames = appearances.map((app: any) => app.changeReason || '初始形象')
      return `${c.name}: [${appearanceNames.map((n: string) => `"${n}"`).join(', ')}]`
    }).join('\n') || '无'

    // 第二阶段用：角色年龄性别信息
    const charactersAgeGender = novelPromotionData.characters.map((c: any) => {
      const appearances = c.appearances || []
      if (appearances.length === 0) return `${c.name}: 年轻人`

      const firstAppearance = appearances[0]
      let descriptions: string[] = []
      if (firstAppearance?.descriptions) {
        try { descriptions = JSON.parse(firstAppearance.descriptions) } catch { }
      }
      const desc = descriptions[firstAppearance?.selectedIndex ?? 0] || firstAppearance?.description || ''

      // 从描述中提取年龄性别
      let ageGender = '年轻人'
      if (desc.includes('少女') || desc.includes('少年')) {
        ageGender = desc.includes('女') || desc.includes('少女') ? '少女' : '少年'
      } else if (desc.includes('中年')) {
        ageGender = desc.includes('女') ? '中年女子' : '中年男子'
      } else if (desc.includes('老年') || desc.includes('老人') || desc.includes('老者')) {
        ageGender = desc.includes('女') ? '老年女子' : '老年男子'
      } else if (desc.includes('女性') || desc.includes('女子') || desc.includes('女孩')) {
        ageGender = '年轻女子'
      } else if (desc.includes('男性') || desc.includes('男子') || desc.includes('男孩')) {
        ageGender = '年轻男子'
      } else if (desc.includes('青年')) {
        ageGender = desc.includes('女') ? '年轻女子' : '年轻男子'
      }

      return `${c.name}: ${ageGender}`
    }).join('\n') || '无'

    // 第一阶段用：角色完整描述（衣着+年龄段+性别+名字）用于 description
    const charactersFullDescription = novelPromotionData.characters.map((c: any) => {
      const appearances = c.appearances || []
      if (appearances.length === 0) return `${c.name}: 年轻人${c.name}`

      const firstAppearance = appearances[0]
      let descriptions: string[] = []
      if (firstAppearance?.descriptions) {
        try { descriptions = JSON.parse(firstAppearance.descriptions) } catch { }
      }
      const desc = descriptions[firstAppearance?.selectedIndex ?? 0] || firstAppearance?.description || ''

      // 提取衣着信息
      let clothing = ''
      const clothingMatch = desc.match(/(?:穿着?|身着|身穿|戴着?)([^，,。.、]+)/u)
      if (clothingMatch) {
        clothing = clothingMatch[1].trim()
      } else {
        const colorClothMatch = desc.match(/^([白黑红蓝绿黄紫粉灰棕][色]?[^，,。.、]{1,10})/u)
        if (colorClothMatch) {
          clothing = colorClothMatch[1].trim()
        }
      }

      // 提取年龄段和性别
      let ageGender = '年轻人'
      let gender = ''

      if (desc.includes('少女')) {
        ageGender = '少女'
        gender = '女性'
      } else if (desc.includes('少年')) {
        ageGender = '少年'
        gender = '男性'
      } else if (desc.includes('中年') && (desc.includes('女') || desc.includes('妇'))) {
        ageGender = '中年'
        gender = '女性'
      } else if (desc.includes('中年')) {
        ageGender = '中年'
        gender = '男性'
      } else if (desc.includes('老年') || desc.includes('老人') || desc.includes('老者')) {
        ageGender = '老年'
        gender = desc.includes('女') || desc.includes('婆') ? '女性' : '男性'
      } else if (desc.includes('女性') || desc.includes('女子') || desc.includes('女孩') || desc.includes('姑娘')) {
        ageGender = '年轻'
        gender = '女性'
      } else if (desc.includes('男性') || desc.includes('男子') || desc.includes('男孩') || desc.includes('小伙')) {
        ageGender = '年轻'
        gender = '男性'
      } else if (desc.includes('青年')) {
        ageGender = '年轻'
        gender = desc.includes('女') ? '女性' : '男性'
      }

      // 构建完整描述格式
      let fullDesc = ''
      if (clothing) {
        fullDesc = `穿${clothing}的${ageGender}${gender}${c.name}`
      } else {
        fullDesc = `${ageGender}${gender}${c.name}`
      }

      return `${c.name}: ${fullDesc}
  原描述: ${desc.substring(0, 100)}...`
    }).join('\n\n') || '无'

    // 场景描述
    const locationsDescription = novelPromotionData.locations.map((l: any) => {
      const images = l.images || []
      const selectedImage = images.find((img: any) => img.isSelected) || images[0]
      const desc = selectedImage?.description || '无描述'
      return `${l.name}: ${desc.substring(0, 100)}`
    }).join('\n') || '无'

    // 使用统一的 formatClipId 函数（来自 @/lib/storyboard-phases）

    const clipId = formatClipId(clip)
    console.log(`[RegenerateStoryboard] 开始重新生成 Clip ${clipId} 的分镜...`)

    logAIAnalysis(session.user.id, session.user.name, projectId, project.name, {
      action: 'REGENERATE_STORYBOARD_TEXT',
      input: {
        storyboardId,
        clipId,
        模式: '两阶段生成',
        使用最新提示词: true
      },
      model: novelPromotionData.analysisModel
    })

    // 构建clipJson (Agent模式)
    const clipJson = JSON.stringify({
      startText: clip.startText,
      endText: clip.endText,
      summary: clip.summary,
      location: clip.location,
      characters: clip.characters ? JSON.parse(clip.characters) : []
    }, null, 2)

    // ========== 第一阶段：基础分镜规划 ==========
    let planPrompt = planPromptTemplate
      .replace('{characters_lib_name}', charactersLibName)
      .replace('{locations_lib_name}', locationsLibName)
      .replace('{characters_appearance_list}', charactersAppearanceList)
      .replace('{characters_full_description}', charactersFullDescription)
      .replace('{clip_json}', clipJson)

    planPrompt = planPrompt.replace('{clip_content}', clip.content || '')

    // 记录发送给第一阶段 AI 的完整 prompt
    logAIAnalysis(session.user.id, session.user.name, projectId, project.name, {
      action: 'REGENERATE_STORYBOARD_PHASE1_PROMPT',
      input: {
        片段标识: clipId,
        完整提示词: planPrompt
      },
      model: novelPromotionData.analysisModel
    })

    console.log(`[Phase 1] Clip ${clipId}: 生成基础分镜规划...`)

    const planCompletion = await chatCompletion(
      session.user.id,
      novelPromotionData.analysisModel,
      [{ role: 'user', content: planPrompt }],
      { reasoning: true, projectId, action: 'storyboard_text_plan' }
    )

    // 💰 记录第一阶段费用
    const planUsage = (planCompletion as any).usage
    if (planUsage) {
      await recordTextUsage(
        projectId,
        session.user.id,
        novelPromotionData.analysisModel,
        'storyboard_text_plan_regenerate',
        planUsage.prompt_tokens || 0,
        planUsage.completion_tokens || 0,
        { clipId: clip.id, storyboardId }
      )
    }

    const planResponseText = getCompletionContent(planCompletion)
    if (!planResponseText) {
      throw new Error(`第一阶段无响应: clip ${clipId}`)
    }

    // 解析第一阶段 JSON
    let planPanels: any[]
    let jsonText = planResponseText.trim()
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')

    const firstBracket = jsonText.indexOf('[')
    const lastBracket = jsonText.lastIndexOf(']')

    if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
      throw new Error(`第一阶段JSON格式错误: clip ${clipId}`)
    }

    jsonText = jsonText.substring(firstBracket, lastBracket + 1)

    try {
      planPanels = JSON.parse(jsonText)
    } catch (parseError: any) {
      throw new Error(`第一阶段JSON解析失败: ${parseError.message}`)
    }

    if (!Array.isArray(planPanels) || planPanels.length === 0) {
      throw new Error(`第一阶段返回空数据: clip ${clipId}`)
    }

    // 统计有效分镜数量
    const validPanelCount = planPanels.filter(panel =>
      panel.description && panel.description !== '无' && panel.location !== '无'
    ).length
    console.log(`[Phase 1] Clip ${clipId}: 共 ${planPanels.length} 个分镜，其中 ${validPanelCount} 个有效分镜`)

    if (validPanelCount === 0) {
      throw new Error(`第一阶段返回全部为空分镜: clip ${clipId}`)
    }

    // 如果有空分镜，记录警告（新提示词要求必须9个有效分镜）
    if (validPanelCount < 12) {
      console.warn(`[Phase 1] Clip ${clipId}: 警告 - 只有 ${validPanelCount}/12 个有效分镜，可能需要检查提示词`)
    }

    // ========== 检测 source_text 字段，缺失则重试 ==========
    const MAX_RETRIES = 2
    let retryCount = 0

    while (retryCount < MAX_RETRIES) {
      // 检查是否所有 panel 都有 source_text
      const missingSourceText = planPanels.some(panel => !panel.source_text)

      if (!missingSourceText) {
        break // 所有 panel 都有 source_text，跳出循环
      }

      retryCount++
      console.log(`[Phase 1] Clip ${clipId}: 检测到缺少 source_text 字段，自动重试 (${retryCount}/${MAX_RETRIES})`)

      // 重新调用 AI
      const retryCompletion = await chatCompletion(
        session.user.id,
        novelPromotionData.analysisModel,
        [{ role: 'user', content: planPrompt }],
        { reasoning: true, projectId, action: 'storyboard_text_plan_retry' }
      )

      const retryResponseText = getCompletionContent(retryCompletion)
      if (!retryResponseText) {
        console.warn(`[Phase 1] Clip ${clipId}: 重试无响应，使用原结果`)
        break
      }

      // 解析重试结果
      let retryJsonText = retryResponseText.trim()
      retryJsonText = retryJsonText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')

      const retryFirstBracket = retryJsonText.indexOf('[')
      const retryLastBracket = retryJsonText.lastIndexOf(']')

      if (retryFirstBracket !== -1 && retryLastBracket !== -1 && retryLastBracket > retryFirstBracket) {
        retryJsonText = retryJsonText.substring(retryFirstBracket, retryLastBracket + 1)
        try {
          const retryPanels = JSON.parse(retryJsonText)
          if (Array.isArray(retryPanels) && retryPanels.length > 0) {
            planPanels = retryPanels
            console.log(`[Phase 1] Clip ${clipId}: 重试成功，获得 ${retryPanels.length} 个分镜`)
          }
        } catch (e) {
          console.warn(`[Phase 1] Clip ${clipId}: 重试解析失败，使用原结果`)
        }
      }
    }

    // 最终检查并记录状态
    const finalMissingCount = planPanels.filter(p => !p.source_text).length
    if (finalMissingCount > 0) {
      console.warn(`[Phase 1] Clip ${clipId}: 仍有 ${finalMissingCount}/${planPanels.length} 个分镜缺少 source_text`)
    }

    console.log(`[Phase 1] Clip ${clipId}: 生成 ${planPanels.length} 个基础分镜`)

    // 记录第一阶段完整输出（包含"无"的空分镜）
    logAIAnalysis(session.user.id, session.user.name, projectId, project.name, {
      action: 'REGENERATE_STORYBOARD_PHASE1_OUTPUT',
      output: {
        片段标识: clipId,
        总分镜数: planPanels.length,
        有效分镜数: validPanelCount,
        第一阶段完整结果: planPanels
      },
      model: novelPromotionData.analysisModel
    })

    // ========== 第二阶段：补充镜头细节和 video_prompt ==========
    const detailPrompt = detailPromptTemplate
      .replace('{panels_json}', JSON.stringify(planPanels, null, 2))
      .replace('{characters_age_gender}', charactersAgeGender)
      .replace('{locations_description}', locationsDescription)

    // 记录发送给第二阶段 AI 的完整 prompt
    logAIAnalysis(session.user.id, session.user.name, projectId, project.name, {
      action: 'REGENERATE_STORYBOARD_PHASE2_PROMPT',
      input: {
        片段标识: clipId,
        完整提示词: detailPrompt
      },
      model: novelPromotionData.analysisModel
    })

    console.log(`[Phase 2] Clip ${clipId}: 补充镜头细节和video_prompt...`)

    const detailCompletion = await chatCompletion(
      session.user.id,
      novelPromotionData.analysisModel,
      [{ role: 'user', content: detailPrompt }],
      { reasoning: true, projectId, action: 'storyboard_text_detail' }
    )

    // 💰 记录第二阶段费用
    const detailUsage = (detailCompletion as any).usage
    if (detailUsage) {
      await recordTextUsage(
        projectId,
        session.user.id,
        novelPromotionData.analysisModel,
        'storyboard_text_detail_regenerate',
        detailUsage.prompt_tokens || 0,
        detailUsage.completion_tokens || 0,
        { clipId: clip.id, storyboardId }
      )
    }

    const detailResponseText = getCompletionContent(detailCompletion)
    if (!detailResponseText) {
      throw new Error(`第二阶段无响应: clip ${clipId}`)
    }

    // 解析第二阶段 JSON
    let finalPanels: any[]
    let detailJsonText = detailResponseText.trim()
    detailJsonText = detailJsonText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')

    const detailFirstBracket = detailJsonText.indexOf('[')
    const detailLastBracket = detailJsonText.lastIndexOf(']')

    if (detailFirstBracket === -1 || detailLastBracket === -1 || detailLastBracket <= detailFirstBracket) {
      console.warn(`[Phase 2] Clip ${clipId}: JSON格式错误，使用第一阶段结果`)
      finalPanels = planPanels
    } else {
      detailJsonText = detailJsonText.substring(detailFirstBracket, detailLastBracket + 1)

      try {
        finalPanels = JSON.parse(detailJsonText)
      } catch (parseError: any) {
        console.warn(`[Phase 2] Clip ${clipId}: JSON解析失败，使用第一阶段结果`)
        finalPanels = planPanels
      }
    }

    if (!Array.isArray(finalPanels) || finalPanels.length === 0) {
      finalPanels = planPanels
    }

    // 记录第二阶段完整输出（包含"无"的空分镜，过滤前）
    const fullPanelsBeforeFilter = [...finalPanels]
    logAIAnalysis(session.user.id, session.user.name, projectId, project.name, {
      action: 'REGENERATE_STORYBOARD_PHASE2_OUTPUT',
      output: {
        片段标识: clipId,
        总分镜数: fullPanelsBeforeFilter.length,
        第二阶段完整结果_含空分镜: fullPanelsBeforeFilter
      },
      model: novelPromotionData.analysisModel
    })

    // 过滤掉"无"的空分镜（第二阶段也可能返回空分镜）
    const beforeFilterCount = finalPanels.length
    finalPanels = finalPanels.filter((panel: any) =>
      panel.description && panel.description !== '无' && panel.location !== '无'
    )
    console.log(`[Phase 2] Clip ${clipId}: 过滤空分镜 ${beforeFilterCount} -> ${finalPanels.length} 个有效分镜`)

    console.log(`[Phase 2] Clip ${clipId}: 完成，共 ${finalPanels.length} 个分镜`)

    // 记录最终结果
    logAIAnalysis(session.user.id, session.user.name, projectId, project.name, {
      action: 'REGENERATE_STORYBOARD_FINAL_OUTPUT',
      output: {
        片段标识: clipId,
        过滤前总数: beforeFilterCount,
        过滤后有效数: finalPanels.length,
        最终有效分镜: finalPanels
      },
      model: novelPromotionData.analysisModel
    })

    // 删除旧的Panel记录
    await (prisma as any).novelPromotionPanel.deleteMany({
      where: { storyboardId }
    })

    // 更新storyboard的panelCount
    await (prisma as any).novelPromotionStoryboard.update({
      where: { id: storyboardId },
      data: { panelCount: finalPanels.length }
    })

    // 创建新的Panel记录
    for (let i = 0; i < finalPanels.length; i++) {
      const panel = finalPanels[i]
      await (prisma as any).novelPromotionPanel.create({
        data: {
          storyboardId: storyboardId,
          panelIndex: i,
          panelNumber: panel.panel_number ?? i + 1,
          shotType: panel.shot_type || null,
          cameraMove: panel.camera_move || null,
          description: panel.description || null,
          location: panel.location || null,
          characters: panel.characters ? JSON.stringify(panel.characters) : null,
          srtStart: panel.srt_range?.[0] || null,
          srtEnd: panel.srt_range?.[1] || null,
          duration: panel.duration || null,
          videoPrompt: panel.video_prompt || null,
          sceneType: panel.scene_type || null,
          srtSegment: panel.source_text || null    // 存储该镜头对应的原文片段
        }
      })
    }

    console.log(`[RegenerateStoryboard] Clip ${clipId}: 重新生成完成，共 ${finalPanels.length} 个分镜`)

    return NextResponse.json({
      success: true,
      storyboardId,
      panelCount: finalPanels.length,
      clipId
    })
  } catch (error: any) {
    // 处理 billing 错误
    const billingError = handleBillingError(error)
    if (billingError) return billingError
    throw error  // 重新抛出让 apiHandler 处理
  }
})
