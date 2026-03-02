import { prisma } from '@/lib/prisma'
import { getAudioApiKey, getModelsByType, getProviderKey, resolveModelSelectionOrSingle, type ModelSelection } from '@/lib/api-config'
import { getSignedUrl, toFetchableUrl, uploadToCOS } from '@/lib/cos'
import { parseQwenVoiceId, resolveQwenVoiceModelFamily, type QwenVoiceModelFamily } from '@/lib/voice/qwen-voice-id'

type CheckCancelled = () => Promise<void>
type SpeakerVoiceConfig = {
  audioUrl?: string | null
  voiceId?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function parseSpeakerVoices(raw: string | null | undefined): Record<string, SpeakerVoiceConfig> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!isRecord(parsed)) return {}
    const normalized: Record<string, SpeakerVoiceConfig> = {}
    for (const [speaker, value] of Object.entries(parsed)) {
      if (!speaker || !isRecord(value)) continue
      normalized[speaker] = {
        audioUrl: readOptionalString(value.audioUrl),
        voiceId: readOptionalString(value.voiceId),
      }
    }
    return normalized
  } catch {
    return {}
  }
}

function readQwenAudioUrl(data: unknown): string | null {
  if (!isRecord(data)) return null
  const output = data.output
  if (!isRecord(output)) return null
  const audio = output.audio
  if (isRecord(audio)) {
    const url = readOptionalString(audio.url)
    if (url) return url
  }
  return readOptionalString(output.audio_url)
}

function readQwenAudioBase64(data: unknown): string | null {
  if (!isRecord(data)) return null
  const output = data.output
  if (!isRecord(output)) return null
  const audio = output.audio
  if (!isRecord(audio)) return null
  return readOptionalString(audio.data)
}

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

type WsEventHandlers = {
  open: () => void
  error: (error: Error) => void
  close: (code: number, reason: Buffer) => void
  message: (data: unknown) => void
}

interface NodeWsLike {
  on<K extends keyof WsEventHandlers>(event: K, listener: WsEventHandlers[K]): this
  send(data: string): void
  close(code?: number): void
}

interface NodeWsCtor {
  new (url: string, options?: { headers?: Record<string, string> }): NodeWsLike
}

