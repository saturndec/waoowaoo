import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { UIMessage, UIMessageStreamWriter } from 'ai'
import type { NextRequest } from 'next/server'
import type { ProjectAgentOperationRegistry } from '@/lib/operations/types'
import { makeTestOperation, EFFECTS_NONE, EFFECTS_WRITE } from '../../helpers/project-agent-operations'

const registryState = vi.hoisted(() => ({
  registry: {} as ProjectAgentOperationRegistry,
}))

vi.mock('@/lib/operations/registry', () => ({
  createProjectAgentOperationRegistry: () => registryState.registry,
}))

import { executeProjectAgentOperationFromTool } from '@/lib/adapters/tools/execute-project-agent-operation'

function buildWriter() {
  return {
    write: vi.fn(),
    merge: vi.fn(),
    onError: vi.fn(),
  } as unknown as UIMessageStreamWriter<UIMessage>
}

function buildRequest(): NextRequest {
  return new Request('http://localhost') as unknown as NextRequest
}

describe('executeProjectAgentOperationFromTool', () => {
  beforeEach(() => {
    registryState.registry = {}
    vi.clearAllMocks()
  })

  it('[invalid input] -> returns structured error with issues', async () => {
    registryState.registry = {
      test_op: makeTestOperation({
        id: 'test_op',
        summary: 'test',
        intent: 'act',
        effects: EFFECTS_WRITE,
        inputSchema: z.object({ name: z.string().min(1) }),
        outputSchema: z.object({ ok: z.boolean() }),
        execute: vi.fn(async () => ({ ok: true })),
      }),
    }

    const result = await executeProjectAgentOperationFromTool({
      request: buildRequest(),
      operationId: 'test_op',
      projectId: 'project-1',
      userId: 'user-1',
      context: {},
      source: 'assistant-panel',
      writer: buildWriter(),
      input: {},
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('OPERATION_INPUT_INVALID')
    expect(result.error.issues).toBeDefined()
  })

  it('[confirmation required] -> writes confirmation card and returns error', async () => {
    const writer = buildWriter()
    const execute = vi.fn(async () => ({ ok: true }))
    registryState.registry = {
      confirm_op: makeTestOperation({
        id: 'confirm_op',
        summary: 'confirm',
        intent: 'act',
        effects: EFFECTS_WRITE,
        confirmation: {
          required: true,
          summary: 'needs confirm',
          budget: {
            key: 'assistant-budget',
            estimatedCostUnits: 3,
          },
        },
        inputSchema: z.object({ confirmed: z.boolean().optional() }),
        outputSchema: z.object({ ok: z.boolean() }),
        execute,
      }),
    }

    const result = await executeProjectAgentOperationFromTool({
      request: buildRequest(),
      operationId: 'confirm_op',
      projectId: 'project-1',
      userId: 'user-1',
      context: {},
      source: 'assistant-panel',
      writer,
      input: {},
    })

    expect(writer.write).toHaveBeenCalledWith(expect.objectContaining({
      type: 'data-confirmation-request',
      data: expect.objectContaining({
        operationId: 'confirm_op',
        summary: 'needs confirm',
        argsHint: expect.objectContaining({ confirmed: true }),
        budget: {
          key: 'assistant-budget',
          estimatedCostUnits: 3,
        },
      }),
    }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.confirmationRequired).toBe(true)
    expect(result.error.code).toBe('CONFIRMATION_REQUIRED')
    expect(execute).not.toHaveBeenCalled()
  })

  it('[confirmed input] -> executes operation when confirmation required', async () => {
    const writer = buildWriter()
    const execute = vi.fn(async () => ({ ok: true }))
    registryState.registry = {
      confirm_ok_op: makeTestOperation({
        id: 'confirm_ok_op',
        summary: 'confirm ok',
        intent: 'act',
        effects: EFFECTS_WRITE,
        confirmation: {
          required: true,
          summary: 'needs confirm',
        },
        inputSchema: z.object({ confirmed: z.boolean().optional() }),
        outputSchema: z.object({ ok: z.boolean() }),
        execute,
      }),
    }

    const result = await executeProjectAgentOperationFromTool({
      request: buildRequest(),
      operationId: 'confirm_ok_op',
      projectId: 'project-1',
      userId: 'user-1',
      context: {},
      source: 'assistant-panel',
      writer,
      input: { confirmed: true },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toEqual({ ok: true })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith(expect.any(Object), { confirmed: true })
  })

  it('[execution error] -> returns structured error', async () => {
    registryState.registry = {
      fail_op: makeTestOperation({
        id: 'fail_op',
        summary: 'fail',
        intent: 'act',
        effects: EFFECTS_WRITE,
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.boolean() }),
        execute: vi.fn(async () => {
          throw new Error('boom')
        }),
      }),
    }

    const result = await executeProjectAgentOperationFromTool({
      request: buildRequest(),
      operationId: 'fail_op',
      projectId: 'project-1',
      userId: 'user-1',
      context: {},
      source: 'assistant-panel',
      writer: buildWriter(),
      input: {},
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('OPERATION_EXECUTION_FAILED')
    expect(result.error.message).toBe('boom')
  })

  it('[execution throws undefined] -> returns fallback message', async () => {
    registryState.registry = {
      fail_undefined: makeTestOperation({
        id: 'fail_undefined',
        summary: 'fail undefined',
        intent: 'act',
        effects: EFFECTS_WRITE,
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.boolean() }),
        execute: vi.fn(async () => {
          throw undefined
        }),
      }),
    }

    const result = await executeProjectAgentOperationFromTool({
      request: buildRequest(),
      operationId: 'fail_undefined',
      projectId: 'project-1',
      userId: 'user-1',
      context: {},
      source: 'assistant-panel',
      writer: buildWriter(),
      input: {},
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('OPERATION_EXECUTION_FAILED')
    expect(result.error.message).toBe('PROJECT_AGENT_OPERATION_FAILED')
  })

  it('[execution throws symbol] -> returns fallback message', async () => {
    registryState.registry = {
      fail_symbol: makeTestOperation({
        id: 'fail_symbol',
        summary: 'fail symbol',
        intent: 'act',
        effects: EFFECTS_WRITE,
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.boolean() }),
        execute: vi.fn(async () => {
          throw Symbol('boom')
        }),
      }),
    }

    const result = await executeProjectAgentOperationFromTool({
      request: buildRequest(),
      operationId: 'fail_symbol',
      projectId: 'project-1',
      userId: 'user-1',
      context: {},
      source: 'assistant-panel',
      writer: buildWriter(),
      input: {},
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('OPERATION_EXECUTION_FAILED')
    expect(result.error.message).toBe('PROJECT_AGENT_OPERATION_FAILED')
  })

  it('[execution throws function] -> returns fallback message', async () => {
    registryState.registry = {
      fail_function: makeTestOperation({
        id: 'fail_function',
        summary: 'fail function',
        intent: 'act',
        effects: EFFECTS_WRITE,
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.boolean() }),
        execute: vi.fn(async () => {
          throw (() => 'boom')
        }),
      }),
    }

    const result = await executeProjectAgentOperationFromTool({
      request: buildRequest(),
      operationId: 'fail_function',
      projectId: 'project-1',
      userId: 'user-1',
      context: {},
      source: 'assistant-panel',
      writer: buildWriter(),
      input: {},
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('OPERATION_EXECUTION_FAILED')
    expect(result.error.message).toBe('PROJECT_AGENT_OPERATION_FAILED')
  })

  it('[output schema mismatch] -> returns structured error', async () => {
    registryState.registry = {
      output_op: makeTestOperation({
        id: 'output_op',
        summary: 'output',
        intent: 'query',
        effects: EFFECTS_NONE,
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.boolean() }),
        execute: vi.fn(async () => ({ missing: true } as unknown as { ok: boolean })),
      }),
    }

    const result = await executeProjectAgentOperationFromTool({
      request: buildRequest(),
      operationId: 'output_op',
      projectId: 'project-1',
      userId: 'user-1',
      context: {},
      source: 'assistant-panel',
      writer: buildWriter(),
      input: {},
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('OPERATION_OUTPUT_INVALID')
    expect(result.error.issues).toBeDefined()
  })

  it('[success] -> wraps output in ok data', async () => {
    registryState.registry = {
      ok_op: makeTestOperation({
        id: 'ok_op',
        summary: 'ok',
        intent: 'query',
        effects: EFFECTS_NONE,
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.boolean() }),
        execute: vi.fn(async () => ({ ok: true })),
      }),
    }

    const result = await executeProjectAgentOperationFromTool({
      request: buildRequest(),
      operationId: 'ok_op',
      projectId: 'project-1',
      userId: 'user-1',
      context: {},
      source: 'assistant-panel',
      writer: buildWriter(),
      input: {},
    })

    expect(result).toEqual({
      ok: true,
      data: { ok: true },
    })
  })
})
