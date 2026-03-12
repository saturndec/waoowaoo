export type WebtoonPanelQuickAction = 'add' | 'duplicate' | 'split' | 'merge' | 'reorder'

export interface WebtoonQuickActionMeta {
  id: WebtoonPanelQuickAction
  label: string
  helper: string
}

export interface WebtoonScrollPreviewItem {
  id: string
  panelIndex: number
  relativeHeight: number
  emphasis: 'anchor' | 'support' | 'transition'
}

export interface WebtoonQuickActionPanelLite {
  id: string
  storyboardId: string
  panelIndex: number
  panelNumber?: number | null
  shotType?: string | null
  cameraMove?: string | null
  description?: string | null
  location?: string | null
  characters?: string | null
  srtStart?: number | null
  srtEnd?: number | null
  duration?: number | null
  videoPrompt?: string | null
}

export interface WebtoonQuickActionCreatePayload {
  storyboardId: string
  shotType: string
  cameraMove: string
  description: string
  location: string | null
  characters: string
  srtStart: number | null
  srtEnd: number | null
  duration: number | null
  videoPrompt: string
}

export const WEBTOON_PANEL_QUICK_ACTIONS: WebtoonQuickActionMeta[] = [
  { id: 'add', label: 'Add', helper: 'Thêm panel mới ở nhịp hiện tại.' },
  { id: 'duplicate', label: 'Duplicate', helper: 'Nhân bản panel để giữ continuity.' },
  { id: 'split', label: 'Split', helper: 'Chia panel dài thành 2 beat rõ hơn.' },
  { id: 'merge', label: 'Merge', helper: 'Gộp panel ngắn để giảm nhiễu nhịp đọc.' },
  { id: 'reorder', label: 'Reorder', helper: 'Đổi thứ tự beat để tối ưu flow dọc.' },
]

function safeNumber(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function parseCharacters(raw: string | null | undefined): Array<{ name: string; appearance?: string }> {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string')
      .map((item) => ({
        name: String((item as { name: string }).name),
        appearance: typeof (item as { appearance?: unknown }).appearance === 'string'
          ? String((item as { appearance?: string }).appearance)
          : undefined,
      }))
  } catch {
    return []
  }
}

function stringifyCharacters(items: Array<{ name: string; appearance?: string }>): string {
  return JSON.stringify(items.map((item) => ({
    name: item.name,
    ...(item.appearance ? { appearance: item.appearance } : {}),
  })))
}

export function createAddPayload(params: {
  anchor: WebtoonQuickActionPanelLite
  fallbackShotType?: string
  fallbackCameraMove?: string
}): WebtoonQuickActionCreatePayload {
  const anchor = params.anchor
  return {
    storyboardId: anchor.storyboardId,
    shotType: anchor.shotType || params.fallbackShotType || 'Medium shot',
    cameraMove: anchor.cameraMove || params.fallbackCameraMove || 'Static',
    description: anchor.description || 'New panel beat',
    location: anchor.location ?? null,
    characters: anchor.characters || '[]',
    srtStart: safeNumber(anchor.srtStart),
    srtEnd: safeNumber(anchor.srtEnd),
    duration: safeNumber(anchor.duration),
    videoPrompt: anchor.videoPrompt || '',
  }
}

export function createDuplicatePayload(panel: WebtoonQuickActionPanelLite): WebtoonQuickActionCreatePayload {
  return {
    storyboardId: panel.storyboardId,
    shotType: panel.shotType || 'Medium shot',
    cameraMove: panel.cameraMove || 'Static',
    description: panel.description || 'Duplicated panel',
    location: panel.location ?? null,
    characters: panel.characters || '[]',
    srtStart: safeNumber(panel.srtStart),
    srtEnd: safeNumber(panel.srtEnd),
    duration: safeNumber(panel.duration),
    videoPrompt: panel.videoPrompt || '',
  }
}

export function createSplitPayloads(panel: WebtoonQuickActionPanelLite): [WebtoonQuickActionCreatePayload, WebtoonQuickActionCreatePayload] {
  const rawDuration = safeNumber(panel.duration)
  const durationA = rawDuration !== null ? Number((rawDuration / 2).toFixed(3)) : null
  const durationB = rawDuration !== null ? Number((rawDuration - durationA!).toFixed(3)) : null

  const left: WebtoonQuickActionCreatePayload = {
    storyboardId: panel.storyboardId,
    shotType: panel.shotType || 'Medium shot',
    cameraMove: panel.cameraMove || 'Static',
    description: panel.description ? `${panel.description} (Part 1)` : 'Split beat (Part 1)',
    location: panel.location ?? null,
    characters: panel.characters || '[]',
    srtStart: safeNumber(panel.srtStart),
    srtEnd: safeNumber(panel.srtEnd),
    duration: durationA,
    videoPrompt: panel.videoPrompt || '',
  }

  const right: WebtoonQuickActionCreatePayload = {
    storyboardId: panel.storyboardId,
    shotType: panel.shotType || 'Medium shot',
    cameraMove: panel.cameraMove || 'Static',
    description: panel.description ? `${panel.description} (Part 2)` : 'Split beat (Part 2)',
    location: panel.location ?? null,
    characters: panel.characters || '[]',
    srtStart: safeNumber(panel.srtStart),
    srtEnd: safeNumber(panel.srtEnd),
    duration: durationB,
    videoPrompt: panel.videoPrompt || '',
  }

  return [left, right]
}

