import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import * as fs from 'fs'
import * as path from 'path'
import { logAIAnalysis } from '@/lib/logger'
import { withTextBilling } from '@/lib/pricing'
import { buildCharactersIntroduction } from '@/lib/constants'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * 构建分镜数据JSON，用于AI分析时匹配台词和镜头
 */
function buildStoryboardJson(storyboards: any[]): string {
  const panelsData: any[] = []

  for (const sb of storyboards) {
    const panels = sb.panels || []
    for (const panel of panels) {
      panelsData.push({
        storyboardId: sb.id,
        panelIndex: panel.panelIndex,
        text_segment: panel.srtSegment || '',
        description: panel.description || '',
        characters: panel.characters || ''
      })
    }
  }

  if (panelsData.length === 0) {
    return '无分镜数据'
  }

  return JSON.stringify(panelsData, null, 2)
}

/**
 * POST /api/novel-promotion/[projectId]/voice-analyze
 * 分析剧本/文字内容，提取台词和发言人，并匹配对应镜头
 * 需要传入 episodeId
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const session = authResult.session
  const project = authResult.project

  const body = await request.json()
  const { episodeId } = body

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS', { message: 'episodeId is required' })
  }

  if (project.mode !== 'novel-promotion') {
    throw new ApiError('INVALID_PARAMS', { message: 'Not a novel promotion project' })
  }

  // 获取小说推文数据和角色库
  const novelPromotionData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    include: {
      characters: true
    }
  })

  if (!novelPromotionData) {
    throw new ApiError('NOT_FOUND', { message: 'Novel promotion data not found' })
  }

  // 获取剧集数据（包含分镜和Panel）
  // 重要：必须按 createdAt 排序以匹配 UI 显示顺序
  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId },
    include: {
      storyboards: {
        include: {
          clip: true,  // 需要 clip 信息用于可能的排序
          panels: {
            orderBy: { panelIndex: 'asc' }
          }
        },
        orderBy: { createdAt: 'asc' }  // 与 episodes/[episodeId] API 保持一致
      }
    }
  })

  if (!episode) {
    throw new ApiError('NOT_FOUND', { message: 'Episode not found' })
  }

  if (episode.novelPromotionProjectId !== novelPromotionData.id) {
    throw new ApiError('INVALID_PARAMS', { message: 'Episode does not belong to this project' })
  }

  // 获取剧本文字内容
  const novelText = episode.novelText
  if (!novelText) {
    throw new ApiError('INVALID_PARAMS', { message: 'No novel text to analyze' })
  }

  // 读取提示词模板
  const promptPath = path.join(process.cwd(), 'lib', 'prompts', 'novel-promotion', 'voice_analysis.txt')
  let promptTemplate = fs.readFileSync(promptPath, 'utf-8')

  // 构建角色库名字列表
  const charactersLibName = novelPromotionData.characters.length > 0
    ? novelPromotionData.characters.map(c => c.name).join('、')
    : '无'

  // 构建角色介绍（用于 AI 理解“我”和称呼映射）
  const charactersIntroduction = buildCharactersIntroduction(novelPromotionData.characters)

  // 构建分镜数据JSON
  const storyboardJson = buildStoryboardJson(episode.storyboards || [])

  // 替换占位符
  promptTemplate = promptTemplate
    .replace('{input}', novelText)
    .replace('{characters_lib_name}', charactersLibName)
    .replace('{characters_introduction}', charactersIntroduction)
    .replace('{storyboard_json}', storyboardJson)

  console.log('Voice Analysis: Calling OpenRouter API to analyze voice lines...')
  console.log(`Voice Analysis: Found ${episode.storyboards?.length || 0} storyboards with panels`)

  // 📝 记录完整的分析台词请求 - VOICE_ANALYSIS_PROMPT
  logAIAnalysis(
    session.user.id,
    session.user.name,
    projectId,
    project.name,
    {
      action: 'VOICE_ANALYSIS_PROMPT',
      input: {
        episodeId,
        episodeName: episode.name,
        fullPrompt: promptTemplate,  // 完整的发送给AI的prompt
        内容长度: novelText.length,
        角色库: charactersLibName,
        分镜数: episode.storyboards?.length || 0
      },
      model: novelPromotionData.analysisModel
    }
  )

  // 💰 使用 withTextBilling 包装整个生成逻辑
  // 预估 token 数：输入约 75%，输出约 25%
  const estimatedTokens = Math.min(novelText.length * 2, 20000)
  const estimatedInputTokens = Math.round(estimatedTokens * 0.75)
  const estimatedOutputTokens = Math.round(estimatedTokens * 0.25)

  const result = await withTextBilling(
    session.user.id,
    novelPromotionData.analysisModel,
    estimatedInputTokens,
    estimatedOutputTokens,
    {
      projectId,
      action: 'voice-analyze',
      metadata: { episodeId }
    },
    async () => {
      // 调用OpenRouter API
      const completion = await chatCompletion(
        session.user.id,
        novelPromotionData.analysisModel,
        [{ role: 'user', content: promptTemplate }],
        { projectId, action: 'voice_analyze' }
      )

      const responseText = getCompletionContent(completion)
      if (!responseText) {
        throw new Error('No response from AI')
      }

      console.log('Voice Analysis: AI Response:', responseText)

      // 📝 记录完整的分析台词响应 - VOICE_ANALYSIS_OUTPUT
      logAIAnalysis(
        session.user.id,
        session.user.name,
        projectId,
        project.name,
        {
          action: 'VOICE_ANALYSIS_OUTPUT',
          input: {
            episodeId,
            episodeName: episode.name
          },
          output: {
            fullResponse: responseText,  // 完整的AI返回内容
            responseLength: responseText.length
          },
          model: novelPromotionData.analysisModel
        }
      )

      // 解析JSON
      let voiceLinesData: any[]
      try {
        let jsonText = responseText.trim()

        // 移除markdown标记
        jsonText = jsonText.replace(/^```json\s*/i, '')
        jsonText = jsonText.replace(/^```\s*/, '')
        jsonText = jsonText.replace(/\s*```$/, '')

        // 提取JSON数组
        const firstBracket = jsonText.indexOf('[')
        const lastBracket = jsonText.lastIndexOf(']')

        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
          jsonText = jsonText.substring(firstBracket, lastBracket + 1)
        }

        voiceLinesData = JSON.parse(jsonText)
      } catch (parseError) {
        console.error('Failed to parse voice lines JSON:', responseText)
        throw new Error('Invalid JSON response from AI')
      }

      if (!Array.isArray(voiceLinesData) || voiceLinesData.length === 0) {
        throw new Error('Invalid voice lines data structure')
      }

      console.log(`Voice Analysis: Parsed ${voiceLinesData.length} voice lines`)

      // 删除旧的voice lines（该剧集的）
      await prisma.novelPromotionVoiceLine.deleteMany({
        where: { episodeId }
      })

      // 保存台词到数据库（包含镜头匹配信息和情绪系数）
      const createdVoiceLines = []
      for (const lineData of voiceLinesData) {
        // 提取镜头匹配信息
        const matchedPanelInfo = lineData.matchedPanel
        const matchedStoryboardId = matchedPanelInfo?.storyboardId || null
        const matchedPanelIndex = matchedPanelInfo?.panelIndex !== undefined ? matchedPanelInfo.panelIndex : null

        // 查找对应的 Panel ID（新方案：用 ID 关联，更健壮）
        let matchedPanelId: string | null = null
        if (matchedStoryboardId && matchedPanelIndex !== null) {
          const panel = await prisma.novelPromotionPanel.findFirst({
            where: { storyboardId: matchedStoryboardId, panelIndex: matchedPanelIndex },
            select: { id: true }
          })
          matchedPanelId = panel?.id || null
        }

        // 提取情绪系数（AI分析的结果，默认0.4）
        const emotionStrength = typeof lineData.emotionStrength === 'number'
          ? Math.min(1, Math.max(0.1, lineData.emotionStrength)) // 限制在0.1-1.0之间
          : 0.4

        const voiceLine = await prisma.novelPromotionVoiceLine.create({
          data: {
            episodeId,
            lineIndex: lineData.lineIndex || createdVoiceLines.length + 1,
            speaker: lineData.speaker || '未知',
            content: lineData.content || '',
            emotionStrength,
            matchedPanelId,  // New: direct panel reference
            matchedStoryboardId,  // Deprecated but kept for compatibility
            matchedPanelIndex     // Deprecated but kept for compatibility
          }
        })
        createdVoiceLines.push(voiceLine)
      }

      console.log(`Voice Analysis: Created ${createdVoiceLines.length} voice lines in database`)

      return createdVoiceLines
    }
  )

  // 统计发言人
  const speakerStats: Record<string, number> = {}
  for (const line of result) {
    speakerStats[line.speaker] = (speakerStats[line.speaker] || 0) + 1
  }

  // 统计镜头匹配数
  const matchedCount = result.filter(l => l.matchedStoryboardId).length
  console.log(`Voice Analysis: ${matchedCount}/${result.length} voice lines matched to panels`)

  return NextResponse.json({
    success: true,
    voiceLines: result,
    count: result.length,
    matchedCount,
    speakerStats
  })
})
