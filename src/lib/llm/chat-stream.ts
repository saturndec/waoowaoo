import OpenAI from 'openai'
import { generateText, streamText, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { GoogleGenAI } from '@google/genai'
import {
  getProviderConfig,
  getProviderKey,
} from '../api-config'
import type { ChatCompletionOptions, ChatCompletionStreamCallbacks } from './types'
import { extractGoogleParts, extractGoogleUsage, GoogleEmptyResponseError } from './providers/google'
import { buildOpenAIChatCompletion } from './providers/openai-compat'
import {
  buildReasoningAwareContent,
  extractStreamDeltaParts,
  getConversationMessages,
  mapReasoningEffort,
  getSystemPrompt,
} from './utils'
import {
  emitStreamChunk,
  emitStreamStage,
  resolveStreamStepMeta,
} from './stream-helpers'
import {
  completionUsageSummary,
  llmLogger,
  logLlmRawInput,
  logLlmRawOutput,
  recordCompletionUsage,
  resolveLlmRuntimeModel,
} from './runtime-shared'
import { getCompletionParts } from './completion-parts'
import { withStreamChunkTimeout } from './stream-timeout'
import { shouldUseOpenAIReasoningProviderOptions } from './reasoning-capability'

type GoogleModelClient = {
  generateContentStream?: (params: unknown) => Promise<unknown>
}

type GoogleChunk = {
  stream?: AsyncIterable<unknown>
}

type AISdkStreamChunk = {
  type?: string
  text?: string
}

type OpenAIStreamWithFinal = AsyncIterable<unknown> & {
  finalChatCompletion?: () => Promise<OpenAI.Chat.Completions.ChatCompletion>
}

function supportsArkReasoningEffort(modelId: string): boolean {
  return modelId === 'doubao-seed-1-8-251228' || modelId.startsWith('doubao-seed-2-0-')
}

export async function chatCompletionStream(
  userId: string,
  model: string | null | undefined,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  options: ChatCompletionOptions = {},
  callbacks?: ChatCompletionStreamCallbacks,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const streamStep = resolveStreamStepMeta(options)
  emitStreamStage(callbacks, streamStep, 'submit')
  if (!model) {
    const error = new Error('ANALYSIS_MODEL_NOT_CONFIGURED: 请先在设置页面配置分析模型')
    callbacks?.onError?.(error, streamStep)
    throw error
  }

  const selection = await resolveLlmRuntimeModel(userId, model)
  const resolvedModelId = selection.modelId
  const provider = selection.provider
  const providerKey = getProviderKey(provider).toLowerCase()
  const temperature = options.temperature ?? 0.7
  const reasoning = options.reasoning ?? true
  const reasoningEffort = options.reasoningEffort || 'high'
  const projectId =
    typeof options.projectId === 'string' && options.projectId.trim().length > 0
      ? options.projectId.trim()
      : undefined
  logLlmRawInput({
    userId,
    projectId,
    provider: providerKey,
    modelId: resolvedModelId,
    modelKey: selection.modelKey,
    stream: true,
    reasoning,
    reasoningEffort,
    temperature,
    action: options.action,
    messages,
  })

  try {
    if (providerKey === 'google' || providerKey === 'gemini-compatible') {
      const config = await getProviderConfig(userId, provider)
      // gemini-compatible 可能有自定义 baseUrl（指向第三方兼容服务）
      const googleAiOptions = config.baseUrl
        ? { apiKey: config.apiKey, httpOptions: { baseUrl: config.baseUrl } }
        : { apiKey: config.apiKey }
      const ai = new GoogleGenAI(googleAiOptions)
      const modelClient = (ai as unknown as { models?: GoogleModelClient }).models
      if (!modelClient || typeof modelClient.generateContentStream !== 'function') {
        throw new Error('GOOGLE_STREAM_UNAVAILABLE: google provider does not expose generateContentStream')
      }

      const systemParts = messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .filter(Boolean)
      const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }))
      const systemInstruction = systemParts.length > 0
        ? { parts: [{ text: systemParts.join('\n') }] }
        : undefined
      const supportsThinkingLevel = resolvedModelId.startsWith('gemini-3')
      const thinkingConfig = (options.reasoning ?? true) && supportsThinkingLevel
        ? { thinkingLevel: options.reasoningEffort || 'high', includeThoughts: true }
        : undefined

      emitStreamStage(callbacks, streamStep, 'streaming', providerKey)
      const stream = await modelClient.generateContentStream({
        model: resolvedModelId,
        contents,
        config: {
          temperature: options.temperature ?? 0.7,
          ...(systemInstruction ? { systemInstruction } : {}),
          ...(thinkingConfig ? { thinkingConfig } : {}),
        },
      })
      const streamChunk = stream as GoogleChunk
      const streamIterable = streamChunk?.stream || (stream as AsyncIterable<unknown>)

      let seq = 1
      let text = ''
      let reasoning = ''
      let lastChunk: unknown = null
      for await (const chunk of withStreamChunkTimeout(streamIterable)) {
        lastChunk = chunk
        const chunkParts = extractGoogleParts(chunk)

        let reasoningDelta = chunkParts.reasoning
        if (reasoningDelta && reasoning && reasoningDelta.startsWith(reasoning)) {
          reasoningDelta = reasoningDelta.slice(reasoning.length)
        }
        if (reasoningDelta) {
          reasoning += reasoningDelta
          emitStreamChunk(callbacks, streamStep, {
            kind: 'reasoning',
            delta: reasoningDelta,
            seq,
            lane: 'reasoning',
          })
          seq += 1
        }

        let textDelta = chunkParts.text
        if (textDelta && text && textDelta.startsWith(text)) {
          textDelta = textDelta.slice(text.length)
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

      const usage = extractGoogleUsage(lastChunk)
      // 如果流式传输结束后 text 仍然为空，抛出可重试错误
      if (!text) {
        throw new GoogleEmptyResponseError('stream_empty')
      }
      const completion = buildOpenAIChatCompletion(
        resolvedModelId,
        buildReasoningAwareContent(text, reasoning),
        usage,
      )
      logLlmRawOutput({
        userId,
        projectId,
        provider: providerKey,
        modelId: resolvedModelId,
        modelKey: selection.modelKey,
        stream: true,
        action: options.action,
        text,
        reasoning,
        usage,
      })
      recordCompletionUsage(resolvedModelId, completion)
      emitStreamStage(callbacks, streamStep, 'completed', providerKey)
      callbacks?.onComplete?.(text, streamStep)
      return completion
    }


    if (providerKey === 'ark') {
      const { apiKey } = await getProviderConfig(userId, provider)
      const client = new OpenAI({
        baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
        apiKey,
      })
      const useReasoning = options.reasoning ?? true
      const extraParams: Record<string, unknown> = {}
      if (supportsArkReasoningEffort(resolvedModelId)) {
        extraParams.reasoning_effort = useReasoning ? (options.reasoningEffort || 'high') : 'minimal'
      } else {
        extraParams.thinking = { type: useReasoning ? 'enabled' : 'disabled' }
      }

      emitStreamStage(callbacks, streamStep, 'streaming', provider)
      const stream = await client.chat.completions.create({
        model: resolvedModelId,
        messages,
        temperature: options.temperature ?? 0.7,
        max_completion_tokens: 65535,
        stream: true,
        ...extraParams,
      } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming)

      let text = ''
      let reasoning = ''
      let seq = 1
      let finalCompletion: OpenAI.Chat.Completions.ChatCompletion | null = null
      for await (const part of withStreamChunkTimeout(stream as AsyncIterable<unknown>)) {
        const { textDelta, reasoningDelta } = extractStreamDeltaParts(part)
        if (reasoningDelta) {
          reasoning += reasoningDelta
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

      const finalChatCompletionFn = (stream as OpenAIStreamWithFinal)?.finalChatCompletion
      if (typeof finalChatCompletionFn === 'function') {
        try {
          finalCompletion = await finalChatCompletionFn.call(stream)
          const finalParts = getCompletionParts(finalCompletion)
          if (finalParts.reasoning && finalParts.reasoning !== reasoning) {
            const reasoningDelta = finalParts.reasoning.startsWith(reasoning)
              ? finalParts.reasoning.slice(reasoning.length)
              : finalParts.reasoning
            if (reasoningDelta) {
              emitStreamChunk(callbacks, streamStep, {
                kind: 'reasoning',
                delta: reasoningDelta,
                seq,
                lane: 'reasoning',
              })
              seq += 1
            }
            reasoning = finalParts.reasoning
          }
          if (finalParts.text && finalParts.text !== text) {
            const textDelta = finalParts.text.startsWith(text)
              ? finalParts.text.slice(text.length)
              : finalParts.text
            if (textDelta) {
              emitStreamChunk(callbacks, streamStep, {
                kind: 'text',
                delta: textDelta,
                seq,
                lane: 'main',
              })
              seq += 1
            }
            text = finalParts.text
          }
        } catch {
          // Ignore final aggregation errors and keep streamed content.
        }
      }

      const completion = buildOpenAIChatCompletion(
        resolvedModelId,
        buildReasoningAwareContent(text, reasoning),
        finalCompletion
          ? {
            promptTokens: Number(finalCompletion.usage?.prompt_tokens ?? 0),
            completionTokens: Number(finalCompletion.usage?.completion_tokens ?? 0),
          }
          : undefined,
      )
      logLlmRawOutput({
        userId,
        projectId,
        provider,
        modelId: resolvedModelId,
        modelKey: selection.modelKey,
        stream: true,
        action: options.action,
        text,
        reasoning,
        usage: completionUsageSummary(finalCompletion),
      })
      recordCompletionUsage(resolvedModelId, completion)
      emitStreamStage(callbacks, streamStep, 'completed', provider)
      callbacks?.onComplete?.(text, streamStep)
      return completion
    }

    if (providerKey !== 'ark') {
      const config = await getProviderConfig(userId, provider)
      if (!config.baseUrl) {
        throw new Error(`PROVIDER_BASE_URL_MISSING: ${provider} (llm)`)
      }

      const isOpenRouter = !!config.baseUrl?.includes('openrouter')
      const providerName = isOpenRouter ? 'openrouter' : provider
      const shouldUseAiSdk = !isOpenRouter
      if (shouldUseAiSdk) {
        const aiOpenAI = createOpenAI({
          baseURL: config.baseUrl,
          apiKey: config.apiKey,
          name: providerName,
        })
        // 只有确定是支持 OpenAI 推理参数的提供商（如 OpenAI 官方、deepseek-r1 等）才传 reasoning provider options
        // gemini-compatible / 其他 OAI-compat 提供商不支持 forceReasoning/reasoningEffort，会导致空响应
        const isNativeOpenAIReasoning = shouldUseOpenAIReasoningProviderOptions({
          providerKey,
          providerApiMode: config.apiMode,
          modelId: resolvedModelId,
        })
        const aiSdkProviderOptions = (options.reasoning ?? true) && isNativeOpenAIReasoning
          ? {
            openai: {
              reasoningEffort: mapReasoningEffort(options.reasoningEffort || 'high'),
              forceReasoning: true,
            },
          }
          : undefined
        const useReasoning = options.reasoning ?? true
        const aiStreamResult = streamText({
          model: aiOpenAI.chat(resolvedModelId),
          system: getSystemPrompt(messages),
          messages: getConversationMessages(messages),
          // 推理模型不支持 temperature，仅在非推理模式下传递
          ...(useReasoning ? {} : { temperature: options.temperature ?? 0.7 }),
          maxRetries: options.maxRetries ?? 2,
          ...(aiSdkProviderOptions ? { providerOptions: aiSdkProviderOptions } : {}),
        })


        emitStreamStage(callbacks, streamStep, 'streaming', providerName)
        let text = ''
        let reasoning = ''
        let seq = 1
        // 用于诊断：记录每种 chunk type 的出现次数
        const chunkTypeCounts: Record<string, number> = {}
        // 记录 API 返回的原始错误（如有）
        const streamErrorChunks: unknown[] = []
        // 记录 finishReason
        let streamFinishReason: string | undefined
        // 记录所有未知类型 chunk 的原始内容（诊断 AI SDK 未解析的响应）
        const unknownChunkSamples: unknown[] = []
        for await (const chunk of withStreamChunkTimeout(aiStreamResult.fullStream as AsyncIterable<AISdkStreamChunk>)) {
          const chunkType = chunk?.type || 'unknown'
          chunkTypeCounts[chunkType] = (chunkTypeCounts[chunkType] || 0) + 1
          if (chunkType === 'reasoning-delta' && typeof chunk.text === 'string' && chunk.text) {
            reasoning += chunk.text
            emitStreamChunk(callbacks, streamStep, {
              kind: 'reasoning',
              delta: chunk.text,
              seq,
              lane: 'reasoning',
            })
            seq += 1
          }
          if (chunkType === 'text-delta' && typeof chunk.text === 'string' && chunk.text) {
            text += chunk.text
            emitStreamChunk(callbacks, streamStep, {
              kind: 'text',
              delta: chunk.text,
              seq,
              lane: 'main',
            })
            seq += 1
          }
          // 捕获 error 类型 chunk（API 返回的原始错误）
          if (chunkType === 'error') {
            streamErrorChunks.push((chunk as Record<string, unknown>).error ?? chunk)
          }
          // 捕获 finish-step 的 finishReason
          if (chunkType === 'finish-step' || chunkType === 'finish') {
            const reason = (chunk as Record<string, unknown>).finishReason as string | undefined
            if (reason) streamFinishReason = reason
          }
          // 记录所有非标准 chunk 的原始内容（排除纯生命周期 chunk）
          const lifecycleTypes = new Set(['text-delta', 'reasoning-delta', 'start', 'start-step', 'finish-step', 'finish', 'error'])
          if (!lifecycleTypes.has(chunkType) && unknownChunkSamples.length < 5) {
            unknownChunkSamples.push(chunk)
          }
        }

        // 读取 AI SDK warnings（如 temperature 不支持等）和最终 finishReason
        let sdkWarnings: unknown[] = []
        let sdkFinishReason: string | undefined
        let sdkProviderMetadata: unknown = undefined
        let sdkResponseStatus: number | undefined
        let sdkResponseHeaders: Record<string, string> | undefined
        try {
          const warnResult = await Promise.resolve(aiStreamResult.warnings).catch(() => null)
          sdkWarnings = Array.isArray(warnResult) ? warnResult : []
        } catch { }
        try {
          sdkFinishReason = await Promise.resolve(aiStreamResult.finishReason).catch(() => undefined) as string | undefined
        } catch { }
        // 读取 providerMetadata（Gemini safetyRatings 等关键诊断信息）
        try {
          sdkProviderMetadata = await Promise.resolve((aiStreamResult as unknown as { experimental_providerMetadata?: unknown }).experimental_providerMetadata).catch(() => undefined)
        } catch { }
        // 读取 HTTP response 状态（诊断 API 层面是否正常）
        try {
          const resp = await Promise.resolve(aiStreamResult.response).catch(() => null)
          if (resp) {
            sdkResponseStatus = (resp as { status?: number }).status
            const hdrs = (resp as { headers?: Record<string, string> }).headers
            if (hdrs && typeof hdrs === 'object') {
              sdkResponseHeaders = Object.fromEntries(
                Object.entries(hdrs).filter(([k]) => ['content-type', 'x-ratelimit-remaining-requests', 'x-request-id'].includes(k))
              ) as Record<string, string>
            }
          }
        } catch { }

        let finalReasoning = reasoning
        let finalText = text
        try {
          const resolvedReasoning = await aiStreamResult.reasoningText
          if (resolvedReasoning && resolvedReasoning !== finalReasoning) {
            const delta = resolvedReasoning.startsWith(finalReasoning)
              ? resolvedReasoning.slice(finalReasoning.length)
              : resolvedReasoning
            if (delta) {
              emitStreamChunk(callbacks, streamStep, {
                kind: 'reasoning',
                delta,
                seq,
                lane: 'reasoning',
              })
              seq += 1
            }
            finalReasoning = resolvedReasoning
          }
        } catch { }
        try {
          const resolvedText = await aiStreamResult.text
          if (resolvedText && resolvedText !== finalText) {
            const delta = resolvedText.startsWith(finalText)
              ? resolvedText.slice(finalText.length)
              : resolvedText
            if (delta) {
              emitStreamChunk(callbacks, streamStep, {
                kind: 'text',
                delta,
                seq,
                lane: 'main',
              })
              seq += 1
            }
            finalText = resolvedText
          }
        } catch { }

        let usage = await Promise.resolve(aiStreamResult.usage).catch(() => null)

        // 显式回退：仅当“强制推理参数”模式返回空文本时，重试一次无推理 provider options 请求。
        if (!finalText && aiSdkProviderOptions) {
          llmLogger.warn({
            audit: false,
            action: 'llm.stream.reasoning_fallback',
            message: '[LLM] empty stream with reasoning options, retrying once without provider reasoning options',
            userId,
            projectId,
            provider: providerName,
            details: {
              model: { id: resolvedModelId, key: selection.modelKey },
              action: options.action ?? null,
              finishReason: sdkFinishReason ?? streamFinishReason ?? 'unknown',
            },
          })

          try {
            const fallbackResult = await generateText({
              model: aiOpenAI.chat(resolvedModelId),
              system: getSystemPrompt(messages),
              messages: getConversationMessages(messages) as ModelMessage[],
              temperature: options.temperature ?? 0.7,
              maxRetries: options.maxRetries ?? 2,
            })
            const fallbackReasoning = fallbackResult.reasoningText || ''
            const fallbackText = fallbackResult.text || ''
            const fallbackUsage = fallbackResult.usage || fallbackResult.totalUsage

            if (fallbackReasoning) {
              emitStreamChunk(callbacks, streamStep, {
                kind: 'reasoning',
                delta: fallbackReasoning,
                seq,
                lane: 'reasoning',
              })
              seq += 1
            }
            if (fallbackText) {
              emitStreamChunk(callbacks, streamStep, {
                kind: 'text',
                delta: fallbackText,
                seq,
                lane: 'main',
              })
              seq += 1
            }

            if (fallbackReasoning) finalReasoning = fallbackReasoning
            if (fallbackText) finalText = fallbackText
            if (fallbackUsage) usage = fallbackUsage
          } catch (fallbackError) {
            llmLogger.warn({
              audit: false,
              action: 'llm.stream.reasoning_fallback_failed',
              message: '[LLM] fallback without reasoning options failed',
              userId,
              projectId,
              provider: providerName,
              details: {
                model: { id: resolvedModelId, key: selection.modelKey },
                action: options.action ?? null,
                error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
              },
            })
          }
        }

        // 空响应诊断日志：当文本为空时记录详细信息并抛出可重试错误
        if (!finalText) {
          // 同步写日志，确保不因竞态丢失，包含完整的原始 API 错误
          llmLogger.warn({
            audit: false,
            action: 'llm.stream.empty_response',
            message: '[LLM] AI SDK 流式返回空内容',
            userId,
            projectId,
            provider: providerName,
            details: {
              model: { id: resolvedModelId, key: selection.modelKey },
              action: options.action ?? null,
              reasoningEnabled: useReasoning,
              isNativeOpenAIReasoning,
              reasoningEffort: options.reasoningEffort ?? 'high',
              chunkTypeCounts,
              sdkWarnings,
              // 原始 API 错误 chunk
              streamErrors: streamErrorChunks.length > 0 ? streamErrorChunks : undefined,
              // finish reason（如 error / content-filter / stop / other 等）
              finishReason: sdkFinishReason ?? streamFinishReason ?? 'unknown',
              // providerMetadata：Gemini safetyRatings、blockReason 等原始信息
              providerMetadata: sdkProviderMetadata,
              // HTTP 响应状态（诊断 API 层面是否正常返回）
              httpStatus: sdkResponseStatus,
              httpHeaders: sdkResponseHeaders,
              // 未被 AI SDK 识别的 chunk 原始内容（可能是模型返回了特殊格式）
              unknownChunks: unknownChunkSamples.length > 0 ? unknownChunkSamples : undefined,
              streamedReasoningLength: finalReasoning.length,
            },
          })
          const finishInfo = sdkFinishReason ?? streamFinishReason ?? 'unknown'
          const errDetail = streamErrorChunks.length > 0
            ? ` [apiError: ${JSON.stringify(streamErrorChunks[0])}]`
            : sdkWarnings.length > 0 ? ` [warnings: ${JSON.stringify(sdkWarnings)}]` : ''
          throw new Error(
            `LLM_EMPTY_RESPONSE: ${providerName}::${resolvedModelId} 返回空内容` +
            ` [finishReason: ${finishInfo}]` +
            ` [httpStatus: ${sdkResponseStatus ?? 'unknown'}]` +
            errDetail +
            ` [chunks: ${JSON.stringify(chunkTypeCounts)}]`,
          )
        }





        const completion = buildOpenAIChatCompletion(
          resolvedModelId,
          buildReasoningAwareContent(finalText, finalReasoning),
          {
            promptTokens: usage?.inputTokens ?? 0,
            completionTokens: usage?.outputTokens ?? 0,
          },
        )
        logLlmRawOutput({
          userId,
          projectId,
          provider: providerName,
          modelId: resolvedModelId,
          modelKey: selection.modelKey,
          stream: true,
          action: options.action,
          text: finalText,
          reasoning: finalReasoning,
          usage: {
            promptTokens: usage?.inputTokens ?? 0,
            completionTokens: usage?.outputTokens ?? 0,
          },
        })
        recordCompletionUsage(resolvedModelId, completion)
        emitStreamStage(callbacks, streamStep, 'completed', providerName)
        callbacks?.onComplete?.(finalText, streamStep)
        return completion
      }

      const client = new OpenAI({
        baseURL: config.baseUrl,
        apiKey: config.apiKey,
      })

      const extraParams: Record<string, unknown> = {}
      if (isOpenRouter && (options.reasoning ?? true)) {
        extraParams.reasoning = { effort: options.reasoningEffort || 'high' }
      }

      emitStreamStage(callbacks, streamStep, 'streaming', providerName)
      const isOpenRouterReasoning = isOpenRouter && (options.reasoning ?? true)
      const stream = await client.chat.completions.create({
        model: resolvedModelId,
        messages,
        // OpenRouter 推理模型不支持 temperature
        ...(isOpenRouterReasoning ? {} : { temperature: options.temperature ?? 0.7 }),
        stream: true,
        ...extraParams,
      } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming)

      let text = ''
      let reasoning = ''
      let seq = 1
      let finalCompletion: OpenAI.Chat.Completions.ChatCompletion | null = null
      for await (const part of withStreamChunkTimeout(stream as AsyncIterable<unknown>)) {
        const { textDelta, reasoningDelta } = extractStreamDeltaParts(part)
        if (reasoningDelta) {
          reasoning += reasoningDelta
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

      const finalChatCompletionFn = (stream as OpenAIStreamWithFinal)?.finalChatCompletion
      if (typeof finalChatCompletionFn === 'function') {
        try {
          finalCompletion = await finalChatCompletionFn.call(stream)
          const finalParts = getCompletionParts(finalCompletion)
          if (finalParts.reasoning && finalParts.reasoning !== reasoning) {
            const reasoningDelta = finalParts.reasoning.startsWith(reasoning)
              ? finalParts.reasoning.slice(reasoning.length)
              : finalParts.reasoning
            if (reasoningDelta) {
              emitStreamChunk(callbacks, streamStep, {
                kind: 'reasoning',
                delta: reasoningDelta,
                seq,
                lane: 'reasoning',
              })
              seq += 1
            }
            reasoning = finalParts.reasoning
          }
          if (finalParts.text && finalParts.text !== text) {
            const textDelta = finalParts.text.startsWith(text)
              ? finalParts.text.slice(text.length)
              : finalParts.text
            if (textDelta) {
              emitStreamChunk(callbacks, streamStep, {
                kind: 'text',
                delta: textDelta,
                seq,
                lane: 'main',
              })
              seq += 1
            }
            text = finalParts.text
          }
        } catch {
          // Ignore final aggregation errors and keep streamed content.
        }
      }

      const completion = buildOpenAIChatCompletion(
        resolvedModelId,
        buildReasoningAwareContent(text, reasoning),
        finalCompletion
          ? {
            promptTokens: Number(finalCompletion.usage?.prompt_tokens ?? 0),
            completionTokens: Number(finalCompletion.usage?.completion_tokens ?? 0),
          }
          : undefined,
      )
      logLlmRawOutput({
        userId,
        projectId,
        provider: providerName,
        modelId: resolvedModelId,
        modelKey: selection.modelKey,
        stream: true,
        action: options.action,
        text,
        reasoning,
        usage: completionUsageSummary(finalCompletion),
      })
      recordCompletionUsage(resolvedModelId, completion)
      emitStreamStage(callbacks, streamStep, 'completed', providerName)
      callbacks?.onComplete?.(text, streamStep)
      return completion
    }
    throw new Error(`UNSUPPORTED_STREAM_PROVIDER: ${providerKey}`)
  } catch (error) {
    // Detect PROHIBITED_CONTENT from Gemini and normalize to SENSITIVE_CONTENT
    // (consistent with chat-completion.ts)
    const errMsg = error instanceof Error ? error.message : String(error)
    if (errMsg.includes('PROHIBITED_CONTENT') || errMsg.includes('request_body_blocked')) {
      const sensitiveError = new Error('SENSITIVE_CONTENT: 内容包含敏感信息,无法处理。请修改内容后重试')
      callbacks?.onError?.(sensitiveError, streamStep)
      throw sensitiveError
    }
    callbacks?.onError?.(error, streamStep)
    throw error
  }
}
