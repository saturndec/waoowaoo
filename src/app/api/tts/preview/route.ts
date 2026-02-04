import { NextRequest, NextResponse } from 'next/server'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

const PREVIEW_TEXT = '这是一段试听文本，用于测试语音合成的速度效果。'

export const POST = apiHandler(async (request: NextRequest) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const { rate, voice } = await request.json()

  if (!rate) {
    throw new ApiError('INVALID_PARAMS', { message: 'Rate is required' })
  }

  const voiceName = voice || 'zh-CN-YunxiNeural'

  const speechKey = process.env.AZURE_SPEECH_KEY
  const speechRegion = process.env.AZURE_SPEECH_REGION

  if (!speechKey || !speechRegion) {
    throw new ApiError('MISSING_CONFIG', { message: 'Azure Speech credentials not configured' })
  }

  const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion)
  // 使用高音质设置，和实际生成一致
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3

  const synthesizer = new sdk.SpeechSynthesizer(speechConfig)

  const ssml = `
    <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
      <voice name="${voiceName}">
        <prosody rate="${rate}">
          ${PREVIEW_TEXT}
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
          synthesizer.close()
          resolve(
            NextResponse.json(
              { error: { code: 'GENERATION_FAILED', message: result.errorDetails } },
              { status: 500 }
            )
          )
        }
      },
      (error) => {
        synthesizer.close()
        resolve(
          NextResponse.json(
            { error: { code: 'GENERATION_FAILED', message: error } },
            { status: 500 }
          )
        )
      }
    )
  })
})
