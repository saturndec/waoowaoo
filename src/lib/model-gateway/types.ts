export type ModelGatewayRoute = 'official' | 'openai-compat'

export type CompatibleProviderKey = 'openai-compatible' | 'grok-compatible'

export type OpenAICompatImageProfile = CompatibleProviderKey

export type OpenAICompatVideoProfile = CompatibleProviderKey

export interface OpenAICompatClientConfig {
  providerId: string
  baseUrl: string
  apiKey: string
}

export interface OpenAICompatImageRequest {
  userId: string
  providerId: string
  modelId?: string
  prompt: string
  referenceImages?: string[]
  options?: Record<string, unknown>
  profile: OpenAICompatImageProfile
  template?: import('@/lib/openai-compat-media-template').OpenAICompatMediaTemplate
  modelKey?: string
}

export interface OpenAICompatVideoRequest {
  userId: string
  providerId: string
  modelId?: string
  imageUrl: string
  prompt: string
  options?: Record<string, unknown>
  profile: OpenAICompatVideoProfile
  template?: import('@/lib/openai-compat-media-template').OpenAICompatMediaTemplate
  modelKey?: string
}

export interface OpenAICompatChatRequest {
  userId: string
  providerId: string
  modelId: string
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  temperature: number
}
