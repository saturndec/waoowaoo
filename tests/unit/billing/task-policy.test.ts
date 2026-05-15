import { describe, expect, it } from 'vitest'
import '@/lib/ai-providers'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo, isBillableTaskType } from '@/lib/billing/task-policy'
import type { TaskBillingInfo } from '@/lib/task/types'

function expectBillableInfo(info: TaskBillingInfo | null): Extract<TaskBillingInfo, { billable: true }> {
  expect(info).toBeTruthy()
  expect(info?.billable).toBe(true)
  if (!info || !info.billable) {
    throw new Error('Expected billable task billing info')
  }
  return info
}

describe('billing/task-policy', () => {
  const billingPayload = {
    analysisModel: 'anthropic/claude-sonnet-4',
    imageModel: 'ark::doubao-seedream-4-5-251128',
    videoModel: 'doubao-seedance-1-5-pro-251215',
  } as const

  it('builds TaskBillingInfo for every billable task type', () => {
    for (const taskType of Object.values(TASK_TYPE)) {
      if (!isBillableTaskType(taskType)) continue
      if (taskType === TASK_TYPE.MUSIC_GENERATE || taskType === TASK_TYPE.BGM_SCORE_GENERATE) continue
      const info = expectBillableInfo(buildDefaultTaskBillingInfo(taskType, billingPayload))
      expect(info.taskType).toBe(taskType)
      expect(info.maxFrozenCost).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns null for a non-billable task type', () => {
    const fake = 'not_billable' as unknown as (typeof TASK_TYPE)[keyof typeof TASK_TYPE]
    expect(isBillableTaskType(fake)).toBe(false)
    expect(buildDefaultTaskBillingInfo(fake, {})).toBeNull()
  })

  it('builds text billing info from explicit model payload', () => {
    const info = expectBillableInfo(buildDefaultTaskBillingInfo(TASK_TYPE.ANALYZE_NOVEL, {
      analysisModel: 'anthropic/claude-sonnet-4',
    }))
    expect(info.apiType).toBe('text')
    expect(info.model).toBe('anthropic/claude-sonnet-4')
    expect(info.quantity).toBe(4200)
  })

  it('returns null for missing required models in text/image/video tasks', () => {
    expect(buildDefaultTaskBillingInfo(TASK_TYPE.ANALYZE_NOVEL, {})).toBeNull()
    expect(buildDefaultTaskBillingInfo(TASK_TYPE.IMAGE_PANEL, {})).toBeNull()
    expect(buildDefaultTaskBillingInfo(TASK_TYPE.VIDEO_PANEL, {})).toBeNull()
    expect(buildDefaultTaskBillingInfo(TASK_TYPE.MUSIC_GENERATE, {})).toBeNull()
    expect(buildDefaultTaskBillingInfo(TASK_TYPE.BGM_SCORE_GENERATE, {})).toBeNull()
  })

  it('builds music billing info for built-in Google Lyria models', () => {
    const clipInfo = expectBillableInfo(buildDefaultTaskBillingInfo(TASK_TYPE.MUSIC_GENERATE, {
      musicModel: 'google::lyria-3-clip-preview',
      durationSeconds: 30,
    }))
    expect(clipInfo.apiType).toBe('music')
    expect(clipInfo.model).toBe('google::lyria-3-clip-preview')
    expect(clipInfo.quantity).toBe(30)
    expect(clipInfo.maxFrozenCost).toBeGreaterThan(0)

    const proInfo = expectBillableInfo(buildDefaultTaskBillingInfo(TASK_TYPE.BGM_SCORE_GENERATE, {
      musicModel: 'google::lyria-3-pro-preview',
      durationSeconds: 60,
    }))
    expect(proInfo.apiType).toBe('music')
    expect(proInfo.model).toBe('google::lyria-3-pro-preview')
    expect(proInfo.quantity).toBe(60)
    expect(proInfo.maxFrozenCost).toBeGreaterThan(0)
  })

  it('fails music billing explicitly when model pricing is not configured', () => {
    expect(() => buildDefaultTaskBillingInfo(TASK_TYPE.MUSIC_GENERATE, {
      musicModel: 'google::unknown-music',
      durationSeconds: 30,
    })).toThrow('Unknown music model pricing')
  })

  it('honors candidateCount/count for image tasks', () => {
    const info = expectBillableInfo(buildDefaultTaskBillingInfo(TASK_TYPE.IMAGE_PANEL, {
      candidateCount: 4,
      imageModel: 'ark::doubao-seedream-4-0-250828',
    }))
    expect(info.apiType).toBe('image')
    expect(info.quantity).toBe(4)
    expect(info.model).toBe('ark::doubao-seedream-4-0-250828')
  })

  it('builds video billing info from firstLastFrame.flModel', () => {
    const info = expectBillableInfo(buildDefaultTaskBillingInfo(TASK_TYPE.VIDEO_PANEL, {
      firstLastFrame: {
        flModel: 'doubao-seedance-1-0-pro-250528',
      },
      duration: 8,
    }))
    expect(info.apiType).toBe('video')
    expect(info.model).toBe('doubao-seedance-1-0-pro-250528')
    expect(info.quantity).toBe(1)
  })

  it('uses explicit lip sync model from payload', () => {
    const info = expectBillableInfo(buildDefaultTaskBillingInfo(TASK_TYPE.LIP_SYNC, {
      lipSyncModel: 'vidu::vidu-lipsync',
    }))
    expect(info.apiType).toBe('lip-sync')
    expect(info.model).toBe('vidu::vidu-lipsync')
    expect(info.quantity).toBe(1)
  })
})
