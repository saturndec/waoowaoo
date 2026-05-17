import { createHash } from 'node:crypto'

type UnknownRecord = Record<string, unknown>

export type OperationRuntimeSignal =
  | {
    kind: 'done'
  }
  | {
    kind: 'await_task'
    operationId: string
    taskIds: string[]
    phases: string[]
  }
  | {
    kind: 'await_user_confirmation'
    operationId: string
    message?: string
  }
  | {
    kind: 'active_status'
    operationId: string
    taskIds: string[]
    phases: string[]
  }
  | {
    kind: 'tool_error'
    operationId: string
    code?: string
    message?: string
  }

export interface NormalizeOperationRuntimeSignalInput {
  toolName: string
  output: unknown
}

export interface ToolCallSignatureInput {
  toolName: string
  input: unknown
}

const ACTIVE_TASK_PHASES = new Set(['queued', 'processing'])
const ACTIVE_COMMAND_STATUSES = new Set(['running', 'approved'])
const STATUS_TOOL_NAMES = new Set(['get_task_status', 'list_recent_commands', 'get_project_command', 'get_project_context'])

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const normalized = readNonEmptyString(item)
    return normalized ? [normalized] : []
  })
}

function readWrappedData(output: unknown): UnknownRecord | null {
  if (!isRecord(output) || output.ok !== true || !isRecord(output.data)) return null
  return output.data
}

function readWrappedPayload(output: unknown): unknown {
  if (!isRecord(output) || output.ok !== true) return null
  return output.data
}

function readOperationId(toolName: string, data: UnknownRecord | null): string {
  return readNonEmptyString(data?.operationId) ?? toolName
}

function readErrorRecord(output: unknown): UnknownRecord | null {
  if (!isRecord(output) || output.ok !== false) return null
  return isRecord(output.error) ? output.error : null
}

function normalizeTaskIds(value: UnknownRecord): string[] {
  const singleTaskId = readNonEmptyString(value.taskId)
  if (singleTaskId) return [singleTaskId]
  return readStringArray(value.taskIds)
}

function normalizePhases(values: string[]): string[] {
  return Array.from(new Set(values)).sort()
}

function normalizeTaskIdList(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort()
}

function normalizeAsyncSignal(toolName: string, data: UnknownRecord | null): OperationRuntimeSignal | null {
  if (!data || data.async !== true) return null
  const taskIds = normalizeTaskIds(data)
  if (taskIds.length === 0) return null
  return {
    kind: 'await_task',
    operationId: readOperationId(toolName, data),
    taskIds: normalizeTaskIdList(taskIds),
    phases: [],
  }
}

function normalizeTaskSubmittedPart(output: unknown): OperationRuntimeSignal | null {
  if (!isRecord(output)) return null
  const partType = readNonEmptyString(output.type)
  const data = isRecord(output.data) ? output.data : output
  if (partType !== 'data-task-submitted' && partType !== 'data-task-batch-submitted') return null
  const taskIds = normalizeTaskIds(data)
  if (taskIds.length === 0) return null
  return {
    kind: 'await_task',
    operationId: readOperationId(partType, data),
    taskIds: normalizeTaskIdList(taskIds),
    phases: [],
  }
}

function normalizeStatusStates(toolName: string, data: UnknownRecord | null): OperationRuntimeSignal | null {
  if (!data || !Array.isArray(data.states)) return null

  const activeStates = data.states.flatMap((state) => {
    if (!isRecord(state)) return []
    const phase = readNonEmptyString(state.phase)
    if (!phase || !ACTIVE_TASK_PHASES.has(phase)) return []
    const taskId = readNonEmptyString(state.runningTaskId) ?? readNonEmptyString(state.taskId)
    return [{
      phase,
      taskId,
    }]
  })
  if (activeStates.length === 0) return null

  return {
    kind: 'active_status',
    operationId: toolName,
    taskIds: normalizeTaskIdList(activeStates.flatMap((state) => state.taskId ? [state.taskId] : [])),
    phases: normalizePhases(activeStates.map((state) => state.phase)),
  }
}

function readCommandTaskIds(command: UnknownRecord): string[] {
  const direct = normalizeTaskIds(command)
  const task = isRecord(command.task) ? normalizeTaskIds(command.task) : []
  return [...direct, ...task]
}

