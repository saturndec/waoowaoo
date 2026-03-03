import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskType } from '@/lib/task/types'
import { buildMockRequest } from '../../../helpers/request'

type AuthState = {
  authenticated: boolean
  projectMode: 'novel-promotion' | 'other'
}

type SubmitResult = {
  taskId: string
  async: true
}

type RouteContext = {
  params: Promise<Record<string, string>>
}

type DirectRouteCase = {
  routeFile: string
  body: Record<string, unknown>
  params?: Record<string, string>
  expectedTaskType: TaskType
  expectedTargetType: string
  expectedProjectId: string
}

const MODEL_FIELD_NAME: Record<'characterModel' | 'locationModel', string> = {
  characterModel: '角色图像模型',
  locationModel: '场景图像模型',
}

const authState = vi.hoisted<AuthState>(() => ({
  authenticated: true,
  projectMode: 'novel-promotion',
}))

const submitTaskMock = vi.hoisted(() => vi.fn<[], Promise<SubmitResult>>())

const configServiceMock = vi.hoisted(() => ({
  getUserModelConfig: vi.fn(async () => ({
    characterModel: 'img::character',
    locationModel: 'img::location',
    editModel: 'img::edit',
  })),
  buildImageBillingPayloadFromUserConfig: vi.fn((input: { basePayload: Record<string, unknown> }) => ({
    ...input.basePayload,
    generationOptions: { resolution: '1024x1024' },
  })),
  getProjectModelConfig: vi.fn(async () => ({
    characterModel: 'img::character',
    locationModel: 'img::location',
    editModel: 'img::edit',
    storyboardModel: 'img::storyboard',
    analysisModel: 'llm::analysis',
  })),
  buildImageBillingPayload: vi.fn(async (input: { basePayload: Record<string, unknown> }) => ({
    ...input.basePayload,
    generationOptions: { resolution: '1024x1024' },
  })),
  resolveProjectModelCapabilityGenerationOptions: vi.fn(async () => ({
    resolution: '1024x1024',
  })),
  checkRequiredModels: vi.fn((
    config: Partial<Record<'characterModel' | 'locationModel', string | null>>,
    requiredFields: Array<'characterModel' | 'locationModel'>,
  ) => requiredFields
    .filter((field) => !config[field])
    .map((field) => MODEL_FIELD_NAME[field])),
  getMissingConfigError: vi.fn((missingFields: string[]) => {
    if (missingFields.length === 0) return ''
    if (missingFields.length === 1) {
      return `请先在项目设置中配置"${missingFields[0]}"`
    }
    return `请先在项目设置中配置以下模型：${missingFields.join('、')}`
  }),
}))

