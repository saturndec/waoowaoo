import type { GenerateResult } from '@/lib/generators/base'
import type { OpenAICompatVideoRequest } from '../types'
import {
  buildRenderedTemplateRequest,
  buildTemplateVariables,
  extractTemplateErrorFromResponse,
  normalizeResponseJson,
  readJsonPath,
  resolveTemplateOperation,
  type TemplateOperation,
} from '@/lib/openai-compat-template-runtime'
import { parseModelKeyStrict } from '@/lib/model-config-contract'
import { resolveOpenAICompatClientConfig, sanitizeTemplateOptions } from './common'

const OPENAI_COMPAT_PROVIDER_PREFIX = 'openai-compatible:'
const PROVIDER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function buildUnsupportedVideoFormatError(detail: string): Error {
  return new Error(`VIDEO_API_FORMAT_UNSUPPORTED: ${detail}`)
}

function encodeProviderToken(providerId: string): string {
  const value = providerId.trim()
  if (value.startsWith(OPENAI_COMPAT_PROVIDER_PREFIX)) {
    const uuid = value.slice(OPENAI_COMPAT_PROVIDER_PREFIX.length).trim()
    if (PROVIDER_UUID_PATTERN.test(uuid)) {
      return `u_${uuid.toLowerCase()}`
    }
  }
  return `b64_${Buffer.from(value, 'utf8').toString('base64url')}`
}

function encodeModelRef(modelRef: string): string {
  return Buffer.from(modelRef, 'utf8').toString('base64url')
}

function resolveModelRef(request: OpenAICompatVideoRequest): string {
  const modelId = typeof request.modelId === 'string' ? request.modelId.trim() : ''
  if (modelId) return modelId
  const parsed = typeof request.modelKey === 'string' ? parseModelKeyStrict(request.modelKey) : null
  if (parsed?.modelId) return parsed.modelId
  throw new Error('OPENAI_COMPAT_VIDEO_MODEL_REF_REQUIRED')
}

function resolveVideoTemplateOperation(options: Record<string, unknown> | undefined): TemplateOperation {
  const candidates = [options?.operation, options?.templateOperation, options?.generationMode]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const normalized = candidate.trim().toLowerCase()
    if (normalized === 'edit') return 'edit'
    if (normalized === 'generate' || normalized === 'generation') return 'generate'
  }
  return 'generate'
}

export async function generateVideoViaOpenAICompatTemplate(
  request: OpenAICompatVideoRequest,
): Promise<GenerateResult> {
  if (!request.template) {
    throw buildUnsupportedVideoFormatError('OPENAI_COMPAT_VIDEO_TEMPLATE_REQUIRED')
  }
  if (request.template.mediaType !== 'video') {
    throw buildUnsupportedVideoFormatError('OPENAI_COMPAT_VIDEO_TEMPLATE_MEDIA_TYPE_INVALID')
  }

  const config = await resolveOpenAICompatClientConfig(request.userId, request.providerId)
  const sanitizedOptions = sanitizeTemplateOptions(request.options)
  const operation = resolveVideoTemplateOperation(request.options)
  const operationTemplate = resolveTemplateOperation(request.template, operation)
  const variables = buildTemplateVariables({
    model: request.modelId || '',
    prompt: request.prompt,
    image: request.imageUrl,
    images: [request.imageUrl],
    aspectRatio: typeof sanitizedOptions?.aspectRatio === 'string' ? sanitizedOptions.aspectRatio : undefined,
    resolution: typeof sanitizedOptions?.resolution === 'string' ? sanitizedOptions.resolution : undefined,
    size: typeof sanitizedOptions?.size === 'string' ? sanitizedOptions.size : undefined,
    duration: typeof sanitizedOptions?.duration === 'number' ? sanitizedOptions.duration : undefined,
    extra: sanitizedOptions,
  })

  const createRequest = await buildRenderedTemplateRequest({
    baseUrl: config.baseUrl,
    endpoint: operationTemplate.create,
    variables,
    defaultAuthHeader: `Bearer ${config.apiKey}`,
  })
  if (['POST', 'PUT', 'PATCH'].includes(createRequest.method) && !createRequest.body) {
    throw buildUnsupportedVideoFormatError('OPENAI_COMPAT_VIDEO_TEMPLATE_CREATE_BODY_REQUIRED')
  }
  const createResponse = await fetch(createRequest.endpointUrl, {
    method: createRequest.method,
    headers: createRequest.headers,
    ...(createRequest.body ? { body: createRequest.body } : {}),
  })
  const rawText = await createResponse.text().catch(() => '')
  const payload = normalizeResponseJson(rawText)

  if (!createResponse.ok) {
    const errorMessage = extractTemplateErrorFromResponse(operationTemplate.response, payload, createResponse.status)
    if ([404, 405, 415].includes(createResponse.status)) {
      throw buildUnsupportedVideoFormatError(errorMessage)
    }
    throw new Error(errorMessage)
  }

  if (operationTemplate.mode === 'sync') {
    const outputUrl = readJsonPath(payload, operationTemplate.response.outputUrlPath)
    if (typeof outputUrl === 'string' && outputUrl.trim()) {
      return {
        success: true,
        videoUrl: outputUrl.trim(),
      }
    }
    const outputUrls = readJsonPath(payload, operationTemplate.response.outputUrlsPath)
    if (Array.isArray(outputUrls) && outputUrls.length > 0 && typeof outputUrls[0] === 'string') {
      return {
        success: true,
        videoUrl: String(outputUrls[0]).trim(),
      }
    }
    throw buildUnsupportedVideoFormatError('OPENAI_COMPAT_VIDEO_TEMPLATE_OUTPUT_NOT_FOUND')
  }

  const taskIdRaw = readJsonPath(payload, operationTemplate.response.taskIdPath)
  const taskId = typeof taskIdRaw === 'string' ? taskIdRaw.trim() : ''
  if (!taskId) {
    throw buildUnsupportedVideoFormatError('OPENAI_COMPAT_VIDEO_TEMPLATE_TASK_ID_NOT_FOUND')
  }

  const providerToken = encodeProviderToken(config.providerId)
  const modelRefToken = encodeModelRef(resolveModelRef(request))

  return {
    success: true,
    async: true,
    requestId: taskId,
    externalId: `OCOMPAT:VIDEO:${providerToken}:${modelRefToken}:${operation}:${taskId}`,
  }
}
