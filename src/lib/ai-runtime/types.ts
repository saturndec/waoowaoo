import type OpenAI from 'openai'

export type AiRuntimeErrorCode =
  | 'NETWORK_ERROR'
  | 'RATE_LIMIT'
  | 'EMPTY_RESPONSE'
  | 'PARSE_ERROR'
  | 'TIMEOUT'
  | 'SENSITIVE_CONTENT'
  | 'INTERNAL_ERROR'

export type AiRuntimeError = Error & {
  code: AiRuntimeErrorCode
  retryable: boolean
  provider?: string | null
  cause?: unknown
}

export type AiPromptPolicyContext = {
  modelKey?: string | null
  provider?: string | null
  taskType?: string | null
  profile?: 'balanced' | 'en-first' | 'zh-preferred'
}

export type AiPromptTelemetry = {
  prompt_language: 'zh' | 'en'
  output_language: 'zh' | 'en' | 'vi' | 'ko'
  contract_language: 'en'
  contract_valid: boolean
  fallback_applied: boolean
  fallback_reason?: string
  route_reason: string
}

export type AiStepMeta = {
  stepId: string
  stepAttempt?: number
  stepTitle: string
  stepIndex: number
  stepTotal: number
  promptPolicy?: AiPromptPolicyContext
}

export type AiTextMessages = Array<{
  role: 'user' | 'assistant' | 'system'
  content: string
}>

export type AiStepExecutionInput = {
  userId: string
  model: string
  messages: AiTextMessages
  projectId: string
  action: string
  meta: AiStepMeta
  promptTelemetry?: AiPromptTelemetry
  temperature?: number
  reasoning?: boolean
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
}

export type AiStepExecutionResult = {
  text: string
  reasoning: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  completion: OpenAI.Chat.Completions.ChatCompletion
  promptTelemetry?: AiPromptTelemetry
}

export type AiVisionStepExecutionInput = {
  userId: string
  model: string
  prompt: string
  imageUrls: string[]
  projectId?: string
  action?: string
  meta?: AiStepMeta
  temperature?: number
  reasoning?: boolean
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
}

export type AiVisionStepExecutionResult = {
  text: string
  reasoning: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  completion: OpenAI.Chat.Completions.ChatCompletion
}
