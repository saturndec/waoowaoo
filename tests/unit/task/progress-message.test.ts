import { describe, expect, it } from 'vitest'
import {
  buildTaskProgressMessage,
  getTaskStageLabel,
  isProgressContractKey,
  normalizeTaskStageLabel,
} from '@/lib/task/progress-message'

describe('task progress message contract normalization', () => {
  it('maps known stage to stable progress key', () => {
    expect(getTaskStageLabel('analyze_global_prepare')).toBe('progress.stage.analyzeGlobalPrepare')
    expect(normalizeTaskStageLabel('analyze_global_prepare', '准备全局资产分析参数')).toBe('progress.stage.analyzeGlobalPrepare')
  })

  it('rejects unknown and localized stage labels', () => {
    expect(getTaskStageLabel('unknown_stage')).toBeNull()
    expect(normalizeTaskStageLabel('unknown_stage', '任务处理中')).toBeNull()
  })

  it('keeps only progress.* message contract', () => {
    expect(isProgressContractKey('progress.runtime.taskFailed')).toBe(true)
    expect(isProgressContractKey('任务失败')).toBe(false)
    expect(isProgressContractKey(null)).toBe(false)
  })

  it('builds processing message from normalized stage contract key', () => {
    const message = buildTaskProgressMessage({
      eventType: 'task.processing',
      payload: {
        stage: 'analyze_global_prepare',
        stageLabel: '准备全局资产分析参数',
      },
    })
    expect(message).toBe('progress.stage.analyzeGlobalPrepare')
  })

  it('falls back to runtime processing message when localized message provided', () => {
    const message = buildTaskProgressMessage({
      eventType: 'task.processing',
      payload: {
        message: '处理中',
        stage: 'unknown_stage',
      },
    })
    expect(message).toBe('progress.runtime.taskStarted')
  })
})