function createRealtimeEventId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return `event_${globalThis.crypto.randomUUID()}`
  }
  return `event_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
}

function buildRealtimeEvent(type: string, payload?: Record<string, unknown>): string {
  const body: Record<string, unknown> = {
    event_id: createRealtimeEventId(),
    type,
  }
  if (payload) {
    Object.assign(body, payload)
  }
  return JSON.stringify(body)
}

function isQwenRealtimeModel(modelId: string): boolean {
  return modelId.toLowerCase().includes('realtime')
}

function readQwenRealtimeBaseUrl(): string {
  const configured = readOptionalString(process.env.QWEN_TTS_REALTIME_BASE_URL)
  return configured || 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime'
}

function buildQwenRealtimeUrl(modelId: string): string {
  const baseUrl = readQwenRealtimeBaseUrl()
  let parsedUrl: URL
  try {
    parsedUrl = new URL(baseUrl)
  } catch {
    throw new Error(`QWEN_TTS_REALTIME_BASE_URL_INVALID: ${baseUrl}`)
  }
  parsedUrl.searchParams.set('model', modelId)
  return parsedUrl.toString()
}

function decodeWsMessageToText(data: unknown): string {
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8')
  }
  if (Array.isArray(data)) {
    const chunks: Buffer[] = []
    for (const item of data) {
      if (Buffer.isBuffer(item)) {
        chunks.push(item)
        continue
      }
      if (item instanceof ArrayBuffer) {
        chunks.push(Buffer.from(item))
        continue
      }
      if (ArrayBuffer.isView(item)) {
        chunks.push(Buffer.from(item.buffer, item.byteOffset, item.byteLength))
        continue
      }
      return ''
    }
    return Buffer.concat(chunks).toString('utf8')
  }
  return ''
}

function isWavBuffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false
  return buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WAVE'
}

function wrapPcm16MonoToWav(pcm: Buffer, sampleRate: number): Buffer {
  const channels = 1
  const bitsPerSample = 16
  const blockAlign = (channels * bitsPerSample) / 8
  const byteRate = sampleRate * blockAlign
  const header = Buffer.alloc(44)

  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(pcm.length, 40)

  return Buffer.concat([header, pcm])
}

function normalizeQwenAudioToWav(rawAudio: Buffer, sampleRate: number): Buffer {
  if (isWavBuffer(rawAudio)) return rawAudio
  return wrapPcm16MonoToWav(rawAudio, sampleRate)
}

async function loadNodeWebSocketCtor(): Promise<NodeWsCtor> {
  const imported: unknown = await import('ws')
  if (!isRecord(imported)) {
    throw new Error('QWEN_TTS_WEBSOCKET_UNAVAILABLE: ws module invalid')
  }

  const defaultCtor = imported.default
  if (typeof defaultCtor === 'function') {
    return defaultCtor as unknown as NodeWsCtor
  }

  const namedCtor = imported.WebSocket
  if (typeof namedCtor === 'function') {
    return namedCtor as unknown as NodeWsCtor
  }

  throw new Error('QWEN_TTS_WEBSOCKET_UNAVAILABLE: ws constructor missing')
}

async function generateVoiceWithQwenRealtimeTTS(params: {
  modelId: string
  voiceId: string
  text: string
  qwenApiKey: string
}) {
  const wsUrl = buildQwenRealtimeUrl(params.modelId)
  const WebSocketCtor = await loadNodeWebSocketCtor()
  const timeoutMs = 45_000

  return await new Promise<{ audioData: Buffer; audioDuration: number }>((resolve, reject) => {
    const audioChunks: Buffer[] = []
    let hasResponseDone = false
    let hasSessionFinished = false
    let settled = false

    const ws = new WebSocketCtor(wsUrl, {
      headers: {
        Authorization: `Bearer ${params.qwenApiKey}`,
      },
    })

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      try {
        ws.close(1011)
      } catch {
        // ignore close error
      }
      reject(error)
    }

    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      if (audioChunks.length === 0) {
        reject(new Error('QWEN_TTS_INVALID_RESPONSE: missing response.audio.delta'))
        return
      }
      const rawAudio = Buffer.concat(audioChunks)
      const wavAudio = normalizeQwenAudioToWav(rawAudio, 24000)
      resolve({
        audioData: wavAudio,
        audioDuration: getWavDurationFromBuffer(wavAudio),
      })
      try {
        ws.close(1000)
      } catch {
        // ignore close error
      }
    }

    const timeoutId = setTimeout(() => {
      fail(new Error(`QWEN_TTS_TIMEOUT: no completion event within ${timeoutMs}ms`))
    }, timeoutMs)

    ws.on('open', () => {
      try {
        ws.send(buildRealtimeEvent('session.update', {
          session: {
            voice: params.voiceId,
            mode: 'server_commit',
            response_format: 'pcm',
            sample_rate: 24000,
          },
        }))
        ws.send(buildRealtimeEvent('input_text_buffer.append', {
          text: params.text,
        }))
        ws.send(buildRealtimeEvent('input_text_buffer.commit'))
        ws.send(buildRealtimeEvent('session.finish'))
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'unknown error'
        fail(new Error(`QWEN_TTS_WS_SEND_FAILED: ${message}`))
      }
    })

    ws.on('message', (data) => {
      const messageText = decodeWsMessageToText(data).trim()
      if (!messageText) {
        return
      }

      let messageData: unknown
      try {
        messageData = JSON.parse(messageText) as unknown
      } catch {
        fail(new Error(`QWEN_TTS_INVALID_EVENT: ${messageText}`))
        return
      }
      if (!isRecord(messageData)) {
        fail(new Error('QWEN_TTS_INVALID_EVENT: event payload is not object'))
        return
      }

      const eventType = readOptionalString(messageData.type)
      if (!eventType) {
        fail(new Error('QWEN_TTS_INVALID_EVENT: missing type'))
        return
      }

      if (eventType === 'error') {
        const errorPayload = isRecord(messageData.error) ? messageData.error : null
        const code = errorPayload ? readOptionalString(errorPayload.code) : null
        const message = errorPayload ? readOptionalString(errorPayload.message) : null
        fail(new Error(`QWEN_TTS_FAILED_WS: ${message || code || messageText}`))
        return
      }

      if (eventType === 'response.audio.delta') {
        const delta = readOptionalString(messageData.delta)
        if (!delta) {
          fail(new Error('QWEN_TTS_INVALID_EVENT: response.audio.delta missing delta'))
          return
        }
        try {
          audioChunks.push(Buffer.from(delta, 'base64'))
        } catch {
          fail(new Error('QWEN_TTS_INVALID_EVENT: response.audio.delta is not valid base64'))
        }
        return
      }

      if (eventType === 'response.done') {
        hasResponseDone = true
        const responseData = isRecord(messageData.response) ? messageData.response : null
        const responseStatus = responseData ? readOptionalString(responseData.status) : null
        if (responseStatus && responseStatus !== 'completed') {
          fail(new Error(`QWEN_TTS_FAILED: response status is ${responseStatus}`))
          return
        }
        if (hasSessionFinished) {
          finish()
        }
        return
      }

      if (eventType === 'session.finished') {
        hasSessionFinished = true
        if (hasResponseDone || audioChunks.length > 0) {
          finish()
        }
      }
    })

    ws.on('error', (error) => {
      fail(new Error(`QWEN_TTS_WS_ERROR: ${error.message}`))
    })

    ws.on('close', (code, reason) => {
      if (settled) return
      const reasonText = reason.toString('utf8').trim()
      if (audioChunks.length > 0 && (hasResponseDone || hasSessionFinished)) {
        finish()
        return
      }
      fail(new Error(`QWEN_TTS_WS_CLOSED: code=${code}${reasonText ? `, reason=${reasonText}` : ''}`))
    })
  })
}

async function generateVoiceWithQwenTTSHttp(params: {
  modelId: string
  voiceId: string
  text: string
  qwenApiKey: string
}) {
  const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.qwenApiKey}`,
    },
    body: JSON.stringify({
      model: params.modelId,
      input: {
        text: params.text,
        voice: params.voiceId,
      },
      parameters: {
        format: 'wav',
        sample_rate: 24000,
      },
    }),
  })

  const rawResponse = await response.text()

  let responseData: unknown = null
  if (rawResponse) {
    try {
      responseData = JSON.parse(rawResponse) as unknown
    } catch {
      responseData = null
    }
  }
  if (!response.ok) {
    const detail = isRecord(responseData)
      ? readOptionalString(responseData.message) || readOptionalString(responseData.code)
      : null
    throw new Error(`QWEN_TTS_FAILED (${response.status}): ${detail || rawResponse || 'unknown error'}`)
  }

  const audioBase64 = readQwenAudioBase64(responseData)
  if (audioBase64) {
    const audioData = Buffer.from(audioBase64, 'base64')
    return {
      audioData,
      audioDuration: getWavDurationFromBuffer(audioData),
    }
  }

  const audioUrl = readQwenAudioUrl(responseData)
  if (!audioUrl) {
    throw new Error('QWEN_TTS_INVALID_RESPONSE: missing output audio')
  }

  const audioResponse = await fetch(toFetchableUrl(audioUrl))
  if (!audioResponse.ok) {
    throw new Error(`QWEN_TTS_AUDIO_DOWNLOAD_FAILED: ${audioResponse.status}`)
  }
  const arrayBuffer = await audioResponse.arrayBuffer()
  const audioData = Buffer.from(arrayBuffer)

  return {
    audioData,
    audioDuration: getWavDurationFromBuffer(audioData),
  }
}

