import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({
  authenticated: true,
}))

const prismaMock = vi.hoisted(() => ({
  executionPlan: {
    findUnique: vi.fn(),
  },
}))

const apiAdapterMock = vi.hoisted(() => ({
  executeProjectAgentOperationFromApi: vi.fn(),
}))

const executorMock = vi.hoisted(() => ({
  executeProjectCommand: vi.fn(async () => ({
    commandId: 'command-1',
    planId: 'plan-1',
    requiresApproval: false,
    status: 'running',
    linkedTaskId: 'task-1',
    summary: 'Panel Variant',
    steps: [
      {
        stepKey: 'panel_variant',
        skillId: 'panel_variant',
        title: 'Panel Variant',
        orderIndex: 0,
        inputArtifacts: ['panel.image'],
        outputArtifacts: ['panel.image'],
        invalidates: ['panel.video'],
        mutationKind: 'generate',
        riskLevel: 'low',
        requiresApproval: false,
        dependsOn: [],
      },
    ],
  })),
  listProjectCommands: vi.fn(async () => ([
    {
      commandId: 'command-1',
      planId: 'plan-1',
      requiresApproval: false,
      status: 'running',
      linkedTaskId: 'task-1',
      summary: 'Panel Variant',
      steps: [],
      createdAt: '2026-04-13T00:00:00.000Z',
      updatedAt: '2026-04-13T00:00:00.000Z',
      commandType: 'run_skill',
      source: 'gui',
      episodeId: 'episode-1',
      approval: null,
    },
  ])),
  syncProjectCommandStatus: vi.fn(async () => undefined),
  approveProjectPlan: vi.fn(async () => ({
    commandId: 'command-1',
    planId: 'plan-1',
    requiresApproval: false,
    status: 'running',
    linkedTaskId: 'task-1',
    summary: 'Panel Variant',
    steps: [],
  })),
  rejectProjectPlan: vi.fn(async () => ({
    commandId: 'command-1',
    planId: 'plan-1',
    requiresApproval: true,
    status: 'rejected',
    linkedTaskId: null,
    summary: 'Panel Variant',
    steps: [],
  })),
}))

