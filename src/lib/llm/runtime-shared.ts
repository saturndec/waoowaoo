import OpenAI from 'openai'
import { createScopedLogger } from '@/lib/logging/core'
import { resolveModelSelection } from '../api-config'
import { recordTextUsage as recordBillingTextUsage } from '@/lib/billing/runtime-usage'
import type { AiPromptTelemetry } from '@/lib/ai-runtime/types'

export const llmLogger = createScopedLogger({
  module: 'llm.client',
  action: 'llm.call',
})

export const _ulogInfo = (...args: unknown[]) => llmLogger.info(...args)
export const _ulogWarn = (...args: unknown[]) => llmLogger.warn(...args)
export const _ulogError = (...args: unknown[]) => llmLogger.error(...args)

export type LlmRawMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

type LlmUsage = {
  promptTokens: number
  completionTokens: number
}

export function completionUsageSummary(
  completion: OpenAI.Chat.Completions.ChatCompletion | null | undefined,
): LlmUsage | null {
  const usage = completion?.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined
  if (!usage) return null
  const promptTokens = Number(usage.prompt_tokens ?? 0)
  const completionTokens = Number(usage.completion_tokens ?? 0)
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) return null
  return {
    promptTokens,
    completionTokens,
  }
}

export function logLlmRawInput(params: {
  userId: string
  projectId?: string
  provider: string
  modelId: string
  modelKey: string
  stream: boolean
  reasoning: boolean
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high'
  temperature: number
  action?: string
  messages: LlmRawMessage[]
  promptTelemetry?: AiPromptTelemetry
}) {
  llmLogger.info({
    audit: true,
    action: 'llm.raw.input',
    message: 'llm raw input',
    userId: params.userId,
    projectId: params.projectId,
    provider: params.provider,
    details: {
      action: params.action || null,
      stream: params.stream,
      model: {
        id: params.modelId,
        key: params.modelKey,
      },
      options: {
        temperature: params.temperature,
        reasoning: params.reasoning,
        reasoningEffort: params.reasoningEffort,
      },
      promptPolicy: params.promptTelemetry || null,
      messages: params.messages,
    },
  })
}

export function logLlmRawOutput(params: {
  userId: string
  projectId?: string
  provider: string
  modelId: string
  modelKey: string
  stream: boolean
  action?: string
  text: string
  reasoning: string
  usage?: LlmUsage | null
}) {
  const isEmpty = !params.text
  const logPayload = {
    audit: true,
    action: 'llm.raw.output',
    message: isEmpty ? 'llm raw output [EMPTY]' : 'llm raw output',
    userId: params.userId,
    projectId: params.projectId,
    provider: params.provider,
    details: {
      action: params.action || null,
      stream: params.stream,
      model: {
        id: params.modelId,
        key: params.modelKey,
      },
      output: {
        reasoning: params.reasoning,
        text: params.text,
        // 空响应时显式标记，方便 grep
        empty: isEmpty || undefined,
      },
      usage: params.usage || null,
    },
  }
  if (isEmpty) {
    llmLogger.warn(logPayload)
  } else {
    llmLogger.info(logPayload)
  }
}

export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const errorRecord = error as { code?: unknown; status?: unknown }
  if (errorRecord.code === 'ECONNRESET' || errorRecord.code === 'ETIMEDOUT') return true
  if (typeof errorRecord.status === 'number' && (errorRecord.status === 429 || (errorRecord.status >= 500 && errorRecord.status < 600))) {
    return true
  }
  return false
}

export function recordCompletionUsage(model: string, completion: OpenAI.Chat.Completions.ChatCompletion) {
  const summary = completionUsageSummary(completion)
  if (!summary) return

  recordBillingTextUsage({
    model,
    inputTokens: summary.promptTokens,
    outputTokens: summary.completionTokens,
  })
}

export interface ResolvedLlmRuntimeModel {
  provider: string
  modelId: string
  modelKey: string
}

export async function resolveLlmRuntimeModel(
  userId: string,
  model: string,
): Promise<ResolvedLlmRuntimeModel> {
  const selection = await resolveModelSelection(userId, model, 'llm')
  return {
    provider: selection.provider,
    modelId: selection.modelId,
    modelKey: selection.modelKey,
  }
}