async function generateVoiceWithQwenTTS(params: {
  modelId: string
  voiceId: string
  text: string
  qwenApiKey: string
}) {
  if (isQwenRealtimeModel(params.modelId)) {
    return await generateVoiceWithQwenRealtimeTTS(params)
  }
  return await generateVoiceWithQwenTTSHttp(params)
}

function assertVoiceFamilyMatchesSelection(selection: ModelSelection, family: QwenVoiceModelFamily | null) {
  if (!family) return
  const selectedFamily = resolveQwenVoiceModelFamily(selection.modelId)
  if (!selectedFamily) {
    throw new Error(`AUDIO_MODEL_UNSUPPORTED: ${selection.modelId}`)
  }
  if (selectedFamily !== family) {
    throw new Error(`AUDIO_MODEL_MISMATCH: voiceId requires ${family} model, got ${selection.modelId}`)
  }
}

async function resolveAudioSelectionForVoice(params: {
  userId: string
  requestedModel?: string | null
  voiceFamily: QwenVoiceModelFamily | null
}): Promise<ModelSelection> {
  const requestedModel = readOptionalString(params.requestedModel)
  if (requestedModel) {
    const explicitSelection = await resolveModelSelectionOrSingle(params.userId, requestedModel, 'audio')
    assertVoiceFamilyMatchesSelection(explicitSelection, params.voiceFamily)
    return explicitSelection
  }

  if (!params.voiceFamily) {
    return await resolveModelSelectionOrSingle(params.userId, undefined, 'audio')
  }

  const enabledAudioModels = await getModelsByType(params.userId, 'audio')
  const matchedModels = enabledAudioModels.filter((model) => resolveQwenVoiceModelFamily(model.modelId) === params.voiceFamily)
  if (matchedModels.length === 0) {
    throw new Error(`MODEL_NOT_CONFIGURED: no ${params.voiceFamily} audio model is enabled`)
  }
  if (matchedModels.length > 1) {
    throw new Error(`MODEL_SELECTION_REQUIRED: multiple ${params.voiceFamily} audio models are enabled, provide model_key explicitly`)
  }

  return await resolveModelSelectionOrSingle(params.userId, matchedModels[0].modelKey, 'audio')
}

