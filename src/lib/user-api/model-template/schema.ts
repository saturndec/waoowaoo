import type {
  OpenAICompatOperationTemplate,
  OpenAICompatMediaTemplate,
  TemplateBodyValue,
  TemplateEndpoint,
  TemplateOperationType,
  TemplatePollingConfig,
  TemplateResponseMap,
} from '@/lib/openai-compat-media-template'
import { TEMPLATE_PLACEHOLDER_ALLOWLIST } from '@/lib/openai-compat-media-template'

type ValidationCode =
  | 'MODEL_TEMPLATE_INVALID'
  | 'MODEL_TEMPLATE_UNMAPPABLE'

export interface ModelTemplateValidationIssue {
  code: ValidationCode
  field: string
  message: string
}

const TEMPLATE_OPERATION_KEYS: TemplateOperationType[] = ['generate', 'edit']

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)
}

function isTemplateHttpMethod(value: unknown): value is TemplateEndpoint['method'] {
  return value === 'GET' || value === 'POST' || value === 'PUT' || value === 'PATCH' || value === 'DELETE'
}

function isTemplateContentType(value: unknown): value is NonNullable<TemplateEndpoint['contentType']> {
  return value === 'application/json'
    || value === 'multipart/form-data'
    || value === 'application/x-www-form-urlencoded'
}

function isBodyValue(value: unknown): value is TemplateBodyValue {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every((item) => isBodyValue(item))
  if (!isRecord(value)) return false
  return Object.values(value).every((item) => isBodyValue(item))
}

function validatePlaceholdersInString(
  value: string,
  field: string,
  issues: ModelTemplateValidationIssue[],
) {
  const regex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g
  let match = regex.exec(value)
  while (match) {
    const key = match[1] || ''
    if (!TEMPLATE_PLACEHOLDER_ALLOWLIST.has(key)) {
      issues.push({
        code: 'MODEL_TEMPLATE_INVALID',
        field,
        message: `Unsupported placeholder: ${key}`,
      })
    }
    match = regex.exec(value)
  }
}

function walkTemplateBody(
  value: TemplateBodyValue,
  field: string,
  issues: ModelTemplateValidationIssue[],
) {
  if (typeof value === 'string') {
    validatePlaceholdersInString(value, field, issues)
    return
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      walkTemplateBody(value[index] as TemplateBodyValue, `${field}[${index}]`, issues)
    }
    return
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    walkTemplateBody(nestedValue, `${field}.${key}`, issues)
  }
}

function readTemplateHeaders(
  value: unknown,
  field: string,
  issues: ModelTemplateValidationIssue[],
): Record<string, string> | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) {
    issues.push({ code: 'MODEL_TEMPLATE_INVALID', field, message: 'headers must be an object' })
    return undefined
  }

  const headers: Record<string, string> = {}
  for (const [key, headerValue] of Object.entries(value)) {
    const trimmedKey = key.trim()
    const trimmedValue = readTrimmedString(headerValue)
    if (!trimmedKey || !trimmedValue) {
      issues.push({
        code: 'MODEL_TEMPLATE_INVALID',
        field: `${field}.${key}`,
        message: 'header key/value must be non-empty string',
      })
      continue
    }
    headers[trimmedKey] = trimmedValue
  }
  return Object.keys(headers).length > 0 ? headers : undefined
}

