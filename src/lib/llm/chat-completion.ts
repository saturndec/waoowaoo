import OpenAI from 'openai'
import { generateText, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { GoogleGenAI } from '@google/genai'
import {
  getProviderConfig,
  getProviderKey,
} from '../api-config'
import { getInternalLLMStreamCallbacks } from '../llm-observe/internal-stream-context'
import type { ChatCompletionOptions } from './types'
import { extractGoogleParts, extractGoogleUsage, GoogleEmptyResponseError } from './providers/google'
import { buildOpenAIChatCompletion } from './providers/openai-compat'
import { getCompletionParts } from './completion-parts'
import {
  buildReasoningAwareContent,
  getConversationMessages,
  getSystemPrompt,
  mapReasoningEffort,
} from './utils'
import { shouldUseOpenAIReasoningProviderOptions } from './reasoning-capability'
import {
  _ulogError,
  _ulogWarn,
  completionUsageSummary,
  isRetryableError,
  llmLogger,
  logLlmRawInput,
  logLlmRawOutput,
  recordCompletionUsage,
  resolveLlmRuntimeModel,
} from './runtime-shared'

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const record = toRecord(error)
  if (record && typeof record.message === 'string') return record.message
  return 'unknown error'
}

function supportsArkReasoningEffort(modelId: string): boolean {
  return modelId === 'doubao-seed-1-8-251228' || modelId.startsWith('doubao-seed-2-0-')
}