export function createMergePayload(params: {
  left: WebtoonQuickActionPanelLite
  right: WebtoonQuickActionPanelLite
}): WebtoonQuickActionCreatePayload {
  const { left, right } = params
  const leftChars = parseCharacters(left.characters)
  const rightChars = parseCharacters(right.characters)
  const mergedCharsMap = new Map<string, { name: string; appearance?: string }>()

  for (const char of [...leftChars, ...rightChars]) {
    const key = `${char.name}::${char.appearance || ''}`
    if (!mergedCharsMap.has(key)) {
      mergedCharsMap.set(key, char)
    }
  }

  const mergedDuration = (() => {
    const a = safeNumber(left.duration)
    const b = safeNumber(right.duration)
    if (a !== null && b !== null) return Number((a + b).toFixed(3))
    if (a !== null) return a
    if (b !== null) return b
    return null
  })()

  const mergedDescription = [left.description, right.description]
    .map((text) => (typeof text === 'string' ? text.trim() : ''))
    .filter(Boolean)
    .join(' → ')

  return {
    storyboardId: left.storyboardId,
    shotType: left.shotType || right.shotType || 'Medium shot',
    cameraMove: left.cameraMove || right.cameraMove || 'Static',
    description: mergedDescription || 'Merged panel beat',
    location: left.location ?? right.location ?? null,
    characters: stringifyCharacters(Array.from(mergedCharsMap.values())),
    srtStart: safeNumber(left.srtStart) ?? safeNumber(right.srtStart),
    srtEnd: safeNumber(right.srtEnd) ?? safeNumber(left.srtEnd),
    duration: mergedDuration,
    videoPrompt: left.videoPrompt || right.videoPrompt || '',
  }
}

export function createReorderPayload(panel: WebtoonQuickActionPanelLite): WebtoonQuickActionCreatePayload {
  return {
    storyboardId: panel.storyboardId,
    shotType: panel.shotType || 'Medium shot',
    cameraMove: panel.cameraMove || 'Static',
    description: panel.description || 'Reordered panel beat',
    location: panel.location ?? null,
    characters: panel.characters || '[]',
    srtStart: safeNumber(panel.srtStart),
    srtEnd: safeNumber(panel.srtEnd),
    duration: safeNumber(panel.duration),
    videoPrompt: panel.videoPrompt || '',
  }
}

export interface WebtoonQuickActionMutationPlan {
  action: WebtoonPanelQuickAction
  selectedPanelId: string | null
  deletePanelIds: string[]
  createPayloads: WebtoonQuickActionCreatePayload[]
  beforeOrder: string[]
  expectedAfterOrder: string[]
}

