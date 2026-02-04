import { NextRequest, NextResponse } from 'next/server'
import { getVoiceById } from '@/lib/azure-voices'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/voice-presets/preview
 * 预览音色效果（使用 Azure TTS）
 * Body: { voiceId, text? }
 */
export const POST = apiHandler(async (request: NextRequest) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { voiceId, text } = body

  if (!voiceId) {
    throw new ApiError('INVALID_PARAMS', { message: 'voiceId is required' })
  }

  // 验证音色是否存在
  const voice = getVoiceById(voiceId)
  if (!voice) {
    throw new ApiError('NOT_FOUND', { message: 'Voice not found' })
  }

  const speechKey = process.env.AZURE_SPEECH_KEY
  const speechRegion = process.env.AZURE_SPEECH_REGION

  if (!speechKey || !speechRegion) {
    throw new ApiError('MISSING_CONFIG', { message: 'Azure Speech credentials not configured' })
  }

  // 使用示例文本或用户提供的文本
  const previewText = text || '你好，这是一段配音预览，用于展示这个音色的效果。让我们一起来体验不同的语音风格吧。'

  console.log(`Voice Preview: Generating preview for "${voice.name}" (${voiceId})`)

  const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion)
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3

  const synthesizer = new sdk.SpeechSynthesizer(speechConfig)

  const ssml = `
    <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
      <voice name="${voiceId}">
        <prosody rate="+0%">
          ${previewText}
        </prosody>
      </voice>
    </speak>
  `.trim()

  return new Promise<NextResponse>((resolve) => {
    synthesizer.speakSsmlAsync(
      ssml,
      (result) => {
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          const audioData = result.audioData
          synthesizer.close()

          resolve(
            new NextResponse(audioData, {
              headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Length': audioData.byteLength.toString()
              }
            })
          )
        } else {
          console.error('Voice Preview synthesis failed:', result.reason, result.errorDetails)
          synthesizer.close()
          resolve(
            NextResponse.json(
              { error: { code: 'GENERATION_FAILED', message: result.errorDetails || `Reason: ${result.reason}` } },
              { status: 500 }
            )
          )
        }
      },
      (error) => {
        console.error('Voice Preview TTS error:', error)
        synthesizer.close()
        const errorMessage = typeof error === 'string' ? error : (error?.message || JSON.stringify(error))
        resolve(
          NextResponse.json(
            { error: { code: 'GENERATION_FAILED', message: errorMessage } },
            { status: 500 }
          )
        )
      }
    )
  })
})
