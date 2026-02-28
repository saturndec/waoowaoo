import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskTargetState } from '@/lib/query/hooks/useTaskTargetStateMap'

const runtime = vi.hoisted(() => ({
  useQueryCalls: [] as Array<Record<string, unknown>>,
  apiStates: [] as TaskTargetState[],
  overlayStates: {} as Record<string, {
    targetType: string
    targetId: string
    phase: 'queued' | 'processing'
    runningTaskId: string | null
    runningTaskType: string | null
    intent: 'generate' | 'process' | 'regenerate'
    hasOutputAtStart: boolean | null
    progress: number | null
    stage: string | null
    stageLabel: string | null
    updatedAt: string | null
    lastError: null
    expiresAt: number
  }>,
}))

const overlayNow = new Date().toISOString()

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useMemo: <T,>(factory: () => T) => factory(),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: Record<string, unknown>) => {
    runtime.useQueryCalls.push(options)

    const queryKey = (options.queryKey || []) as unknown[]
    const first = queryKey[0]
    if (first === 'task-target-states-overlay') {
      return {
        data: runtime.overlayStates,
      }
    }

    return {
      data: runtime.apiStates,
    }
  },
}))

describe('task target state map behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtime.useQueryCalls = []
    runtime.apiStates = [
      {
        targetType: 'CharacterAppearance',
        targetId: 'appearance-1',
        phase: 'idle',
        runningTaskId: null,
        runningTaskType: null,
        intent: 'process',
        hasOutputAtStart: null,
        progress: null,
        stage: null,
        stageLabel: null,
        lastError: null,
        updatedAt: null,
      },
      {
        targetType: 'NovelPromotionPanel',
        targetId: 'panel-1',
        phase: 'processing',
        runningTaskId: 'task-api-panel',
        runningTaskType: 'IMAGE_PANEL',
        intent: 'process',
        hasOutputAtStart: null,
        progress: 10,
        stage: 'api',
        stageLabel: 'API处理中',
        lastError: null,
        updatedAt: overlayNow,
      },
    ]
    runtime.overlayStates = {
      'CharacterAppearance:appearance-1': {
        targetType: 'CharacterAppearance',
        targetId: 'appearance-1',
        phase: 'processing',
        runningTaskId: 'task-ov-1',
        runningTaskType: 'IMAGE_CHARACTER',
        intent: 'process',
        hasOutputAtStart: false,
        progress: 50,
        stage: 'generate',
        stageLabel: '生成中',
        updatedAt: overlayNow,
        lastError: null,
        expiresAt: Date.now() + 30_000,
      },
      'NovelPromotionPanel:panel-1': {
        targetType: 'NovelPromotionPanel',
        targetId: 'panel-1',
        phase: 'queued',
        runningTaskId: 'task-ov-2',
        runningTaskType: 'LIP_SYNC',
        intent: 'process',
        hasOutputAtStart: null,
        progress: null,
        stage: null,
        stageLabel: null,
        updatedAt: overlayNow,
        lastError: null,
        expiresAt: Date.now() + 30_000,
      },
    }
  })

  it('keeps polling disabled and merges overlay only when rules match', async () => {
    const { useTaskTargetStateMap } = await import('@/lib/query/hooks/useTaskTargetStateMap')

    const result = useTaskTargetStateMap('project-1', [
      { targetType: 'CharacterAppearance', targetId: 'appearance-1', types: ['IMAGE_CHARACTER'] },
      { targetType: 'NovelPromotionPanel', targetId: 'panel-1', types: ['IMAGE_PANEL'] },
    ])

    const firstCall = runtime.useQueryCalls[0]
    expect(firstCall?.refetchInterval).toBe(false)

    const appearance = result.getState('CharacterAppearance', 'appearance-1')
    expect(appearance?.phase).toBe('processing')
    expect(appearance?.runningTaskType).toBe('IMAGE_CHARACTER')
    expect(appearance?.runningTaskId).toBe('task-ov-1')

    const panel = result.getState('NovelPromotionPanel', 'panel-1')
    expect(panel?.phase).toBe('processing')
    expect(panel?.runningTaskType).toBe('IMAGE_PANEL')
    expect(panel?.runningTaskId).toBe('task-api-panel')
  })

  it('allows newer overlay to override completed state for immediate rerun feedback', async () => {
    runtime.apiStates = [
      {
        targetType: 'NovelPromotionPanel',
        targetId: 'panel-2',
        phase: 'completed',
        runningTaskId: null,
        runningTaskType: null,
        intent: 'generate',
        hasOutputAtStart: true,
        progress: 100,
        stage: null,
        stageLabel: null,
        lastError: null,
        updatedAt: '2026-02-27T00:00:00.000Z',
      },
    ]
    runtime.overlayStates = {
      'NovelPromotionPanel:panel-2': {
        targetType: 'NovelPromotionPanel',
        targetId: 'panel-2',
        phase: 'queued',
        runningTaskId: 'task-overlay-new',
        runningTaskType: 'VIDEO_PANEL',
        intent: 'generate',
        hasOutputAtStart: true,
        progress: null,
        stage: null,
        stageLabel: null,
        updatedAt: '2026-02-27T00:00:01.000Z',
        lastError: null,
        expiresAt: Date.now() + 30_000,
      },
    }

    const { useTaskTargetStateMap } = await import('@/lib/query/hooks/useTaskTargetStateMap')

    const result = useTaskTargetStateMap('project-1', [
      { targetType: 'NovelPromotionPanel', targetId: 'panel-2', types: ['VIDEO_PANEL'] },
    ])

    const state = result.getState('NovelPromotionPanel', 'panel-2')
    expect(state?.phase).toBe('queued')
    expect(state?.runningTaskId).toBe('task-overlay-new')
    expect(state?.runningTaskType).toBe('VIDEO_PANEL')
  })

  it('allows active overlay to override completed state even with timestamp skew', async () => {
    runtime.apiStates = [
      {
        targetType: 'NovelPromotionPanel',
        targetId: 'panel-3',
        phase: 'completed',
        runningTaskId: null,
        runningTaskType: null,
        intent: 'generate',
        hasOutputAtStart: true,
        progress: 100,
        stage: null,
        stageLabel: null,
        lastError: null,
        updatedAt: '2026-02-27T00:00:05.000Z',
      },
    ]
    runtime.overlayStates = {
      'NovelPromotionPanel:panel-3': {
        targetType: 'NovelPromotionPanel',
        targetId: 'panel-3',
        phase: 'queued',
        runningTaskId: 'task-overlay-old',
        runningTaskType: 'VIDEO_PANEL',
        intent: 'generate',
        hasOutputAtStart: true,
        progress: null,
        stage: null,
        stageLabel: null,
        updatedAt: '2026-02-27T00:00:01.000Z',
        lastError: null,
        expiresAt: Date.now() + 30_000,
      },
    }

    const { useTaskTargetStateMap } = await import('@/lib/query/hooks/useTaskTargetStateMap')

    const result = useTaskTargetStateMap('project-1', [
      { targetType: 'NovelPromotionPanel', targetId: 'panel-3', types: ['VIDEO_PANEL'] },
    ])

    const state = result.getState('NovelPromotionPanel', 'panel-3')
    expect(state?.phase).toBe('queued')
    expect(state?.runningTaskId).toBe('task-overlay-old')
    expect(state?.runningTaskType).toBe('VIDEO_PANEL')
  })

  it('matches task type whitelist case-insensitively', async () => {
    runtime.apiStates = [
      {
        targetType: 'NovelPromotionPanel',
        targetId: 'panel-4',
        phase: 'idle',
        runningTaskId: null,
        runningTaskType: null,
        intent: 'generate',
        hasOutputAtStart: null,
        progress: null,
        stage: null,
        stageLabel: null,
        lastError: null,
        updatedAt: null,
      },
    ]
    runtime.overlayStates = {
      'NovelPromotionPanel:panel-4': {
        targetType: 'NovelPromotionPanel',
        targetId: 'panel-4',
        phase: 'processing',
        runningTaskId: 'task-overlay-upper',
        runningTaskType: 'VIDEO_PANEL',
        intent: 'generate',
        hasOutputAtStart: false,
        progress: 15,
        stage: 'generate_panel_video',
        stageLabel: '生成中',
        updatedAt: '2026-02-27T00:00:10.000Z',
        lastError: null,
        expiresAt: Date.now() + 30_000,
      },
    }

    const { useTaskTargetStateMap } = await import('@/lib/query/hooks/useTaskTargetStateMap')

    const result = useTaskTargetStateMap('project-1', [
      { targetType: 'NovelPromotionPanel', targetId: 'panel-4', types: ['video_panel'] },
    ])

    const state = result.getState('NovelPromotionPanel', 'panel-4')
    expect(state?.phase).toBe('processing')
    expect(state?.runningTaskType).toBe('VIDEO_PANEL')
    expect(state?.runningTaskId).toBe('task-overlay-upper')
  })
})
