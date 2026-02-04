import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadToCOS, generateUniqueKey, getSignedUrl } from '@/lib/cos'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

const TEST_TEXT = '这是一段测试音频，测试语音合成的效果。'

interface SpeakerVoiceConfig {
  voiceType: 'azure' | 'custom'
  voiceId?: string      // Azure语音ID
  audioUrl: string      // 参考音频URL（COS key）
}

/**
 * GET /api/novel-promotion/[projectId]/speaker-voice?episodeId=xxx
 * 获取剧集的发言人音色配置
 */
export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params
  const { searchParams } = new URL(request.url)
  const episodeId = searchParams.get('episodeId')

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS', { message: 'episodeId is required' })
  }

  // 获取剧集
  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId }
  })

  if (!episode) {
    throw new ApiError('NOT_FOUND', { message: 'Episode not found' })
  }

  // 解析发言人音色
  let speakerVoices: Record<string, SpeakerVoiceConfig> = {}
  if (episode.speakerVoices) {
    try {
      speakerVoices = JSON.parse(episode.speakerVoices)
      // 为音频URL生成签名
      for (const speaker of Object.keys(speakerVoices)) {
        if (speakerVoices[speaker].audioUrl && !speakerVoices[speaker].audioUrl.startsWith('http')) {
          speakerVoices[speaker].audioUrl = getSignedUrl(speakerVoices[speaker].audioUrl, 7200)
        }
      }
    } catch {
      speakerVoices = {}
    }
  }

  return NextResponse.json({ speakerVoices })
})

/**
 * POST /api/novel-promotion/[projectId]/speaker-voice
 * 使用微软语音为发言人生成参考音频，或保存 AI 设计的声音
 * Body: { episodeId, speaker, voiceId } - 微软语音
 * Body: { episodeId, speaker, voiceDesign: { voiceId, audioBase64 } } - AI 声音设计
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { episodeId, speaker, voiceId, voiceDesign } = body

  if (!episodeId || !speaker) {
    throw new ApiError('INVALID_PARAMS', { message: 'episodeId and speaker are required' })
  }

  // 需要 voiceId 或 voiceDesign
  if (!voiceId && !voiceDesign) {
    throw new ApiError('INVALID_PARAMS', { message: 'voiceId or voiceDesign is required' })
  }

  // 获取剧集
  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId }
  })

  if (!episode) {
    throw new ApiError('NOT_FOUND', { message: 'Episode not found' })
  }

  let cosKey: string
  let voiceConfig: SpeakerVoiceConfig

  // 处理 AI 声音设计
  if (voiceDesign) {
    const { voiceId: designVoiceId, audioBase64 } = voiceDesign

    if (!designVoiceId || !audioBase64) {
      throw new ApiError('INVALID_PARAMS', { message: 'voiceDesign requires voiceId and audioBase64' })
    }

    // 解码 base64 音频
    const audioBuffer = Buffer.from(audioBase64, 'base64')

    // 上传到COS
    const key = generateUniqueKey(`voice/speaker/${projectId}/${episodeId}`, 'wav')
    cosKey = await uploadToCOS(audioBuffer, key)

    voiceConfig = {
      voiceType: 'custom' as const,  // AI 设计的声音保存为 custom 类型
      voiceId: designVoiceId,  // 保存 AI 生成的 voice ID
      audioUrl: cosKey
    }

    console.log(`Speaker "${speaker}" AI-designed voice saved for episode ${episodeId}, voiceId: ${designVoiceId}`)

  } else {
    // 处理微软语音
    const speechKey = process.env.AZURE_SPEECH_KEY
    const speechRegion = process.env.AZURE_SPEECH_REGION

    if (!speechKey || !speechRegion) {
      throw new ApiError('MISSING_CONFIG', { message: 'Azure Speech credentials not configured' })
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion)
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig)

    const ssml = `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
        <voice name="${voiceId}">
          <prosody rate="+0%">
            ${TEST_TEXT}
          </prosody>
        </voice>
      </speak>
    `.trim()

    // 生成音频
    const audioBuffer = await new Promise<Buffer>((resolve, reject) => {
      synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            const audioData = Buffer.from(result.audioData)
            synthesizer.close()
            resolve(audioData)
          } else {
            synthesizer.close()
            reject(new Error(`Speech synthesis failed: ${result.errorDetails}`))
          }
        },
        (error) => {
          synthesizer.close()
          reject(new Error(`Speech synthesis error: ${error}`))
        }
      )
    })

    // 上传到COS
    const key = generateUniqueKey(`voice/speaker/${projectId}/${episodeId}`, 'mp3')
    cosKey = await uploadToCOS(audioBuffer, key)

    voiceConfig = {
      voiceType: 'azure' as const,
      voiceId: voiceId,
      audioUrl: cosKey
    }

    console.log(`Speaker "${speaker}" voice set to Azure ${voiceId} for episode ${episodeId}`)
  }

  // 更新剧集的发言人音色
  let speakerVoices: Record<string, SpeakerVoiceConfig> = {}
  if (episode.speakerVoices) {
    try {
      speakerVoices = JSON.parse(episode.speakerVoices)
    } catch {
      speakerVoices = {}
    }
  }

  speakerVoices[speaker] = voiceConfig

  await prisma.novelPromotionEpisode.update({
    where: { id: episodeId },
    data: { speakerVoices: JSON.stringify(speakerVoices) }
  })

  // 返回签名URL
  const signedAudioUrl = getSignedUrl(cosKey, 7200)

  return NextResponse.json({
    success: true,
    audioUrl: signedAudioUrl,
    speakerVoices: {
      ...speakerVoices,
      [speaker]: { ...speakerVoices[speaker], audioUrl: signedAudioUrl }
    }
  })
})

/**
 * PUT /api/novel-promotion/[projectId]/speaker-voice
 * 上传自定义音频作为发言人的参考音频
 * FormData: { episodeId, speaker, file }
 */
