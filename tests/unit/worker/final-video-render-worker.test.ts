import type { Job } from 'bullmq'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  videoEditorProject: {
    upsert: vi.fn(),
  },
  project: {
    findUnique: vi.fn(),
  },
  projectEpisode: {
    findFirst: vi.fn(),
  },
  projectEditScript: {
    findUnique: vi.fn(),
  },
  projectPanel: {
    findMany: vi.fn(),
  },
  projectVideoGroup: {
    findMany: vi.fn(),
  },
  userPreference: {
    findUnique: vi.fn(),
  },
}))

const reportTaskProgressMock = vi.hoisted(() => vi.fn())
const generateMusicMock = vi.hoisted(() => vi.fn())
const executeAiTextStepMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: reportTaskProgressMock,
}))

vi.mock('@/lib/ai-exec/engine', () => ({
  executeAiTextStep: executeAiTextStepMock,
  generateMusic: generateMusicMock,
}))

vi.mock('@/lib/ai-registry/selection', () => ({
  parseModelKeyStrict: vi.fn((modelKey: string) => ({ modelKey })),
}))

vi.mock('@/lib/media/service', () => ({
  ensureMediaObjectFromStorageKey: vi.fn(),
  resolveStorageKeyFromMediaValue: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  generateUniqueKey: vi.fn((prefix: string, ext: string) => `${prefix}/asset.${ext}`),
  getObjectBuffer: vi.fn(),
  toFetchableUrl: vi.fn((url: string) => url),
  uploadObject: vi.fn(),
}))

function buildJob(payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    queueName: 'waoowaoo-video',
    data: {
      taskId: 'task-1',
      type: TASK_TYPE.FINAL_VIDEO_RENDER,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'ProjectEpisode',
      targetId: 'episode-1',
      payload,
      userId: 'user-1',
    } satisfies TaskJobData,
  } as unknown as Job<TaskJobData>
}

describe('final video render worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.project.findUnique.mockResolvedValue({ videoRatio: '9:16', analysisModel: 'openai::gpt-4.1' })
    prismaMock.projectEpisode.findFirst.mockResolvedValue({ id: 'episode-1' })
    prismaMock.projectEditScript.findUnique.mockResolvedValue({
      id: 'edit-script-1',
      title: 'Final Edit',
      logline: 'A test edit.',
      durationSec: 3,
      shotsJson: [
        {
          shotNumber: 1,
          durationSec: 3,
          visualAction: 'A shot',
          charactersAndScene: 'A scene',
          camera: 'Static',
          videoPrompt: 'A shot',
          sound: 'tense pulse, sparse piano',
        },
      ],
    })
    prismaMock.projectPanel.findMany.mockResolvedValue([
      {
        id: 'panel-1',
        panelIndex: 0,
        panelNumber: 1,
        duration: 3,
        description: 'panel 1',
        videoUrl: null,
        videoMedia: null,
        lipSyncVideoUrl: null,
        lipSyncVideoMedia: null,
        photographyRules: JSON.stringify({ source: 'edit_script', editScriptId: 'edit-script-1' }),
        storyboard: {
          id: 'storyboard-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          storyboardTextJson: JSON.stringify({ editScriptId: 'edit-script-1' }),
          clip: { createdAt: new Date('2026-01-01T00:00:00.000Z') },
        },
      },
    ])
    prismaMock.projectVideoGroup.findMany.mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fails explicitly when an edit-first panel has no rendered video', async () => {
    const { handleFinalVideoRenderTask } = await import('@/lib/workers/final-video-render')

    await expect(handleFinalVideoRenderTask(buildJob({
      episodeId: 'episode-1',
      musicModel: 'google::lyria-3-pro-preview',
    }))).rejects.toThrow('FINAL_VIDEO_RENDER_MISSING_VIDEO:panel-1')

    expect(generateMusicMock).not.toHaveBeenCalled()
    expect(prismaMock.videoEditorProject.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { episodeId: 'episode-1' },
      update: expect.objectContaining({ renderStatus: 'rendering', renderTaskId: 'task-1' }),
    }))
    expect(prismaMock.videoEditorProject.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { episodeId: 'episode-1' },
      update: expect.objectContaining({ renderStatus: 'failed', renderTaskId: 'task-1' }),
    }))
    expect(reportTaskProgressMock).toHaveBeenCalledWith(expect.anything(), 10, {
      stage: 'final_render_prepare',
    })
  })
})
