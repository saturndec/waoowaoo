import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@/lib/cos'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * GET /api/novel-promotion/[projectId]/voice-lines?episodeId=xxx
 * 获取剧集的台词列表
 */
export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const episodeId = searchParams.get('episodeId')

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS', { message: 'episodeId is required' })
  }

  // 获取台词列表（包含匹配的 Panel 信息）
  const voiceLines = await prisma.novelPromotionVoiceLine.findMany({
    where: { episodeId },
    orderBy: { lineIndex: 'asc' },
    include: {
      matchedPanel: {
        select: {
          id: true,
          storyboardId: true,
          panelIndex: true
        }
      }
    }
  })

  // 转换 audioUrl 为签名 URL，并添加兼容字段
  const voiceLinesWithUrls = voiceLines.map(line => ({
    ...line,
    audioUrl: line.audioUrl
      ? (line.audioUrl.startsWith('http') ? line.audioUrl : getSignedUrl(line.audioUrl, 7200))
      : null,
    // Backward compatibility: use matchedPanel if available, else fall back to legacy fields
    matchedStoryboardId: line.matchedPanel?.storyboardId ?? line.matchedStoryboardId,
    matchedPanelIndex: line.matchedPanel?.panelIndex ?? line.matchedPanelIndex
  }))

  // 统计发言人
  const speakerStats: Record<string, number> = {}
  for (const line of voiceLines) {
    speakerStats[line.speaker] = (speakerStats[line.speaker] || 0) + 1
  }

  return NextResponse.json({
    voiceLines: voiceLinesWithUrls,
    count: voiceLines.length,
    speakerStats
  })
})

/**
 * PATCH /api/novel-promotion/[projectId]/voice-lines
 * 更新台词设置（内容、发言人、情绪设置、音频URL）
 * Body: { lineId, content, speaker, emotionPrompt, emotionStrength, audioUrl } 
 *    或 { speaker, episodeId, voicePresetId } (批量更新同一发言人的音色)
 */
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { lineId, speaker, episodeId, voicePresetId, emotionPrompt, emotionStrength, content, audioUrl } = body

  // 单条更新
  if (lineId) {
    const updateData: any = {}
    if (voicePresetId !== undefined) updateData.voicePresetId = voicePresetId
    if (emotionPrompt !== undefined) updateData.emotionPrompt = emotionPrompt || null
    if (emotionStrength !== undefined) updateData.emotionStrength = emotionStrength
    if (content !== undefined) updateData.content = content.trim()
    if (speaker !== undefined && !episodeId) updateData.speaker = speaker.trim()
    if (audioUrl !== undefined) updateData.audioUrl = audioUrl // 支持清空音频 (传 null)

    const updated = await prisma.novelPromotionVoiceLine.update({
      where: { id: lineId },
      data: updateData
    })
    return NextResponse.json({ success: true, voiceLine: updated })
  }

  // 批量更新同一发言人（仅支持更新音色）
  if (speaker && episodeId) {
    const result = await prisma.novelPromotionVoiceLine.updateMany({
      where: {
        episodeId,
        speaker
      },
      data: { voicePresetId }
    })
    return NextResponse.json({
      success: true,
      updatedCount: result.count,
      speaker,
      voicePresetId
    })
  }

  throw new ApiError('INVALID_PARAMS', { message: 'lineId or (speaker + episodeId) is required' })
})

/**
 * DELETE /api/novel-promotion/[projectId]/voice-lines?lineId=xxx
 * 删除单条台词
 */
export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const lineId = searchParams.get('lineId')

  if (!lineId) {
    throw new ApiError('INVALID_PARAMS', { message: 'lineId is required' })
  }

  // 获取要删除的台词
  const lineToDelete = await prisma.novelPromotionVoiceLine.findUnique({
    where: { id: lineId }
  })

  if (!lineToDelete) {
    throw new ApiError('NOT_FOUND', { message: 'Voice line not found' })
  }

  // 删除台词
  await prisma.novelPromotionVoiceLine.delete({
    where: { id: lineId }
  })

  // 重新排序剩余台词的 lineIndex
  const remainingLines = await prisma.novelPromotionVoiceLine.findMany({
    where: { episodeId: lineToDelete.episodeId },
    orderBy: { lineIndex: 'asc' }
  })

  // 更新每条台词的 lineIndex
  for (let i = 0; i < remainingLines.length; i++) {
    if (remainingLines[i].lineIndex !== i + 1) {
      await prisma.novelPromotionVoiceLine.update({
        where: { id: remainingLines[i].id },
        data: { lineIndex: i + 1 }
      })
    }
  }

  return NextResponse.json({
    success: true,
    deletedId: lineId,
    remainingCount: remainingLines.length
  })
})
