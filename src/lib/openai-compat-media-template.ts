export type TemplateHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type TemplateContentType =
  | 'application/json'
  | 'multipart/form-data'
  | 'application/x-www-form-urlencoded'

export type TemplateHeaderMap = Record<string, string>

export type TemplateBodyValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: TemplateBodyValue }
  | TemplateBodyValue[]

export interface TemplateEndpoint {
  method: TemplateHttpMethod
  path: string
  contentType?: TemplateContentType
  headers?: TemplateHeaderMap
  bodyTemplate?: TemplateBodyValue
  multipartFileFields?: string[]
}

export interface TemplateResponseMap {
  taskIdPath?: string
  statusPath?: string
  outputUrlPath?: string
  outputUrlsPath?: string
  errorPath?: string
}

export interface TemplatePollingConfig {
  intervalMs: number
  timeoutMs: number
  doneStates: string[]
  failStates: string[]
}

export type TemplateOperationType = 'generate' | 'edit'

export interface OpenAICompatOperationTemplate {
  create: TemplateEndpoint
  status?: TemplateEndpoint
  content?: TemplateEndpoint
  response: TemplateResponseMap
  polling?: TemplatePollingConfig
}

export interface OpenAICompatMediaTemplate {
  version: 1
  mediaType: 'image' | 'video'
  mode: 'sync' | 'async'
  create: TemplateEndpoint
  status?: TemplateEndpoint
  content?: TemplateEndpoint
  response: TemplateResponseMap
  polling?: TemplatePollingConfig
  operations?: Partial<Record<TemplateOperationType, OpenAICompatOperationTemplate>>
}

export type OpenAICompatMediaTemplateSource = 'ai' | 'manual'

export const TEMPLATE_PLACEHOLDER_ALLOWLIST = new Set([
  'model',
  'prompt',
  'image',
  'images',
  'aspect_ratio',
  'duration',
  'resolution',
  'size',
  'task_id',
])
