import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

type WorkerProcessor = (job: Job<TaskJobData>) => Promise<unknown>

type PanelRow = {
  id: string
  videoUrl: string | null
  imageUrl: string | null
  videoPrompt: string | null
  description: string | null
  firstLastFramePrompt: string | null
  duration: number | null
}

const workerState = vi.hoisted(() => ({
  processor: null as WorkerProcessor | null,
}))

const reportTaskProgressMock = vi.hoisted(() => vi.fn(async () => undefined))
const withTaskLifecycleMock = vi.hoisted(() =>
  vi.fn(async (job: Job<TaskJobData>, handler: WorkerProcessor) => await handler(job)),
)

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => undefined),
  getProjectModels: vi.fn(async () => ({ videoRatio: '16:9' })),
  resolveLipSyncVideoSource: vi.fn(async () => 'https://provider.example/lipsync.mp4'),
  resolveVideoSourceFromGeneration: vi.fn<(...args: unknown[]) => Promise<{ url: string; actualVideoTokens?: number; downloadHeaders?: Record<string, string> }>>(async () => ({ url: 'https://provider.example/video.mp4' })),
  toSignedUrlIfCos: vi.fn((url: string | null) => (url ? `https://signed.example/${url}` : null)),
  uploadVideoSourceToCos: vi.fn(async () => 'cos/lip-sync/video.mp4'),
}))
const configServiceMock = vi.hoisted(() => ({
  getUserWorkflowConcurrencyConfig: vi.fn(async () => ({
    analysis: 5,
    image: 5,
    video: 5,
  })),
}))
const concurrencyGateMock = vi.hoisted(() => ({
  withUserConcurrencyGate: vi.fn(async <T>(input: {
    run: () => Promise<T>
  }) => await input.run()),
}))
const videoGroupMocks = vi.hoisted(() => ({
  composeAndStoreGridReferenceImage: vi.fn(async () => ({
    id: 'reference-media-1',
    publicId: 'reference-public-1',
    url: '/m/reference-public-1',
    storageKey: 'images/video-group-reference/group-1.png',
    mimeType: 'image/png',
    sizeBytes: 1000,
    width: 1536,
    height: 1536,
    durationMs: null,
  })),
  executeAiTextStep: vi.fn(async () => ({ text: 'continuous group prompt', reasoning: '', usage: null, completion: null })),
  ensureMediaObjectFromStorageKey: vi.fn(async () => ({
    id: 'video-media-1',
    publicId: 'video-public-1',
    url: '/m/video-public-1',
    storageKey: 'group-video/group-1.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 1000,
    width: null,
    height: null,
    durationMs: 14000,
  })),
}))

const prismaMock = vi.hoisted(() => ({
  projectPanel: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(async () => undefined),
  },
  projectVoiceLine: {
    findUnique: vi.fn(),
  },
  projectVideoGroup: {
    update: vi.fn(async () => undefined),
  },
  project: {
    findUnique: vi.fn(),
  },
  projectEditScript: {
    findFirst: vi.fn(),
  },
}))

vi.mock('bullmq', () => ({
  Queue: class {
    constructor(name: string) {
      void name
    }

    async add() {
      return { id: 'job-1' }
    }

    async getJob() {
      return null
    }
  },
  Worker: class {
    constructor(name: string, processor: WorkerProcessor) {
      void name
      workerState.processor = processor
    }
  },
}))

vi.mock('@/lib/redis', () => ({ queueRedis: {} }))
vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: reportTaskProgressMock,
  withTaskLifecycle: withTaskLifecycleMock,
}))
vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/media/outbound-image', () => ({
  normalizeToBase64ForGeneration: vi.fn(async (input: string) => input),
}))
vi.mock('@/lib/ai-registry/capabilities-catalog', () => ({
  registerBuiltinCapabilityCatalogEntries: vi.fn(),
  resolveBuiltinCapabilitiesByModelKey: vi.fn(() => ({ video: { firstlastframe: true } })),
}))
vi.mock('@/lib/ai-registry/pricing-resolution', () => ({
  registerBuiltinPricingCatalogEntries: vi.fn(),
}))
vi.mock('@/lib/ai-registry/pricing-catalog', () => ({
  registerBuiltinPricingCatalogEntries: vi.fn(),
}))
vi.mock('@/lib/ai-registry/api-config-catalog', () => ({
  DEFAULT_LIPSYNC_MODEL_KEY: 'fal::lipsync',
  DEFAULT_VOICE_DESIGN_MODEL_KEY: 'openai::voice-design',
  DEFAULT_VOICE_MODEL_KEY: 'openai::voice',
  BUILTIN_API_CONFIG_CATALOG: {},
  registerBuiltinApiConfigCatalog: vi.fn(),
}))
vi.mock('@/lib/ai-exec/engine', () => ({
  executeAiTextStep: videoGroupMocks.executeAiTextStep,
}))
vi.mock('@/lib/video-groups/grid-image', () => ({
  composeAndStoreGridReferenceImage: videoGroupMocks.composeAndStoreGridReferenceImage,
}))
vi.mock('@/lib/video-groups/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/video-groups/core')>()
  return actual
})
vi.mock('@/lib/media/service', () => ({
  ensureMediaObjectFromStorageKey: videoGroupMocks.ensureMediaObjectFromStorageKey,
}))
vi.mock('@/lib/ai-registry/selection', () => ({
  composeModelKey: vi.fn((provider: string, modelId: string) => `${provider}::${modelId}`),
  parseModelKeyStrict: vi.fn(() => ({ provider: 'fal' })),
}))
vi.mock('@/lib/user-api/runtime-config', () => ({
  getProviderConfig: vi.fn(async () => ({ apiKey: 'api-key' })),
}))
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/workers/user-concurrency-gate', () => concurrencyGateMock)

