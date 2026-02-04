import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadToCOS, generateUniqueKey, getSignedUrl } from '@/lib/cos'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

const TEST_TEXT = '这是一段测试音频，测试语音合成的效果。'

/**
 * POST /api/novel-promotion/[projectId]/character-voice-generate
 * 使用微软语音生成参考音频并保存为角色的音色
 * Body: { characterId, voiceId }
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { characterId, voiceId } = await request.json()

  if (!characterId || !voiceId) {
    throw new ApiError('INVALID_PARAMS', { message: 'characterId and voiceId are required' })
  }

  // 生成语音
  const speechKey = process.env.AZURE_SPEECH_KEY
  const speechRegion = process.env.AZURE_SPEECH_REGION

  if (!speechKey || !speechRegion) {
    throw new ApiError('MISSING_CONFIG', { message: 'Azure Speech credentials not configured' })
  }

  const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion)
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3

  const synthesizer = new sdk.SpeechSynthesizer(speechConfig)

  // SSML 格式
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
  const key = generateUniqueKey(`voice/azure/${projectId}/${characterId}`, 'mp3')
  const audioUrl = await uploadToCOS(audioBuffer, key)

  // 更新角色音色设置
  const character = await prisma.novelPromotionCharacter.update({
    where: { id: characterId },
    data: {
      voiceType: 'azure',
      voiceId: voiceId,
      customVoiceUrl: audioUrl
    }
  })

  console.log(`Character ${characterId} voice generated with Azure ${voiceId}: ${audioUrl}`)

  // 返回签名URL
  const signedAudioUrl = getSignedUrl(audioUrl, 7200)

  return NextResponse.json({
    success: true,
    audioUrl: signedAudioUrl,
    character: {
      ...character,
      customVoiceUrl: signedAudioUrl
    }
  })
})
