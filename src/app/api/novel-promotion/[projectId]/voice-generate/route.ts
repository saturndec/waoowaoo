import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logError } from '@/lib/logger'
import { uploadToCOS, getSignedUrl, imageUrlToBase64 } from '@/lib/cos'
import { withVoiceBilling, handleBillingError } from '@/lib/pricing'
import { submitFalTask, queryFalStatus } from '@/lib/async-submit'
import { fal } from '@fal-ai/client'
import { getFalApiKey } from '@/lib/api-config'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

// 注意：fal.config 不再全局设置，改为在调用时动态传入 credentials

const TTS_ENDPOINT = 'fal-ai/index-tts-2/text-to-speech'

function getWavDurationFromBuffer(buffer: Buffer): number {
  try {
    const riff = buffer.slice(0, 4).toString('ascii')
    if (riff !== 'RIFF') {
      return Math.round((buffer.length * 8) / 128)
    }

    const byteRate = buffer.readUInt32LE(28)

    let offset = 12
    let dataSize = 0

    while (offset < buffer.length - 8) {
      const chunkId = buffer.slice(offset, offset + 4).toString('ascii')
      const chunkSize = buffer.readUInt32LE(offset + 4)

      if (chunkId === 'data') {
        dataSize = chunkSize
        break
      }

      offset += 8 + chunkSize
    }

    if (dataSize > 0 && byteRate > 0) {
      return Math.round((dataSize / byteRate) * 1000)
    }

    return Math.round((buffer.length * 8) / 128)
  } catch {
    return Math.round((buffer.length * 8) / 128)
  }
}

