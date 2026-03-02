import type { Job } from 'bullmq'
import { createVoiceDesign, validatePreviewText, validateVoicePrompt, type VoiceDesignInput } from '@/lib/qwen-voice-design'
import { getProviderConfig, getProviderKey, resolveModelSelectionOrSingle } from '@/lib/api-config'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { encodeQwenVoiceIdWithModel } from '@/lib/voice/qwen-voice-id'

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`)
  }
  return value.trim()
}

function readLanguage(value: unknown): 'zh' | 'en' {
  return value === 'en' ? 'en' : 'zh'
}

function readOptionalModelKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export async function handleVoiceDesignTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const voicePrompt = readRequiredString(payload.voicePrompt, 'voicePrompt')
  const previewText = readRequiredString(payload.previewText, 'previewText')
  const audioModel = readOptionalModelKey(payload.audioModel)
  const preferredName = typeof payload.preferredName === 'string' && payload.preferredName.trim()
    ? payload.preferredName.trim()
    : 'custom_voice'
  const language = readLanguage(payload.language)

  const promptValidation = validateVoicePrompt(voicePrompt)
  if (!promptValidation.valid) {
    throw new Error(promptValidation.error || 'invalid voicePrompt')
  }
  const textValidation = validatePreviewText(previewText)
  if (!textValidation.valid) {
    throw new Error(textValidation.error || 'invalid previewText')
  }

  await reportTaskProgress(job, 25, {
    stage: 'voice_design_submit',
    stageLabel: '提交声音设计任务',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'voice_design_submit')

  const audioSelection = await resolveModelSelectionOrSingle(job.data.userId, audioModel, 'audio')
  const providerKey = getProviderKey(audioSelection.provider).toLowerCase()
  if (providerKey !== 'qwen') {
    throw new Error(`AUDIO_PROVIDER_UNSUPPORTED: ${audioSelection.provider}`)
  }
  const { apiKey } = await getProviderConfig(job.data.userId, audioSelection.provider)
  const input: VoiceDesignInput = {
    voicePrompt,
    previewText,
    targetModel: audioSelection.modelId,
    preferredName,
    language,
  }
  const designed = await createVoiceDesign(input, apiKey)
  if (!designed.success) {
    throw new Error(designed.error || '声音设计失败')
  }
  const resolvedTargetModel = typeof designed.targetModel === 'string' && designed.targetModel.trim()
    ? designed.targetModel.trim()
    : audioSelection.modelId
  const normalizedVoiceId = typeof designed.voiceId === 'string' && designed.voiceId.trim()
    ? encodeQwenVoiceIdWithModel(designed.voiceId, resolvedTargetModel)
    : designed.voiceId

  await reportTaskProgress(job, 96, {
    stage: 'voice_design_done',
    stageLabel: '声音设计完成',
    displayMode: 'detail',
  })

  return {
    success: true,
    voiceId: normalizedVoiceId,
    targetModel: resolvedTargetModel,
    audioBase64: designed.audioBase64,
    sampleRate: designed.sampleRate,
    responseFormat: designed.responseFormat,
    usageCount: designed.usageCount,
    requestId: designed.requestId,
    taskType: job.data.type === TASK_TYPE.ASSET_HUB_VOICE_DESIGN ? TASK_TYPE.ASSET_HUB_VOICE_DESIGN : TASK_TYPE.VOICE_DESIGN,
  }
}
