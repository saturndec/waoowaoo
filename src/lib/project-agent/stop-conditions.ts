import type { StepResult, StopCondition, ToolSet } from 'ai'
import {
  buildToolCallSignature,
  normalizeOperationRuntimeSignal,
  stableArgsHash,
  type OperationRuntimeSignal,
} from './runtime-signal'
import type { ProjectAgentStopPartData } from './types'

export const PROJECT_AGENT_MAX_STEPS = 12
const PROJECT_AGENT_MAX_CONSECUTIVE_SAME_TOOL = 3

type RuntimeSignalDescriptor =
  | {
    reason: 'awaiting_external_task'
    operationId: string
    taskIds: string[]
    phases: string[]
  }
  | {
    reason: 'awaiting_user_confirmation'
    operationId: string
  }
  | {
    reason: 'tool_error'
    operationId: string
    code?: string
  }

function signalToDescriptor(signal: OperationRuntimeSignal): RuntimeSignalDescriptor | null {
  if (signal.kind === 'await_task' || signal.kind === 'active_status') {
    return {
      reason: 'awaiting_external_task',
      operationId: signal.operationId,
      taskIds: signal.taskIds,
      phases: signal.phases,
    }
  }
  if (signal.kind === 'await_user_confirmation') {
    return {
      reason: 'awaiting_user_confirmation',
      operationId: signal.operationId,
    }
  }
  if (signal.kind === 'tool_error') {
    return {
      reason: 'tool_error',
      operationId: signal.operationId,
      ...(signal.code ? { code: signal.code } : {}),
    }
  }
  return null
}

function collectRuntimeSignalDescriptors<TOOLS extends ToolSet>(
  step: StepResult<TOOLS> | undefined,
): RuntimeSignalDescriptor[] {
  if (!step) return []
  const toolResults = Array.isArray(step.toolResults) ? step.toolResults : []
  return toolResults.flatMap((result) => {
    const signal = normalizeOperationRuntimeSignal({
      toolName: result.toolName,
      output: result.output,
    })
    const descriptor = signalToDescriptor(signal)
    return descriptor ? [descriptor] : []
  })
}

function mergeDescriptors(
  stepCount: number,
  descriptors: RuntimeSignalDescriptor[],
): ProjectAgentStopPartData | null {
  const firstReason = descriptors[0]?.reason
  if (!firstReason) return null
  const matching = descriptors.filter((descriptor) => descriptor.reason === firstReason)

  if (firstReason === 'awaiting_external_task') {
    const externalTaskDescriptors = matching.filter((descriptor): descriptor is Extract<RuntimeSignalDescriptor, { reason: 'awaiting_external_task' }> => (
      descriptor.reason === 'awaiting_external_task'
    ))
    return {
      reason: firstReason,
      stepCount,
      operationIds: Array.from(new Set(externalTaskDescriptors.map((descriptor) => descriptor.operationId))).sort(),
      taskIds: Array.from(new Set(externalTaskDescriptors.flatMap((descriptor) => descriptor.taskIds))).sort(),
      phases: Array.from(new Set(externalTaskDescriptors.flatMap((descriptor) => descriptor.phases))).sort(),
    }
  }

  if (firstReason === 'awaiting_user_confirmation') {
    return {
      reason: firstReason,
      stepCount,
      operationIds: Array.from(new Set(matching.map((descriptor) => descriptor.operationId))).sort(),
    }
  }

  const toolErrorDescriptors = matching.filter((descriptor): descriptor is Extract<RuntimeSignalDescriptor, { reason: 'tool_error' }> => (
    descriptor.reason === 'tool_error'
  ))
  return {
    reason: 'tool_error',
    stepCount,
    operationIds: Array.from(new Set(toolErrorDescriptors.map((descriptor) => descriptor.operationId))).sort(),
    codes: Array.from(new Set(toolErrorDescriptors.flatMap((descriptor) => descriptor.code ? [descriptor.code] : []))).sort(),
  }
}

