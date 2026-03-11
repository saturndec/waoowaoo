import type {
  OpenAICompatOperationTemplate,
  OpenAICompatMediaTemplate,
  TemplateBodyValue,
  TemplateEndpoint,
  TemplateHeaderMap,
  TemplateOperationType,
  TemplatePollingConfig,
  TemplateResponseMap,
} from '@/lib/openai-compat-media-template'
import { toUploadFile } from '@/lib/model-gateway/openai-compat/common'

export type TemplateVariableMap = Record<string, TemplateBodyValue | undefined>
export type TemplateOperation = TemplateOperationType

export interface ResolvedTemplateOperation {
  mode: OpenAICompatMediaTemplate['mode']
  create: TemplateEndpoint
  status?: TemplateEndpoint
  content?: TemplateEndpoint
  response: TemplateResponseMap
  polling?: TemplatePollingConfig
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function cloneTemplateBodyValue(value: TemplateBodyValue): TemplateBodyValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneTemplateBodyValue(item))
  }
  const output: Record<string, TemplateBodyValue> = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    output[key] = cloneTemplateBodyValue(nestedValue as TemplateBodyValue)
  }
  return output
}

function stringifyVariable(value: TemplateBodyValue | undefined): string {
  if (Array.isArray(value) || isRecord(value)) return JSON.stringify(value)
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'string') return value
  return ''
}

function resolvePlaceholderValue(
  placeholder: string,
  variables: TemplateVariableMap,
): TemplateBodyValue | undefined {
  if (!(placeholder in variables)) {
    throw new Error(`OPENAI_COMPAT_TEMPLATE_VARIABLE_MISSING: ${placeholder}`)
  }
  return variables[placeholder]
}

function resolvePlaceholderText(
  placeholder: string,
  variables: TemplateVariableMap,
): string {
  return stringifyVariable(resolvePlaceholderValue(placeholder, variables))
}

function matchExactPlaceholder(value: string): string | null {
  const match = value.match(/^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/)
  return match?.[1] || null
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

function toTemplateVariableValue(value: unknown): TemplateBodyValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    const items: TemplateBodyValue[] = []
    for (const item of value) {
      const converted = toTemplateVariableValue(item)
      if (converted === undefined) return undefined
      items.push(converted)
    }
    return items
  }
  if (!isRecord(value)) return undefined

  const output: Record<string, TemplateBodyValue> = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    const converted = toTemplateVariableValue(nestedValue)
    if (converted === undefined) return undefined
    output[key] = converted
  }
  return output
}

function appendTemplateOptionVariables(
  target: TemplateVariableMap,
  source: Record<string, unknown> | undefined,
) {
  if (!source) return
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const value = toTemplateVariableValue(rawValue)
    if (value === undefined) continue
    const trimmedKey = rawKey.trim()
    if (!trimmedKey) continue
    target[trimmedKey] = value
    const snakeKey = toSnakeCase(trimmedKey)
    if (!(snakeKey in target)) {
      target[snakeKey] = value
    }
  }
}

function setHeaderIfMissing(headers: Record<string, string>, key: string, value: string) {
  const existingKey = Object.keys(headers).find((headerKey) => headerKey.toLowerCase() === key.toLowerCase())
  if (!existingKey) {
    headers[key] = value
  }
}

function deleteHeader(headers: Record<string, string>, key: string) {
  for (const headerKey of Object.keys(headers)) {
    if (headerKey.toLowerCase() === key.toLowerCase()) {
      delete headers[headerKey]
    }
  }
}

function isMultipartFileField(
  multipartFileFields: Set<string>,
  fieldPath: string,
): boolean {
  return multipartFileFields.has(fieldPath)
}