export function planWebtoonQuickActionMutation(input: {
  action: WebtoonPanelQuickAction
  panels: WebtoonQuickActionPanelLite[]
  selectedPanelId?: string | null
  fallbackStoryboardId?: string | null
}): WebtoonQuickActionMutationPlan {
  const orderedPanels = [...input.panels].sort((a, b) => a.panelIndex - b.panelIndex)
  if (orderedPanels.length === 0) {
    if (input.action !== 'add') {
      throw new Error('Chưa có storyboard/panel để thao tác quick actions.')
    }

    const storyboardId = typeof input.fallbackStoryboardId === 'string' && input.fallbackStoryboardId.trim()
      ? input.fallbackStoryboardId.trim()
      : null

    if (!storyboardId) {
      throw new Error('No storyboard to add panel')
    }

    return {
      action: input.action,
      selectedPanelId: null,
      deletePanelIds: [],
      createPayloads: [{
        storyboardId,
        shotType: 'Medium shot',
        cameraMove: 'Static',
        description: 'New panel beat',
        location: null,
        characters: '[]',
        srtStart: null,
        srtEnd: null,
        duration: null,
        videoPrompt: '',
      }],
      beforeOrder: [],
      expectedAfterOrder: ['__new_add__'],
    }
  }

  const selected = input.selectedPanelId
    ? orderedPanels.find((panel) => panel.id === input.selectedPanelId) || null
    : orderedPanels[orderedPanels.length - 1] || null

  if (!selected) {
    throw new Error('No source panel to reorder')
  }

  const beforeOrder = orderedPanels.map((panel) => panel.id)

  if (input.action === 'add') {
    return {
      action: input.action,
      selectedPanelId: selected.id,
      deletePanelIds: [],
      createPayloads: [createAddPayload({ anchor: selected })],
      beforeOrder,
      expectedAfterOrder: [...beforeOrder, '__new_add__'],
    }
  }

  if (input.action === 'duplicate') {
    return {
      action: input.action,
      selectedPanelId: selected.id,
      deletePanelIds: [],
      createPayloads: [createDuplicatePayload(selected)],
      beforeOrder,
      expectedAfterOrder: [...beforeOrder, `__new_duplicate_of_${selected.id}__`],
    }
  }

  if (input.action === 'split') {
    const [left, right] = createSplitPayloads(selected)
    return {
      action: input.action,
      selectedPanelId: selected.id,
      deletePanelIds: [selected.id],
      createPayloads: [left, right],
      beforeOrder,
      expectedAfterOrder: beforeOrder.flatMap((id) => (
        id === selected.id
          ? [`__new_split_left_of_${selected.id}__`, `__new_split_right_of_${selected.id}__`]
          : [id]
      )),
    }
  }

  if (input.action === 'merge') {
    const selectedIndex = orderedPanels.findIndex((panel) => panel.id === selected.id)
    if (selectedIndex <= 0) {
      throw new Error('Need at least 2 adjacent panels to merge')
    }

    const previous = orderedPanels[selectedIndex - 1]
    if (!previous) {
      throw new Error('Need previous adjacent panel to merge')
    }

    return {
      action: input.action,
      selectedPanelId: selected.id,
      deletePanelIds: [selected.id, previous.id],
      createPayloads: [createMergePayload({ left: previous, right: selected })],
      beforeOrder,
      expectedAfterOrder: beforeOrder.flatMap((id) => (
        id === previous.id
          ? [`__new_merge_${previous.id}_${selected.id}__`]
          : id === selected.id
            ? []
            : [id]
      )),
    }
  }

  if (input.action === 'reorder') {
    if (orderedPanels.length < 2) {
      throw new Error('Need at least 2 panels to reorder')
    }
    const head = orderedPanels[0]
    if (!head) {
      throw new Error('No source panel to reorder')
    }

    return {
      action: input.action,
      selectedPanelId: selected.id,
      deletePanelIds: [head.id],
      createPayloads: [createReorderPayload(head)],
      beforeOrder,
      expectedAfterOrder: [...beforeOrder.slice(1), head.id],
    }
  }

  return {
    action: input.action,
    selectedPanelId: selected.id,
    deletePanelIds: [],
    createPayloads: [],
    beforeOrder,
    expectedAfterOrder: beforeOrder,
  }
}

function normalize(weights: number[]): number[] {
  const safe = weights.map((n) => (Number.isFinite(n) && n > 0 ? n : 1))
  const total = safe.reduce((sum, n) => sum + n, 0)
  if (total <= 0) return safe.map(() => 1 / safe.length)
  return safe.map((n) => Number((n / total).toFixed(3)))
}

function fallbackWeights(panelSlotCount: number): number[] {
  const count = Math.max(1, Math.min(12, Math.trunc(panelSlotCount) || 1))
  return Array.from({ length: count }, (_, i) => 1 + i * 0.08)
}

export function buildWebtoonScrollNarrativePreview(input: {
  panelSlotCount: number
  layoutFamily?: string
}): WebtoonScrollPreviewItem[] {
  const family = input.layoutFamily || ''

  let weights: number[]
  if (family === 'single-splash') {
    weights = [1]
  } else if (family === 'dual-split' || family === 'dual-hero-support') {
    weights = [0.54, 0.46]
  } else if (family === 'triple-strip' || family === 'triple-focus') {
    weights = [0.28, 0.33, 0.39]
  } else if (family.startsWith('quad-')) {
    weights = [0.2, 0.23, 0.27, 0.3]
  } else if (family === 'dense-six-panel') {
    weights = [0.12, 0.14, 0.16, 0.17, 0.2, 0.21]
  } else if (family.startsWith('cinematic-')) {
    const n = Math.max(4, Math.min(8, Math.trunc(input.panelSlotCount) || 5))
    weights = Array.from({ length: n }, (_, i) => 0.9 + i * 0.07)
  } else {
    weights = fallbackWeights(input.panelSlotCount)
  }

  const normalized = normalize(weights)
  return normalized.map((relativeHeight, index) => {
    const emphasis: WebtoonScrollPreviewItem['emphasis'] = index === 0
      ? 'anchor'
      : index === normalized.length - 1
        ? 'transition'
        : 'support'

    return {
      id: `preview-panel-${index + 1}`,
      panelIndex: index + 1,
      relativeHeight,
      emphasis,
    }
  })
}
