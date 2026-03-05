import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import {
  getProviderConfig,
  getProviderKey,
} from '../api-config'
import { getInternalLLMStreamCallbacks } from '../llm-observe/internal-stream-context'
import type { ChatCompletionOptions, ChatCompletionStreamCallbacks } from './types'
import { arkResponsesCompletion } from './providers/ark'
import { extractGoogleText, extractGoogleUsage } from './providers/google'
import { buildOpenAIChatCompletion } from './providers/openai-compat'
import { emitChunkedText } from './stream-helpers'
import { getCompletionParts } from './completion-parts'
import {
  _ulogError,
  _ulogInfo,
  _ulogWarn,
  isRetryableError,
  llmLogger,
  recordCompletionUsage,
  resolveLlmRuntimeModel,
} from './runtime-shared'

type GoogleVisionPart = { inlineData: { mimeType: string; data: string } } | { text: string }
type ArkVisionContentItem = { type: 'input_image'; image_url: string } | { type: 'input_text'; text: string }
type OpenAiVisionContentItem = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string') return error.message
  if (typeof error === 'object' && error !== null) {
    const candidate = (error as { message?: unknown }).message
    if (typeof candidate === 'string') return candidate
  }
  return 'unknown error'
}

function getErrorBody(error: unknown): { message?: unknown; code?: unknown } {
  if (typeof error !== 'object' || error === null) return {}
  const root = error as { error?: unknown; message?: unknown; code?: unknown }
  if (typeof root.error === 'object' && root.error !== null) {
    return root.error as { message?: unknown; code?: unknown }
  }
  return root
}