async function appendMultipartFileValue(
  formData: FormData,
  formKey: string,
  value: TemplateBodyValue,
  fieldPath: string,
  indexSeed: number,
): Promise<number> {
  if (typeof value === 'string') {
    formData.append(formKey, await toUploadFile(value, indexSeed))
    return indexSeed + 1
  }
  if (Array.isArray(value)) {
    let nextIndex = indexSeed
    for (const item of value) {
      nextIndex = await appendMultipartFileValue(formData, formKey, item, fieldPath, nextIndex)
    }
    return nextIndex
  }
  throw new Error(`OPENAI_COMPAT_TEMPLATE_MULTIPART_FILE_INVALID: ${fieldPath}`)
}

async function appendMultipartValue(
  formData: FormData,
  formKey: string,
  value: TemplateBodyValue,
  fieldPath: string,
  multipartFileFields: Set<string>,
  fileIndexSeed: number,
): Promise<number> {
  if (isMultipartFileField(multipartFileFields, fieldPath)) {
    return appendMultipartFileValue(formData, formKey, value, fieldPath, fileIndexSeed)
  }

  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    formData.append(formKey, value === null ? 'null' : String(value))
    return fileIndexSeed
  }

  if (Array.isArray(value)) {
    let nextIndex = fileIndexSeed
    for (const item of value) {
      if (
        item === null
        || typeof item === 'string'
        || typeof item === 'number'
        || typeof item === 'boolean'
      ) {
        formData.append(formKey, item === null ? 'null' : String(item))
        continue
      }
      const nestedKey = `${formKey}[]`
      nextIndex = await appendMultipartValue(
        formData,
        nestedKey,
        item,
        fieldPath,
        multipartFileFields,
        nextIndex,
      )
    }
    return nextIndex
  }

  let nextIndex = fileIndexSeed
  for (const [nestedKey, nestedValue] of Object.entries(value)) {
    const nextFormKey = formKey ? `${formKey}[${nestedKey}]` : nestedKey
    const nextFieldPath = fieldPath ? `${fieldPath}.${nestedKey}` : nestedKey
    nextIndex = await appendMultipartValue(
      formData,
      nextFormKey,
      nestedValue as TemplateBodyValue,
      nextFieldPath,
      multipartFileFields,
      nextIndex,
    )
  }
  return nextIndex
}

async function buildMultipartBody(
  endpoint: TemplateEndpoint,
  renderedBody: TemplateBodyValue,
): Promise<FormData> {
  if (!isRecord(renderedBody)) {
    throw new Error('OPENAI_COMPAT_TEMPLATE_MULTIPART_BODY_INVALID')
  }

  const formData = new FormData()
  const multipartFileFields = new Set(endpoint.multipartFileFields || [])
  let fileIndex = 0

  for (const [key, value] of Object.entries(renderedBody)) {
    fileIndex = await appendMultipartValue(
      formData,
      key,
      value as TemplateBodyValue,
      key,
      multipartFileFields,
      fileIndex,
    )
  }
  return formData
}

function appendUrlEncodedValue(
  params: URLSearchParams,
  formKey: string,
  value: TemplateBodyValue,
) {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    params.append(formKey, value === null ? 'null' : String(value))
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      appendUrlEncodedValue(params, formKey, item)
    }
    return
  }
  for (const [nestedKey, nestedValue] of Object.entries(value)) {
    const nextKey = formKey ? `${formKey}[${nestedKey}]` : nestedKey
    appendUrlEncodedValue(params, nextKey, nestedValue as TemplateBodyValue)
  }
}

async function buildRequestBody(
  endpoint: TemplateEndpoint,
  renderedBody: TemplateBodyValue,
  headers: Record<string, string>,
): Promise<BodyInit> {
  const contentType = endpoint.contentType || 'application/json'

  if (contentType === 'multipart/form-data') {
    deleteHeader(headers, 'Content-Type')
    return buildMultipartBody(endpoint, renderedBody)
  }

  if (contentType === 'application/x-www-form-urlencoded') {
    const params = new URLSearchParams()
    appendUrlEncodedValue(params, '', renderedBody)
    setHeaderIfMissing(headers, 'Content-Type', 'application/x-www-form-urlencoded')
    return params
  }

  setHeaderIfMissing(headers, 'Content-Type', 'application/json')
  return JSON.stringify(renderedBody)
}