export async function chatCompletion(
  userId: string,
  model: string | null | undefined,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  options: ChatCompletionOptions = {},
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const internalCallbacks = getInternalLLMStreamCallbacks()
  if (internalCallbacks && !options.__skipAutoStream) {
    const { chatCompletionStream } = await import('./chat-stream')
    return await chatCompletionStream(
      userId,
      model,
      messages,
      { ...options, __skipAutoStream: true },
      internalCallbacks,
    )
  }

  if (!model) {
    _ulogError('[LLM] 模型未配置，调用栈:', new Error().stack)
    throw new Error('ANALYSIS_MODEL_NOT_CONFIGURED: 请先在设置页面配置分析模型')
  }

  const selection = await resolveLlmRuntimeModel(userId, model)
  const resolvedModelId = selection.modelId
  const provider = selection.provider
  const providerKey = getProviderKey(provider).toLowerCase()

  const {
    temperature = 0.7,
    reasoning = true,
    reasoningEffort = 'high',
    maxRetries = 2,
  } = options
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
    stream: false,
    reasoning,
    reasoningEffort,
    temperature,
    action: options.action,
    messages,
  })

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const attemptStartedAt = Date.now()
    try {
      if (providerKey === 'google' || providerKey === 'gemini-compatible') {
        const config = await getProviderConfig(userId, provider)
        // gemini-compatible 可能有自定义 baseUrl（指向第三方兼容服务）
        const googleAiOptions = config.baseUrl
          ? { apiKey: config.apiKey, httpOptions: { baseUrl: config.baseUrl } }
          : { apiKey: config.apiKey }
        const ai = new GoogleGenAI(googleAiOptions)

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
        const thinkingConfig = reasoning && supportsThinkingLevel
          ? { thinkingLevel: reasoningEffort, includeThoughts: true }
          : undefined

        const googleRequest = {
          model: resolvedModelId,
          contents,
          config: {
            temperature,
            ...(systemInstruction ? { systemInstruction } : {}),
            ...(thinkingConfig ? { thinkingConfig } : {}),
          },
        }
        const response = await ai.models.generateContent(
          googleRequest as unknown as Parameters<typeof ai.models.generateContent>[0],
        )

        const googleParts = extractGoogleParts(response, true)
        const usage = extractGoogleUsage(response)
        const completion = buildOpenAIChatCompletion(
          resolvedModelId,
          buildReasoningAwareContent(googleParts.text, googleParts.reasoning),
          usage,
        )
        logLlmRawOutput({
          userId,
          projectId,
          provider: providerKey,
          modelId: resolvedModelId,
          modelKey: selection.modelKey,
          stream: false,
          action: options.action,
          text: googleParts.text,
          reasoning: googleParts.reasoning,
          usage,
        })
        recordCompletionUsage(resolvedModelId, completion)
        llmLogger.info({
          action: 'llm.call.success',
          message: 'llm call succeeded',
          provider: providerKey,
          durationMs: Date.now() - attemptStartedAt,
          details: {
            model: resolvedModelId,
            attempt,
            maxRetries,
          },
        })
        return completion
      }


      if (providerKey === 'ark') {
        const { apiKey } = await getProviderConfig(userId, provider)
        const client = new OpenAI({
          baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
          apiKey,
        })
        const extraParams: Record<string, unknown> = {}
        if (supportsArkReasoningEffort(resolvedModelId)) {
          extraParams.reasoning_effort = reasoning ? reasoningEffort : 'minimal'
        } else {
          extraParams.thinking = { type: reasoning ? 'enabled' : 'disabled' }
        }

        const completion = await client.chat.completions.create({
          model: resolvedModelId,
          messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          temperature,
          max_completion_tokens: 65535,
          ...extraParams,
        } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming)
        const completionParts = getCompletionParts(completion)
        logLlmRawOutput({
          userId,
          projectId,
          provider: 'ark',
          modelId: resolvedModelId,
          modelKey: selection.modelKey,
          stream: false,
          action: options.action,
          text: completionParts.text,
          reasoning: completionParts.reasoning,
          usage: completionUsageSummary(completion),
        })
        recordCompletionUsage(resolvedModelId, completion)
        llmLogger.info({
          action: 'llm.call.success',
          message: 'llm call succeeded',
          provider: 'ark',
          durationMs: Date.now() - attemptStartedAt,
          details: {
            model: resolvedModelId,
            attempt,
            maxRetries,
          },
        })
        return completion
      }

      const config = await getProviderConfig(userId, provider)
      if (!config.baseUrl) {
        throw new Error(`PROVIDER_BASE_URL_MISSING: ${provider} (llm)`)
      }

      const isOpenRouter = !!config.baseUrl?.includes('openrouter')
      const providerName = isOpenRouter ? 'openrouter' : 'openai_compatible'
      if (!isOpenRouter) {
        const aiOpenAI = createOpenAI({
          baseURL: config.baseUrl,
          apiKey: config.apiKey,
          name: providerName,
        })
        // 只有原生 OpenAI 推理模型才支持 forceReasoning/reasoningEffort
        // gemini-compatible 等 OAI-compat 提供商传这些参数会导致空响应
        const isNativeOpenAIReasoning = shouldUseOpenAIReasoningProviderOptions({
          providerKey,
          providerApiMode: config.apiMode,
          modelId: resolvedModelId,
        })
        const aiSdkProviderOptions = reasoning && isNativeOpenAIReasoning
          ? {
            openai: {
              reasoningEffort: mapReasoningEffort(reasoningEffort),
              forceReasoning: true,
            },
          }
          : undefined
        const generateParams: Parameters<typeof generateText>[0] = {
          model: aiOpenAI.chat(resolvedModelId),
          system: getSystemPrompt(messages),
          messages: getConversationMessages(messages) as ModelMessage[],
          // 推理模型不支持 temperature，仅在非推理模式下传递
          ...(reasoning ? {} : { temperature }),
          maxRetries,
          ...(aiSdkProviderOptions ? { providerOptions: aiSdkProviderOptions } : {}),
        }
        const aiSdkResult = await generateText(generateParams)

        const usage = aiSdkResult.usage || aiSdkResult.totalUsage
        const completion = buildOpenAIChatCompletion(
          resolvedModelId,
          buildReasoningAwareContent(aiSdkResult.text || '', aiSdkResult.reasoningText || ''),
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
          stream: false,
          action: options.action,
          text: aiSdkResult.text || '',
          reasoning: aiSdkResult.reasoningText || '',
          usage: {
            promptTokens: usage?.inputTokens ?? 0,
            completionTokens: usage?.outputTokens ?? 0,
          },
        })
        recordCompletionUsage(resolvedModelId, completion)
        llmLogger.info({
          action: 'llm.call.success',
          message: 'llm call succeeded',
          provider: providerName,
          durationMs: Date.now() - attemptStartedAt,
          details: {
            model: resolvedModelId,
            attempt,
            maxRetries,
            engine: 'ai_sdk',
          },
        })
        return completion
      }

      const client = new OpenAI({
        baseURL: config.baseUrl,
        apiKey: config.apiKey,
      })

      const extraParams: Record<string, unknown> = {}
      if (isOpenRouter && reasoning) {
        extraParams.reasoning = { effort: reasoningEffort }
      }

      const completion = await client.chat.completions.create({
        model: resolvedModelId,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        temperature,
        ...extraParams,
      })
      const normalizedCompletion = completion as OpenAI.Chat.Completions.ChatCompletion
      const completionParts = getCompletionParts(normalizedCompletion)
      logLlmRawOutput({
        userId,
        projectId,
        provider: providerName,
        modelId: resolvedModelId,
        modelKey: selection.modelKey,
        stream: false,
        action: options.action,
        text: completionParts.text,
        reasoning: completionParts.reasoning,
        usage: completionUsageSummary(normalizedCompletion),
      })
      recordCompletionUsage(resolvedModelId, normalizedCompletion)
      llmLogger.info({
        action: 'llm.call.success',
        message: 'llm call succeeded',
        provider: providerName,
        durationMs: Date.now() - attemptStartedAt,
        details: {
          model: resolvedModelId,
          attempt,
          maxRetries,
          engine: 'openai_sdk',
        },
      })
      return completion
    } catch (error: unknown) {
      const normalizedError = error instanceof Error ? error : new Error(errorMessage(error))
      lastError = normalizedError
      llmLogger.warn({
        action: 'llm.call.attempt_failed',
        message: errorMessage(error) || 'llm call attempt failed',
        provider,
        durationMs: Date.now() - attemptStartedAt,
        details: {
          model: resolvedModelId,
          attempt,
          maxRetries,
        },
      })
      const errorBody = toRecord(toRecord(error)?.error) || toRecord(error)
      if (errorBody?.message === 'PROHIBITED_CONTENT' || errorBody?.code === 502) {
        _ulogError('[LLM] ❌ 内容安全检测失败 - Google AI Studio 拒绝处理此内容')
        throw new Error('SENSITIVE_CONTENT: 内容包含敏感信息,无法处理。请修改内容后重试')
      }

      // Google Gemini 返回空响应时，视为可重试错误（不抛出，继续重试循环）
      if (error instanceof GoogleEmptyResponseError) {
        _ulogWarn(`[LLM] Google 返回空响应，将重试 (${attempt}/${maxRetries + 1}): ${errorMessage(error)}`)
        if (attempt > maxRetries) break
        const delayMs = Math.min(2000 * attempt, 8000)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        continue
      }

      _ulogWarn(`[LLM] 调用失败 (${attempt}/${maxRetries + 1}): ${errorMessage(error)}`)

      if (!isRetryableError(error) || attempt > maxRetries) break
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  throw lastError || new Error('LLM 调用失败')
}