const hasOutputMock = vi.hoisted(() => ({
  hasGlobalCharacterOutput: vi.fn(async () => false),
  hasGlobalLocationOutput: vi.fn(async () => false),
  hasGlobalCharacterAppearanceOutput: vi.fn(async () => false),
  hasGlobalLocationImageOutput: vi.fn(async () => false),
  hasCharacterAppearanceOutput: vi.fn(async () => false),
  hasLocationImageOutput: vi.fn(async () => false),
  hasPanelLipSyncOutput: vi.fn(async () => false),
  hasPanelImageOutput: vi.fn(async () => false),
  hasPanelVideoOutput: vi.fn(async () => false),
  hasVoiceLineAudioOutput: vi.fn(async () => false),
}))

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(async () => ({ lipSyncModel: 'fal::lipsync-model' })),
  },
  novelPromotionPanel: {
    findFirst: vi.fn(async () => ({ id: 'panel-1' })),
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async ({ where }: { where?: { id?: string } }) => {
      const id = where?.id || 'panel-1'
      if (id === 'panel-src') {
        return {
          id,
          panelIndex: 1,
          shotType: 'wide',
          cameraMove: 'static',
          description: 'source description',
          videoPrompt: 'source video prompt',
          location: 'source location',
          characters: '[]',
          srtSegment: '',
          duration: 3,
        }
      }
      if (id === 'panel-ins') {
        return {
          id,
          panelIndex: 2,
          shotType: 'medium',
          cameraMove: 'push',
          description: 'insert description',
          videoPrompt: 'insert video prompt',
          location: 'insert location',
          characters: '[]',
          srtSegment: '',
          duration: 3,
        }
      }
      return {
        id,
        panelIndex: 0,
        shotType: 'medium',
        cameraMove: 'static',
        description: 'panel description',
        videoPrompt: 'panel prompt',
        location: 'panel location',
        characters: '[]',
        srtSegment: '',
        duration: 3,
      }
    }),
    update: vi.fn(async () => ({})),
    create: vi.fn(async () => ({ id: 'panel-created', panelIndex: 3 })),
  },
  novelPromotionProject: {
    findUnique: vi.fn(async () => ({
      id: 'project-data-1',
      characters: [
        { name: 'Narrator', customVoiceUrl: 'https://voice.example/narrator.mp3' },
      ],
    })),
  },
  novelPromotionEpisode: {
    findFirst: vi.fn(async () => ({
      id: 'episode-1',
      speakerVoices: '{}',
    })),
  },
  novelPromotionVoiceLine: {
    findMany: vi.fn(async () => [
      { id: 'line-1', speaker: 'Narrator', content: 'hello world voice line' },
    ]),
    findFirst: vi.fn(async () => ({
      id: 'line-1',
      speaker: 'Narrator',
      content: 'hello world voice line',
    })),
  },
  $transaction: vi.fn(async (fn: (tx: {
    novelPromotionPanel: {
      findMany: (args: unknown) => Promise<Array<{ id: string; panelIndex: number }>>
      update: (args: unknown) => Promise<unknown>
      create: (args: unknown) => Promise<{ id: string; panelIndex: number }>
    }
  }) => Promise<unknown>) => {
    const tx = {
      novelPromotionPanel: {
        findMany: async () => [],
        update: async () => ({}),
        create: async () => ({ id: 'panel-created', panelIndex: 3 }),
      },
    }
    return await fn(tx)
  }),
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireUserAuth: async () => {
      if (!authState.authenticated) return unauthorized()
      return { session: { user: { id: 'user-1' } } }
    },
    requireProjectAuth: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1', mode: authState.projectMode },
      }
    },
    requireProjectAuthLight: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1', mode: authState.projectMode },
      }
    },
  }
})