export function renderTemplateString(
  template: string,
  variables: TemplateVariableMap,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    return resolvePlaceholderText(String(key), variables)
  })
}

export function renderTemplateValue(
  value: TemplateBodyValue,
  variables: TemplateVariableMap,
): TemplateBodyValue | undefined {
  if (typeof value === 'string') {
    const exactPlaceholder = matchExactPlaceholder(value)
    if (exactPlaceholder) {
      const resolved = resolvePlaceholderValue(exactPlaceholder, variables)
      return resolved === undefined ? undefined : cloneTemplateBodyValue(resolved)
    }
    return renderTemplateString(value, variables)
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    const output: TemplateBodyValue[] = []
    for (const item of value) {
      const rendered = renderTemplateValue(item, variables)
      if (rendered !== undefined) output.push(rendered)
    }
    return output
  }
  const out: Record<string, TemplateBodyValue> = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    const rendered = renderTemplateValue(nestedValue as TemplateBodyValue, variables)
    if (rendered !== undefined) {
      out[key] = rendered
    }
  }
  return out
}

export function resolveTemplateEndpointUrl(baseUrl: string, path: string): string {
  const trimmedPath = path.trim()
  if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
    return trimmedPath
  }

  const normalizedBase = baseUrl.replace(/\/+$/, '')
  let normalizedPath = trimmedPath.replace(/^\/+/, '')

  // Prevent accidental /v1/v1 duplication for openai-compatible providers:
  // baseUrl is normalized to include /v1, so relative template path should omit /v1.
  try {
    const parsedBase = new URL(normalizedBase)
    const baseSegments = parsedBase.pathname.split('/').filter(Boolean)
    const baseEndsWithV1 = baseSegments.length > 0 && baseSegments[baseSegments.length - 1] === 'v1'
    if (baseEndsWithV1 && /^v1(?:\/|$|\?)/.test(normalizedPath)) {
      normalizedPath = normalizedPath.replace(/^v1\/?/, '')
    }
  } catch {
    // Keep original path behavior for invalid base urls; caller will fail explicitly downstream.
  }

  return `${normalizedBase}/${normalizedPath}`
}

export function renderTemplateHeaders(
  headers: TemplateHeaderMap | undefined,
  variables: TemplateVariableMap,
): Record<string, string> {
  if (!headers) return {}
  const output: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    output[key] = renderTemplateString(value, variables)
  }
  return output
}

function parsePathSegments(path: string): Array<string | number> {
  const normalized = path.replace(/^\$\./, '')
  if (!normalized) return []
  const segments: Array<string | number> = []
  const dotParts = normalized.split('.')
  for (const part of dotParts) {
    const regex = /([^[\]]+)|\[(\d+)\]/g
    let match = regex.exec(part)
    while (match) {
      if (match[1]) segments.push(match[1])
      if (match[2]) segments.push(Number.parseInt(match[2], 10))
      match = regex.exec(part)
    }
  }
  return segments
}

export function readJsonPath(payload: unknown, path: string | undefined): unknown {
  if (!path) return undefined
  if (!path.startsWith('$.')) return undefined
  const segments = parsePathSegments(path)
  let current: unknown = payload
  for (const segment of segments) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined
      current = current[segment]
      continue
    }
    if (!isRecord(current)) return undefined
    current = current[segment]
  }
  return current
}

export type RenderedTemplateRequest = {
  endpointUrl: string
  method: TemplateEndpoint['method']
  headers: Record<string, string>
  body?: BodyInit
}