function matchCharacterBySpeaker(
  speaker: string,
  characters: Array<{ name: string; voiceId?: string | null }>
) {
  const exactMatch = characters.find((character) => character.name === speaker)
  if (exactMatch) return exactMatch
  return characters.find((character) => character.name.includes(speaker) || speaker.includes(character.name))
}

export async function generateVoiceLine(params: {
  projectId: string
  episodeId?: string | null
  lineId: string
  userId: string
  audioModel?: string
  checkCancelled?: CheckCancelled
}) {
  const checkCancelled = params.checkCancelled

  const line = await prisma.novelPromotionVoiceLine.findUnique({
    where: { id: params.lineId },
    select: {
      id: true,
      episodeId: true,
      speaker: true,
      content: true,
    },
  })
  if (!line) {
    throw new Error('Voice line not found')
  }

  const episodeId = params.episodeId || line.episodeId
  if (!episodeId) {
    throw new Error('episodeId is required')
  }

  const [projectData, episode] = await Promise.all([
    prisma.novelPromotionProject.findUnique({
      where: { projectId: params.projectId },
      include: { characters: true },
    }),
    prisma.novelPromotionEpisode.findUnique({
      where: { id: episodeId },
      select: { speakerVoices: true },
    }),
  ])

  if (!projectData) {
    throw new Error('Novel promotion project not found')
  }

  const speakerVoices = parseSpeakerVoices(episode?.speakerVoices)

  const character = matchCharacterBySpeaker(line.speaker, projectData.characters || [])
  const speakerVoice = speakerVoices[line.speaker]
  const storedVoiceId = readOptionalString(character?.voiceId) || readOptionalString(speakerVoice?.voiceId)
  const parsedVoiceId = parseQwenVoiceId(storedVoiceId)
  if (!parsedVoiceId) {
    throw new Error('请先为该发言人设计并保存 Qwen voiceId')
  }

  const text = (line.content || '').trim()
  if (!text) {
    throw new Error('Voice line text is empty')
  }

  const audioSelection = await resolveAudioSelectionForVoice({
    userId: params.userId,
    requestedModel: params.audioModel,
    voiceFamily: parsedVoiceId.family,
  })
  const providerKey = getProviderKey(audioSelection.provider).toLowerCase()
  if (providerKey !== 'qwen') {
    throw new Error(`AUDIO_PROVIDER_UNSUPPORTED: ${audioSelection.provider}`)
  }
  const qwenApiKey = await getAudioApiKey(params.userId, audioSelection.modelKey)

  const generated = await generateVoiceWithQwenTTS({
    modelId: audioSelection.modelId,
    voiceId: parsedVoiceId.voiceId,
    text,
    qwenApiKey,
  })

  const audioKey = `voice/${params.projectId}/${episodeId}/${line.id}.wav`
  const cosKey = await uploadToCOS(generated.audioData, audioKey)

  await checkCancelled?.()

  await prisma.novelPromotionVoiceLine.update({
    where: { id: line.id },
    data: {
      audioUrl: cosKey,
      audioDuration: generated.audioDuration || null,
    },
  })

  const signedUrl = getSignedUrl(cosKey, 7200)
  return {
    lineId: line.id,
    audioUrl: signedUrl,
    storageKey: cosKey,
    audioDuration: generated.audioDuration || null,
  }
}

export function estimateVoiceLineMaxSeconds(content: string | null | undefined) {
  const chars = typeof content === 'string' ? content.length : 0
  return Math.max(5, Math.ceil(chars / 2))
}
