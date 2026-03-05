/**
 * Anthropic Claude provider — sử dụng Claude API proxy
 * Hỗ trợ extended thinking (Opus 4.6) qua OpenAI-compatible endpoint
 *
 * Proxy phải expose OpenAI-compatible /v1/chat/completions endpoint.
 * Extended thinking nội dung được trả về qua `reasoning_content` trong response.
 */

import OpenAI from 'openai'
import type { ChatCompletionStreamCallbacks } from '../types'
import { buildOpenAIChatCompletion } from './openai-compat'
import {
  buildReasoningAwareContent,
  extractStreamDeltaParts,
} from '../utils'
import {
  emitStreamChunk,
  emitStreamStage,
  type StreamStepMeta,
} from '../stream-helpers'
import { withStreamChunkTimeout } from '../stream-timeout'
import { getCompletionParts } from '../completion-parts'
import {
  completionUsageSummary,
  llmLogger,
  logLlmRawOutput,
  recordCompletionUsage,
} from '../runtime-shared'

type OpenAIStreamWithFinal = AsyncIterable<unknown> & {
  finalChatCompletion?: () => Promise<OpenAI.Chat.Completions.ChatCompletion>
}

interface AnthropicConfig {
  baseUrl: string
  apiKey: string
}

function getAnthropicConfig(): AnthropicConfig {
  const baseUrl = process.env.CLAUDE_PROXY_BASE_URL
  const apiKey = process.env.CLAUDE_PROXY_API_KEY
  if (!baseUrl || !apiKey) {
    throw new Error('CLAUDE_PROXY_NOT_CONFIGURED: CLAUDE_PROXY_BASE_URL và CLAUDE_PROXY_API_KEY chưa được cấu hình')
  }
  return { baseUrl, apiKey }
}

function createAnthropicClient(config: AnthropicConfig): OpenAI {
  return new OpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  })
}

/**
 * Non-streaming chat completion qua Claude proxy
 */
export async function anthropicChatCompletion(
  resolvedModelId: string,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  options: {
    temperature?: number
    reasoning?: boolean
    reasoningEffort?: string
  } = {},
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const config = getAnthropicConfig()
  const client = createAnthropicClient(config)

  const { temperature = 0.7, reasoning = true, reasoningEffort = 'high' } = options

  const extraParams: Record<string, unknown> = {}
  if (reasoning) {
    // Claude proxy hỗ trợ extended thinking qua reasoning param (OpenRouter-compatible)
    extraParams.reasoning = { effort: reasoningEffort }
  }

  const completion = await client.chat.completions.create({
    model: resolvedModelId,
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    // Claude thinking models không hỗ trợ temperature khi reasoning enabled
    ...(reasoning ? {} : { temperature }),
    ...extraParams,
  })

  return completion as OpenAI.Chat.Completions.ChatCompletion
}

/**
 * Streaming chat completion qua Claude proxy
 */
export async function anthropicChatCompletionStream(
  resolvedModelId: string,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  options: {
    temperature?: number
    reasoning?: boolean
    reasoningEffort?: string
  } = {},
  callbacks?: ChatCompletionStreamCallbacks,
  streamStep?: StreamStepMeta,
  logContext?: {
    userId: string
    projectId?: string
    modelKey: string
    action?: string
  },
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const config = getAnthropicConfig()
  const client = createAnthropicClient(config)

  const { temperature = 0.7, reasoning = true, reasoningEffort = 'high' } = options

  const extraParams: Record<string, unknown> = {}
  if (reasoning) {
    extraParams.reasoning = { effort: reasoningEffort }
  }

  emitStreamStage(callbacks, streamStep, 'streaming', 'anthropic')

  const stream = await client.chat.completions.create({
    model: resolvedModelId,
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    ...(reasoning ? {} : { temperature }),
    stream: true,
    ...extraParams,
  } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming)

  let text = ''
  let reasoningText = ''
  let seq = 1
  let finalCompletion: OpenAI.Chat.Completions.ChatCompletion | null = null

  for await (const part of withStreamChunkTimeout(stream as AsyncIterable<unknown>)) {
    const { textDelta, reasoningDelta } = extractStreamDeltaParts(part)
    if (reasoningDelta) {
      reasoningText += reasoningDelta
      emitStreamChunk(callbacks, streamStep, {
        kind: 'reasoning',
        delta: reasoningDelta,
        seq,
        lane: 'reasoning',
      })
      seq += 1
    }
    if (textDelta) {
      text += textDelta
      emitStreamChunk(callbacks, streamStep, {
        kind: 'text',
        delta: textDelta,
        seq,
        lane: 'main',
      })
      seq += 1
    }
  }

  // Lấy final completion nếu có
  const finalChatCompletionFn = (stream as OpenAIStreamWithFinal)?.finalChatCompletion
  if (typeof finalChatCompletionFn === 'function') {
    try {
      finalCompletion = await finalChatCompletionFn.call(stream)
      const finalParts = getCompletionParts(finalCompletion)
      if (finalParts.reasoning && finalParts.reasoning !== reasoningText) {
        const delta = finalParts.reasoning.startsWith(reasoningText)
          ? finalParts.reasoning.slice(reasoningText.length)
          : finalParts.reasoning
        if (delta) {
          emitStreamChunk(callbacks, streamStep, {
            kind: 'reasoning',
            delta,
            seq,
            lane: 'reasoning',
          })
          seq += 1
        }
        reasoningText = finalParts.reasoning
      }
      if (finalParts.text && finalParts.text !== text) {
        const delta = finalParts.text.startsWith(text)
          ? finalParts.text.slice(text.length)
          : finalParts.text
        if (delta) {
          emitStreamChunk(callbacks, streamStep, {
            kind: 'text',
            delta,
            seq,
            lane: 'main',
          })
          seq += 1
        }
        text = finalParts.text
      }
    } catch {
      // Bỏ qua lỗi aggregation, giữ nội dung đã stream
    }
  }

  const completion = buildOpenAIChatCompletion(
    resolvedModelId,
    buildReasoningAwareContent(text, reasoningText),
    finalCompletion
      ? {
        promptTokens: Number(finalCompletion.usage?.prompt_tokens ?? 0),
        completionTokens: Number(finalCompletion.usage?.completion_tokens ?? 0),
      }
      : undefined,
  )

  if (logContext) {
    logLlmRawOutput({
      userId: logContext.userId,
      projectId: logContext.projectId,
      provider: 'anthropic',
      modelId: resolvedModelId,
      modelKey: logContext.modelKey,
      stream: true,
      action: logContext.action,
      text,
      reasoning: reasoningText,
      usage: completionUsageSummary(finalCompletion),
    })
  }

  recordCompletionUsage(resolvedModelId, completion)
  emitStreamStage(callbacks, streamStep, 'completed', 'anthropic')
  callbacks?.onComplete?.(text, streamStep)

  llmLogger.info({
    action: 'llm.call.success',
    message: 'anthropic proxy call succeeded',
    provider: 'anthropic',
    details: { model: resolvedModelId, stream: true },
  })

  return completion
}
