import { describe, expect, it } from 'vitest'
import type { StepResult, ToolSet } from 'ai'
import { createProjectAgentStopController, PROJECT_AGENT_MAX_STEPS } from '@/lib/project-agent/stop-conditions'
import { stableArgsHash } from '@/lib/project-agent/runtime-signal'

function buildSteps(count: number): StepResult<ToolSet>[] {
  const step = {} as StepResult<ToolSet>
  return Array.from({ length: count }, () => step)
}

function buildToolResultStep(params: {
  toolName: string
  input?: unknown
  output: unknown
}): StepResult<ToolSet> {
  return {
    toolResults: [{
      type: 'tool-result',
      toolCallId: 'tool-call-1',
      toolName: params.toolName,
      input: params.input ?? {},
      output: params.output,
    }],
  } as unknown as StepResult<ToolSet>
}

describe('project agent stop conditions', () => {
  it('[below cap] -> stopWhen false and no stop part', () => {
    const controller = createProjectAgentStopController({} as ToolSet)
    const steps = buildSteps(PROJECT_AGENT_MAX_STEPS - 1)

    expect(controller.stopWhen({ steps })).toBe(false)
    expect(controller.buildStopPart(steps.length)).toBeNull()
  })

  it('[cap reached] -> stopWhen true and stop part returned', () => {
    const controller = createProjectAgentStopController({} as ToolSet)
    const steps = buildSteps(PROJECT_AGENT_MAX_STEPS)

    expect(controller.stopWhen({ steps })).toBe(true)
    expect(controller.buildStopPart(steps.length)).toEqual({
      reason: 'step_cap',
      stepCount: PROJECT_AGENT_MAX_STEPS,
      maxSteps: PROJECT_AGENT_MAX_STEPS,
    })
  })

  it('[async task submitted] -> stops the loop so system monitoring owns waiting', () => {
    const controller = createProjectAgentStopController({} as ToolSet)
    const steps = [
      buildToolResultStep({
        toolName: 'generate_edit_script',
        output: {
          ok: true,
          data: {
            async: true,
            taskId: 'task-1',
            status: 'processing',
          },
        },
      }),
    ]

    expect(controller.stopWhen({ steps })).toBe(true)
    expect(controller.buildStopPart(steps.length)).toEqual({
      reason: 'awaiting_external_task',
      stepCount: 1,
      operationIds: ['generate_edit_script'],
      taskIds: ['task-1'],
      phases: [],
    })
  })

  it('[task status active] -> stops after one active status query instead of polling', () => {
    const controller = createProjectAgentStopController({} as ToolSet)
    const steps = [
      buildToolResultStep({
        toolName: 'get_task_status',
        output: {
          ok: true,
          data: {
            states: [{
              targetType: 'ProjectEpisode',
              targetId: 'episode-1',
              phase: 'processing',
              runningTaskId: 'task-1',
            }],
          },
        },
      }),
    ]

    expect(controller.stopWhen({ steps })).toBe(true)
    expect(controller.buildStopPart(steps.length)).toEqual({
      reason: 'awaiting_external_task',
      stepCount: 1,
      operationIds: ['get_task_status'],
      taskIds: ['task-1'],
      phases: ['processing'],
    })
  })

  it('[task status terminal] -> lets the assistant summarize completed results', () => {
    const controller = createProjectAgentStopController({} as ToolSet)
    const steps = [
      buildToolResultStep({
        toolName: 'get_task_status',
        output: {
          ok: true,
          data: {
            states: [{
              targetType: 'ProjectEpisode',
              targetId: 'episode-1',
              phase: 'completed',
              runningTaskId: null,
            }],
          },
        },
      }),
    ]

    expect(controller.stopWhen({ steps })).toBe(false)
    expect(controller.buildStopPart(steps.length)).toBeNull()
  })

  it('[confirmation required] -> stops for user confirmation', () => {
    const controller = createProjectAgentStopController({} as ToolSet)
    const steps = [
      buildToolResultStep({
        toolName: 'delete_storyboard_panel',
        output: {
          ok: false,
          confirmationRequired: true,
          error: {
            operationId: 'delete_storyboard_panel',
            code: 'CONFIRMATION_REQUIRED',
          },
        },
      }),
    ]

    expect(controller.stopWhen({ steps })).toBe(true)
    expect(controller.buildStopPart(steps.length)).toEqual({
      reason: 'awaiting_user_confirmation',
      stepCount: 1,
      operationIds: ['delete_storyboard_panel'],
    })
  })

  it('[repeated tool call] -> stops on second identical tool+args signature', () => {
    const controller = createProjectAgentStopController({} as ToolSet)
    const repeatedStep = buildToolResultStep({
      toolName: 'get_task_status',
      output: {
        ok: true,
        data: {
          states: [{ phase: 'completed', runningTaskId: null }],
        },
      },
    })
    const steps = [repeatedStep, repeatedStep]

    expect(controller.stopWhen({ steps })).toBe(true)
    expect(controller.buildStopPart(steps.length)).toEqual({
      reason: 'repeated_tool_call',
      stepCount: 2,
      toolName: 'get_task_status',
      argsHash: '44136fa355b3678a',
    })
  })

  it('[same tool churn] -> stops on third consecutive same tool even with different args', () => {
    const controller = createProjectAgentStopController({} as ToolSet)
    const steps = [1, 2, 3].map((attempt) => buildToolResultStep({
      toolName: 'get_project_context',
      input: { attempt },
      output: {
        ok: true,
        data: {
          context: {
            activeOperationTasks: [],
          },
        },
      },
    }))

    expect(controller.stopWhen({ steps })).toBe(true)
    expect(controller.buildStopPart(steps.length)).toEqual({
      reason: 'repeated_tool_call',
      stepCount: 3,
      toolName: 'get_project_context',
      argsHash: stableArgsHash({ attempt: 3 }),
    })
  })
})