function normalizeActiveCommands(toolName: string, payload: unknown): OperationRuntimeSignal | null {
  if (!payload || (toolName !== 'list_recent_commands' && toolName !== 'get_project_command')) return null
  const payloadRecord = isRecord(payload) ? payload : null
  const commandCandidates = payloadRecord && Array.isArray(payloadRecord.commands)
    ? payloadRecord.commands
    : payloadRecord && Array.isArray(payloadRecord.items)
      ? payloadRecord.items
      : payloadRecord && isRecord(payloadRecord.command)
        ? [payloadRecord.command]
      : Array.isArray(payload)
        ? payload
        : payloadRecord
          ? [payload]
          : []

  const activeCommands = commandCandidates.flatMap((command) => {
    if (!isRecord(command)) return []
    const status = readNonEmptyString(command.status)
    if (!status || !ACTIVE_COMMAND_STATUSES.has(status)) return []
    return [{
      status,
      taskIds: readCommandTaskIds(command),
    }]
  })
  if (activeCommands.length === 0) return null

  return {
    kind: 'active_status',
    operationId: toolName,
    taskIds: normalizeTaskIdList(activeCommands.flatMap((command) => command.taskIds)),
    phases: normalizePhases(activeCommands.map((command) => command.status)),
  }
}

function normalizeActiveOperationTasks(toolName: string, data: UnknownRecord | null): OperationRuntimeSignal | null {
  if (!data || toolName !== 'get_project_context') return null
  const context = isRecord(data.context) ? data.context : data
  const activeTasks = Array.isArray(context.activeOperationTasks) ? context.activeOperationTasks : []
  if (activeTasks.length === 0) return null

  const taskIds: string[] = []
  const phases: string[] = []
  for (const task of activeTasks) {
    if (!isRecord(task)) continue
    const taskId = readNonEmptyString(task.taskId) ?? readNonEmptyString(task.id)
    const phase = readNonEmptyString(task.phase) ?? readNonEmptyString(task.status)
    if (taskId) taskIds.push(taskId)
    if (phase) phases.push(phase)
  }

  return {
    kind: 'active_status',
    operationId: toolName,
    taskIds: normalizeTaskIdList(taskIds),
    phases: normalizePhases(phases),
  }
}

export function normalizeOperationRuntimeSignal(input: NormalizeOperationRuntimeSignalInput): OperationRuntimeSignal {
  const taskSubmittedPart = normalizeTaskSubmittedPart(input.output)
  if (taskSubmittedPart) return taskSubmittedPart

  if (!STATUS_TOOL_NAMES.has(input.toolName)) {
    const data = readWrappedData(input.output)
    const asyncSignal = normalizeAsyncSignal(input.toolName, data)
    if (asyncSignal) return asyncSignal
  }

  if (isRecord(input.output) && input.output.confirmationRequired === true) {
    const error = readErrorRecord(input.output)
    return {
      kind: 'await_user_confirmation',
      operationId: readNonEmptyString(error?.operationId) ?? input.toolName,
      ...(readNonEmptyString(error?.message) ? { message: readNonEmptyString(error?.message) ?? undefined } : {}),
    }
  }

  const error = readErrorRecord(input.output)
  if (error) {
    return {
      kind: 'tool_error',
      operationId: readNonEmptyString(error.operationId) ?? input.toolName,
      ...(readNonEmptyString(error.code) ? { code: readNonEmptyString(error.code) ?? undefined } : {}),
      ...(readNonEmptyString(error.message) ? { message: readNonEmptyString(error.message) ?? undefined } : {}),
    }
  }

  const data = readWrappedData(input.output)
  const payload = readWrappedPayload(input.output)
  const asyncSignal = normalizeAsyncSignal(input.toolName, data)
  if (asyncSignal) return asyncSignal

  const taskStatusSignal = normalizeStatusStates(input.toolName, data)
  if (taskStatusSignal) return taskStatusSignal

  const activeCommandSignal = normalizeActiveCommands(input.toolName, payload)
  if (activeCommandSignal) return activeCommandSignal

  const activeTaskSignal = normalizeActiveOperationTasks(input.toolName, data)
  if (activeTaskSignal) return activeTaskSignal

  return { kind: 'done' }
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value.trim())
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => item === undefined ? 'null' : stableStringify(item)).join(',')}]`
  const record = value as UnknownRecord
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
  return `{${entries.join(',')}}`
}

export function stableArgsHash(input: unknown): string {
  return createHash('sha256').update(stableStringify(input)).digest('hex').slice(0, 16)
}

export function buildToolCallSignature(input: ToolCallSignatureInput): string {
  return `${input.toolName}:${stableArgsHash(input.input)}`
}