function detectRepeatedToolCall<TOOLS extends ToolSet>(steps: StepResult<TOOLS>[]): ProjectAgentStopPartData | null {
  const callCounts = new Map<string, {
    count: number
    toolName: string
    argsHash: string
  }>()

  for (const step of steps) {
    const toolCalls = Array.isArray(step.toolCalls) ? step.toolCalls : []
    const toolResults = Array.isArray(step.toolResults) ? step.toolResults : []
    const calls = toolCalls.length > 0
      ? toolCalls.map((call) => ({
          toolName: call.toolName,
          input: call.input,
        }))
      : toolResults.map((result) => ({
          toolName: result.toolName,
          input: result.input,
        }))

    for (const call of calls) {
      const argsHash = stableArgsHash(call.input ?? {})
      const signature = buildToolCallSignature({
        toolName: call.toolName,
        input: call.input ?? {},
      })
      const previous = callCounts.get(signature)
      const nextCount = (previous?.count ?? 0) + 1
      callCounts.set(signature, {
        count: nextCount,
        toolName: call.toolName,
        argsHash,
      })
      if (nextCount >= 2) {
        return {
          reason: 'repeated_tool_call',
          stepCount: steps.length,
          toolName: call.toolName,
          argsHash,
        }
      }
    }
  }

  return null
}

function readStepToolCalls<TOOLS extends ToolSet>(step: StepResult<TOOLS>): Array<{ toolName: string; input: unknown }> {
  const toolCalls = Array.isArray(step.toolCalls) ? step.toolCalls : []
  const toolResults = Array.isArray(step.toolResults) ? step.toolResults : []
  return toolCalls.length > 0
    ? toolCalls.map((call) => ({
        toolName: call.toolName,
        input: call.input,
      }))
    : toolResults.map((result) => ({
        toolName: result.toolName,
        input: result.input,
      }))
}

function detectSameToolChurn<TOOLS extends ToolSet>(steps: StepResult<TOOLS>[]): ProjectAgentStopPartData | null {
  if (steps.length < PROJECT_AGENT_MAX_CONSECUTIVE_SAME_TOOL) return null
  let consecutiveToolName: string | null = null
  let consecutiveCount = 0
  let latestArgsHash = ''

  for (const step of steps) {
    const calls = readStepToolCalls(step)
    const stepToolName = calls.length === 1 ? calls[0]?.toolName ?? null : null
    if (!stepToolName) {
      consecutiveToolName = null
      consecutiveCount = 0
      latestArgsHash = ''
      continue
    }
    latestArgsHash = stableArgsHash(calls[0]?.input ?? {})
    if (stepToolName === consecutiveToolName) {
      consecutiveCount += 1
    } else {
      consecutiveToolName = stepToolName
      consecutiveCount = 1
    }
    if (consecutiveCount >= PROJECT_AGENT_MAX_CONSECUTIVE_SAME_TOOL) {
      return {
        reason: 'repeated_tool_call',
        stepCount: steps.length,
        toolName: stepToolName,
        argsHash: latestArgsHash,
      }
    }
  }

  return null
}

export function createProjectAgentStopController<TToolSet extends ToolSet>(_tools: TToolSet) {
  void _tools
  let stopPart: ProjectAgentStopPartData | null = null
  const stopWhen: StopCondition<TToolSet> = ({ steps }) => {
    const runtimeSignalStop = mergeDescriptors(
      steps.length,
      collectRuntimeSignalDescriptors(steps[steps.length - 1]),
    )
    if (runtimeSignalStop) {
      stopPart = runtimeSignalStop
      return true
    }

    const repeatStop = detectRepeatedToolCall(steps)
    if (repeatStop) {
      stopPart = repeatStop
      return true
    }

    const churnStop = detectSameToolChurn(steps)
    if (churnStop) {
      stopPart = churnStop
      return true
    }

    if (steps.length >= PROJECT_AGENT_MAX_STEPS) {
      stopPart = {
        reason: 'step_cap',
        stepCount: steps.length,
        maxSteps: PROJECT_AGENT_MAX_STEPS,
      }
      return true
    }
    return false
  }

  const buildStopPart = (stepCount: number): ProjectAgentStopPartData | null => {
    if (!stopPart) return null
    return stopPart.reason === 'step_cap' || stopPart.reason === 'repeated_tool_call'
      ? { ...stopPart, stepCount }
      : stopPart
  }

  return {
    stopWhen,
    buildStopPart,
  }
}
