export type QwenVoiceModelFamily = 'vd' | 'vc'

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveQwenVoiceModelFamily(modelId: string | null | undefined): QwenVoiceModelFamily | null {
  const normalized = readTrimmedString(modelId).toLowerCase()
  if (!normalized) return null
  if (normalized.includes('tts-vd')) return 'vd'
  if (normalized.includes('tts-vc')) return 'vc'
  return null
}

export function encodeQwenVoiceIdWithModel(voiceId: string, modelId: string | null | undefined): string {
  const normalizedVoiceId = readTrimmedString(voiceId)
  if (!normalizedVoiceId) return normalizedVoiceId

  if (normalizedVoiceId.startsWith('vd:') || normalizedVoiceId.startsWith('vc:')) {
    return normalizedVoiceId
  }

  const family = resolveQwenVoiceModelFamily(modelId)
  if (!family) return normalizedVoiceId
  return `${family}:${normalizedVoiceId}`
}

export function parseQwenVoiceId(rawVoiceId: string | null | undefined): { voiceId: string; family: QwenVoiceModelFamily | null } | null {
  const normalized = readTrimmedString(rawVoiceId)
  if (!normalized) return null

  if (normalized.startsWith('vd:')) {
    const payload = normalized.slice(3).trim()
    return payload ? { voiceId: payload, family: 'vd' } : null
  }
  if (normalized.startsWith('vc:')) {
    const payload = normalized.slice(3).trim()
    return payload ? { voiceId: payload, family: 'vc' } : null
  }
  const inferredFamily = resolveQwenVoiceModelFamily(normalized)
  return {
    voiceId: normalized,
    family: inferredFamily,
  }
}
