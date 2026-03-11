import OpenAI from 'openai'
import { setProxy } from '../../../lib/prompts/proxy'

export type TestStepName = 'models' | 'textGen' | 'imageGen' | 'credits' | 'audioGen'
export type TestStepStatus = 'pass' | 'fail' | 'skip'

export interface TestStep {
  name: TestStepName
  status: TestStepStatus
  message: string
  model?: string
  detail?: string
}

export interface TestProviderResult {
  success: boolean
  steps: TestStep[]
}

type PresetProviderType = 'ark' | 'google' | 'openrouter' | 'minimax' | 'fal' | 'vidu'
  | 'bailian'
  | 'siliconflow'
type CompatibleProviderType = 'openai-compatible' | 'gemini-compatible' | 'grok-compatible'

type TestProviderPayload = {
  apiType: CompatibleProviderType | PresetProviderType
  baseUrl?: string
  apiKey: string
  llmModel?: string
}

function classifyProbeFailure(status: number): { status: TestStepStatus; message: string } {
  if (status === 401 || status === 403) {
    return { status: 'fail', message: `Authentication failed (${status})` }
  }
  if (status === 429) {
    return { status: 'fail', message: `Rate limited (${status})` }
  }
  return { status: 'fail', message: `Provider error (${status})` }
}

function toNetworkErrorMessage(error: unknown): string {
  const raw = toErrorMessage(error)
  return `Network error: ${raw}`
}

// ---------------------------------------------------------------------------
// OpenAI-compatible
// ---------------------------------------------------------------------------

type CompatibleProbeOutcome = 'pass' | 'unsupported' | 'auth_fail' | 'rate_limited' | 'provider_error' | 'network_fail'

interface CompatibleProbeResult {
  step: TestStep
  outcome: CompatibleProbeOutcome
}

interface ProbeAttempt {
  url: string
  status?: number
  note: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

function buildCompatibleProbeUrls(baseUrl: string, paths: string[]): string[] {
  const normalizedBase = sanitizeBaseUrl(baseUrl)
  const baseVariants = new Set<string>([normalizedBase])
  if (normalizedBase.endsWith('/v1')) {
    const rootBase = normalizedBase.slice(0, -3)
    if (rootBase) baseVariants.add(rootBase)
  } else {
    baseVariants.add(`${normalizedBase}/v1`)
  }

  const urls = new Set<string>()
  for (const baseVariant of baseVariants) {
    for (const path of paths) {
      urls.add(`${baseVariant}${path}`)
    }
  }
  return Array.from(urls)
}

function toAttemptDetail(attempts: ProbeAttempt[]): string {
  return attempts
    .map((attempt) => {
      const printableUrl = attempt.url.replace(/^https?:\/\/[^/]+/i, '')
      const statusText = typeof attempt.status === 'number' ? ` ${attempt.status}` : ''
      return `${printableUrl}${statusText} ${attempt.note}`.trim()
    })
    .join(' | ')
    .slice(0, 500)
}

function parseModelCount(payload: unknown): number | null {
  if (!isRecord(payload)) return null
  const data = payload.data
  if (Array.isArray(data)) return data.length
  const models = payload.models
  if (Array.isArray(models)) return models.length
  const result = payload.result
  if (Array.isArray(result)) return result.length
  return null
}

function parseCreditsMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null

  const data = isRecord(payload.data) ? payload.data : null
  const creditGrants = isRecord(payload.credit_grants) ? payload.credit_grants : null
  const totalCredits = typeof data?.total_credits === 'number' ? data.total_credits : null
  const totalUsage = typeof data?.total_usage === 'number' ? data.total_usage : null
  if (typeof totalCredits === 'number' && typeof totalUsage === 'number') {
    return `Balance: ${(totalCredits - totalUsage).toFixed(2)}`
  }