function readTemplateEndpoint(
  value: unknown,
  field: string,
  options: { allowBody: boolean },
  issues: ModelTemplateValidationIssue[],
): TemplateEndpoint | null {
  if (!isRecord(value)) {
    issues.push({ code: 'MODEL_TEMPLATE_INVALID', field, message: 'endpoint must be an object' })
    return null
  }

  const methodRaw = value.method
  if (!isTemplateHttpMethod(methodRaw)) {
    issues.push({
      code: 'MODEL_TEMPLATE_INVALID',
      field: `${field}.method`,
      message: 'method must be one of GET/POST/PUT/PATCH/DELETE',
    })
  }

  const path = readTrimmedString(value.path)
  if (!path) {
    issues.push({
      code: 'MODEL_TEMPLATE_INVALID',
      field: `${field}.path`,
      message: 'path is required',
    })
  }

  const contentTypeRaw = value.contentType
  if (contentTypeRaw !== undefined && !isTemplateContentType(contentTypeRaw)) {
    issues.push({
      code: 'MODEL_TEMPLATE_INVALID',
      field: `${field}.contentType`,
      message: 'unsupported contentType',
    })
  }

  const headers = readTemplateHeaders(value.headers, `${field}.headers`, issues)

  let bodyTemplate: TemplateBodyValue | undefined
  if (value.bodyTemplate !== undefined) {
    if (!options.allowBody) {
      issues.push({
        code: 'MODEL_TEMPLATE_INVALID',
        field: `${field}.bodyTemplate`,
        message: 'bodyTemplate is not allowed for this endpoint',
      })
    } else if (!isBodyValue(value.bodyTemplate)) {
      issues.push({
        code: 'MODEL_TEMPLATE_INVALID',
        field: `${field}.bodyTemplate`,
        message: 'bodyTemplate must be valid JSON value',
      })
    } else {
      bodyTemplate = value.bodyTemplate
      walkTemplateBody(bodyTemplate, `${field}.bodyTemplate`, issues)
    }
  }

  const multipartFileFields = readOptionalStringArray(
    value.multipartFileFields,
    `${field}.multipartFileFields`,
    issues,
  )
  if (multipartFileFields && contentTypeRaw !== 'multipart/form-data') {
    issues.push({
      code: 'MODEL_TEMPLATE_INVALID',
      field: `${field}.multipartFileFields`,
      message: 'multipartFileFields requires contentType multipart/form-data',
    })
  }

  if (!isTemplateHttpMethod(methodRaw) || !path) return null
  return {
    method: methodRaw,
    path,
    ...(isTemplateContentType(contentTypeRaw) ? { contentType: contentTypeRaw } : {}),
    ...(headers ? { headers } : {}),
    ...(bodyTemplate !== undefined ? { bodyTemplate } : {}),
    ...(multipartFileFields ? { multipartFileFields } : {}),
  }
}

function readResponseMap(
  value: unknown,
  field: string,
  issues: ModelTemplateValidationIssue[],
): TemplateResponseMap | null {
  if (!isRecord(value)) {
    issues.push({ code: 'MODEL_TEMPLATE_INVALID', field, message: 'response map must be an object' })
    return null
  }

  const output: TemplateResponseMap = {}
  const keys: Array<keyof TemplateResponseMap & string> = [
    'taskIdPath',
    'statusPath',
    'outputUrlPath',
    'outputUrlsPath',
    'errorPath',
  ]

  for (const key of keys) {
    const raw = value[key]
    if (raw === undefined || raw === null) continue
    const path = readTrimmedString(raw)
    if (!path) {
      issues.push({
        code: 'MODEL_TEMPLATE_INVALID',
        field: `${field}.${key}`,
        message: 'path must be non-empty string',
      })
      continue
    }
    if (!path.startsWith('$.')) {
      issues.push({
        code: 'MODEL_TEMPLATE_INVALID',
        field: `${field}.${key}`,
        message: 'path must start with $.',
      })
      continue
    }
    output[key] = path
  }

  return output
}

function readStringArray(
  value: unknown,
  field: string,
  issues: ModelTemplateValidationIssue[],
): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({
      code: 'MODEL_TEMPLATE_INVALID',
      field,
      message: 'must be non-empty array of strings',
    })
    return null
  }
  const result: string[] = []
  for (let index = 0; index < value.length; index += 1) {
    const item = readTrimmedString(value[index])
    if (!item) {
      issues.push({
        code: 'MODEL_TEMPLATE_INVALID',
        field: `${field}[${index}]`,
        message: 'must be non-empty string',
      })
      continue
    }
    result.push(item)
  }
  return result.length > 0 ? result : null
}

