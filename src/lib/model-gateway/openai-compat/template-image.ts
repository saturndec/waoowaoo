import type { GenerateResult } from '@/lib/generators/base'
import type { OpenAICompatImageRequest } from '../types'
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

function resolveModelRef(request: OpenAICompatImageRequest): string {
  const modelId = typeof request.modelId === 'string' ? request.modelId.trim() : ''
  if (modelId) return modelId
  const parsed = typeof request.modelKey === 'string' ? parseModelKeyStrict(request.modelKey) : null
  if (parsed?.modelId) return parsed.modelId
  throw new Error('OPENAI_COMPAT_IMAGE_MODEL_REF_REQUIRED')
}

export async function generateImageViaOpenAICompatTemplate(
  request: OpenAICompatImageRequest,
): Promise<GenerateResult> {
  if (!request.template) {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_REQUIRED')
  }
  if (request.template.mediaType !== 'image') {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_MEDIA_TYPE_INVALID')
  }

  const config = await resolveOpenAICompatClientConfig(request.userId, request.providerId)
  const firstReference = Array.isArray(request.referenceImages) && request.referenceImages.length > 0
    ? request.referenceImages[0]
    : ''
  const operation: TemplateOperation = firstReference ? 'edit' : 'generate'
  const sanitizedOptions = sanitizeTemplateOptions(request.options)
  const operationTemplate = resolveTemplateOperation(request.template, operation)
  const variables = buildTemplateVariables({
    model: request.modelId || 'gpt-image-1',
    prompt: request.prompt,
    image: firstReference,
    images: request.referenceImages || [],
    aspectRatio: typeof sanitizedOptions?.aspectRatio === 'string' ? sanitizedOptions.aspectRatio : undefined,
    resolution: typeof sanitizedOptions?.resolution === 'string' ? sanitizedOptions.resolution : undefined,
    size: typeof sanitizedOptions?.size === 'string' ? sanitizedOptions.size : undefined,
    extra: sanitizedOptions,
  })

  const createRequest = await buildRenderedTemplateRequest({
    baseUrl: config.baseUrl,
    endpoint: operationTemplate.create,
    variables,
    defaultAuthHeader: `Bearer ${config.apiKey}`,
  })
  if (['POST', 'PUT', 'PATCH'].includes(createRequest.method) && !createRequest.body) {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_CREATE_BODY_REQUIRED')
  }
  const response = await fetch(createRequest.endpointUrl, {
    method: createRequest.method,
    headers: createRequest.headers,
    ...(createRequest.body ? { body: createRequest.body } : {}),
  })
  const rawText = await response.text().catch(() => '')
  const payload = normalizeResponseJson(rawText)
  if (!response.ok) {
    throw new Error(extractTemplateErrorFromResponse(operationTemplate.response, payload, response.status))
  }

  if (operationTemplate.mode === 'sync') {
    const outputUrl = readJsonPath(payload, operationTemplate.response.outputUrlPath)
    if (typeof outputUrl === 'string' && outputUrl.trim().length > 0) {
      return {
        success: true,
        imageUrl: outputUrl.trim(),
      }
    }
    const outputUrls = readJsonPath(payload, operationTemplate.response.outputUrlsPath)
    if (Array.isArray(outputUrls) && outputUrls.length > 0) {
      const first = outputUrls[0]
      if (typeof first === 'string' && first.trim()) {
        return {
          success: true,
          imageUrl: first.trim(),
        }
      }
      if (first && typeof first === 'object' && !Array.isArray(first)) {
        const firstUrl = (first as { url?: unknown }).url
        if (typeof firstUrl === 'string' && firstUrl.trim()) {
          return {
            success: true,
            imageUrl: firstUrl.trim(),
          }
        }
      }
    }
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_OUTPUT_NOT_FOUND')
  }

  const taskIdRaw = readJsonPath(payload, operationTemplate.response.taskIdPath)
  const taskId = typeof taskIdRaw === 'string' ? taskIdRaw.trim() : ''
  if (!taskId) {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_TASK_ID_NOT_FOUND')
  }
  const providerToken = encodeProviderToken(config.providerId)
  const modelRefToken = encodeModelRef(resolveModelRef(request))
  return {
    success: true,
    async: true,
    requestId: taskId,
    externalId: `OCOMPAT:IMAGE:${providerToken}:${modelRefToken}:${operation}:${taskId}`,
  }
}
