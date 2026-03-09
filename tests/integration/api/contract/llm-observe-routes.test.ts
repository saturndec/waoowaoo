import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskType } from '@/lib/task/types'
import { buildMockRequest } from '../../../helpers/request'

type AuthState = {
  authenticated: boolean
  projectMode: 'novel-promotion' | 'other'
}

type LLMRouteCase = {
  routeFile: string
  body: Record<string, unknown>
  params?: Record<string, string>
  expectedTaskType: TaskType
  expectedTargetType: string
  expectedProjectId: string
}

type RouteContext = {
  params: Promise<Record<string, string>>
}

const authState = vi.hoisted<AuthState>(() => ({
  authenticated: true,
  projectMode: 'novel-promotion',
}))

const maybeSubmitLLMTaskMock = vi.hoisted(() =>
  vi.fn(async () => new Response(
    JSON.stringify({ taskId: 'task-1', async: true }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )),
)

const configServiceMock = vi.hoisted(() => ({
  getUserModelConfig: vi.fn(async () => ({
    analysisModel: 'llm::analysis',
  })),
  getProjectModelConfig: vi.fn(async () => ({
    analysisModel: 'llm::analysis',
  })),
}))

const prismaMock = vi.hoisted(() => ({
  globalCharacter: {
    findUnique: vi.fn(async () => ({
      id: 'global-character-1',
      userId: 'user-1',
    })),
  },
  globalLocation: {
    findUnique: vi.fn(async () => ({
      id: 'global-location-1',
      userId: 'user-1',
    })),
  },
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

vi.mock('@/lib/llm-observe/route-task', () => ({
  maybeSubmitLLMTask: maybeSubmitLLMTaskMock,
}))
vi.mock('@/lib/config-service', () => configServiceMock)
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

const ROUTE_CASES: ReadonlyArray<LLMRouteCase> = [
  {
    routeFile: 'src/app/api/asset-hub/ai-design-character/route.ts',
    body: { userInstruction: 'design a heroic character' },
    expectedTaskType: TASK_TYPE.ASSET_HUB_AI_DESIGN_CHARACTER,
    expectedTargetType: 'GlobalAssetHubCharacterDesign',
    expectedProjectId: 'global-asset-hub',
  },
  {
    routeFile: 'src/app/api/asset-hub/ai-design-location/route.ts',
    body: { userInstruction: 'design a noir city location' },
    expectedTaskType: TASK_TYPE.ASSET_HUB_AI_DESIGN_LOCATION,
    expectedTargetType: 'GlobalAssetHubLocationDesign',
    expectedProjectId: 'global-asset-hub',
  },
  {
    routeFile: 'src/app/api/asset-hub/ai-modify-character/route.ts',
    body: {
      characterId: 'global-character-1',
      appearanceIndex: 0,
      currentDescription: 'old desc',
      modifyInstruction: 'make the outfit darker',
    },
    expectedTaskType: TASK_TYPE.ASSET_HUB_AI_MODIFY_CHARACTER,
    expectedTargetType: 'GlobalCharacter',
    expectedProjectId: 'global-asset-hub',
  },
  {
    routeFile: 'src/app/api/asset-hub/ai-modify-location/route.ts',
    body: {
      locationId: 'global-location-1',
      imageIndex: 0,
      currentDescription: 'old location desc',
      modifyInstruction: 'add more fog',
    },
    expectedTaskType: TASK_TYPE.ASSET_HUB_AI_MODIFY_LOCATION,
    expectedTargetType: 'GlobalLocation',
    expectedProjectId: 'global-asset-hub',
  },
  {
    routeFile: 'src/app/api/asset-hub/reference-to-character/route.ts',
    body: { referenceImageUrl: 'https://example.com/ref.png' },
    expectedTaskType: TASK_TYPE.ASSET_HUB_REFERENCE_TO_CHARACTER,
    expectedTargetType: 'GlobalCharacter',
    expectedProjectId: 'global-asset-hub',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/ai-create-character/route.ts',
    body: { userInstruction: 'create a rebel hero' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.AI_CREATE_CHARACTER,
    expectedTargetType: 'NovelPromotionCharacterDesign',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/ai-create-location/route.ts',
    body: { userInstruction: 'create a mountain temple' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.AI_CREATE_LOCATION,
    expectedTargetType: 'NovelPromotionLocationDesign',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/ai-modify-appearance/route.ts',
    body: {
      characterId: 'character-1',
      appearanceId: 'appearance-1',
      currentDescription: 'old appearance',
      modifyInstruction: 'add armor',
    },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.AI_MODIFY_APPEARANCE,
    expectedTargetType: 'CharacterAppearance',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/ai-modify-location/route.ts',
    body: {
      locationId: 'location-1',
      currentDescription: 'old location',
      modifyInstruction: 'add rain',
    },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.AI_MODIFY_LOCATION,
    expectedTargetType: 'NovelPromotionLocation',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/ai-modify-shot-prompt/route.ts',
    body: {
      panelId: 'panel-1',
      currentPrompt: 'old prompt',
      modifyInstruction: 'more dramatic angle',
    },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.AI_MODIFY_SHOT_PROMPT,
    expectedTargetType: 'NovelPromotionPanel',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/analyze-global/route.ts',
    body: {},
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.ANALYZE_GLOBAL,
    expectedTargetType: 'NovelPromotionProject',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/analyze-shot-variants/route.ts',
    body: { panelId: 'panel-1' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.ANALYZE_SHOT_VARIANTS,
    expectedTargetType: 'NovelPromotionPanel',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/analyze/route.ts',
    body: { episodeId: 'episode-1', content: 'Analyze this chapter' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.ANALYZE_NOVEL,
    expectedTargetType: 'NovelPromotionProject',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/character-profile/batch-confirm/route.ts',
    body: { items: ['character-1', 'character-2'] },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.CHARACTER_PROFILE_BATCH_CONFIRM,
    expectedTargetType: 'NovelPromotionProject',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/character-profile/confirm/route.ts',
    body: { characterId: 'character-1' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.CHARACTER_PROFILE_CONFIRM,
    expectedTargetType: 'NovelPromotionCharacter',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/clips/route.ts',
    body: { episodeId: 'episode-1' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.CLIPS_BUILD,
    expectedTargetType: 'NovelPromotionEpisode',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/episodes/split/route.ts',
    body: { content: 'x'.repeat(120) },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.EPISODE_SPLIT_LLM,
    expectedTargetType: 'NovelPromotionProject',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/reference-to-character/route.ts',
    body: { referenceImageUrl: 'https://example.com/ref.png' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.REFERENCE_TO_CHARACTER,
    expectedTargetType: 'NovelPromotionProject',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/screenplay-conversion/route.ts',
    body: { episodeId: 'episode-1' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.SCREENPLAY_CONVERT,
    expectedTargetType: 'NovelPromotionEpisode',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/script-to-storyboard-stream/route.ts',
    body: { episodeId: 'episode-1' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
    expectedTargetType: 'NovelPromotionEpisode',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/quick-manga/route.ts',
    body: {
      episodeId: 'episode-1',
      stage: 'story-to-script',
      content: 'quick manga story content',
      quickManga: {
        enabled: true,
        preset: 'action-battle',
        layout: 'cinematic',
        colorMode: 'black-white',
        style: 'manga ink',
      },
    },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.STORY_TO_SCRIPT_RUN,
    expectedTargetType: 'NovelPromotionEpisode',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/quick-manga/route.ts',
    body: {
      episodeId: 'episode-1',
      stage: 'script-to-storyboard',
      quickManga: {
        enabled: true,
        preset: 'action-battle',
        layout: 'cinematic',
        colorMode: 'black-white',
        style: 'manga ink',
      },
    },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
    expectedTargetType: 'NovelPromotionEpisode',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/story-to-script-stream/route.ts',
    body: { episodeId: 'episode-1', content: 'story text' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.STORY_TO_SCRIPT_RUN,
    expectedTargetType: 'NovelPromotionEpisode',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/novel-promotion/[projectId]/voice-analyze/route.ts',
    body: { episodeId: 'episode-1' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.VOICE_ANALYZE,
    expectedTargetType: 'NovelPromotionEpisode',
    expectedProjectId: 'project-1',
  },
]

async function invokePostRoute(routeCase: LLMRouteCase): Promise<Response> {
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

describe('api contract - llm observe routes (behavior)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true
    authState.projectMode = 'novel-promotion'
    maybeSubmitLLMTaskMock.mockResolvedValue(
      new Response(JSON.stringify({ taskId: 'task-1', async: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  })

  it('keeps expected coverage size', () => {
    expect(ROUTE_CASES.length).toBe(24)
  })

  for (const routeCase of ROUTE_CASES) {
    it(`${routeCase.routeFile} -> returns 401 when unauthenticated`, async () => {
      authState.authenticated = false
      const res = await invokePostRoute(routeCase)
      expect(res.status).toBe(401)
      expect(maybeSubmitLLMTaskMock).not.toHaveBeenCalled()
    })

    it(`${routeCase.routeFile} -> submits llm task with expected contract when authenticated`, async () => {
      const res = await invokePostRoute(routeCase)
      expect(res.status).toBe(200)
      expect(maybeSubmitLLMTaskMock).toHaveBeenCalledWith(expect.objectContaining({
        type: routeCase.expectedTaskType,
        targetType: routeCase.expectedTargetType,
        projectId: routeCase.expectedProjectId,
        userId: 'user-1',
      }))

      const callArg = maybeSubmitLLMTaskMock.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined
      expect(callArg?.type).toBe(routeCase.expectedTaskType)
      expect(callArg?.targetType).toBe(routeCase.expectedTargetType)
      expect(callArg?.projectId).toBe(routeCase.expectedProjectId)
      expect(callArg?.userId).toBe('user-1')

      const json = await res.json() as Record<string, unknown>
      expect(json.async).toBe(true)
      expect(typeof json.taskId).toBe('string')
    })
  }
})