  const balanceCandidate = payload.balance ?? data?.balance ?? creditGrants?.total_available
  if (typeof balanceCandidate === 'number' && Number.isFinite(balanceCandidate)) {
    return `Balance: ${balanceCandidate}`
  }
  if (typeof balanceCandidate === 'string' && balanceCandidate.trim()) {
    return `Balance: ${balanceCandidate.trim()}`
  }

  const remains = payload.remains
  if (Array.isArray(remains)) {
    const first = remains[0]
    if (isRecord(first) && typeof first.credit_remain === 'number') {
      return `Balance: ${first.credit_remain}`
    }
  }

  return null
}

async function runCompatibleGetProbe(params: {
  stepName: 'models' | 'credits'
  urls: string[]
  apiKey: string
  onSuccessMessage: (payload: unknown) => string
  unsupportedMessage: string
}): Promise<CompatibleProbeResult> {
  const attempts: ProbeAttempt[] = []
  const headers = { Authorization: `Bearer ${params.apiKey}` }
  let providerFailure: { status: number; detail: string } | null = null

  for (const url of params.urls) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(15_000),
      })
      const bodyText = await response.text().catch(() => '')
      attempts.push({
        url,
        status: response.status,
        note: response.ok ? 'ok' : 'failed',
      })

      if (response.ok) {
        let parsedBody: unknown = null
        if (bodyText.trim()) {
          try {
            parsedBody = JSON.parse(bodyText) as unknown
          } catch {
            parsedBody = null
          }
        }
        return {
          outcome: 'pass',
          step: {
            name: params.stepName,
            status: 'pass',
            message: params.onSuccessMessage(parsedBody),
            detail: attempts.length > 1 ? toAttemptDetail(attempts) : undefined,
          },
        }
      }

      if (response.status === 401 || response.status === 403) {
        return {
          outcome: 'auth_fail',
          step: {
            name: params.stepName,
            status: 'fail',
            message: `Authentication failed (${response.status})`,
            detail: bodyText.slice(0, 500) || toAttemptDetail(attempts),
          },
        }
      }

      if (response.status === 429) {
        return {
          outcome: 'rate_limited',
          step: {
            name: params.stepName,
            status: 'fail',
            message: `Rate limited (${response.status})`,
            detail: bodyText.slice(0, 500) || toAttemptDetail(attempts),
          },
        }
      }

      const unsupportedStatus = response.status === 404 || response.status === 405 || response.status === 501
      if (!unsupportedStatus) {
        providerFailure = {
          status: response.status,
          detail: bodyText.slice(0, 500),
        }
      }
    } catch (error) {
      attempts.push({ url, note: `network: ${toErrorMessage(error)}` })
      return {
        outcome: 'network_fail',
        step: {
          name: params.stepName,
          status: 'fail',
          message: toNetworkErrorMessage(error),
          detail: toAttemptDetail(attempts),
        },
      }
    }
  }

  if (providerFailure) {
    return {
      outcome: 'provider_error',
      step: {
        name: params.stepName,
        status: 'fail',
        message: `Provider error (${providerFailure.status})`,
        detail: providerFailure.detail || toAttemptDetail(attempts),
      },
    }
  }

  return {
    outcome: 'unsupported',
    step: {
      name: params.stepName,
      status: 'skip',
      message: params.unsupportedMessage,
      detail: toAttemptDetail(attempts),
    },
  }
}

async function runCompatibleLlmFallback(baseUrl: string, apiKey: string, llmModel: string): Promise<TestStep> {
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      timeout: 30_000,
    })
    const response = await client.chat.completions.create({
      model: llmModel,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 20,
      temperature: 0,
    })
    const answer = response.choices[0]?.message?.content?.trim() || ''
    return {
      name: 'textGen',
      status: 'pass',
      model: llmModel,
      message: answer ? `Response: ${answer.slice(0, 80)}` : 'LLM fallback succeeded',
    }
  } catch (error) {
    return {
      name: 'textGen',
      status: 'fail',
      model: llmModel,
      message: toErrorMessage(error),
    }
  }
}

