import { describe, expect, it } from 'vitest'
import {
  buildWebtoonScrollNarrativePreview,
  createAddPayload,
  createDuplicatePayload,
  createMergePayload,
  createReorderPayload,
  createSplitPayloads,
  planWebtoonQuickActionMutation,
  WEBTOON_PANEL_QUICK_ACTIONS,
} from '@/lib/workspace/webtoon-panel-controls'

describe('webtoon panel controls helpers (VAT-133 P0)', () => {
  it('exposes 5 panel-first quick actions', () => {
    expect(WEBTOON_PANEL_QUICK_ACTIONS.map((x) => x.id)).toEqual([
      'add',
      'duplicate',
      'split',
      'merge',
      'reorder',
    ])
  })

  it('builds dense-six-panel preview with stable shape and normalized heights', () => {
    const preview = buildWebtoonScrollNarrativePreview({
      panelSlotCount: 6,
      layoutFamily: 'dense-six-panel',
    })

    expect(preview).toHaveLength(6)
    expect(preview[0]?.emphasis).toBe('anchor')
    expect(preview[5]?.emphasis).toBe('transition')
    expect(preview.slice(1, -1).every((item) => item.emphasis === 'support')).toBe(true)

    const sum = preview.reduce((acc, item) => acc + item.relativeHeight, 0)
    expect(sum).toBeGreaterThan(0.98)
    expect(sum).toBeLessThan(1.02)
  })

  it('uses fallback weights when layout family is unknown', () => {
    const preview = buildWebtoonScrollNarrativePreview({
      panelSlotCount: 4,
      layoutFamily: 'unknown-family',
    })

    expect(preview).toHaveLength(4)
    expect(preview[0]?.panelIndex).toBe(1)
    expect(preview[3]?.panelIndex).toBe(4)
    expect(preview[0]?.relativeHeight).toBeLessThan(preview[3]?.relativeHeight ?? 0)
  })

  it('builds add payload from anchor panel', () => {
    const payload = createAddPayload({
      anchor: {
        id: 'p1',
        storyboardId: 'sb1',
        panelIndex: 2,
        shotType: 'Close-up',
        cameraMove: 'Static',
        description: 'Anchor beat',
        location: 'Cafe',
        characters: '[{"name":"A"}]',
        srtStart: 1.2,
        srtEnd: 2.8,
        duration: 1.6,
        videoPrompt: 'anchor prompt',
      },
    })

    expect(payload.storyboardId).toBe('sb1')
    expect(payload.shotType).toBe('Close-up')
    expect(payload.description).toBe('Anchor beat')
    expect(payload.characters).toContain('A')
  })

  it('creates split payload pair and keeps duration balanced', () => {
    const [left, right] = createSplitPayloads({
      id: 'p2',
      storyboardId: 'sb1',
      panelIndex: 1,
      description: 'Long beat',
      duration: 5,
      characters: '[]',
    })

    expect(left.description).toContain('Part 1')
    expect(right.description).toContain('Part 2')
    expect((left.duration ?? 0) + (right.duration ?? 0)).toBeCloseTo(5, 3)
  })

  it('creates merge payload with combined description/characters', () => {
    const payload = createMergePayload({
      left: {
        id: 'p3',
        storyboardId: 'sb1',
        panelIndex: 1,
        description: 'Beat A',
        characters: '[{"name":"Hero"}]',
        duration: 1.1,
      },
      right: {
        id: 'p4',
        storyboardId: 'sb1',
        panelIndex: 2,
        description: 'Beat B',
        characters: '[{"name":"Hero"},{"name":"Friend"}]',
        duration: 1.4,
      },
    })

    expect(payload.description).toContain('Beat A')
    expect(payload.description).toContain('Beat B')
    expect(payload.characters).toContain('Hero')
    expect(payload.characters).toContain('Friend')
    expect(payload.duration).toBeCloseTo(2.5, 3)
  })

  it('duplicate/reorder payload helpers keep storyboard continuity shape', () => {
    const panel = {
      id: 'p5',
      storyboardId: 'sb9',
      panelIndex: 0,
      description: 'Beat keep',
      characters: '[]',
      duration: 1,
    }

    const duplicate = createDuplicatePayload(panel)
    const reorder = createReorderPayload(panel)

    expect(duplicate.storyboardId).toBe('sb9')
    expect(reorder.storyboardId).toBe('sb9')
    expect(duplicate.description).toContain('Beat keep')
    expect(reorder.description).toContain('Beat keep')
  })

  it('plans split mutation as delete+create pair with stable expected order markers', () => {
    const plan = planWebtoonQuickActionMutation({
      action: 'split',
      panels: [
        { id: 'p1', storyboardId: 'sb1', panelIndex: 0, description: 'A', characters: '[]' },
        { id: 'p2', storyboardId: 'sb1', panelIndex: 1, description: 'B', characters: '[]', duration: 4 },
        { id: 'p3', storyboardId: 'sb1', panelIndex: 2, description: 'C', characters: '[]' },
      ],
      selectedPanelId: 'p2',
    })

    expect(plan.deletePanelIds).toEqual(['p2'])
    expect(plan.createPayloads).toHaveLength(2)
    expect(plan.expectedAfterOrder).toEqual([
      'p1',
      '__new_split_left_of_p2__',
      '__new_split_right_of_p2__',
      'p3',
    ])
  })

  it('plans merge mutation with adjacency guard and deterministic replacement marker', () => {
    const plan = planWebtoonQuickActionMutation({
      action: 'merge',
      panels: [
        { id: 'p1', storyboardId: 'sb1', panelIndex: 0, description: 'A', characters: '[]' },
        { id: 'p2', storyboardId: 'sb1', panelIndex: 1, description: 'B', characters: '[]' },
        { id: 'p3', storyboardId: 'sb1', panelIndex: 2, description: 'C', characters: '[]' },
      ],
      selectedPanelId: 'p2',
    })

    expect(plan.deletePanelIds).toEqual(['p2', 'p1'])
    expect(plan.createPayloads).toHaveLength(1)
    expect(plan.expectedAfterOrder).toEqual(['__new_merge_p1_p2__', 'p3'])
  })

  it('plans reorder mutation by moving head panel to tail order', () => {
    const plan = planWebtoonQuickActionMutation({
      action: 'reorder',
      panels: [
        { id: 'p1', storyboardId: 'sb1', panelIndex: 0, description: 'A', characters: '[]' },
        { id: 'p2', storyboardId: 'sb1', panelIndex: 1, description: 'B', characters: '[]' },
        { id: 'p3', storyboardId: 'sb1', panelIndex: 2, description: 'C', characters: '[]' },
      ],
      selectedPanelId: 'p3',
    })

    expect(plan.deletePanelIds).toEqual(['p1'])
    expect(plan.createPayloads).toHaveLength(1)
    expect(plan.expectedAfterOrder).toEqual(['p2', 'p3', 'p1'])
  })

  it('supports add quick action even when storyboard has zero panels', () => {
    const plan = planWebtoonQuickActionMutation({
      action: 'add',
      panels: [],
      fallbackStoryboardId: 'sb-empty',
    })

    expect(plan.selectedPanelId).toBeNull()
    expect(plan.deletePanelIds).toEqual([])
    expect(plan.createPayloads).toHaveLength(1)
    expect(plan.createPayloads[0]?.storyboardId).toBe('sb-empty')
    expect(plan.expectedAfterOrder).toEqual(['__new_add__'])
  })

  it('guards add when no storyboard fallback id is provided', () => {
    expect(() => planWebtoonQuickActionMutation({
      action: 'add',
      panels: [],
    })).toThrow('No storyboard to add panel')
  })

  it('guards merge/reorder edge cases with explicit errors', () => {
    expect(() => planWebtoonQuickActionMutation({
      action: 'merge',
      panels: [
        { id: 'p1', storyboardId: 'sb1', panelIndex: 0, description: 'A', characters: '[]' },
      ],
      selectedPanelId: 'p1',
    })).toThrow('Need at least 2 adjacent panels to merge')

    expect(() => planWebtoonQuickActionMutation({
      action: 'reorder',
      panels: [
        { id: 'p1', storyboardId: 'sb1', panelIndex: 0, description: 'A', characters: '[]' },
      ],
      selectedPanelId: 'p1',
    })).toThrow('Need at least 2 panels to reorder')
  })
})
