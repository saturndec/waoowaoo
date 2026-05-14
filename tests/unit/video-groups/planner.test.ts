import { describe, expect, it } from 'vitest'
import { normalizeVideoBlockPlanResponse } from '@/lib/video-groups/planner'

describe('video block plan validator', () => {
  it('normalizes mixed single and group plans in edit-first order', () => {
    const plan = normalizeVideoBlockPlanResponse({
      allShotNumbers: [1, 2, 3, 4, 5],
      response: {
        items: [
          { type: 'single', shotNumbers: [1], reason: 'static product shot', prompt: 'single prompt 1' },
          { type: 'group', shotNumbers: [2, 3, 4], gridMode: '2x2', reason: 'continuous fight movement', prompt: 'group prompt 2-4' },
          { type: 'single', shotNumbers: [5], reason: 'space jumps', prompt: 'single prompt 5' },
        ],
      },
    })

    expect(plan.items).toEqual([
      { kind: 'single', shotNumbers: [1], reason: 'static product shot', prompt: 'single prompt 1' },
      { kind: 'group', shotNumbers: [2, 3, 4], gridMode: '2x2', reason: 'continuous fight movement', prompt: 'group prompt 2-4' },
      { kind: 'single', shotNumbers: [5], reason: 'space jumps', prompt: 'single prompt 5' },
    ])
  })

  it('fails when the plan skips or reorders edit-first shots', () => {
    expect(() => normalizeVideoBlockPlanResponse({
      allShotNumbers: [1, 2, 3],
      response: {
        items: [
          { type: 'single', shotNumbers: [1], reason: 'ok', prompt: 'prompt 1' },
          { type: 'single', shotNumbers: [3], reason: 'skip', prompt: 'prompt 3' },
        ],
      },
    })).toThrow('VIDEO_BLOCK_PLAN_SHOT_COVERAGE_INVALID')
  })

  it('requires final prompts for every planned video block', () => {
    expect(() => normalizeVideoBlockPlanResponse({
      allShotNumbers: [1],
      response: {
        items: [{ type: 'single', shotNumbers: [1], reason: 'missing prompt' }],
      },
    })).toThrow('VIDEO_BLOCK_PLAN_PROMPT_REQUIRED')
  })

  it('rejects invalid group sizes and wrong grid modes', () => {
    expect(() => normalizeVideoBlockPlanResponse({
      allShotNumbers: [1],
      response: {
        items: [{ type: 'group', shotNumbers: [1], gridMode: '2x2', reason: 'too short', prompt: 'group prompt' }],
      },
    })).toThrow('VIDEO_GROUP_SHOT_COUNT_UNSUPPORTED')

    expect(() => normalizeVideoBlockPlanResponse({
      allShotNumbers: [1, 2, 3, 4, 5],
      response: {
        items: [{ type: 'group', shotNumbers: [1, 2, 3, 4, 5], gridMode: '2x2', reason: 'wrong grid', prompt: 'group prompt' }],
      },
    })).toThrow('VIDEO_BLOCK_PLAN_GRID_MODE_MISMATCH')
  })

})