async function generateVoiceWithIndexTTS2(
  referenceAudioUrl: string,
  text: string,
  emotionPrompt?: string | null,
  strength: number = 0.4,
  falApiKey?: string
): Promise<{ success: boolean; audioData?: Buffer; audioDuration?: number; error?: string }> {
  try {
    console.log(`IndexTTS2: Generating with reference audio, strength: ${strength}`)
    if (emotionPrompt) {
      console.log(`IndexTTS2: Using emotion prompt: ${emotionPrompt}`)
    }

    // 动态配置 FAL credentials
    if (falApiKey) {
      fal.config({ credentials: falApiKey })
    }

    // 🔥 转换参考音频为Data URL（适配内网环境）
    const audioDataUrl = referenceAudioUrl.startsWith('data:')
      ? referenceAudioUrl
      : await imageUrlToBase64(referenceAudioUrl)
    console.log(`IndexTTS2: 已转换参考音频为 Data URL`)

    const input: any = {
      audio_url: audioDataUrl,
      prompt: text,
      should_use_prompt_for_emotion: true,
      strength: strength
    }

    if (emotionPrompt && emotionPrompt.trim()) {
      input.emotion_prompt = emotionPrompt.trim()
    }

    const result = await fal.subscribe('fal-ai/index-tts-2/text-to-speech', {
      input,
      logs: false
    })

    const audioUrl = (result as any).data?.audio?.url
    if (!audioUrl) {
      return { success: false, error: 'No audio URL in response' }
    }

    const response = await fetch(audioUrl)
    const arrayBuffer = await response.arrayBuffer()
    const audioData = Buffer.from(arrayBuffer)

    const audioDuration = getWavDurationFromBuffer(audioData)
    console.log(`IndexTTS2: Generated audio duration: ${audioDuration}ms`)

    return { success: true, audioData, audioDuration }
  } catch (error: any) {
    console.error('IndexTTS2 error:', error)
    return { success: false, error: error.message }
  }
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const session = authResult.session

  const body = await request.json()
  const { episodeId, lineId, all } = body

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS', { message: 'episodeId is required' })
  }

  const novelPromotionData = await prisma.novelPromotionProject.findFirst({
    where: { projectId },
    include: { characters: true }
  })
  const characters = novelPromotionData?.characters || []

  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId },
    select: { speakerVoices: true }
  })

  let speakerVoices: Record<string, { voiceType: string; voiceId?: string; audioUrl: string }> = {}
  if (episode?.speakerVoices) {
    try { speakerVoices = JSON.parse(episode.speakerVoices) } catch { speakerVoices = {} }
  }

  const matchCharacterBySpeaker = (speaker: string) => {
    const exactMatch = characters.find(c => c.name === speaker)
    if (exactMatch) return exactMatch
    return characters.find(c => c.name.includes(speaker) || speaker.includes(c.name))
  }

  const getSpeakerVoiceUrl = (speaker: string): string | null => {
    const char = matchCharacterBySpeaker(speaker)
    if (char?.customVoiceUrl) return char.customVoiceUrl
    const speakerVoice = speakerVoices[speaker]
    if (speakerVoice?.audioUrl) return speakerVoice.audioUrl
    return null
  }

  let voiceLines: any[]

  if (all) {
    voiceLines = await prisma.novelPromotionVoiceLine.findMany({
      where: { episodeId, audioUrl: null },
      orderBy: { lineIndex: 'asc' }
    })
    voiceLines = voiceLines.filter(line => getSpeakerVoiceUrl(line.speaker))
  } else if (lineId) {
    const line = await prisma.novelPromotionVoiceLine.findUnique({ where: { id: lineId } })
    if (!line) {
      throw new ApiError('NOT_FOUND', { message: 'Voice line not found' })
    }
    if (!getSpeakerVoiceUrl(line.speaker)) {
      throw new ApiError('INVALID_PARAMS', { message: '请先为该发言人设置参考音频' })
    }
    voiceLines = [line]
  } else {
    throw new ApiError('INVALID_PARAMS', { message: 'lineId or all=true is required' })
  }

  if (voiceLines.length === 0) {
    return NextResponse.json({ success: true, message: 'No voice lines to generate', generated: 0 })
  }

  // 预估时长：每条台词平均5秒
  const estimatedSeconds = voiceLines.length * 5

  // 使用 withVoiceBilling 包装 - 由于 billing 函数有特殊处理，保留内部 try-catch
  try {
    const result = await withVoiceBilling(
      session.user.id,
      estimatedSeconds,
      { projectId, action: 'batch_voice_generate', metadata: { episodeId, lineCount: voiceLines.length } },
      async () => {
        console.log(`Voice Generate: Generating ${voiceLines.length} voice lines with IndexTTS2...`)

        await prisma.novelPromotionVoiceLine.updateMany({
          where: { id: { in: voiceLines.map(l => l.id) } },
          data: { generating: true }
        })

        const results: { lineId: string; success: boolean; audioUrl?: string; error?: string }[] = []

        for (const line of voiceLines) {
          const voiceUrl = getSpeakerVoiceUrl(line.speaker)

          if (!voiceUrl) {
            results.push({ lineId: line.id, success: false, error: '未找到参考音频' })
            await prisma.novelPromotionVoiceLine.update({
              where: { id: line.id },
              data: { generating: false }
            })
            continue
          }

          console.log(`Voice Generate: Line ${line.lineIndex} - "${line.content.substring(0, 30)}..." with IndexTTS2`)

          const fullAudioUrl = voiceUrl.startsWith('http') ? voiceUrl : getSignedUrl(voiceUrl, 3600)

          // 获取用户的 FAL API Key
          const falApiKey = await getFalApiKey(session.user.id)

          const emotionStrength = line.emotionStrength ?? 0.4
          const genResult = await generateVoiceWithIndexTTS2(
            fullAudioUrl,
            line.content,
            line.emotionPrompt,
            emotionStrength,
            falApiKey
          )

          if (genResult.success && genResult.audioData) {
            try {
              const audioKey = `voice/${projectId}/${episodeId}/${line.id}.wav`
              const audioUrl = await uploadToCOS(genResult.audioData, audioKey)

              await prisma.novelPromotionVoiceLine.update({
                where: { id: line.id },
                data: {
                  audioUrl,
                  audioDuration: genResult.audioDuration || null,
                  generating: false
                }
              })

              const signedUrl = getSignedUrl(audioUrl, 7200)
              results.push({ lineId: line.id, success: true, audioUrl: signedUrl })
            } catch (uploadError: any) {
              console.error('Upload to COS failed:', uploadError)
              await prisma.novelPromotionVoiceLine.update({
                where: { id: line.id },
                data: { generating: false }
              })
              results.push({ lineId: line.id, success: false, error: 'Upload failed: ' + uploadError.message })
            }
          } else {
            await prisma.novelPromotionVoiceLine.update({
              where: { id: line.id },
              data: { generating: false }
            })
            results.push({ lineId: line.id, success: false, error: genResult.error })
          }
        }

        const successCount = results.filter(r => r.success).length
        console.log(`Voice Generate: Completed ${successCount}/${voiceLines.length} voice lines`)

        return {
          success: true,
          generated: successCount,
          total: voiceLines.length,
          results
        }
      }
    )

    return NextResponse.json(result)
  } catch (error: any) {
    // 处理 billing 错误（余额不足等）
    const billingError = handleBillingError(error)
    if (billingError) return billingError
    throw error  // 重新抛出让 apiHandler 处理
  }
})
