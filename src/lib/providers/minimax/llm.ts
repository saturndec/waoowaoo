import OpenAI from 'openai'
import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/providers/official/model-registry'
import { ensureMiniMaxCatalogRegistered } from './catalog'
import type { MiniMaxLlmMessage } from './types'

export interface MiniMaxLlmCompletionParams {
  modelId: string
  messages: MiniMaxLlmMessage[]
  apiKey: string
  baseUrl?: string
  temperature?: number
}

const MINIMAX_DEFAULT_BASE_URL = 'https://api.minimaxi.com/v1'

function assertRegistered(modelId: string): void {
  ensureMiniMaxCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'minimax',
    modality: 'llm' satisfies OfficialModelModality,
    modelId,
  })
}

export async function completeMiniMaxLlm(
  params: MiniMaxLlmCompletionParams,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  assertRegistered(params.modelId)

  const client = new OpenAI({
    apiKey: params.apiKey,
    baseURL: params.baseUrl || MINIMAX_DEFAULT_BASE_URL,
    timeout: 60_000,
  })

  const completion = await client.chat.completions.create({
    model: params.modelId,
    messages: params.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature: params.temperature ?? 0.7,
  })

  return completion as OpenAI.Chat.Completions.ChatCompletion
}