export const PUT = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const formData = await request.formData()
  const file = formData.get('file') as File
  const episodeId = formData.get('episodeId') as string
  const speaker = formData.get('speaker') as string

  if (!file || !episodeId || !speaker) {
    throw new ApiError('INVALID_PARAMS', { message: 'file, episodeId, and speaker are required' })
  }

  // 验证文件类型
  const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/x-m4a']
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|m4a)$/i)) {
    throw new ApiError('INVALID_PARAMS', { message: 'Invalid file type. Allowed: mp3, wav, ogg, m4a' })
  }

  // 获取剧集
  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId }
  })

  if (!episode) {
    throw new ApiError('NOT_FOUND', { message: 'Episode not found' })
  }

  // 读取文件
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // 获取文件扩展名
  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3'

  // 上传到COS
  const key = generateUniqueKey(`voice/speaker/${projectId}/${episodeId}`, ext)
  const cosKey = await uploadToCOS(buffer, key)

  // 更新剧集的发言人音色
  let speakerVoices: Record<string, SpeakerVoiceConfig> = {}
  if (episode.speakerVoices) {
    try {
      speakerVoices = JSON.parse(episode.speakerVoices)
    } catch {
      speakerVoices = {}
    }
  }

  speakerVoices[speaker] = {
    voiceType: 'custom',
    audioUrl: cosKey
  }

  await prisma.novelPromotionEpisode.update({
    where: { id: episodeId },
    data: { speakerVoices: JSON.stringify(speakerVoices) }
  })

  console.log(`Speaker "${speaker}" custom voice uploaded for episode ${episodeId}`)

  // 返回签名URL
  const signedAudioUrl = getSignedUrl(cosKey, 7200)

  return NextResponse.json({
    success: true,
    audioUrl: signedAudioUrl,
    speakerVoices: {
      ...speakerVoices,
      [speaker]: { ...speakerVoices[speaker], audioUrl: signedAudioUrl }
    }
  })
})
