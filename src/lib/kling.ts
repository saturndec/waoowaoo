/**
 * Kling AI 口型同步 - 通过 FAL AI 调用（异步模式）
 * https://fal.ai/models/fal-ai/kling-video/lipsync/audio-to-video/api
 */

import { submitFalTask } from '@/lib/async-submit'
import { getLipSyncApiKey } from '@/lib/api-config'
import { imageUrlToBase64 } from '@/lib/cos'

/**
 * 口型同步结果
 */
export interface LipSyncResult {
  videoUrl?: string
  requestId: string
  async?: boolean
}

/**
 * 口型同步参数
 */
export interface LipSyncParams {
  videoUrl: string    // 视频 URL (支持 .mp4/.mov, ≤100MB, 2-10s, 720p/1080p, width/height 720-1920px)
  audioUrl: string    // 音频 URL (最小2s, 最大60s, 最大5MB)
}

const LIPSYNC_ENDPOINT = 'fal-ai/kling-video/lipsync/audio-to-video'

/**
 * 使用 FAL AI 的 Kling LipSync 生成口型同步视频（异步模式）
 * 
 * @param params 口型同步参数
 * @param userId 用户ID，用于获取API Key
 * @returns 任务ID，由前端轮询或Cron处理
 */
export async function generateLipSync(params: LipSyncParams, userId: string): Promise<LipSyncResult> {
  console.log(`[Kling LipSync Async] 开始提交口型同步任务`)

  try {
    // 🔥 转换视频和音频为Data URL（适配内网环境）
    const videoDataUrl = params.videoUrl.startsWith('data:')
      ? params.videoUrl
      : await imageUrlToBase64(params.videoUrl)
    const audioDataUrl = params.audioUrl.startsWith('data:')
      ? params.audioUrl
      : await imageUrlToBase64(params.audioUrl)
    console.log(`[Kling LipSync Async] 已转换视频和音频为 Data URL`)

    const input = {
      video_url: videoDataUrl,
      audio_url: audioDataUrl
    }

    const falApiKey = await getLipSyncApiKey(userId)
    const requestId = await submitFalTask(LIPSYNC_ENDPOINT, input, falApiKey)
    console.log(`[Kling LipSync Async] 任务已提交: ${requestId}`)

    return {
      requestId,
      async: true
    }

  } catch (error: any) {
    console.error(`[Kling LipSync Async] 错误:`, error)
    let errorDetails = error.message || '未知错误'
    if (error.body) {
      console.error(`[Kling LipSync Async] 错误详情:`, JSON.stringify(error.body, null, 2))
      if (error.body.detail) {
        errorDetails = typeof error.body.detail === 'string'
          ? error.body.detail
          : JSON.stringify(error.body.detail)
      }
    }
    throw new Error(`口型同步任务提交失败: ${errorDetails}`)
  }
}