async function testCompatibleProvider(baseUrl: string, apiKey: string, llmModel?: string): Promise<TestProviderResult> {
  const modelProbe = await runCompatibleGetProbe({
    stepName: 'models',
    urls: buildCompatibleProbeUrls(baseUrl, ['/models']),
    apiKey,
    onSuccessMessage: (payload) => {
      const count = parseModelCount(payload)
      return typeof count === 'number' ? `Found ${count} models` : 'Models endpoint reachable'
    },
    unsupportedMessage: 'Model list endpoint not supported by this compatible provider',
  })

  const creditProbe = await runCompatibleGetProbe({
    stepName: 'credits',
    urls: buildCompatibleProbeUrls(baseUrl, ['/credits', '/user/info', '/dashboard/billing/credit_grants']),
    apiKey,
    onSuccessMessage: (payload) => parseCreditsMessage(payload) || 'Credits endpoint reachable',
    unsupportedMessage: 'Credits endpoint not supported by this compatible provider',
  })

  const steps: TestStep[] = [modelProbe.step, creditProbe.step]
  const hasPassStep = modelProbe.outcome === 'pass' || creditProbe.outcome === 'pass'
  if (hasPassStep) {
    return { success: true, steps }
  }

  const allUnsupported = modelProbe.outcome === 'unsupported' && creditProbe.outcome === 'unsupported'
  if (!allUnsupported) {
    return { success: false, steps }
  }

  const fallbackModel = typeof llmModel === 'string' ? llmModel.trim() : ''
  if (!fallbackModel) {
    steps.push({
      name: 'textGen',
      status: 'fail',
      message: 'No free probe endpoint detected. Please configure an LLM model first, then retry / 未发现可用的免费探测接口，请先配置 LLM 模型后再测试',
    })
    return { success: false, steps }
  }

  const llmStep = await runCompatibleLlmFallback(baseUrl, apiKey, fallbackModel)
  steps.push(llmStep)
  return {
    success: llmStep.status === 'pass',
    steps,
  }
}

// ---------------------------------------------------------------------------
// Types for Gemini response
// ---------------------------------------------------------------------------

interface GeminiInlineData {
  mimeType?: string
  mime_type?: string
  data: string
}

interface GeminiPart {
  text?: string
  inlineData?: GeminiInlineData
  inline_data?: GeminiInlineData
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[]
    }
  }>
  error?: {
    message?: string
    code?: number
  }
}

// ---------------------------------------------------------------------------
// Volcengine Ark
// ---------------------------------------------------------------------------

async function testArkProvider(apiKey: string): Promise<TestProviderResult> {
  const steps: TestStep[] = []
  // 和 src/lib/ark-llm.ts 的 arkResponsesCompletion 保持一致，使用字节原生 Responses API
  const model = 'doubao-seed-2-0-lite-260215'

  try {
    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'user',
            content: [{ type: 'input_text', text: '你好' }],
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      steps.push({
        name: 'textGen',
        status: 'fail',
        model,
        message: `HTTP ${response.status}`,
        detail: errorText.slice(0, 500),
      })
      return { success: false, steps }
    }

    const data = await response.json() as Record<string, unknown>
    // 和 ark-llm.ts 一样提取 output_text
    const outputText = typeof data.output_text === 'string'
      ? data.output_text
      : ''
    const text = outputText.trim().slice(0, 80) || 'OK'
    steps.push({
      name: 'textGen',
      status: 'pass',
      model,
      message: `Response: ${text}`,
    })
    return { success: true, steps }
  } catch (error) {
    steps.push({
      name: 'textGen',
      status: 'fail',
      model,
      message: toErrorMessage(error),
    })
    return { success: false, steps }
  }
}

// ---------------------------------------------------------------------------
// Google AI Studio (official)
// ---------------------------------------------------------------------------

