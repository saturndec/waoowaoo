import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE } from '@/lib/task/types'

const submitTaskMock = vi.hoisted(() => vi.fn(async () => ({
  success: true,
  taskId: 'task-1',
  async: true,
  status: 'queued',
  runId: null,
  deduped: false,
})))
vi.mock('@/lib/task/submitter', () => ({
  submitTask: submitTaskMock,
}))

vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: vi.fn(() => 'zh'),
}))

vi.mock('@/lib/billing', () => ({
  buildDefaultTaskBillingInfo: vi.fn(() => ({ mode: 'default' })),
}))

const configMock = vi.hoisted(() => ({
  getProjectModelConfig: vi.fn(async () => ({
    characterModel: 'img::character',
    locationModel: 'img::location',
    editModel: 'img::edit',
    analysisModel: 'llm::analysis',
  })),
  buildImageBillingPayload: vi.fn(async (input: { basePayload: Record<string, unknown> }) => input.basePayload),
}))
vi.mock('@/lib/config-service', () => configMock)

const hasOutputMock = vi.hoisted(() => ({
  hasCharacterAppearanceOutput: vi.fn(async () => false),
  hasLocationImageOutput: vi.fn(async () => false),
  hasPanelImageOutput: vi.fn(async () => false),
}))
vi.mock('@/lib/task/has-output', () => hasOutputMock)

const locationSlotsMock = vi.hoisted(() => ({
  ensureProjectLocationImageSlots: vi.fn(async () => undefined),
}))
vi.mock('@/lib/image-generation/location-slots', () => locationSlotsMock)

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(async () => ({
      visualStylePresetSource: 'system',
      visualStylePresetId: 'realistic',
      artStyle: 'realistic',
    })),
  },
  projectLocation: {
    findUnique: vi.fn(async () => ({ name: 'loc', summary: 'sum' })),
  },
  projectPanel: {
    findFirst: vi.fn(async () => ({ id: 'panel-1' })),
  },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/media/outbound-image', () => ({
  sanitizeImageInputsForTaskPayload: vi.fn((inputs: unknown[]) => ({
    normalized: inputs.filter((x): x is string => typeof x === 'string'),
    issues: [],
  })),
}))

import { createMediaOperations } from '@/lib/operations/domains/media/media-ops'

function buildCtx() {
  return {
    request: new Request('http://localhost') as unknown as import('next/server').NextRequest,
    userId: 'user-1',
    projectId: 'project-1',
    context: {},
    source: 'assistant-panel',
    writer: null,
  }
}

describe('media operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('regenerate_group -> submits REGENERATE_GROUP task', async () => {
    const ops = createMediaOperations()
    const ctx = buildCtx()
    await ops.regenerate_group.execute(ctx as never, {
      type: 'character',
      id: 'character-1',
      appearanceId: 'appearance-1',
      count: 2,
    })
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.REGENERATE_GROUP,
      projectId: 'project-1',
      operationId: 'regenerate_group',
      operationSource: 'assistant-panel',
      operationConfirmed: false,
      operationRequestId: undefined,
    }))
  })

  it('regenerate_single_image -> submits IMAGE_CHARACTER task', async () => {
    const ops = createMediaOperations()
    const ctx = buildCtx()
    await ops.regenerate_single_image.execute(ctx as never, {
      type: 'character',
      id: 'character-1',
      appearanceId: 'appearance-1',
      imageIndex: 0,
    })
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.IMAGE_CHARACTER,
      targetType: 'CharacterAppearance',
    }))
  })

  it('regenerate_storyboard_text -> submits REGENERATE_STORYBOARD_TEXT task', async () => {
    const ops = createMediaOperations()
    const ctx = buildCtx()
    await ops.regenerate_storyboard_text.execute(ctx as never, {
      storyboardId: 'storyboard-1',
    })
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.REGENERATE_STORYBOARD_TEXT,
      targetType: 'ProjectStoryboard',
      targetId: 'storyboard-1',
    }))
  })

  it('modify_storyboard_image -> submits MODIFY_ASSET_IMAGE task', async () => {
    const ops = createMediaOperations()
    const ctx = buildCtx()
    await ops.modify_storyboard_image.execute(ctx as never, {
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      modifyPrompt: 'increase contrast',
      extraImageUrls: ['https://example.com/ref.png'],
      selectedAssets: [{ imageUrl: 'https://example.com/asset.png' }],
    })
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.MODIFY_ASSET_IMAGE,
      targetType: 'ProjectPanel',
      targetId: 'panel-1',
    }))
  })
})