export async function chatCompletionWithVision(
  userId: string,
  model: string | null | undefined,
  textPrompt: string,
  imageUrls: string[] = [],
  options: ChatCompletionOptions = {},
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const internalCallbacks = getInternalLLMStreamCallbacks()
  if (internalCallbacks && !options.__skipAutoStream) {
    return await chatCompletionWithVisionStream(
      userId,
      model,
      textPrompt,
      imageUrls,
      { ...options, __skipAutoStream: true },
      internalCallbacks,
    )
  }

  if (!model) {
    _ulogError('[LLM Vision] 模型未配置，调用栈:', new Error().stack)
    throw new Error('ANALYSIS_MODEL_NOT_CONFIGURED: 请先在设置页面配置分析模型')
  }

  const selection = await resolveLlmRuntimeModel(userId, model)
  const resolvedModelId = selection.modelId
  const provider = selection.provider
  const providerKey = getProviderKey(provider).toLowerCase()

  const { temperature = 0.7, maxRetries = 2, reasoning = true } = options

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const attemptStartedAt = Date.now()
    try {
      if (providerKey === 'google') {
        const { apiKey } = await getProviderConfig(userId, provider)
        const ai = new GoogleGenAI({ apiKey })
        const { imageUrlToBase64 } = await import('../cos')

        const parts: GoogleVisionPart[] = []
        for (const url of imageUrls) {
          try {
            const dataUrl = url.startsWith('data:') ? url : await imageUrlToBase64(url)
            const base64Start = dataUrl.indexOf(';base64,')
            if (base64Start !== -1) {
              const mimeType = dataUrl.substring(5, base64Start)
              const data = dataUrl.substring(base64Start + 8)
              parts.push({ inlineData: { mimeType, data } })
            }
          } catch (e) {
            _ulogError('[LLM Vision] Google 图片转换失败:', e)
          }
        }
        if (textPrompt) parts.push({ text: textPrompt })

        const response = await ai.models.generateContent({
          model: resolvedModelId,
          contents: [{ role: 'user', parts }],
          config: { temperature },
        })

        const text = extractGoogleText(response)
        const usage = extractGoogleUsage(response)
        llmLogger.info({
          action: 'llm.vision.success',
          message: 'llm vision call succeeded',
          provider: 'google',
          durationMs: Date.now() - attemptStartedAt,
          details: {
            model: resolvedModelId,
            attempt,
            maxRetries,
            imageCount: imageUrls.length,
          },
        })
        const completion = buildOpenAIChatCompletion(resolvedModelId, text, usage)
        recordCompletionUsage(resolvedModelId, completion)
        return completion
      }

      if (providerKey === 'ark') {
        const { apiKey } = await getProviderConfig(userId, provider)
        const { imageUrlToBase64 } = await import('../cos')

        const content: ArkVisionContentItem[] = []
        for (const url of imageUrls) {
          let finalUrl = url
          try {
            if (!url.startsWith('http') && !url.startsWith('data:')) {
              finalUrl = await imageUrlToBase64(url)
            } else if (url.startsWith('/')) {
              finalUrl = await imageUrlToBase64(url)
            }
          } catch (e) {
            _ulogError('[LLM Vision] Ark 图片转换失败:', e)
          }
          content.push({ type: 'input_image', image_url: finalUrl })
        }
        if (textPrompt) {
          content.push({ type: 'input_text', text: textPrompt })
        }

        const thinkingType = reasoning ? 'enabled' : 'disabled'
        const { text, usage } = await arkResponsesCompletion({
          apiKey,
          model: resolvedModelId,
          input: [{ role: 'user', content }],
          thinking: { type: thinkingType },
        })

        llmLogger.info({
          action: 'llm.vision.success',
          message: 'llm vision call succeeded',
          provider: 'ark',
          durationMs: Date.now() - attemptStartedAt,
          details: {
            model: resolvedModelId,
            attempt,
            maxRetries,
            imageCount: imageUrls.length,
          },
        })
        const completion = buildOpenAIChatCompletion(resolvedModelId, text, usage)
        recordCompletionUsage(resolvedModelId, completion)
        return completion
      }

      const config = await getProviderConfig(userId, provider)
      if (!config.baseUrl) {
        throw new Error(`PROVIDER_BASE_URL_MISSING: ${provider} (llm)`)
      }

      const client = new OpenAI({
        baseURL: config.baseUrl,
        apiKey: config.apiKey,
        defaultHeaders: {
          'User-Agent': 'waoowaoo/0.1',
        },
      })

      const content: OpenAiVisionContentItem[] = []
      if (textPrompt) content.push({ type: 'text', text: textPrompt })

      for (const url of imageUrls) {
        let finalUrl = url
        if (url.startsWith('/api/files/') || url.startsWith('/')) {
          try {
            const { imageUrlToBase64 } = await import('../cos')
            finalUrl = await imageUrlToBase64(url)
            _ulogInfo('[LLM Vision] 转换本地图片为 Base64')
          } catch (e) {
            _ulogError('[LLM Vision] 转换本地图片失败:', e)
            const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
            finalUrl = `${baseUrl}${url}`
          }
        }
        content.push({ type: 'image_url', image_url: { url: finalUrl } })
      }

      const completion = await client.chat.completions.create({
        model: resolvedModelId,
        messages: [{ role: 'user', content }],
        temperature,
      })
      recordCompletionUsage(resolvedModelId, completion as OpenAI.Chat.Completions.ChatCompletion)
      llmLogger.info({
        action: 'llm.vision.success',
        message: 'llm vision call succeeded',
        provider,
        durationMs: Date.now() - attemptStartedAt,
        details: {
          model: resolvedModelId,
          attempt,
          maxRetries,
          imageCount: imageUrls.length,
        },
      })
      return completion
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(getErrorMessage(error))
      const errorMessage = getErrorMessage(error)
      llmLogger.warn({
        action: 'llm.vision.attempt_failed',
        message: errorMessage || 'llm vision attempt failed',
        provider,
        durationMs: Date.now() - attemptStartedAt,
        details: {
          model: resolvedModelId,
          attempt,
          maxRetries,
          imageCount: imageUrls.length,
        },
      })
      const errorBody = getErrorBody(error)
      if (errorBody?.message === 'PROHIBITED_CONTENT' || errorBody?.code === 502) {
        _ulogError('[LLM Vision] ❌ 内容安全检测失败 - Google AI Studio 拒绝处理此内容')
        throw new Error('SENSITIVE_CONTENT: 图片或提示词包含敏感信息,无法处理')
      }

      _ulogWarn(`[LLM Vision] 调用失败 (${attempt}/${maxRetries + 1}): ${errorMessage}`)
      if (!isRetryableError(error) || attempt > maxRetries) break
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw lastError || new Error('LLM Vision 调用失败')
}

export async function chatCompletionWithVisionStream(
  userId: string,
  model: string | null | undefined,
  textPrompt: string,
  imageUrls: string[] = [],
  options: ChatCompletionOptions = {},
  callbacks?: ChatCompletionStreamCallbacks,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  callbacks?.onStage?.({ stage: 'submit' })
  try {
    callbacks?.onStage?.({ stage: 'fallback' })
    const completion = await chatCompletionWithVision(userId, model, textPrompt, imageUrls, {
      ...options,
      __skipAutoStream: true,
    })
    const completionParts = getCompletionParts(completion)
    let seq = 1
    if (completionParts.reasoning) {
      seq = emitChunkedText(completionParts.reasoning, callbacks, 'reasoning', seq)
    }
    emitChunkedText(completionParts.text, callbacks, 'text', seq)
    callbacks?.onStage?.({ stage: 'completed' })
    callbacks?.onComplete?.(completionParts.text)
    return completion
  } catch (error) {
    callbacks?.onError?.(error, undefined)
    throw error
  }
}
