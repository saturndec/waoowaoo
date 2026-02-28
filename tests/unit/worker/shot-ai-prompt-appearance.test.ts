import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const persistMock = vi.hoisted(() => ({
  resolveAnalysisModel: vi.fn(),
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
  PROMPT_IDS: { NP_CHARACTER_MODIFY: 'np_character_modify' },
  buildPrompt: vi.fn(() => 'appearance-final-prompt'),
}))

import { handleModifyAppearanceTask } from '@/lib/workers/handlers/shot-ai-prompt-appearance'

function buildJob(payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-shot-appearance-1',
      type: TASK_TYPE.AI_MODIFY_APPEARANCE,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'CharacterAppearance',
      targetId: 'appearance-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker shot-ai-prompt-appearance behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    persistMock.resolveAnalysisModel.mockResolvedValue({ id: 'np-1', analysisModel: 'llm::analysis' })
    runtimeMock.runShotPromptCompletion.mockResolvedValue('{"prompt":"updated appearance description"}')
  })

  it('missing characterId -> explicit error', async () => {
    const job = buildJob({
      appearanceId: 'appearance-1',
      currentDescription: 'old desc',
      modifyInstruction: 'new style',
    })

    await expect(handleModifyAppearanceTask(job, job.data.payload as Record<string, unknown>)).rejects.toThrow('characterId is required')
  })

  it('success -> returns modifiedDescription and rawResponse', async () => {
    const payload = {
      characterId: 'character-1',
      appearanceId: 'appearance-1',
      currentDescription: 'old desc',
      modifyInstruction: 'new style',
    }
    const job = buildJob(payload)

    const result = await handleModifyAppearanceTask(job, payload)

    expect(runtimeMock.runShotPromptCompletion).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ai_modify_appearance',
      prompt: 'appearance-final-prompt',
    }))
    expect(result).toEqual(expect.objectContaining({
      success: true,
      modifiedDescription: 'updated appearance description',
      rawResponse: '{"prompt":"updated appearance description"}',
    }))
  })
})
