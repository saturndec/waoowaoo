type OpenAICompatibleModelItem = {
  modelId: string
  name: string
}

type ListOpenAICompatibleModelsParams = {
  apiKey: string
  baseUrl: string
  timeoutMs?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeOpenAICompatibleBaseUrl(rawBaseUrl: string): string {
  const baseUrl = readTrimmedString(rawBaseUrl)
  if (!baseUrl) {
    throw new Error('OPENAI_COMPATIBLE_BASE_URL_REQUIRED')
  }

  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new Error('OPENAI_COMPATIBLE_BASE_URL_INVALID')
  }

  const pathSegments = parsed.pathname.split('/').filter(Boolean)
  const hasV1 = pathSegments.includes('v1')
  if (!hasV1) {
    const trimmedPath = parsed.pathname.replace(/\/+$/, '')
    parsed.pathname = `${trimmedPath === '' || trimmedPath === '/' ? '' : trimmedPath}/v1`
  }

  return parsed.toString().replace(/\/+$/, '')
}

export function extractOpenAICompatibleModelIds(payload: unknown): string[] {
  if (!isRecord(payload)) return []
  const rawData = payload.data
  if (!Array.isArray(rawData)) return []

  const seen = new Set<string>()
  const ids: string[] = []
  for (const item of rawData) {
    if (!isRecord(item)) continue
    const id = readTrimmedString(item.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }

  ids.sort((a, b) => a.localeCompare(b, 'en'))
  return ids
}

export async function listOpenAICompatibleModels(
  params: ListOpenAICompatibleModelsParams,
): Promise<OpenAICompatibleModelItem[]> {
  const apiKey = readTrimmedString(params.apiKey)
  if (!apiKey) {
    throw new Error('OPENAI_COMPATIBLE_API_KEY_REQUIRED')
  }

  const normalizedBaseUrl = normalizeOpenAICompatibleBaseUrl(params.baseUrl)
  const endpoint = `${normalizedBaseUrl}/models`
  const timeoutMs = typeof params.timeoutMs === 'number' && Number.isFinite(params.timeoutMs) && params.timeoutMs > 0
    ? Math.floor(params.timeoutMs)
    : 15_000

  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      const rawError = await response.text().catch(() => '')
      const safeError = rawError.slice(0, 300)
      throw new Error(`OPENAI_COMPATIBLE_FETCH_FAILED:${response.status}:${safeError}`)
    }

    const payload = await response.json().catch(() => null)
    const ids = extractOpenAICompatibleModelIds(payload)
    return ids.map((modelId) => ({ modelId, name: modelId }))
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OPENAI_COMPATIBLE_FETCH_TIMEOUT')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
