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
  PROMPT_IDS: { NP_IMAGE_PROMPT_MODIFY: 'np_image_prompt_modify' },
  buildPrompt: vi.fn(() => 'shot-final-prompt'),
}))

import { handleModifyShotPromptTask } from '@/lib/workers/handlers/shot-ai-prompt-shot'

function buildJob(payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-shot-prompt-1',
      type: TASK_TYPE.AI_MODIFY_SHOT_PROMPT,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'NovelPromotionPanel',
      targetId: 'panel-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker shot-ai-prompt-shot behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    persistMock.resolveAnalysisModel.mockResolvedValue({ id: 'np-1', analysisModel: 'llm::analysis' })
    runtimeMock.runShotPromptCompletion.mockResolvedValue('{"image_prompt":"updated image prompt","video_prompt":"updated video prompt"}')
  })

  it('missing currentPrompt -> explicit error', async () => {
    const payload = { modifyInstruction: 'new angle' }
    const job = buildJob(payload)

    await expect(handleModifyShotPromptTask(job, payload)).rejects.toThrow('currentPrompt is required')
  })

  it('success -> returns modified image/video prompts and passes referencedAssets', async () => {
    const payload = {
      currentPrompt: 'old image prompt',
      currentVideoPrompt: 'old video prompt',
      modifyInstruction: 'new camera movement',
      referencedAssets: [{ name: 'Hero', description: 'black coat' }],
    }
    const job = buildJob(payload)

    const result = await handleModifyShotPromptTask(job, payload)

    expect(runtimeMock.runShotPromptCompletion).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ai_modify_shot_prompt',
      prompt: 'shot-final-prompt',
    }))
    expect(result).toEqual({
      success: true,
      modifiedImagePrompt: 'updated image prompt',
      modifiedVideoPrompt: 'updated video prompt',
      referencedAssets: [{ name: 'Hero', description: 'black coat' }],
    })
  })
})
