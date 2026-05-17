import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
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
  videoEditorProject: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}))

const executeAiTextStepMock = vi.hoisted(() => vi.fn())
const generateMusicMock = vi.hoisted(() => vi.fn())
const reportTaskProgressMock = vi.hoisted(() => vi.fn())
const mediaServiceMock = vi.hoisted(() => ({
  ensureMediaObjectFromStorageKey: vi.fn(),
}))
const storageMock = vi.hoisted(() => ({
  generateUniqueKey: vi.fn((prefix: string, ext: string) => `${prefix}/asset.${ext}`),
  toFetchableUrl: vi.fn((url: string) => url),
  uploadObject: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/ai-exec/engine', () => ({
  executeAiTextStep: executeAiTextStepMock,
  generateMusic: generateMusicMock,
}))

vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: reportTaskProgressMock,
}))

vi.mock('@/lib/media/service', () => ({
  ensureMediaObjectFromStorageKey: mediaServiceMock.ensureMediaObjectFromStorageKey,
}))

vi.mock('@/lib/storage', () => ({
  generateUniqueKey: storageMock.generateUniqueKey,
  toFetchableUrl: storageMock.toFetchableUrl,
  uploadObject: storageMock.uploadObject,
}))

function buildJob(payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    queueName: 'waoowaoo-music',
    data: {
      taskId: 'task-bgm-1',
      type: TASK_TYPE.BGM_SCORE_GENERATE,
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

function mockReadyProject(): void {
  prismaMock.project.findUnique.mockResolvedValue({
    analysisModel: 'openai::gpt-4.1',
    videoRatio: '16:9',
    artStyle: null,
    artStylePrompt: null,
    visualStylePresetSource: null,
    visualStylePresetId: null,
    directorStylePresetSource: null,
    directorStylePresetId: null,
    directorStyleDoc: null,
  })
  prismaMock.projectEpisode.findFirst.mockResolvedValue({ id: 'episode-1' })
  prismaMock.projectEditScript.findUnique.mockResolvedValue({
    id: 'edit-script-1',
    userPrompt: 'test',
    title: 'Test',
    logline: 'Test logline',
    durationSec: 3,
    shotsJson: [{
      shotNumber: 1,
      durationSec: 3,
      visualAction: 'A shot',
      charactersAndScene: 'A room',
      camera: 'Static',
      videoPrompt: 'A shot',
      sound: 'native video sound only',
    }],
    videoBlocksJson: [],
  })
}

function mockCompleteTimeline(): void {
  prismaMock.projectPanel.findMany.mockResolvedValue([
    {
      id: 'panel-1',
      panelIndex: 0,
      panelNumber: 1,
      duration: 3,
      description: 'panel 1',
      videoUrl: 'https://example.com/panel-1.mp4',
      videoMedia: null,
      lipSyncVideoUrl: null,
      lipSyncVideoMedia: null,
      photographyRules: JSON.stringify({ editScriptId: 'edit-script-1' }),
      storyboard: {
        id: 'storyboard-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        storyboardTextJson: JSON.stringify({ editScriptId: 'edit-script-1' }),
        clip: { createdAt: new Date('2026-01-01T00:00:00.000Z') },
      },
    },
  ])
  prismaMock.projectVideoGroup.findMany.mockResolvedValue([])
}

function buildValidPlanText(): string {
  return JSON.stringify({
    durationSeconds: 3,
    creativeBrief: {
      cueType: 'continuous instrumental underscore',
      genre: 'minimal suspense drama',
      mood: 'tense and restrained',
      narrativeFunction: 'hold continuity while staying under native video sound',
    },
    scoreDesign: {
      overview: 'A single sparse cue with low tension, restrained harmony, and one tiny lift near the end.',
      sections: [
        {
          category: 'Cue Arc',
          title: 'Restrained suspense bed',
          purpose: 'Keep the scene connected without replacing source audio.',
          startSec: 0,
          endSec: 3,
          content: 'Slow 72 BPM implied pulse, D minor color, no literal effects.',
        },
        {
          category: 'Hit Point',
          title: 'End lift',
          purpose: 'Support the visual resolve.',
          startSec: 2.4,
          endSec: 3,
          content: 'Small harmonic swell, no impact sound.',
        },
      ],
    },
    virtualLayers: [
      {
        name: 'sustained harmonic bed',
        purpose: 'Provide the main emotional continuity.',
        content: 'Soft low strings and air pad, no independent melody.',
      },
      {
        name: 'restrained low weight',
        purpose: 'Add pressure without clutter.',
        content: 'Subtle low pedal below the video sound effects.',
      },
    ],
    promptSections: [
      {
        title: 'Main cue direction',
        purpose: 'Single final music prompt basis.',
        startSec: 0,
        endSec: 3,
        content: 'Generate a sparse suspense underscore in D minor, continuous for 3 seconds.',
      },
    ],
    finalPrompt: 'Generate one complete continuous instrumental cinematic BGM track for 3 seconds. Minimal suspense drama underscore in D minor, sparse low strings and air pad, restrained harmonic movement, tiny swell near 2.4 seconds, no literal sound effects, leave space for native video dialogue and sound.',
    negativePrompt: 'no vocals, no lyrics, no dialogue, no Foley, no literal sound effects, no whoosh, no footsteps',
  })
}

describe('bgm score worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storageMock.uploadObject.mockImplementation(async (_buffer: Buffer, key: string) => key)
    mediaServiceMock.ensureMediaObjectFromStorageKey.mockImplementation(async (storageKey: string) => ({
      id: storageKey.includes('music/bgm-score') ? 'media-mix' : `media-${storageKey}`,
      url: storageKey.includes('music/bgm-score') ? '/m/bgm-mix' : `/m/${storageKey}`,
    }))
    prismaMock.videoEditorProject.findUnique.mockResolvedValue({ projectData: null })
  })

  it('generates BGM from the scheduled video group timeline before video media exists', async () => {
    mockReadyProject()
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
        photographyRules: JSON.stringify({ editScriptId: 'edit-script-1' }),
        storyboard: {
          id: 'storyboard-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          storyboardTextJson: JSON.stringify({ editScriptId: 'edit-script-1' }),
          clip: { createdAt: new Date('2026-01-01T00:00:00.000Z') },
        },
      },
    ])
    prismaMock.projectVideoGroup.findMany.mockResolvedValue([
      {
        id: 'group-1',
        gridMode: '2x2',
        shotNumbers: [1],
        durationSec: 3,
        status: 'processing',
        prompt: 'group prompt',
        videoUrl: null,
        videoMedia: null,
      },
    ])
    executeAiTextStepMock.mockResolvedValue({ text: buildValidPlanText() })
    generateMusicMock.mockResolvedValue({
      success: true,
      audioBase64: Buffer.from('draft-bgm').toString('base64'),
      audioMimeType: 'audio/mpeg',
    })

    const { handleBgmScoreGenerateTask } = await import('@/lib/bgm-score/generate')
    const result = await handleBgmScoreGenerateTask(buildJob({
      episodeId: 'episode-1',
      musicModel: 'google::lyria-3-pro-preview',
    }))

    expect(result).toMatchObject({
      episodeId: 'episode-1',
      mediaId: 'media-mix',
      audioUrl: '/m/bgm-mix',
    })
    expect(executeAiTextStepMock).toHaveBeenCalledTimes(1)
    const planPrompt = String(executeAiTextStepMock.mock.calls[0]?.[0]?.messages?.[0]?.content)
    expect(planPrompt).toContain('"sourceKind": "videoGroup"')
    expect(planPrompt).toContain('"groupId": "group-1"')
    expect(generateMusicMock).toHaveBeenCalledTimes(1)
  })

  it('fails explicitly when no schedulable video timeline exists', async () => {
    mockReadyProject()
    prismaMock.projectPanel.findMany.mockResolvedValue([])
    prismaMock.projectVideoGroup.findMany.mockResolvedValue([])

    const { handleBgmScoreGenerateTask } = await import('@/lib/bgm-score/generate')
    await expect(handleBgmScoreGenerateTask(buildJob({
      episodeId: 'episode-1',
      musicModel: 'google::lyria-3-pro-preview',
    }))).rejects.toThrow('BGM_SCORE_VIDEO_TIMELINE_INCOMPLETE')

    expect(executeAiTextStepMock).not.toHaveBeenCalled()
    expect(generateMusicMock).not.toHaveBeenCalled()
  })

  it('writes completed BGM after one final music generation request', async () => {
    mockReadyProject()
    mockCompleteTimeline()
    executeAiTextStepMock.mockResolvedValue({ text: buildValidPlanText() })
    generateMusicMock.mockResolvedValue({
      success: true,
      audioBase64: Buffer.from('final-bgm').toString('base64'),
      audioMimeType: 'audio/mpeg',
    })

    const { handleBgmScoreGenerateTask } = await import('@/lib/bgm-score/generate')
    const result = await handleBgmScoreGenerateTask(buildJob({
      episodeId: 'episode-1',
      musicModel: 'google::lyria-3-pro-preview',
    }))

    expect(result).toMatchObject({
      episodeId: 'episode-1',
      mediaId: 'media-mix',
      audioUrl: '/m/bgm-mix',
      designSectionCount: 2,
      promptSectionCount: 1,
      virtualLayerCount: 2,
    })
    expect(generateMusicMock).toHaveBeenCalledTimes(1)
    expect(String(generateMusicMock.mock.calls[0]?.[2])).toContain('Generate one complete continuous instrumental cinematic BGM track')
    expect(String(generateMusicMock.mock.calls[0]?.[2])).toContain('Text-only internal arrangement layers')
    expect(storageMock.uploadObject).toHaveBeenCalledTimes(1)

    const completedCall = prismaMock.videoEditorProject.upsert.mock.calls.find((call) => {
      const arg = call[0] as { update?: { projectData?: string } }
      const projectData = JSON.parse(arg.update?.projectData ?? '{}') as {
        bgmScore?: {
          status?: string
          schemaVersion?: number
          plan?: { virtualLayers?: readonly unknown[]; promptSections?: readonly unknown[] }
          mix?: { url?: string }
        }
      }
      return projectData.bgmScore?.status === 'completed'
        && projectData.bgmScore.schemaVersion === 2
        && projectData.bgmScore.mix?.url === '/m/bgm-mix'
        && projectData.bgmScore.plan?.virtualLayers?.length === 2
        && projectData.bgmScore.plan?.promptSections?.length === 1
    })
    expect(completedCall).toBeTruthy()

    const progressCall = reportTaskProgressMock.mock.calls.find((call) => {
      const payload = call[2] as { stage?: string; designSectionCount?: number; promptSectionCount?: number }
      return payload.stage === 'bgm_score_generate_music'
        && payload.designSectionCount === 2
        && payload.promptSectionCount === 1
    })
    expect(progressCall).toBeTruthy()
  })

  it('fails the task and does not upload a mix when final music generation fails', async () => {
    mockReadyProject()
    mockCompleteTimeline()
    executeAiTextStepMock.mockResolvedValue({ text: buildValidPlanText() })
    generateMusicMock.mockResolvedValue({
      success: false,
      error: 'provider rejected final BGM',
    })

    const { handleBgmScoreGenerateTask } = await import('@/lib/bgm-score/generate')
    await expect(handleBgmScoreGenerateTask(buildJob({
      episodeId: 'episode-1',
      musicModel: 'google::lyria-3-pro-preview',
    }))).rejects.toThrow('provider rejected final BGM')

    expect(storageMock.uploadObject).not.toHaveBeenCalled()
    const failedCall = prismaMock.videoEditorProject.upsert.mock.calls.find((call) => {
      const arg = call[0] as { update?: { projectData?: string } }
      const projectData = JSON.parse(arg.update?.projectData ?? '{}') as { bgmScore?: { status?: string; errorMessage?: string } }
      return projectData.bgmScore?.status === 'failed'
        && projectData.bgmScore.errorMessage === 'provider rejected final BGM'
    })
    expect(failedCall).toBeTruthy()
  })
})