export async function buildRenderedTemplateRequest(input: {
  baseUrl: string
  endpoint: TemplateEndpoint
  variables: TemplateVariableMap
  defaultAuthHeader?: string
}): Promise<RenderedTemplateRequest> {
  const renderedPath = renderTemplateString(input.endpoint.path, input.variables)
  const endpointUrl = resolveTemplateEndpointUrl(input.baseUrl, renderedPath)
  const headers = renderTemplateHeaders(input.endpoint.headers, input.variables)
  if (input.defaultAuthHeader && !headers.Authorization) {
    headers.Authorization = input.defaultAuthHeader
  }

  let body: BodyInit | undefined
  if (input.endpoint.bodyTemplate !== undefined) {
    const renderedBody = renderTemplateValue(input.endpoint.bodyTemplate, input.variables)
    if (renderedBody !== undefined) {
      body = await buildRequestBody(input.endpoint, renderedBody, headers)
    }
  }

  return {
    endpointUrl,
    method: input.endpoint.method,
    headers,
    ...(body !== undefined ? { body } : {}),
  }
}

export function normalizeResponseJson(rawText: string): unknown {
  const trimmed = rawText.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return trimmed
  }
}

function normalizeOperationTemplate(
  template: OpenAICompatMediaTemplate,
  operationTemplate?: OpenAICompatOperationTemplate,
): ResolvedTemplateOperation {
  if (!operationTemplate) {
    return {
      mode: template.mode,
      create: template.create,
      status: template.status,
      content: template.content,
      response: template.response,
      polling: template.polling,
    }
  }

  return {
    mode: template.mode,
    create: operationTemplate.create,
    status: operationTemplate.status ?? template.status,
    content: operationTemplate.content ?? template.content,
    response: {
      ...template.response,
      ...operationTemplate.response,
    },
    polling: operationTemplate.polling ?? template.polling,
  }
}

export function resolveTemplateOperation(
  template: OpenAICompatMediaTemplate,
  operation: TemplateOperation = 'generate',
): ResolvedTemplateOperation {
  const operationTemplate = template.operations?.[operation]
  return normalizeOperationTemplate(template, operationTemplate)
}

export function buildTemplateVariables(input: {
  model: string
  prompt: string
  image?: string
  images?: string[]
  aspectRatio?: string
  duration?: number
  resolution?: string
  size?: string
  taskId?: string
  extra?: Record<string, unknown>
}): TemplateVariableMap {
  const variables: TemplateVariableMap = {
    model: input.model,
    prompt: input.prompt,
    image: input.image,
    images: input.images || [],
    aspect_ratio: input.aspectRatio,
    duration: input.duration,
    resolution: input.resolution,
    size: input.size,
    task_id: input.taskId,
  }
  appendTemplateOptionVariables(variables, input.extra)
  return variables
}

export function extractTemplateError(
  template: OpenAICompatMediaTemplate,
  payload: unknown,
  status: number,
): string {
  return extractTemplateErrorFromResponse(template.response, payload, status)
}

export function extractTemplateErrorFromResponse(
  response: Pick<TemplateResponseMap, 'errorPath'>,
  payload: unknown,
  status: number,
): string {
  const mapped = readJsonPath(payload, response.errorPath)
  if (typeof mapped === 'string' && mapped.trim()) return mapped.trim()
  const fallbackCandidates = [
    readJsonPath(payload, '$.error.message_zh'),
    readJsonPath(payload, '$.error.message'),
    readJsonPath(payload, '$.message_zh'),
    readJsonPath(payload, '$.message'),
    readJsonPath(payload, '$.error'),
  ]
  for (const candidate of fallbackCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return `Template request failed with status ${status}: ${candidate.trim()}`
    }
  }
  if (typeof payload === 'string' && payload.trim()) {
    const snippet = payload.trim().slice(0, 300)
    return `Template request failed with status ${status}: ${snippet}`
  }
  if (payload && typeof payload === 'object') {
    try {
      const snippet = JSON.stringify(payload).slice(0, 300)
      if (snippet) return `Template request failed with status ${status}: ${snippet}`
    } catch {
      // Fall through to generic message below.
    }
  }
  return `Template request failed with status ${status}`
}