vi.mock('@/lib/task/submitter', () => ({
  submitTask: submitTaskMock,
}))
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: vi.fn(() => 'zh'),
}))
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/task/has-output', () => hasOutputMock)
vi.mock('@/lib/billing', () => ({
  buildDefaultTaskBillingInfo: vi.fn(() => ({ mode: 'default' })),
}))
vi.mock('@/lib/qwen-voice-design', () => ({
  validateVoicePrompt: vi.fn(() => ({ valid: true })),
  validatePreviewText: vi.fn(() => ({ valid: true })),
}))
vi.mock('@/lib/media/outbound-image', () => ({
  sanitizeImageInputsForTaskPayload: vi.fn((inputs: unknown[]) => ({
    normalized: inputs
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
    issues: [] as Array<{ reason: string }>,
  })),
}))
vi.mock('@/lib/model-capabilities/lookup', () => ({
  resolveBuiltinCapabilitiesByModelKey: vi.fn(() => ({ video: { firstlastframe: true } })),
}))
vi.mock('@/lib/model-pricing/lookup', () => ({
  resolveBuiltinPricing: vi.fn(() => ({ status: 'ok' })),
}))
vi.mock('@/lib/api-config', () => ({
  resolveModelSelection: vi.fn(async () => ({
    model: 'img::storyboard',
  })),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

function toApiPath(routeFile: string): string {
  return routeFile
    .replace(/^src\/app/, '')
    .replace(/\/route\.ts$/, '')
    .replace('[projectId]', 'project-1')
}

function toModuleImportPath(routeFile: string): string {
  return `@/${routeFile.replace(/^src\//, '').replace(/\.ts$/, '')}`
}

const DIRECT_CASES: ReadonlyArray<DirectRouteCase> = [
  {
    routeFile: 'src/app/api/asset-hub/generate-image/route.ts',
    body: { type: 'character', id: 'global-character-1', appearanceIndex: 0 },
    expectedTaskType: TASK_TYPE.ASSET_HUB_IMAGE,
    expectedTargetType: 'GlobalCharacter',
    expectedProjectId: 'global-asset-hub',
  },
  {
    routeFile: 'src/app/api/asset-hub/modify-image/route.ts',
    body: {
      type: 'character',
      id: 'global-character-1',
      modifyPrompt: 'sharpen details',
      appearanceIndex: 0,
      imageIndex: 0,
      extraImageUrls: ['https://example.com/ref-a.png'],
    },
    expectedTaskType: TASK_TYPE.ASSET_HUB_MODIFY,
    expectedTargetType: 'GlobalCharacterAppearance',
    expectedProjectId: 'global-asset-hub',
  },
  {
    routeFile: 'src/app/api/asset-hub/voice-design/route.ts',
    body: { voicePrompt: 'female calm narrator', previewText: '你好世界' },
    expectedTaskType: TASK_TYPE.ASSET_HUB_VOICE_DESIGN,
    expectedTargetType: 'GlobalAssetHubVoiceDesign',
    expectedProjectId: 'global-asset-hub',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/generate-image/route.ts',
    body: { type: 'character', id: 'character-1', appearanceId: 'appearance-1' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.IMAGE_CHARACTER,
    expectedTargetType: 'CharacterAppearance',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/generate-video/route.ts',
    body: { videoModel: 'fal::video-model', storyboardId: 'storyboard-1', panelIndex: 0 },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.VIDEO_PANEL,
    expectedTargetType: 'NovelPromotionPanel',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/insert-panel/route.ts',
    body: { storyboardId: 'storyboard-1', insertAfterPanelId: 'panel-ins' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.INSERT_PANEL,
    expectedTargetType: 'NovelPromotionStoryboard',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/lip-sync/route.ts',
    body: {
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      voiceLineId: 'line-1',
      lipSyncModel: 'fal::lip-model',
    },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.LIP_SYNC,
    expectedTargetType: 'NovelPromotionPanel',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/modify-asset-image/route.ts',
    body: {
      type: 'character',
      characterId: 'character-1',
      appearanceId: 'appearance-1',
      modifyPrompt: 'enhance texture',
      extraImageUrls: ['https://example.com/ref-b.png'],
    },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.MODIFY_ASSET_IMAGE,
    expectedTargetType: 'CharacterAppearance',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/modify-storyboard-image/route.ts',
    body: {
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      modifyPrompt: 'increase contrast',
      extraImageUrls: ['https://example.com/ref-c.png'],
      selectedAssets: [{ imageUrl: 'https://example.com/ref-d.png' }],
    },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.MODIFY_ASSET_IMAGE,
    expectedTargetType: 'NovelPromotionPanel',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/panel-variant/route.ts',
    body: {
      storyboardId: 'storyboard-1',
      insertAfterPanelId: 'panel-ins',
      sourcePanelId: 'panel-src',
      variant: { video_prompt: 'new prompt', description: 'variant desc' },
    },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.PANEL_VARIANT,
    expectedTargetType: 'NovelPromotionPanel',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/regenerate-group/route.ts',
    body: { type: 'character', id: 'character-1', appearanceId: 'appearance-1' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.REGENERATE_GROUP,
    expectedTargetType: 'CharacterAppearance',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/regenerate-panel-image/route.ts',
    body: { panelId: 'panel-1', count: 1 },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.IMAGE_PANEL,
    expectedTargetType: 'NovelPromotionPanel',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/regenerate-single-image/route.ts',
    body: { type: 'character', id: 'character-1', appearanceId: 'appearance-1', imageIndex: 0 },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.IMAGE_CHARACTER,
    expectedTargetType: 'CharacterAppearance',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/regenerate-storyboard-text/route.ts',
    body: { storyboardId: 'storyboard-1' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.REGENERATE_STORYBOARD_TEXT,
    expectedTargetType: 'NovelPromotionStoryboard',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/voice-design/route.ts',
    body: { voicePrompt: 'warm female voice', previewText: 'This is preview text' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.VOICE_DESIGN,
    expectedTargetType: 'NovelPromotionProject',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/voice-generate/route.ts',
    body: { episodeId: 'episode-1', lineId: 'line-1', audioModel: 'fal::audio-model' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.VOICE_LINE,
    expectedTargetType: 'NovelPromotionVoiceLine',
    expectedProjectId: 'project-1',
  },
]

async function invokePostRoute(routeCase: DirectRouteCase): Promise<Response> {
  const modulePath = toModuleImportPath(routeCase.routeFile)
  const mod = await import(modulePath)
  const post = mod.POST as (request: Request, context?: RouteContext) => Promise<Response>
  const req = buildMockRequest({
    path: toApiPath(routeCase.routeFile),
    method: 'POST',
    body: routeCase.body,
  })
  return await post(req, { params: Promise.resolve(routeCase.params || {}) })
}

function getDirectRouteCaseOrThrow(routeFile: string): DirectRouteCase {
  const routeCase = DIRECT_CASES.find((item) => item.routeFile === routeFile)
  if (!routeCase) {
    throw new Error(`route case not found: ${routeFile}`)
  }
  return routeCase
}

describe('api contract - direct submit routes (behavior)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true
    authState.projectMode = 'novel-promotion'
    let seq = 0
    submitTaskMock.mockImplementation(async () => ({
      taskId: `task-${++seq}`,
      async: true,
    }))
  })

  it('keeps expected coverage size', () => {
    expect(DIRECT_CASES.length).toBe(16)
  })

  for (const routeCase of DIRECT_CASES) {
    it(`${routeCase.routeFile} -> returns 401 when unauthenticated`, async () => {
      authState.authenticated = false
      const res = await invokePostRoute(routeCase)
      expect(res.status).toBe(401)
      expect(submitTaskMock).not.toHaveBeenCalled()
    })

    it(`${routeCase.routeFile} -> submits task with expected contract when authenticated`, async () => {
      const res = await invokePostRoute(routeCase)
      expect(res.status).toBe(200)
      expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
        type: routeCase.expectedTaskType,
        targetType: routeCase.expectedTargetType,
        projectId: routeCase.expectedProjectId,
        userId: 'user-1',
      }))

      const submitArg = submitTaskMock.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined
      expect(submitArg?.type).toBe(routeCase.expectedTaskType)
      expect(submitArg?.targetType).toBe(routeCase.expectedTargetType)
      expect(submitArg?.projectId).toBe(routeCase.expectedProjectId)
      expect(submitArg?.userId).toBe('user-1')

      const json = await res.json() as Record<string, unknown>
      const isVoiceGenerateRoute = routeCase.routeFile.endsWith('/voice-generate/route.ts')
      if (isVoiceGenerateRoute) {
        expect(json.success).toBe(true)
        expect(json.async).toBe(true)
        expect(typeof json.taskId).toBe('string')
      } else {
        expect(json.async).toBe(true)
        expect(typeof json.taskId).toBe('string')
      }
    })
  }

  it('bugfix: generate-image character returns MISSING_CONFIG when characterModel is absent', async () => {
    configServiceMock.getProjectModelConfig.mockResolvedValueOnce({
      characterModel: null,
      locationModel: 'img::location',
      editModel: 'img::edit',
      storyboardModel: 'img::storyboard',
      analysisModel: 'llm::analysis',
    })
    const routeCase = getDirectRouteCaseOrThrow('src/app/api/novel-promotion/[projectId]/generate-image/route.ts')
    const res = await invokePostRoute(routeCase)

    expect(res.status).toBe(400)
    expect(submitTaskMock).not.toHaveBeenCalled()
    const json = await res.json() as { code?: string, message?: string }
    expect(json.code).toBe('MISSING_CONFIG')
    expect(json.message).toBe('请先在项目设置中配置"角色图像模型"')
  })

  it('bugfix: generate-image location returns MISSING_CONFIG when locationModel is absent', async () => {
    configServiceMock.getProjectModelConfig.mockResolvedValueOnce({
      characterModel: 'img::character',
      locationModel: null,
      editModel: 'img::edit',
      storyboardModel: 'img::storyboard',
      analysisModel: 'llm::analysis',
    })
    const routeCase = getDirectRouteCaseOrThrow('src/app/api/novel-promotion/[projectId]/generate-image/route.ts')
    const res = await invokePostRoute({
      ...routeCase,
      body: { type: 'location', id: 'location-1' },
    })

    expect(res.status).toBe(400)
    expect(submitTaskMock).not.toHaveBeenCalled()
    const json = await res.json() as { code?: string, message?: string }
    expect(json.code).toBe('MISSING_CONFIG')
    expect(json.message).toBe('请先在项目设置中配置"场景图像模型"')
  })

  it('bugfix: regenerate-group character returns MISSING_CONFIG when characterModel is absent', async () => {
    configServiceMock.getProjectModelConfig.mockResolvedValueOnce({
      characterModel: null,
      locationModel: 'img::location',
      editModel: 'img::edit',
      storyboardModel: 'img::storyboard',
      analysisModel: 'llm::analysis',
    })
    const routeCase = getDirectRouteCaseOrThrow('src/app/api/novel-promotion/[projectId]/regenerate-group/route.ts')
    const res = await invokePostRoute(routeCase)

    expect(res.status).toBe(400)
    expect(submitTaskMock).not.toHaveBeenCalled()
    const json = await res.json() as { code?: string, message?: string }
    expect(json.code).toBe('MISSING_CONFIG')
    expect(json.message).toBe('请先在项目设置中配置"角色图像模型"')
  })

  it('bugfix: regenerate-group location returns MISSING_CONFIG when locationModel is absent', async () => {
    configServiceMock.getProjectModelConfig.mockResolvedValueOnce({
      characterModel: 'img::character',
      locationModel: null,
      editModel: 'img::edit',
      storyboardModel: 'img::storyboard',
      analysisModel: 'llm::analysis',
    })
    const routeCase = getDirectRouteCaseOrThrow('src/app/api/novel-promotion/[projectId]/regenerate-group/route.ts')
    const res = await invokePostRoute({
      ...routeCase,
      body: { type: 'location', id: 'location-1' },
    })

    expect(res.status).toBe(400)
    expect(submitTaskMock).not.toHaveBeenCalled()
    const json = await res.json() as { code?: string, message?: string }
    expect(json.code).toBe('MISSING_CONFIG')
    expect(json.message).toBe('请先在项目设置中配置"场景图像模型"')
  })

  it('bugfix: regenerate-single-image character returns MISSING_CONFIG when characterModel is absent', async () => {
    configServiceMock.getProjectModelConfig.mockResolvedValueOnce({
      characterModel: null,
      locationModel: 'img::location',
      editModel: 'img::edit',
      storyboardModel: 'img::storyboard',
      analysisModel: 'llm::analysis',
    })
    const routeCase = getDirectRouteCaseOrThrow('src/app/api/novel-promotion/[projectId]/regenerate-single-image/route.ts')
    const res = await invokePostRoute(routeCase)

    expect(res.status).toBe(400)
    expect(submitTaskMock).not.toHaveBeenCalled()
    const json = await res.json() as { code?: string, message?: string }
    expect(json.code).toBe('MISSING_CONFIG')
    expect(json.message).toBe('请先在项目设置中配置"角色图像模型"')
  })

  it('bugfix: regenerate-single-image location returns MISSING_CONFIG when locationModel is absent', async () => {
    configServiceMock.getProjectModelConfig.mockResolvedValueOnce({
      characterModel: 'img::character',
      locationModel: null,
      editModel: 'img::edit',
      storyboardModel: 'img::storyboard',
      analysisModel: 'llm::analysis',
    })
    const routeCase = getDirectRouteCaseOrThrow('src/app/api/novel-promotion/[projectId]/regenerate-single-image/route.ts')
    const res = await invokePostRoute({
      ...routeCase,
      body: { type: 'location', id: 'location-1', imageIndex: 0 },
    })

    expect(res.status).toBe(400)
    expect(submitTaskMock).not.toHaveBeenCalled()
    const json = await res.json() as { code?: string, message?: string }
    expect(json.code).toBe('MISSING_CONFIG')
    expect(json.message).toBe('请先在项目设置中配置"场景图像模型"')
  })
})
