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

export interface OpenAICompatMediaTemplate {
  version: number
  mediaType: 'image' | 'video'
  mode: 'sync' | 'async'
  create: TemplateEndpoint
  status?: TemplateEndpoint
  content?: TemplateEndpoint
  response: TemplateResponseMap
  polling?: TemplatePollingConfig
}

export type OpenAICompatMediaTemplateSource = 'ai' | 'manual'

export function getDefaultMediaTemplate(type: 'image' | 'video'): OpenAICompatMediaTemplate {
  if (type === 'image') {
    return {
      version: 2,
      mediaType: 'image',
      mode: 'sync',
      create: {
        method: 'POST',
        path: '/images/generations',
        contentType: 'multipart/form-data',
        multipartFileFields: ['image'],
        bodyTemplate: {
          model: '{{model}}',
          prompt: '{{prompt}}',
          image: '{{images}}',
        },
      },
      response: {
        outputUrlPath: '$.data[0].url',
        outputUrlsPath: '$.data',
        errorPath: '$.error.message',
      },
    }
  }

  return {
    version: 1,
    mediaType: 'video',
    mode: 'async',
    create: {
      method: 'POST',
      path: '/videos',
      contentType: 'multipart/form-data',
      multipartFileFields: ['input_reference'],
      bodyTemplate: {
        model: '{{model}}',
        prompt: '{{prompt}}',
        seconds: '{{duration}}',
        size: '{{size}}',
        input_reference: '{{image}}',
      },
    },
    status: {
      method: 'GET',
      path: '/videos/{{task_id}}',
    },
    content: {
      method: 'GET',
      path: '/videos/{{task_id}}/content',
    },
    response: {
      taskIdPath: '$.id',
      statusPath: '$.status',
      errorPath: '$.error.message',
    },
    polling: {
      intervalMs: 3000,
      timeoutMs: 600000,
      doneStates: ['completed', 'succeeded'],
      failStates: ['failed', 'error', 'canceled'],
    },
  }
}

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
