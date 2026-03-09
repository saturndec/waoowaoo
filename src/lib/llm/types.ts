import type { LLMStreamKind } from '@/lib/llm-observe/types'
import type { InternalLLMStreamStepMeta } from '@/lib/llm-observe/internal-stream-context'

export interface ChatCompletionOptions {
    temperature?: number
    reasoning?: boolean
    reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
    maxRetries?: number
    // 💰 计费相关
    projectId?: string   // 用于计费（如果不传，使用 'system' 作为默认值）
    action?: string      // 计费操作名称
    // 流式步骤元信息（用于任务控制台按步骤展示）
    streamStepId?: string
    streamStepAttempt?: number
    streamStepTitle?: string
    streamStepIndex?: number
    streamStepTotal?: number
    // Prompt routing telemetry (VAT-41 P0)
    promptTelemetry?: {
      prompt_language: 'zh' | 'en'
      output_language: 'zh' | 'en' | 'vi' | 'ko'
      contract_language: 'en'
      contract_valid: boolean
      fallback_applied: boolean
      fallback_reason?: string
      route_reason: string
    }
    // 内部保护位：避免 chatCompletion 与 chatCompletionStream 互相递归
    __skipAutoStream?: boolean
}

export interface ChatCompletionStreamCallbacks {
    onStage?: (stage: {
        stage: 'submit' | 'streaming' | 'fallback' | 'completed'
        provider?: string | null
        step?: InternalLLMStreamStepMeta
    }) => void
    onChunk?: (chunk: {
        kind: LLMStreamKind
        delta: string
        seq: number
        lane?: string | null
        step?: InternalLLMStreamStepMeta
    }) => void
    onComplete?: (text: string, step?: InternalLLMStreamStepMeta) => void
    onError?: (error: unknown, step?: InternalLLMStreamStepMeta) => void
}

export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string }
