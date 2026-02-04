/**
 * 小说推文模式 API 客户端
 */

export interface NovelPromotionConfig {
  novelText: string
  analysisModel: string
  imageModel: string
  videoModel: string
  videoRatio: string
}

/**
 * 更新项目配置
 */
export async function updateConfig(
  projectId: string,
  config: Partial<NovelPromotionConfig>
): Promise<void> {
  const res = await fetch(`/api/novel-promotion/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || '更新配置失败')
  }
}

/**
 * 生成TTS音频
 */
export async function generateTTS(
  projectId: string
): Promise<{ audioUrl: string }> {
  const res = await fetch(`/api/novel-promotion/${projectId}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || '生成TTS失败')
  }

  return res.json()
}

