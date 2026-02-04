import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateLipSync } from '@/lib/kling'
import { getSignedUrl, uploadToCOS } from '@/lib/cos'
import { logError } from '@/lib/logger'
import { handleBillingError, InsufficientBalanceError } from '@/lib/pricing'
import { freezeBalance, confirmChargeWithRecord, rollbackFreeze, getBalance } from '@/lib/pricing/balance'
import { calcLipSync } from '@/lib/pricing/calculator'
import { createAsyncTask, TASK_TYPES } from '@/lib/async-task-manager'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * 从URL下载WAV文件
 */
async function downloadWavFromUrl(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * 获取 WAV 文件信息
 */
function getWavInfo(buffer: Buffer): { sampleRate: number; numChannels: number; bitsPerSample: number; byteRate: number; dataSize: number; dataOffset: number } | null {
  try {
    if (buffer.slice(0, 4).toString('ascii') !== 'RIFF') {
      return null
    }

    const numChannels = buffer.readUInt16LE(22)
    const sampleRate = buffer.readUInt32LE(24)
    const byteRate = buffer.readUInt32LE(28)
    const bitsPerSample = buffer.readUInt16LE(34)

    let offset = 12
    let dataSize = 0
    let dataOffset = 0

    while (offset < buffer.length - 8) {
      const chunkId = buffer.slice(offset, offset + 4).toString('ascii')
      const chunkSize = buffer.readUInt32LE(offset + 4)

      if (chunkId === 'data') {
        dataSize = chunkSize
        dataOffset = offset + 8
        break
      }

      offset += 8 + chunkSize
    }

    return { sampleRate, numChannels, bitsPerSample, byteRate, dataSize, dataOffset }
  } catch {
    return null
  }
}

/**
 * 将 WAV 音频填充静音到目标时长
 */
function padWavToMinDuration(buffer: Buffer, targetDurationMs: number): Buffer {
  const info = getWavInfo(buffer)
  if (!info) {
    console.warn('[Lip Sync] Cannot parse WAV file, returning original')
    return buffer
  }

  const { sampleRate, numChannels, bitsPerSample, byteRate, dataSize, dataOffset } = info
  const currentDurationMs = (dataSize / byteRate) * 1000

  if (currentDurationMs >= targetDurationMs) {
    return buffer
  }

  const additionalMs = targetDurationMs - currentDurationMs
  const additionalBytes = Math.ceil((additionalMs / 1000) * byteRate)

  console.log(`[Lip Sync] Padding audio from ${currentDurationMs.toFixed(0)}ms to ${targetDurationMs}ms (adding ${additionalBytes} bytes of silence)`)

  const silenceData = Buffer.alloc(additionalBytes, 0)
  const newDataSize = dataSize + additionalBytes

  const headerAndData = buffer.slice(0, dataOffset)
  const originalData = buffer.slice(dataOffset, dataOffset + dataSize)

  const newBuffer = Buffer.concat([headerAndData, originalData, silenceData])

  newBuffer.writeUInt32LE(newBuffer.length - 8, 4)

  let offset = 12
  while (offset < newBuffer.length - 8) {
    const chunkId = newBuffer.slice(offset, offset + 4).toString('ascii')
    if (chunkId === 'data') {
      newBuffer.writeUInt32LE(newDataSize, offset + 4)
      break
    }
    const chunkSize = newBuffer.readUInt32LE(offset + 4)
    offset += 8 + chunkSize
  }

  return newBuffer
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params
  let freezeId: string | null = null

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const session = authResult.session

  const body = await request.json()
  const { storyboardId, panelIndex, voiceLineId } = body

  if (!storyboardId || panelIndex === undefined || !voiceLineId) {
    throw new ApiError('INVALID_PARAMS', {
      message: 'Missing required parameters: storyboardId, panelIndex, voiceLineId'
    })
  }

  const panel = await prisma.novelPromotionPanel.findFirst({
    where: { storyboardId, panelIndex }
  })
  if (!panel) {
    throw new ApiError('NOT_FOUND', { message: 'Panel not found' })
  }
  if (!panel.videoUrl) {
    throw new ApiError('INVALID_PARAMS', { message: 'Panel has no video' })
  }

  const voiceLine = await prisma.novelPromotionVoiceLine.findUnique({
    where: { id: voiceLineId }
  })
  if (!voiceLine) {
    throw new ApiError('NOT_FOUND', { message: 'Voice line not found' })
  }
  if (!voiceLine.audioUrl) {
    throw new ApiError('INVALID_PARAMS', { message: 'Voice line has no audio' })
  }

  console.log(`[Lip Sync] Starting for panel ${storyboardId}-${panelIndex} with voice line ${voiceLineId}, audio duration: ${voiceLine.audioDuration}ms`)

  // ========================================
  // 🔧 异步任务专用计费模式：先计费，后执行
  // 避免将长时间异步操作包含在数据库事务中
  // ========================================

  try {
    // 1. 先冻结余额（快速事务）
    const cost = calcLipSync()
    freezeId = await freezeBalance(session.user.id, cost)

    if (!freezeId) {
      const balance = await getBalance(session.user.id)
      throw new InsufficientBalanceError(cost, balance.balance)
    }

    // 2. 立即确认扣费（在异步任务提交前完成计费）
    const billingSuccess = await confirmChargeWithRecord(freezeId, {
      projectId,
      action: 'lip_sync',
      metadata: { storyboardId, panelIndex, voiceLineId },
      apiType: 'lip-sync',
      model: 'kling',
      quantity: 1,
      unit: 'call'
    })

    if (!billingSuccess) {
      throw new Error('确认扣费失败')
    }

    // 计费已完成，清空 freezeId 防止后续错误回滚
    freezeId = null;
    console.log(`[Lip Sync] 计费已完成，开始执行任务`)

    // 3. 执行异步任务（不在事务内）
    await prisma.novelPromotionPanel.update({
      where: { id: panel.id },
      data: { generatingLipSync: true }
    })

    try {
      const signedVideoUrl = panel.videoUrl.startsWith('http')
        ? panel.videoUrl
        : getSignedUrl(panel.videoUrl, 7200)

      const MIN_AUDIO_DURATION_MS = 2000
      let signedAudioUrl: string

      if (voiceLine.audioDuration && voiceLine.audioDuration < MIN_AUDIO_DURATION_MS) {
        console.log(`[Lip Sync] Audio is too short (${voiceLine.audioDuration}ms), padding to ${MIN_AUDIO_DURATION_MS}ms`)

        const originalAudioUrl = voiceLine.audioUrl.startsWith('http')
          ? voiceLine.audioUrl
          : getSignedUrl(voiceLine.audioUrl, 3600)

        const audioBuffer = await downloadWavFromUrl(originalAudioUrl)
        const paddedAudio = padWavToMinDuration(audioBuffer, MIN_AUDIO_DURATION_MS)

        const paddedAudioKey = `temp/lip-sync-padded/${voiceLine.id}-${Date.now()}.wav`
        await uploadToCOS(paddedAudio, paddedAudioKey)

        signedAudioUrl = getSignedUrl(paddedAudioKey, 7200)
        console.log(`[Lip Sync] Padded audio uploaded: ${paddedAudioKey}`)
      } else {
        signedAudioUrl = voiceLine.audioUrl.startsWith('http')
          ? voiceLine.audioUrl
          : getSignedUrl(voiceLine.audioUrl, 7200)
      }

      const lipSyncResult = await generateLipSync({
        videoUrl: signedVideoUrl,
        audioUrl: signedAudioUrl
      }, session.user.id)

      // 异步模式：LipSync现在返回requestId而不是videoUrl
      if (lipSyncResult.async) {
        console.log(`[Lip Sync Async] 任务已提交: ${lipSyncResult.requestId}`)

        const externalId = `FAL:fal-ai/kling-video/lipsync/audio-to-video:${lipSyncResult.requestId}`

        // 保存任务ID到数据库，由前端轮询或Cron处理
        await prisma.novelPromotionPanel.update({
          where: { id: panel.id },
          data: {
            lipSyncTaskId: externalId,
            generatingLipSync: true  // 保持生成状态
          }
        })

        // 🔥 创建 AsyncTask 记录供 Cron 冷轮询兜底
        await createAsyncTask({
          type: TASK_TYPES.LIP_SYNC_PANEL,
          targetId: panel.id,
          targetType: 'NovelPromotionPanel',
          externalId,
          payload: { storyboardId, panelIndex, voiceLineId },
          userId: session.user.id
        })
        console.log(`[Lip Sync Async] AsyncTask 已创建，供 Cron 兜底`)

        return NextResponse.json({
          success: true,
          async: true,
          requestId: lipSyncResult.requestId,
          message: '口型同步任务已提交，请等待处理完成'
        })
      }

      // 同步模式（备用）
      // 🔥 使用统一的媒体处理服务
      console.log(`[Lip Sync] FAL AI returned video: ${lipSyncResult.videoUrl}`)

      const { processMediaResult } = await import('@/lib/services/media-handler')
      const cosVideoKey = await processMediaResult({
        source: lipSyncResult.videoUrl!,
        type: 'video',
        keyPrefix: 'lip-sync',
        targetId: panel.id
      })

      console.log(`[Lip Sync] Video uploaded to COS: ${cosVideoKey}`)

      await prisma.novelPromotionPanel.update({
        where: { id: panel.id },
        data: {
          lipSyncVideoUrl: cosVideoKey,
          lipSyncTaskId: lipSyncResult.requestId,
          generatingLipSync: false
        }
      })

      const signedResultUrl = getSignedUrl(cosVideoKey)

      return NextResponse.json({
        success: true,
        lipSyncVideoUrl: signedResultUrl,
        requestId: lipSyncResult.requestId
      })
    } catch (error: any) {
      // 任务执行失败，但计费已完成，不退款（任务已提交到FAL）
      await prisma.novelPromotionPanel.update({
        where: { id: panel.id },
        data: { generatingLipSync: false }
      })
      throw error
    }
  } catch (error: any) {
    // 如果还有未确认的冻结，回滚
    if (freezeId) {
      try {
        await rollbackFreeze(freezeId)
        console.log(`[Lip Sync] 余额已回滚: ${freezeId}`)
      } catch (rollbackError) {
        console.error('[Lip Sync] 回滚失败:', rollbackError)
      }
    }

    // 处理 billing 错误
    const billingError = handleBillingError(error)
    if (billingError) return billingError
    throw error  // 重新抛出让 apiHandler 处理
  }
})

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const storyboardId = searchParams.get('storyboardId')
  const panelIndex = searchParams.get('panelIndex')

  if (!storyboardId || panelIndex === null) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing storyboardId or panelIndex' })
  }

  const panel = await prisma.novelPromotionPanel.findFirst({
    where: {
      storyboardId,
      panelIndex: parseInt(panelIndex)
    }
  })

  if (!panel) {
    throw new ApiError('NOT_FOUND', { message: 'Panel not found' })
  }

  const matchedVoiceLines = await prisma.novelPromotionVoiceLine.findMany({
    where: {
      // Use matchedPanelId for robust queries (not affected by panel reordering)
      // Fall back to legacy fields for backward compatibility
      OR: [
        { matchedPanelId: panel.id },
        {
          matchedStoryboardId: storyboardId,
          matchedPanelIndex: parseInt(panelIndex),
          matchedPanelId: null  // Only use legacy if new field not set
        }
      ],
      audioUrl: { not: null }
    },
    orderBy: { lineIndex: 'asc' }
  })

  return NextResponse.json({
    success: true,
    panel: {
      id: panel.id,
      videoUrl: panel.videoUrl ? getSignedUrl(panel.videoUrl) : null,
      lipSyncVideoUrl: panel.lipSyncVideoUrl ? getSignedUrl(panel.lipSyncVideoUrl) : null,
      generatingLipSync: panel.generatingLipSync,
      lipSyncTaskId: panel.lipSyncTaskId
    },
    matchedVoiceLines: matchedVoiceLines.map(vl => ({
      id: vl.id,
      lineIndex: vl.lineIndex,
      speaker: vl.speaker,
      content: vl.content,
      audioUrl: vl.audioUrl ? getSignedUrl(vl.audioUrl) : null,
      audioDuration: vl.audioDuration,
      emotionStrength: vl.emotionStrength
    }))
  })
})