function readOptionalStringArray(
  value: unknown,
  field: string,
  issues: ModelTemplateValidationIssue[],
): string[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) {
    issues.push({
      code: 'MODEL_TEMPLATE_INVALID',
      field,
      message: 'must be an array of strings',
    })
    return undefined
  }

  const result: string[] = []
  for (let index = 0; index < value.length; index += 1) {
    const item = readTrimmedString(value[index])
    if (!item) {
      issues.push({
        code: 'MODEL_TEMPLATE_INVALID',
        field: `${field}[${index}]`,
        message: 'must be non-empty string',
      })
      continue
    }
    result.push(item)
  }
  return result
}

function readPollingConfig(
  value: unknown,
  field: string,
  issues: ModelTemplateValidationIssue[],
): TemplatePollingConfig | null {
  if (!isRecord(value)) {
    issues.push({
      code: 'MODEL_TEMPLATE_INVALID',
      field,
      message: 'polling config must be an object',
    })
    return null
  }

  const intervalMs = value.intervalMs
  const timeoutMs = value.timeoutMs
  const doneStates = readStringArray(value.doneStates, `${field}.doneStates`, issues)
  const failStates = readStringArray(value.failStates, `${field}.failStates`, issues)

  if (!isFiniteInteger(intervalMs) || intervalMs <= 0) {
    issues.push({
      code: 'MODEL_TEMPLATE_INVALID',
      field: `${field}.intervalMs`,
      message: 'intervalMs must be positive integer',
    })
  }

  if (!isFiniteInteger(timeoutMs) || timeoutMs <= 0) {
    issues.push({
      code: 'MODEL_TEMPLATE_INVALID',
      field: `${field}.timeoutMs`,
      message: 'timeoutMs must be positive integer',
    })
  }

  if (!isFiniteInteger(intervalMs) || !isFiniteInteger(timeoutMs) || !doneStates || !failStates) {
    return null
  }

  return {
    intervalMs,
    timeoutMs,
    doneStates,
    failStates,
  }
}

function readOperationTemplate(
  value: unknown,
  field: string,
  issues: ModelTemplateValidationIssue[],
): OpenAICompatOperationTemplate | null {
  if (!isRecord(value)) {
    issues.push({
      code: 'MODEL_TEMPLATE_INVALID',
      field,
      message: 'operation template must be an object',
    })
    return null
  }

  const create = readTemplateEndpoint(value.create, `${field}.create`, { allowBody: true }, issues)
  const status = value.status === undefined
    ? undefined
    : readTemplateEndpoint(value.status, `${field}.status`, { allowBody: false }, issues) || undefined
  const content = value.content === undefined
    ? undefined
    : readTemplateEndpoint(value.content, `${field}.content`, { allowBody: false }, issues) || undefined
  const response = value.response === undefined
    ? {}
    : readResponseMap(value.response, `${field}.response`, issues)
  const polling = value.polling === undefined
    ? undefined
    : readPollingConfig(value.polling, `${field}.polling`, issues) || undefined

  if (!create || !response) return null
  return {
    create,
    ...(status ? { status } : {}),
    ...(content ? { content } : {}),
    response,
    ...(polling ? { polling } : {}),
  }
}

