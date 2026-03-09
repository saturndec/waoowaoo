export type MiniMaxProviderKey = 'minimax'

export interface MiniMaxGenerateRequestOptions {
  provider: string
  modelId: string
  modelKey: string
  [key: string]: unknown
}

export interface MiniMaxLlmMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface MiniMaxProbeStep {
  name: 'models' | 'credits'
  status: 'pass' | 'fail' | 'skip'
  message: string
  detail?: string
}

export interface MiniMaxProbeResult {
  success: boolean
  steps: MiniMaxProbeStep[]
}
