import { describe, expect, it } from 'vitest'
import {
  asBoolean,
  asNonEmptyString,
  asObject,
  buildIdleState,
  pairKey,
  resolveTargetState,
  toProgress,
} from '@/lib/task/state-service'
import { getTaskStageLabel } from '@/lib/task/progress-message'

describe('task state service helpers', () => {
  it('normalizes primitive parsing helpers', () => {
    expect(pairKey('A', 'B')).toBe('A:B')
    expect(asObject({ ok: true })).toEqual({ ok: true })
    expect(asObject(['x'])).toBeNull()
    expect(asNonEmptyString(' x ')).toBe('x')
    expect(asNonEmptyString('  ')).toBeNull()
    expect(asBoolean(true)).toBe(true)
    expect(asBoolean('true')).toBeNull()
    expect(toProgress(101)).toBe(100)
    expect(toProgress(-5)).toBe(0)
    expect(toProgress(Number.NaN)).toBeNull()
  })

  it('builds idle state when no tasks found', () => {
    const idle = buildIdleState({ targetType: 'GlobalCharacter', targetId: 'c1' })
    expect(idle.phase).toBe('idle')
    expect(idle.runningTaskId).toBeNull()
    expect(idle.lastError).toBeNull()
  })

  it('resolves processing state from active task', () => {
    const state = resolveTargetState(
      { targetType: 'GlobalCharacter', targetId: 'c1' },
      [
        {
          id: 'task-1',
          type: 'asset_hub_image',
          status: 'processing',
          progress: 42,
          payload: {
            stage: 'image_generating',
            stageLabel: 'Generating',
            ui: { intent: 'create', hasOutputAtStart: false },
          },
          errorCode: null,
          errorMessage: null,
          updatedAt: new Date('2026-02-25T00:00:00.000Z'),
        },
      ],
    )

    expect(state.phase).toBe('processing')
    expect(state.runningTaskId).toBe('task-1')
    expect(state.progress).toBe(42)
    expect(state.stage).toBe('image_generating')
    expect(state.stageLabel).toBeNull()
  })

  it('normalizes legacy localized stageLabel into stable progress key', () => {
    const state = resolveTargetState(
      { targetType: 'GlobalCharacter', targetId: 'c1' },
      [
        {
          id: 'task-legacy-1',
          type: 'analyze_global',
          status: 'processing',
          progress: 42,
          payload: {
            stage: 'analyze_global_prepare',
            stageLabel: '准备全局资产分析参数',
            ui: { intent: 'process', hasOutputAtStart: false },
          },
          errorCode: null,
          errorMessage: null,
          updatedAt: new Date('2026-02-25T00:00:00.000Z'),
        },
      ],
    )

    expect(state.stage).toBe('analyze_global_prepare')
    expect(state.stageLabel).toBe(getTaskStageLabel('analyze_global_prepare'))
  })

  it('resolves failed state and normalizes error', () => {
    const state = resolveTargetState(
      { targetType: 'GlobalCharacter', targetId: 'c1' },
      [
        {
          id: 'task-2',
          type: 'asset_hub_image',
          status: 'failed',
          progress: 100,
          payload: { ui: { intent: 'modify', hasOutputAtStart: true } },
          errorCode: 'INVALID_PARAMS',
          errorMessage: 'bad input',
          updatedAt: new Date('2026-02-25T00:00:00.000Z'),
        },
      ],
    )

    expect(state.phase).toBe('failed')
    expect(state.runningTaskId).toBeNull()
    expect(state.lastError?.code).toBe('INVALID_PARAMS')
    expect(state.lastError?.message).toBe('bad input')
  })
})
