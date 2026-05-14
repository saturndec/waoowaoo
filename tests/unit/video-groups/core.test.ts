import { describe, expect, it } from 'vitest'
import {
  chunkVideoGroupShots,
  inferVideoGridModeForShotCount,
  validateVideoGroupShotNumbers,
} from '@/lib/video-groups/core'

describe('video group core', () => {
  it('validates partial contiguous 2x2 and 3x3 shot ranges', () => {
    expect(validateVideoGroupShotNumbers({ gridMode: '2x2', shotNumbers: [1, 2] })).toEqual([1, 2])
    expect(validateVideoGroupShotNumbers({ gridMode: '2x2', shotNumbers: [1, 2, 3] })).toEqual([1, 2, 3])
    expect(validateVideoGroupShotNumbers({ gridMode: '2x2', shotNumbers: [1, 2, 3, 4] })).toEqual([1, 2, 3, 4])
    expect(validateVideoGroupShotNumbers({ gridMode: '3x3', shotNumbers: [1, 2, 3, 4, 5, 6, 7] })).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(validateVideoGroupShotNumbers({ gridMode: '3x3', shotNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9] })).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(() => validateVideoGroupShotNumbers({ gridMode: '2x2', shotNumbers: [1, 2, 4, 5] })).toThrow('VIDEO_GROUP_SHOT_NUMBERS_NOT_CONTINUOUS')
    expect(() => validateVideoGroupShotNumbers({ gridMode: '2x2', shotNumbers: [1] })).toThrow('VIDEO_GROUP_SHOT_COUNT_MISMATCH')
    expect(() => validateVideoGroupShotNumbers({ gridMode: '2x2', shotNumbers: [1, 2, 3, 4, 5] })).toThrow('VIDEO_GROUP_SHOT_COUNT_MISMATCH')
  })

  it('chunks full and final partial grid groups in edit-first order', () => {
    expect(chunkVideoGroupShots({ gridMode: '2x2', shotNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9] })).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ])
    expect(chunkVideoGroupShots({ gridMode: '2x2', shotNumbers: [1, 2, 3, 4, 5, 6, 7] })).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7],
    ])
    expect(chunkVideoGroupShots({ gridMode: '3x3', shotNumbers: [1, 2, 3, 4] })).toEqual([[1, 2, 3, 4]])
  })

  it('infers the compact reference grid mode from group size', () => {
    expect(inferVideoGridModeForShotCount(2)).toBe('2x2')
    expect(inferVideoGridModeForShotCount(4)).toBe('2x2')
    expect(inferVideoGridModeForShotCount(5)).toBe('3x3')
    expect(inferVideoGridModeForShotCount(9)).toBe('3x3')
    expect(() => inferVideoGridModeForShotCount(1)).toThrow('VIDEO_GROUP_SHOT_COUNT_UNSUPPORTED')
  })

})
