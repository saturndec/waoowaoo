import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logProjectAction, logError } from '@/lib/logger'
import { generateTTSWithSRT } from '@/lib/azure-tts'
import { recordTTSUsage, checkBalance, InsufficientBalanceError, calcTTS } from '@/lib/pricing'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

// POST - 生成TTS音频
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const session = authResult.session
  const project = authResult.project
  const novelPromotionData = authResult.novelData

  const body = await request.json().catch(() => ({}))
  const { episodeId } = body

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS', { message: 'episodeId is required' })
  }

  if (project.mode !== 'novel-promotion') {
    throw new ApiError('INVALID_PARAMS', { message: 'Not a novel promotion project' })
  }

  // 获取剧集数据
  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId }
  })

  if (!episode) {
    throw new ApiError('NOT_FOUND', { message: 'Episode not found' })
  }

  if (episode.novelPromotionProjectId !== novelPromotionData.id) {
    throw new ApiError('INVALID_PARAMS', { message: 'Episode does not belong to this project' })
  }

  if (!episode.novelText) {
    throw new ApiError('INVALID_PARAMS', { message: 'No novel text to process in this episode' })
  }

  // 💰 预扣费检查 - 由于 billing 函数有特殊处理，保留内部 try-catch
  try {
    const estimatedCost = calcTTS(episode.novelText.length)
    await checkBalance(session.user.id, estimatedCost)
  } catch (error: any) {
    if (error instanceof InsufficientBalanceError) {
      return NextResponse.json(
        { error: error.message, code: 'INSUFFICIENT_BALANCE' },
        { status: 402 }
      )
    }
    throw error
  }

  // 调用Azure TTS生成音频和SRT
  // 从配置中读取语速和声音设置
  const ttsRate = (novelPromotionData as any).ttsRate || '+50%'
  const ttsVoice = (novelPromotionData as any).ttsVoice || 'zh-CN-YunxiNeural'
  const result = await generateTTSWithSRT(
    episode.novelText,
    projectId,
    ttsVoice,
    ttsRate
  )

  // 记录 TTS 费用（按字符数计费）
  await recordTTSUsage(
    projectId,
    session.user.id,
    'tts',
    episode.novelText.length,
    { voice: ttsVoice, rate: ttsRate, duration: result.duration }
  )

  // 更新剧集数据
  await prisma.novelPromotionEpisode.update({
    where: { id: episodeId },
    data: {
      audioUrl: result.audioUrl,
      srtContent: result.srtContent
    }
  })

  // 更新项目阶段
  await prisma.novelPromotionProject.update({
    where: { projectId },
    data: { stage: 'tts' }
  })

  logProjectAction(
    'GENERATE_TTS',
    session.user.id,
    session.user.name,
    projectId,
    project.name,
    {
      episodeId,
      episodeName: episode.name,
      textLength: episode.novelText.length,
      voice: ttsVoice,
      rate: ttsRate,
      audioUrl: result.audioUrl
    }
  )

  return NextResponse.json({
    success: true,
    audioUrl: result.audioUrl,
    srtContent: result.srtContent,
    duration: result.duration,
    episodeId
  })
})