function readOperationTemplates(
  value: unknown,
  field: string,
  issues: ModelTemplateValidationIssue[],
): Partial<Record<TemplateOperationType, OpenAICompatOperationTemplate>> | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) {
    issues.push({
      code: 'MODEL_TEMPLATE_INVALID',
      field,
      message: 'operations must be an object',
    })
    return undefined
  }

  const operations: Partial<Record<TemplateOperationType, OpenAICompatOperationTemplate>> = {}

  for (const key of Object.keys(value)) {
    if (!TEMPLATE_OPERATION_KEYS.includes(key as TemplateOperationType)) {
      issues.push({
        code: 'MODEL_TEMPLATE_INVALID',
        field: `${field}.${key}`,
        message: `unsupported operation key: ${key}`,
      })
    }
  }

  for (const operation of TEMPLATE_OPERATION_KEYS) {
    const rawOperation = value[operation]
    if (rawOperation === undefined) continue
    const parsedOperation = readOperationTemplate(rawOperation, `${field}.${operation}`, issues)
    if (parsedOperation) {
      operations[operation] = parsedOperation
    }
  }

  return Object.keys(operations).length > 0 ? operations : undefined
}

function fieldPath(prefix: string, suffix: string): string {
  return prefix ? `${prefix}.${suffix}` : suffix
}

function validateSingleTemplateRequirements(input: {
  mode: OpenAICompatMediaTemplate['mode']
  create: TemplateEndpoint
  status?: TemplateEndpoint
  response: TemplateResponseMap
  polling?: TemplatePollingConfig
  fieldPrefix: string
}, issues: ModelTemplateValidationIssue[]) {
  const createBodyField = fieldPath(input.fieldPrefix, 'create.bodyTemplate')
  const createMultipartField = fieldPath(input.fieldPrefix, 'create.multipartFileFields')
  const statusField = fieldPath(input.fieldPrefix, 'status')
  const statusPathField = fieldPath(input.fieldPrefix, 'status.path')
  const taskIdField = fieldPath(input.fieldPrefix, 'response.taskIdPath')
  const statusValueField = fieldPath(input.fieldPrefix, 'response.statusPath')
  const responseField = fieldPath(input.fieldPrefix, 'response')
  const pollingField = fieldPath(input.fieldPrefix, 'polling')

  if (
    (input.create.method === 'POST' || input.create.method === 'PUT' || input.create.method === 'PATCH')
    && input.create.bodyTemplate === undefined
  ) {
    issues.push({
      code: 'MODEL_TEMPLATE_UNMAPPABLE',
      field: createBodyField,
      message: `${input.create.method} create endpoint requires bodyTemplate`,
    })
  }

  if (input.create.contentType === 'multipart/form-data' && input.create.multipartFileFields) {
    if (!isRecord(input.create.bodyTemplate)) {
      issues.push({
        code: 'MODEL_TEMPLATE_UNMAPPABLE',
        field: createBodyField,
        message: 'multipart create endpoint requires object bodyTemplate',
      })
    } else {
      for (const path of input.create.multipartFileFields) {
        const [topLevelField] = path.split('.')
        if (!topLevelField || !(topLevelField in input.create.bodyTemplate)) {
          issues.push({
            code: 'MODEL_TEMPLATE_UNMAPPABLE',
            field: createMultipartField,
            message: `multipart file field not found in bodyTemplate: ${path}`,
          })
        }
      }
    }
  }

  if (input.mode === 'async') {
    if (!input.status) {
      issues.push({
        code: 'MODEL_TEMPLATE_UNMAPPABLE',
        field: statusField,
        message: 'async mode requires status endpoint',
      })
    }
    if (!input.response.taskIdPath) {
      issues.push({
        code: 'MODEL_TEMPLATE_UNMAPPABLE',
        field: taskIdField,
        message: 'async mode requires response.taskIdPath',
      })
    }
    if (!input.response.statusPath) {
      issues.push({
        code: 'MODEL_TEMPLATE_UNMAPPABLE',
        field: statusValueField,
        message: 'async mode requires response.statusPath',
      })
    }
    if (!input.polling) {
      issues.push({
        code: 'MODEL_TEMPLATE_UNMAPPABLE',
        field: pollingField,
        message: 'async mode requires polling config',
      })
    }
    if (input.status && !/\{\{\s*task_id\s*\}\}/.test(input.status.path)) {
      issues.push({
        code: 'MODEL_TEMPLATE_UNMAPPABLE',
        field: statusPathField,
        message: 'async status endpoint path must include {{task_id}} placeholder',
      })
    }
    return
  }

  if (!input.response.outputUrlPath && !input.response.outputUrlsPath) {
    issues.push({
      code: 'MODEL_TEMPLATE_UNMAPPABLE',
      field: responseField,
      message: 'sync mode requires outputUrlPath or outputUrlsPath',
    })
  }
}

