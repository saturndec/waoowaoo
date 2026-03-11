import { getProviderKey } from '@/lib/api-config'
import { resolveOpenAICompatClientConfig } from '@/lib/model-gateway/openai-compat/common'

const PROBE_TIMEOUT_MS = 15_000

type ProbeEndpoint = 'responses' | 'chat-completions'
type ProbeOutcome =
  | 'supported'
  | 'unsupported'
  | 'auth_fail'
  | 'rate_limited'
  | 'provider_error'
  | 'network_error'
  | 'timeout'
  | 'inconclusive'

export interface ModelLlmProtocolProbeTrace {
  endpoint: ProbeEndpoint
  url: string
  outcome: ProbeOutcome
  status?: number
  note: string
  bodySnippet?: string
}

export interface ModelLlmProtocolProbeInput {
  userId: string
  providerId: string
  modelId: string
}

export interface ModelLlmProtocolProbeSuccess {
  success: true
  protocol: 'responses' | 'chat-completions'
  checkedAt: string
  traces: ModelLlmProtocolProbeTrace[]
}

export interface ModelLlmProtocolProbeFailure {
  success: false
  code: 'PROBE_INCONCLUSIVE' | 'PROBE_AUTH_FAILED'
  message: string
  traces: ModelLlmProtocolProbeTrace[]
}

export type ModelLlmProtocolProbeResult =
  | ModelLlmProtocolProbeSuccess
  | ModelLlmProtocolProbeFailure

type EndpointProbeResult = {
  outcome: ProbeOutcome
  status?: number
  bodySnippet?: string
  note: string
}

function isOpenAICompatProviderKey(providerKey: string): boolean {
  return providerKey === 'openai-compatible' || providerKey === 'grok-compatible'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toEndpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function toBodySnippet(bodyText: string): string | undefined {
  const trimmed = bodyText.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, 500)
}

function inferKeywordUnsupported(bodyText: string): boolean {
  const lower = bodyText.toLowerCase()
  return (
    lower.includes('unsupported')
    || lower.includes('not found')
    || lower.includes('unknown endpoint')
    || lower.includes('endpoint not found')
    || lower.includes('not implemented')
    || lower.includes('no such endpoint')
    || lower.includes('unrecognized request url')
    || lower.includes('不支持')
    || lower.includes('未找到')
    || lower.includes('未知端点')
  )
}

function isAbortLikeError(error: unknown): boolean {
  if (!isRecord(error)) return false
  const name = trimString(error.name)
  const message = trimString(error.message).toLowerCase()
  if (name === 'AbortError' || name === 'TimeoutError') return true
  return message.includes('aborted') || message.includes('timeout')
}

async function probeEndpoint(params: {
  endpoint: ProbeEndpoint
  url: string
  apiKey: string
  body: Record<string, unknown>
}): Promise<EndpointProbeResult> {
  try {
    const response = await fetch(params.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(params.body),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })

    const bodyText = await response.text().catch(() => '')
    const bodySnippet = toBodySnippet(bodyText)

    if (response.ok) {
      return {
        outcome: 'supported',
        status: response.status,
        bodySnippet,
        note: `${params.endpoint} probe succeeded`,
      }
    }

    if (response.status === 401 || response.status === 403) {
      return {
        outcome: 'auth_fail',
        status: response.status,
        bodySnippet,
        note: `${params.endpoint} authentication failed`,
      }
    }

    if (response.status === 404 || response.status === 405 || response.status === 501) {
      return {
        outcome: 'unsupported',
        status: response.status,
        bodySnippet,
        note: `${params.endpoint} endpoint unsupported`,
      }
    }

    if (response.status === 429) {
      return {
        outcome: 'rate_limited',
        status: response.status,
        bodySnippet,
        note: `${params.endpoint} rate limited`,
      }
    }

    if (response.status >= 500 && response.status < 600) {
      if (inferKeywordUnsupported(bodyText)) {
        return {
          outcome: 'unsupported',
          status: response.status,
          bodySnippet,
          note: `${params.endpoint} provider returned not-implemented style error`,
        }
      }
      return {
        outcome: 'provider_error',
        status: response.status,
        bodySnippet,
        note: `${params.endpoint} provider error`,
      }
    }

    if (response.status === 400 || response.status === 422) {
      const unsupported = inferKeywordUnsupported(bodyText)
      return {
        outcome: unsupported ? 'unsupported' : 'inconclusive',
        status: response.status,
        bodySnippet,
        note: unsupported
          ? `${params.endpoint} request indicates unsupported endpoint`
          : `${params.endpoint} request rejected without unsupported keywords`,
      }
    }

    return {
      outcome: 'inconclusive',
      status: response.status,
      bodySnippet,
      note: `${params.endpoint} returned inconclusive status`,
    }
  } catch (error) {
    if (isAbortLikeError(error)) {
      return {
        outcome: 'timeout',
        note: `${params.endpoint} probe timeout`,
      }
    }

    return {
      outcome: 'network_error',
      note: `${params.endpoint} probe network error: ${trimString((error as Error).message) || 'unknown'}`,
    }
  }
}