const contextAssemblerMock = vi.hoisted(() => ({
  assembleProjectContext: vi.fn(async () => ({
    projectId: 'project-1',
    projectName: 'Project One',
    episodeId: 'episode-1',
    episodeName: 'Episode One',
    currentStage: 'config',
    selectedScopeRef: null,
    latestArtifacts: [],
    activePlanRuns: [],
    policy: {
      projectId: 'project-1',
      episodeId: 'episode-1',
      videoRatio: '9:16',
      artStyle: 'american-comic',
      analysisModel: 'llm::analysis',
      overrides: {},
    },
  })),
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireProjectAuth: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1' },
      }
    },
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/adapters/api/execute-project-agent-operation', () => apiAdapterMock)

vi.mock('@/lib/command-center/executor', () => executorMock)
vi.mock('@/lib/project-context/assembler', () => contextAssemblerMock)

import { GET as commandsGet, POST as commandsPost } from '@/app/api/projects/[projectId]/commands/route'
import { POST as approvePost } from '@/app/api/projects/[projectId]/plans/[planId]/approve/route'
import { POST as rejectPost } from '@/app/api/projects/[projectId]/plans/[planId]/reject/route'
import { GET as contextGet } from '@/app/api/projects/[projectId]/context/route'

describe('project commands routes', () => {
  beforeEach(() => {
    authState.authenticated = true
    vi.clearAllMocks()
  })

  it('POST /api/projects/[projectId]/commands -> returns async command execution payload', async () => {
    const response = await commandsPost(
      buildMockRequest({
        path: '/api/projects/project-1/commands',
        method: 'POST',
        body: {
          commandType: 'run_skill',
          skillId: 'panel_variant',
          episodeId: 'episode-1',
          scopeRef: 'panel:panel-1',
          input: { panelId: 'panel-1' },
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({
      success: true,
      async: true,
      commandId: 'command-1',
      planId: 'plan-1',
      taskId: 'task-1',
    })
    expect(executorMock.executeProjectCommand).toHaveBeenCalledTimes(1)
  })

  it('POST /api/projects/[projectId]/commands -> returns approval payload for assistant-panel operation plans', async () => {
    executorMock.executeProjectCommand.mockResolvedValueOnce({
      commandId: 'command-2',
      planId: 'plan-2',
      requiresApproval: true,
      status: 'awaiting_approval',
      linkedTaskId: '',
      summary: 'Insert Panel',
      steps: [
        {
          stepKey: 'insert_panel',
          skillId: 'insert_panel',
          title: 'Insert Panel',
          orderIndex: 0,
          inputArtifacts: ['storyboard.panel_set'],
          outputArtifacts: ['storyboard.panel_set'],
          invalidates: ['panel.image'],
          mutationKind: 'generate',
          riskLevel: 'medium',
          requiresApproval: true,
          dependsOn: [],
        },
      ],
    })

    const response = await commandsPost(
      buildMockRequest({
        path: '/api/projects/project-1/commands',
        method: 'POST',
        body: {
          commandType: 'run_skill',
          source: 'assistant-panel',
          skillId: 'insert_panel',
          episodeId: 'episode-1',
          scopeRef: 'panel:panel-1',
          input: { panelId: 'panel-1' },
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({
      success: true,
      commandId: 'command-2',
      planId: 'plan-2',
      status: 'awaiting_approval',
      requiresApproval: true,
    })
    expect(payload.async).toBeUndefined()
    expect(payload.taskId).toBeUndefined()
    expect(payload.runId).toBeUndefined()
  })

  it('GET /api/projects/[projectId]/commands -> returns command list', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce([
      {
        commandId: 'command-1',
        planId: 'plan-1',
        requiresApproval: false,
        status: 'running',
        linkedTaskId: 'task-1',
        summary: 'Panel Variant',
        steps: [],
        createdAt: '2026-04-13T00:00:00.000Z',
        updatedAt: '2026-04-13T00:00:00.000Z',
        commandType: 'run_skill',
        source: 'gui',
        episodeId: 'episode-1',
        approval: null,
      },
    ])

    const response = await commandsGet(
      buildMockRequest({
        path: '/api/projects/project-1/commands',
        method: 'GET',
        query: { episodeId: 'episode-1', limit: '10' },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.commands).toHaveLength(1)
    expect(payload.commands[0]).toMatchObject({
      commandId: 'command-1',
      planId: 'plan-1',
      linkedTaskId: 'task-1',
    })
  })

  it('POST approve route -> returns linked task payload', async () => {
    prismaMock.executionPlan.findUnique.mockResolvedValueOnce({
      id: 'plan-1',
      projectId: 'project-1',
      command: {
        normalizedInput: { operationId: 'panel_variant' },
        rawInput: {},
      },
    })
    executorMock.approveProjectPlan.mockResolvedValueOnce({
      commandId: 'command-1',
      planId: 'plan-1',
      requiresApproval: false,
      linkedTaskId: 'task-1',
      status: 'running',
      summary: 'Panel Variant',
      steps: [],
    })

    const response = await approvePost(
      buildMockRequest({
        path: '/api/projects/project-1/plans/plan-1/approve',
        method: 'POST',
      }),
      { params: Promise.resolve({ projectId: 'project-1', planId: 'plan-1' }) },
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({
      success: true,
      async: true,
      taskId: 'task-1',
      status: 'running',
    })
  })

  it('POST reject route -> returns rejected plan payload', async () => {
    prismaMock.executionPlan.findUnique.mockResolvedValueOnce({
      id: 'plan-1',
      projectId: 'project-1',
    })
    executorMock.rejectProjectPlan.mockResolvedValueOnce({
      commandId: 'command-1',
      planId: 'plan-1',
      requiresApproval: true,
      linkedTaskId: null,
      status: 'rejected',
      summary: 'Panel Variant',
      steps: [],
    })

    const response = await rejectPost(
      buildMockRequest({
        path: '/api/projects/project-1/plans/plan-1/reject',
        method: 'POST',
        body: { note: 'stop here' },
      }),
      { params: Promise.resolve({ projectId: 'project-1', planId: 'plan-1' }) },
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({
      success: true,
      status: 'rejected',
      commandId: 'command-1',
    })
  })

  it('GET context route -> returns assembled workspace context', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({
      projectId: 'project-1',
      projectName: 'Project One',
      episodeId: 'episode-1',
      episodeName: 'Episode One',
      currentStage: 'config',
      selectedScopeRef: null,
      latestArtifacts: [],
      activePlanRuns: [],
      policy: {
        projectId: 'project-1',
        episodeId: 'episode-1',
        videoRatio: '9:16',
        artStyle: 'american-comic',
        analysisModel: 'llm::analysis',
        overrides: {},
      },
    })

    const response = await contextGet(
      buildMockRequest({
        path: '/api/projects/project-1/context',
        method: 'GET',
        query: { episodeId: 'episode-1', currentStage: 'config' },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.context).toMatchObject({
      projectId: 'project-1',
      episodeId: 'episode-1',
      currentStage: 'config',
    })
  })
})
