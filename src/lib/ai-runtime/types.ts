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

export type AiStepMeta = {
  stepId: string
  stepAttempt?: number
  stepTitle: string
  stepIndex: number
  stepTotal: number
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