async function testGoogleOfficial(apiKey: string): Promise<TestProviderResult> {
  await setProxy()
  console.log('[provider-test] testGoogleOfficial')
  const steps: TestStep[] = []
  const model = 'gemini-3-flash-preview'

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: '你好' }] }],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      steps.push({
        name: 'textGen',
        status: 'fail',
        model,
        message: `HTTP ${response.status}`,
        detail: errorText.slice(0, 500),
      })
      return { success: false, steps }
    }

    const data = await response.json() as GeminiGenerateContentResponse
    if (data.error) {
      steps.push({
        name: 'textGen',
        status: 'fail',
        model,
        message: data.error.message || 'API error',
        detail: JSON.stringify(data.error).slice(0, 500),
      })
      return { success: false, steps }
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    steps.push({
      name: 'textGen',
      status: 'pass',
      model,
      message: text ? `Response: ${text.slice(0, 80)}` : 'OK',
    })
    return { success: true, steps }
  } catch (error) {
    steps.push({
      name: 'textGen',
      status: 'fail',
      model,
      message: toErrorMessage(error),
    })
    return { success: false, steps }
  }
}

// ---------------------------------------------------------------------------
// OpenRouter
// ---------------------------------------------------------------------------

async function testOpenRouterProvider(apiKey: string): Promise<TestProviderResult> {
  const steps: TestStep[] = []
  await setProxy()

  try {
    const response = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      steps.push({
        name: 'credits',
        status: 'fail',
        message: `HTTP ${response.status}`,
        detail: errorText.slice(0, 500),
      })
      return { success: false, steps }
    }

    const data = await response.json() as { data?: { total_credits?: number; total_usage?: number } }
    const credits = data.data?.total_credits
    const usage = data.data?.total_usage
    const remaining = typeof credits === 'number' && typeof usage === 'number'
      ? (credits - usage).toFixed(2)
      : undefined

    steps.push({
      name: 'credits',
      status: 'pass',
      message: remaining !== undefined ? `Balance: $${remaining}` : 'OK',
    })
    return { success: true, steps }
  } catch (error) {
    steps.push({
      name: 'credits',
      status: 'fail',
      message: toErrorMessage(error),
    })
    return { success: false, steps }
  }
}

// ---------------------------------------------------------------------------
// MiniMax
// ---------------------------------------------------------------------------

async function testMiniMaxProvider(apiKey: string): Promise<TestProviderResult> {
  const steps: TestStep[] = []
  const model = 'MiniMax-M2.5'

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.minimaxi.com/v1',
      timeout: 30_000,
    })
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 20,
      temperature: 0,
    })
    const answer = response.choices[0]?.message?.content?.trim() || ''
    steps.push({
      name: 'textGen',
      status: 'pass',
      model,
      message: answer ? `Response: ${answer.slice(0, 80)}` : 'OK',
    })
    return { success: true, steps }
  } catch (error) {
    steps.push({
      name: 'textGen',
      status: 'fail',
      model,
      message: toErrorMessage(error),
    })
    return { success: false, steps }
  }
}

// ---------------------------------------------------------------------------
// FAL.ai
// ---------------------------------------------------------------------------