function toTrace(
  endpoint: ProbeEndpoint,
  url: string,
  result: EndpointProbeResult,
): ModelLlmProtocolProbeTrace {
  return {
    endpoint,
    url,
    outcome: result.outcome,
    ...(typeof result.status === 'number' ? { status: result.status } : {}),
    note: result.note,
    ...(result.bodySnippet ? { bodySnippet: result.bodySnippet } : {}),
  }
}

export async function probeModelLlmProtocol(
  input: ModelLlmProtocolProbeInput,
): Promise<ModelLlmProtocolProbeResult> {
  if (!isOpenAICompatProviderKey(getProviderKey(input.providerId))) {
    throw new Error(`MODEL_LLM_PROTOCOL_PROBE_PROVIDER_UNSUPPORTED: ${input.providerId}`)
  }

  const modelId = trimString(input.modelId)
  if (!modelId) {
    throw new Error('MODEL_LLM_PROTOCOL_PROBE_MODEL_ID_REQUIRED')
  }

  const clientConfig = await resolveOpenAICompatClientConfig(input.userId, input.providerId)
  const responsesUrl = toEndpoint(clientConfig.baseUrl, '/responses')
  const chatCompletionsUrl = toEndpoint(clientConfig.baseUrl, '/chat/completions')

  const traces: ModelLlmProtocolProbeTrace[] = []
  const checkedAt = new Date().toISOString()

  const responsesResult = await probeEndpoint({
    endpoint: 'responses',
    url: responsesUrl,
    apiKey: clientConfig.apiKey,
    body: {
      model: modelId,
      input: [{
        role: 'user',
        content: [{ type: 'input_text', text: 'ping' }],
      }],
      max_output_tokens: 8,
      temperature: 0,
    },
  })
  traces.push(toTrace('responses', responsesUrl, responsesResult))

  if (responsesResult.outcome === 'supported') {
    return {
      success: true,
      protocol: 'responses',
      checkedAt,
      traces,
    }
  }

  const chatResult = await probeEndpoint({
    endpoint: 'chat-completions',
    url: chatCompletionsUrl,
    apiKey: clientConfig.apiKey,
    body: {
      model: modelId,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 8,
      temperature: 0,
    },
  })
  traces.push(toTrace('chat-completions', chatCompletionsUrl, chatResult))

  if (chatResult.outcome === 'supported') {
    return {
      success: true,
      protocol: 'chat-completions',
      checkedAt,
      traces,
    }
  }

  if (responsesResult.outcome === 'auth_fail' && chatResult.outcome === 'auth_fail') {
    return {
      success: false,
      code: 'PROBE_AUTH_FAILED',
      message: 'responses/chat authentication failed',
      traces,
    }
  }

  return {
    success: false,
    code: 'PROBE_INCONCLUSIVE',
    message: 'model llm protocol probe inconclusive',
    traces,
  }
}