function validateModeSpecificRequirements(
  template: OpenAICompatMediaTemplate,
  issues: ModelTemplateValidationIssue[],
) {
  validateSingleTemplateRequirements({
    mode: template.mode,
    create: template.create,
    status: template.status,
    response: template.response,
    polling: template.polling,
    fieldPrefix: '',
  }, issues)

  if (!template.operations) return
  for (const operation of TEMPLATE_OPERATION_KEYS) {
    const operationTemplate = template.operations[operation]
    if (!operationTemplate) continue
    validateSingleTemplateRequirements({
      mode: template.mode,
      create: operationTemplate.create,
      status: operationTemplate.status ?? template.status,
      response: { ...template.response, ...operationTemplate.response },
      polling: operationTemplate.polling ?? template.polling,
      fieldPrefix: `operations.${operation}`,
    }, issues)
  }
}


export function parseOpenAICompatMediaTemplate(raw: unknown): {
  template: OpenAICompatMediaTemplate | null
  issues: ModelTemplateValidationIssue[]
} {
  const issues: ModelTemplateValidationIssue[] = []

  if (!isRecord(raw)) {
    return {
      template: null,
      issues: [{ code: 'MODEL_TEMPLATE_INVALID', field: 'template', message: 'template must be an object' }],
    }
  }

  if (raw.version !== 1) {
    issues.push({
      code: 'MODEL_TEMPLATE_INVALID',
      field: 'version',
      message: 'version must be 1',
    })
  }

  const mediaType = raw.mediaType
  if (mediaType !== 'image' && mediaType !== 'video') {
    issues.push({
      code: 'MODEL_TEMPLATE_INVALID',
      field: 'mediaType',
      message: 'mediaType must be image or video',
    })
  }

  const mode = raw.mode
  if (mode !== 'sync' && mode !== 'async') {
    issues.push({
      code: 'MODEL_TEMPLATE_INVALID',
      field: 'mode',
      message: 'mode must be sync or async',
    })
  }

  const create = readTemplateEndpoint(raw.create, 'create', { allowBody: true }, issues)
  const status = raw.status === undefined
    ? undefined
    : readTemplateEndpoint(raw.status, 'status', { allowBody: false }, issues) || undefined
  const content = raw.content === undefined
    ? undefined
    : readTemplateEndpoint(raw.content, 'content', { allowBody: false }, issues) || undefined
  const response = raw.response === undefined
    ? {}
    : readResponseMap(raw.response, 'response', issues)
  const polling = raw.polling === undefined
    ? undefined
    : readPollingConfig(raw.polling, 'polling', issues) || undefined
  const operations = readOperationTemplates(raw.operations, 'operations', issues)

  if (issues.length > 0 || !create || !response || (mode !== 'sync' && mode !== 'async') || (mediaType !== 'image' && mediaType !== 'video')) {
    return { template: null, issues }
  }

  const normalizedTemplate: OpenAICompatMediaTemplate = {
    version: 1,
    mediaType,
    mode,
    create,
    ...(status ? { status } : {}),
    ...(content ? { content } : {}),
    response,
    ...(polling ? { polling } : {}),
    ...(operations ? { operations } : {}),
  }
  validateModeSpecificRequirements(normalizedTemplate, issues)
  if (issues.length > 0) {
    return { template: null, issues }
  }
  return { template: normalizedTemplate, issues: [] }
}
