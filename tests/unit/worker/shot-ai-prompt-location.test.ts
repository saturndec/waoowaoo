import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const persistMock = vi.hoisted(() => ({
  resolveAnalysisModel: vi.fn(),
  requireProjectLocation: vi.fn(),
  persistLocationDescription: vi.fn(),
}))

const runtimeMock = vi.hoisted(() => ({
  runShotPromptCompletion: vi.fn(),
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
}))

vi.mock('@/lib/workers/handlers/shot-ai-persist', () => persistMock)
vi.mock('@/lib/workers/handlers/shot-ai-prompt-runtime', () => ({
  runShotPromptCompletion: runtimeMock.runShotPromptCompletion,
}))
vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: runtimeMock.reportTaskProgress,
}))
vi.mock('@/lib/workers/utils', () => ({
  assertTaskActive: runtimeMock.assertTaskActive,
}))
vi.mock('@/lib/prompt-i18n', () => ({
  PROMPT_IDS: { NP_LOCATION_MODIFY: 'np_location_modify' },
  buildPrompt: vi.fn(() => 'location-final-prompt'),
}))

import { handleModifyLocationTask } from '@/lib/workers/handlers/shot-ai-prompt-location'

function buildJob(payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-shot-location-1',
      type: TASK_TYPE.AI_MODIFY_LOCATION,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'NovelPromotionLocation',
      targetId: 'location-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker shot-ai-prompt-location behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    persistMock.resolveAnalysisModel.mockResolvedValue({ id: 'np-1', analysisModel: 'llm::analysis' })
    persistMock.requireProjectLocation.mockResolvedValue({ id: 'location-1', name: 'Old Town' })
    runtimeMock.runShotPromptCompletion.mockResolvedValue('{"prompt":"updated location description"}')
    persistMock.persistLocationDescription.mockResolvedValue({ id: 'location-1', images: [] })
  })

  it('missing locationId -> explicit error', async () => {
    const payload = {
      currentDescription: 'old location',
      modifyInstruction: 'new style',
    }
    const job = buildJob(payload)

    await expect(handleModifyLocationTask(job, payload)).rejects.toThrow('locationId is required')
  })

  it('success -> persists modifiedDescription with computed imageIndex', async () => {
    const payload = {
      locationId: 'location-1',
      imageIndex: 2,
      currentDescription: 'old location',
      modifyInstruction: 'add fog',
    }
    const job = buildJob(payload)

    const result = await handleModifyLocationTask(job, payload)

    expect(runtimeMock.runShotPromptCompletion).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ai_modify_location',
      prompt: 'location-final-prompt',
    }))
    expect(persistMock.persistLocationDescription).toHaveBeenCalledWith({
      locationId: 'location-1',
      imageIndex: 2,
      modifiedDescription: 'updated location description',
    })
    expect(result).toEqual(expect.objectContaining({
      success: true,
      modifiedDescription: 'updated location description',
      location: { id: 'location-1', images: [] },
    }))
  })
})