function buildPanel(overrides?: Partial<PanelRow>): PanelRow {
  return {
    id: 'panel-1',
    videoUrl: 'cos/base-video.mp4',
    imageUrl: 'cos/panel-image.png',
    videoPrompt: 'panel prompt',
    description: 'panel description',
    firstLastFramePrompt: null,
    duration: 5,
    ...(overrides || {}),
  }
}

function buildJob(params: {
  type: TaskJobData['type']
  payload?: Record<string, unknown>
  targetType?: string
  targetId?: string
}): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-1',
      type: params.type,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: params.targetType ?? 'ProjectPanel',
      targetId: params.targetId ?? 'panel-1',
      payload: params.payload ?? {},
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker video processor behavior', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    workerState.processor = null

    prismaMock.projectPanel.findUnique.mockResolvedValue(buildPanel())
    prismaMock.projectPanel.findFirst.mockResolvedValue(buildPanel())
    prismaMock.projectVoiceLine.findUnique.mockResolvedValue({
      id: 'line-1',
      audioUrl: 'cos/line-1.mp3',
      audioDuration: 1200,
    })
    prismaMock.project.findUnique.mockResolvedValue({
      analysisModel: 'openai::gpt-4.1',
      videoRatio: '9:16',
      artStyle: 'cinematic',
      directorStyleDoc: null,
    })
    prismaMock.projectEditScript.findFirst.mockResolvedValue({
      title: 'Grid Film',
      logline: 'A continuous test.',
      shotsJson: [
        {
          shotNumber: 1,
          durationSec: 2,
          visualAction: 'Shot one',
          charactersAndScene: 'A',
          camera: 'wide',
          videoPrompt: 'shot one prompt',
          sound: 'tone',
        },
        {
          shotNumber: 2,
          durationSec: 3,
          visualAction: 'Shot two',
          charactersAndScene: 'B',
          camera: 'medium',
          videoPrompt: 'shot two prompt',
          sound: 'pulse',
        },
        {
          shotNumber: 3,
          durationSec: 4,
          visualAction: 'Shot three',
          charactersAndScene: 'C',
          camera: 'close',
          videoPrompt: 'shot three prompt',
          sound: 'rise',
        },
        {
          shotNumber: 4,
          durationSec: 5,
          visualAction: 'Shot four',
          charactersAndScene: 'D',
          camera: 'pull back',
          videoPrompt: 'shot four prompt',
          sound: 'release',
        },
      ],
    })

    const mod = await import('@/lib/workers/video.worker')
    mod.createVideoWorker()
  })

  it('VIDEO_GROUP: generates a continuous grid clip and writes ProjectVideoGroup output', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    prismaMock.projectPanel.findMany.mockResolvedValueOnce([
      { ...buildPanel({ id: 'panel-1' }), panelNumber: 1, imageMedia: { storageKey: 'images/panel-1.png' } },
      { ...buildPanel({ id: 'panel-2' }), panelNumber: 2, imageMedia: { storageKey: 'images/panel-2.png' } },
      { ...buildPanel({ id: 'panel-3' }), panelNumber: 3, imageMedia: { storageKey: 'images/panel-3.png' } },
      { ...buildPanel({ id: 'panel-4' }), panelNumber: 4, imageMedia: { storageKey: 'images/panel-4.png' } },
    ])
    utilsMock.uploadVideoSourceToCos.mockResolvedValueOnce('group-video/group-1.mp4')

    const result = await processor!(buildJob({
      type: TASK_TYPE.VIDEO_GROUP,
      targetType: 'ProjectVideoGroup',
      targetId: 'group-1',
      payload: {
        videoModel: 'google::veo',
        gridMode: '2x2',
        shotNumbers: [1, 2, 3, 4],
        generationOptions: { resolution: '720p' },
      },
    }))

    expect(result).toEqual(expect.objectContaining({
      groupId: 'group-1',
      videoUrl: '/m/video-public-1',
      videoMediaId: 'video-media-1',
      durationSec: 14,
      shotNumbers: [1, 2, 3, 4],
    }))
    expect(videoGroupMocks.composeAndStoreGridReferenceImage).toHaveBeenCalledWith(expect.objectContaining({
      gridMode: '2x2',
      targetId: 'group-1',
    }))
    expect(videoGroupMocks.executeAiTextStep).toHaveBeenCalledWith(expect.objectContaining({
      action: 'video_group_prompt',
    }))
    expect(utilsMock.resolveVideoSourceFromGeneration).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      modelId: 'google::veo',
      options: expect.objectContaining({
        prompt: 'continuous group prompt',
        duration: 14,
        aspectRatio: '9:16',
      }),
    }))
    expect(prismaMock.projectVideoGroup.update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'group-1' },
      data: expect.objectContaining({
        status: 'completed',
        videoUrl: '/m/video-public-1',
        videoMediaId: 'video-media-1',
      }),
    }))
  })

  it('VIDEO_PANEL: 缺少 payload.videoModel 时显式失败', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {},
    })

    await expect(processor!(job)).rejects.toThrow('VIDEO_MODEL_REQUIRED: payload.videoModel is required')
  })

  it('VIDEO_PANEL: 透传异步轮询返回的下载头到 COS 上传', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    utilsMock.resolveVideoSourceFromGeneration.mockResolvedValueOnce({
      url: 'https://provider.example/video.mp4',
      downloadHeaders: {
        Authorization: 'Bearer oa-key',
      },
    })

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'openai-compatible:oa-1::sora-2',
        generationOptions: {
          duration: 8,
          resolution: '720p',
        },
      },
    })

    await processor!(job)

    expect(utilsMock.uploadVideoSourceToCos).toHaveBeenCalledWith(
      'https://provider.example/video.mp4',
      'panel-video',
      'panel-1',
      {
        Authorization: 'Bearer oa-key',
      },
    )
  })

  it('VIDEO_PANEL: 将 Ark 返回的实际视频 token 用量透传到任务结果', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    utilsMock.resolveVideoSourceFromGeneration.mockResolvedValueOnce({
      url: 'https://provider.example/video.mp4',
      actualVideoTokens: 108000,
    })

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'ark::doubao-seedance-2-0-260128',
        generationOptions: {
          duration: 5,
          resolution: '720p',
        },
      },
    })

    const result = await processor!(job) as { panelId: string; videoUrl: string; actualVideoTokens: number }
    expect(result).toEqual({
      panelId: 'panel-1',
      videoUrl: 'cos/lip-sync/video.mp4',
      actualVideoTokens: 108000,
    })
  })

  it('VIDEO_PANEL: 成功生成后保存本次实际使用的 generationOptions', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const job = buildJob({
      type: TASK_TYPE.VIDEO_PANEL,
      payload: {
        videoModel: 'ark::doubao-seedance-2-0-260128',
        generationOptions: {
          duration: 8,
          resolution: '720p',
          generateAudio: true,
          aspectRatio: '9:16',
        },
      },
    })

    await processor!(job)

    expect(utilsMock.resolveVideoSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          aspectRatio: '16:9',
          duration: 8,
          resolution: '720p',
          generateAudio: true,
          generationMode: 'normal',
        }),
      }),
    )
    expect(prismaMock.projectPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: {
        videoUrl: 'cos/lip-sync/video.mp4',
        videoGenerationMode: 'normal',
        lastVideoGenerationOptions: {
          duration: 8,
          resolution: '720p',
          generateAudio: true,
        },
      },
    })
  })

  it('LIP_SYNC: 缺少 panel 时显式失败', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    prismaMock.projectPanel.findUnique.mockResolvedValueOnce(null)
    const job = buildJob({
      type: TASK_TYPE.LIP_SYNC,
      payload: { voiceLineId: 'line-1' },
      targetId: 'panel-missing',
    })

    await expect(processor!(job)).rejects.toThrow('Lip-sync panel not found')
  })

  it('LIP_SYNC: 正常路径写回 lipSyncVideoUrl 并清理 lipSyncTaskId', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const job = buildJob({
      type: TASK_TYPE.LIP_SYNC,
      payload: {
        voiceLineId: 'line-1',
        lipSyncModel: 'fal::lipsync-model',
      },
      targetId: 'panel-1',
    })

    const result = await processor!(job) as { panelId: string; voiceLineId: string; lipSyncVideoUrl: string }
    expect(result).toEqual({
      panelId: 'panel-1',
      voiceLineId: 'line-1',
      lipSyncVideoUrl: 'cos/lip-sync/video.mp4',
    })

    expect(utilsMock.resolveLipSyncVideoSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-1',
        modelKey: 'fal::lipsync-model',
        audioDurationMs: 1200,
        videoDurationMs: 5000,
      }),
    )

    expect(prismaMock.projectPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: {
        lipSyncVideoUrl: 'cos/lip-sync/video.mp4',
        lipSyncTaskId: null,
      },
    })
  })

  it('未知任务类型: 显式报错', async () => {
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    const unsupportedJob = buildJob({
      type: TASK_TYPE.AI_CREATE_CHARACTER,
    })

    await expect(processor!(unsupportedJob)).rejects.toThrow('Unsupported video task type')
  })
})