async function testFalProvider(apiKey: string): Promise<TestProviderResult> {
  await setProxy()
  console.log('[provider-test] testFalProvider')
  const steps: TestStep[] = []

  // 🔥 使用免费的 GET /v1/models 端点验证 API Key，不消耗实际资源
  try {
    const response = await fetch('https://api.fal.ai/v1/models?limit=1', {
      headers: {
        'Authorization': `Key ${apiKey}`,
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      steps.push({
        name: 'models',
        status: 'fail',
        message: `HTTP ${response.status}`,
        detail: errorText.slice(0, 500),
      })
      return { success: false, steps }
    }

    const data = await response.json() as { models?: Array<{ endpoint_id?: string }> }
    const modelCount = data.models?.length ?? 0
    steps.push({
      name: 'models',
      status: 'pass',
      message: `API Key valid (${modelCount} models returned)`,
    })
    return { success: true, steps }
  } catch (error) {
    steps.push({
      name: 'models',
      status: 'fail',
      message: toErrorMessage(error),
    })
    return { success: false, steps }
  }
}

// ---------------------------------------------------------------------------
// Vidu (生数科技)
// ---------------------------------------------------------------------------

async function testViduProvider(apiKey: string): Promise<TestProviderResult> {
  console.log('[provider-test] testViduProvider')
  const steps: TestStep[] = []

  // 🔥 使用免费的 GET /ent/v2/credits 积分查询端点，不消耗任何资源
  try {
    const response = await fetch('https://api.vidu.cn/ent/v2/credits', {
      headers: {
        'Authorization': `Token ${apiKey}`,
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      steps.push({
        name: 'credits',
        status: 'fail',
        message: response.status === 403
          ? 'Authentication failed — check API Key'
          : `HTTP ${response.status}`,
        detail: errorText.slice(0, 500) || undefined,
      })
      return { success: false, steps }
    }

    const data = await response.json() as {
      remains?: Array<{ type?: string; credit_remain?: number }>
    }
    const creditRemain = data.remains?.[0]?.credit_remain
    const balanceText = typeof creditRemain === 'number'
      ? `Balance: ${creditRemain} credits`
      : 'OK'

    steps.push({
      name: 'credits',
      status: 'pass',
      message: balanceText,
    })
    return { success: true, steps }
  } catch (error) {
    steps.push({
      name: 'credits',
      status: 'fail',
      message: toErrorMessage(error),
    })
    return { success: false, steps }
  }
}

// ---------------------------------------------------------------------------
// SiliconFlow (zero-inference probes)
// ---------------------------------------------------------------------------

async function testSiliconFlowProvider(apiKey: string): Promise<TestProviderResult> {
  const steps: TestStep[] = []
  const headers = { Authorization: `Bearer ${apiKey}` }

  try {
    const modelResponse = await fetch('https://api.siliconflow.cn/v1/models', {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(20_000),
    })
    if (!modelResponse.ok) {
      const fail = classifyProbeFailure(modelResponse.status)
      const detail = await modelResponse.text().catch(() => '')
      steps.push({
        name: 'models',
        status: fail.status,
        message: fail.message,
        detail: detail.slice(0, 500),
      })
      steps.push({
        name: 'credits',
        status: 'skip',
        message: 'Skipped because model probe failed',
      })
      return { success: false, steps }
    }
    const modelData = await modelResponse.json() as { data?: Array<{ id?: string }> }
    const count = Array.isArray(modelData.data) ? modelData.data.length : 0
    steps.push({
      name: 'models',
      status: 'pass',
      message: `Found ${count} models`,
    })
  } catch (error) {
    steps.push({
      name: 'models',
      status: 'fail',
      message: toNetworkErrorMessage(error),
    })
    steps.push({
      name: 'credits',
      status: 'skip',
      message: 'Skipped because model probe failed',
    })
    return { success: false, steps }
  }

  try {
    const infoResponse = await fetch('https://api.siliconflow.cn/v1/user/info', {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(20_000),
    })
    if (!infoResponse.ok) {
      const fail = classifyProbeFailure(infoResponse.status)
      const detail = await infoResponse.text().catch(() => '')
      steps.push({
        name: 'credits',
        status: fail.status,
        message: fail.message,
        detail: detail.slice(0, 500),
      })
      return { success: false, steps }
    }
    const infoData = await infoResponse.json() as { balance?: unknown; data?: { balance?: unknown } }
    const rawBalance = infoData.balance ?? infoData.data?.balance
    const balance = typeof rawBalance === 'number'
      ? String(rawBalance)
      : typeof rawBalance === 'string' && rawBalance.trim()
        ? rawBalance.trim()
        : undefined
    steps.push({
      name: 'credits',
      status: 'pass',
      message: typeof balance === 'string' ? `Balance: ${balance}` : 'User info reachable',
    })
    return { success: true, steps }
  } catch (error) {
    steps.push({
      name: 'credits',
      status: 'fail',
      message: toNetworkErrorMessage(error),
    })
    return { success: false, steps }
  }
}

// ---------------------------------------------------------------------------
// Bailian (zero-inference probes)
// ---------------------------------------------------------------------------

async function testBailianProvider(apiKey: string): Promise<TestProviderResult> {
  const steps: TestStep[] = []
  const headers = { Authorization: `Bearer ${apiKey}` }

  try {
    const modelResponse = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/models', {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(20_000),
    })
    if (!modelResponse.ok) {
      const fail = classifyProbeFailure(modelResponse.status)
      const detail = await modelResponse.text().catch(() => '')
      steps.push({
        name: 'models',
        status: fail.status,
        message: fail.message,
        detail: detail.slice(0, 500),
      })
      steps.push({
        name: 'credits',
        status: 'skip',
        message: 'Not supported by Bailian probe API',
      })
      return { success: false, steps }
    }
    const modelData = await modelResponse.json() as { data?: Array<{ id?: string }> }
    const count = Array.isArray(modelData.data) ? modelData.data.length : 0
    steps.push({
      name: 'models',
      status: 'pass',
      message: `Found ${count} models`,
    })
    steps.push({
      name: 'credits',
      status: 'skip',
      message: 'Not supported by Bailian probe API',
    })
    return { success: true, steps }
  } catch (error) {
    steps.push({
      name: 'models',
      status: 'fail',
      message: toNetworkErrorMessage(error),
    })
    steps.push({
      name: 'credits',
      status: 'skip',
      message: 'Not supported by Bailian probe API',
    })
    return { success: false, steps }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function testProviderConnection(payload: TestProviderPayload): Promise<TestProviderResult> {
  const { apiType, baseUrl, apiKey, llmModel } = payload

  if (!apiKey) {
    return {
      success: false,
      steps: [{ name: 'models', status: 'fail', message: 'Missing apiKey' }],
    }
  }

  // Compatible providers require baseUrl
  if ((apiType === 'openai-compatible' || apiType === 'gemini-compatible' || apiType === 'grok-compatible') && !baseUrl) {
    return {
      success: false,
      steps: [{ name: 'models', status: 'fail', message: 'Missing baseUrl' }],
    }
  }

  switch (apiType) {
    case 'openai-compatible':
      return testCompatibleProvider(baseUrl!, apiKey, llmModel)
    case 'grok-compatible':
    case 'gemini-compatible':
      return testCompatibleProvider(baseUrl!, apiKey, llmModel)
    case 'ark':
      return testArkProvider(apiKey)
    case 'google':
      return testGoogleOfficial(apiKey)
    case 'openrouter':
      return testOpenRouterProvider(apiKey)
    case 'minimax':
      return testMiniMaxProvider(apiKey)
    case 'fal':
      return testFalProvider(apiKey)
    case 'vidu':
      return testViduProvider(apiKey)
    case 'bailian':
      return testBailianProvider(apiKey)
    case 'siliconflow':
      return testSiliconFlowProvider(apiKey)
    default:
      return {
        success: false,
        steps: [{ name: 'models', status: 'fail', message: `Unsupported API type: ${apiType}` }],
      }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Clean up OpenAI SDK errors
    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND'))
      return 'Network error — check your internet connection / 网络连接失败，请检查网络后重试'
    if (error.message.includes('Connection error')) return 'Network error — temporary connection failure, please retry / 网络抖动，请稍后重试'
    if (error.message.includes('401')) return 'Authentication failed — check API Key'
    if (error.message.includes('403')) return 'Access denied — check API Key permissions'
    if (error.message.includes('timeout') || error.name === 'TimeoutError') return 'Request timed out'
    return error.message.slice(0, 200)
  }
  return String(error).slice(0, 200)
}
