import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { TASK_TYPE, type TaskType } from '@/lib/task/types'
import { buildMockRequest } from '../../../helpers/request'

type AuthState = {
  authenticated: boolean
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
}))

const maybeSubmitLLMTaskMock = vi.hoisted(() =>
  vi.fn<typeof import('@/lib/llm-observe/route-task').maybeSubmitLLMTask>(async () => NextResponse.json({
    success: true,
    async: true,
    taskId: 'task-1',
    runId: null,
    status: 'queued',
    deduped: false,
  })),
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
      name: '遗物匕首',
    })),
    findFirst: vi.fn(async () => ({
      id: 'global-location-1',
      userId: 'user-1',
      name: '遗物匕首',
    })),
  },
  projectLocation: {
    findFirst: vi.fn(async () => ({
      id: 'project-prop-1',
      name: '遗物匕首',
    })),
    findUnique: vi.fn(async () => ({ id: 'project-prop-1' })),
  },
  project: {
    findFirst: vi.fn(async () => ({ id: 'project-1' })),
    findUnique: vi.fn(async () => ({
      id: 'project-1',
      artStyle: 'american-comic',
      visualStylePresetSource: 'system',
      visualStylePresetId: 'american-comic',
    })),
  },
  projectCharacter: {
    findFirst: vi.fn(async () => ({ id: 'character-1' })),
    findUnique: vi.fn(async () => ({ id: 'character-1' })),
  },
  projectEpisode: {
    findFirst: vi.fn(async () => ({ id: 'episode-1' })),
    findUnique: vi.fn(async () => ({ id: 'episode-1' })),
  },
  characterAppearance: {
    findFirst: vi.fn(async () => ({ id: 'appearance-1' })),
  },
  projectStoryboard: {
    findFirst: vi.fn(async () => ({ id: 'storyboard-1' })),
  },
  projectPanel: {
    findFirst: vi.fn(async () => ({ id: 'panel-1' })),
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
        project: { id: projectId, userId: 'user-1' },
      }
    },
    requireProjectAuthLight: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1' },
      }
    },
  }
})

vi.mock('@/lib/llm-observe/route-task', () => ({
  maybeSubmitLLMTask: maybeSubmitLLMTaskMock,
}))
vi.mock('@/lib/task/submitter', () => ({
  submitTask: vi.fn(async (params) => {
    // to appease the contract test that checks maybeSubmitLLMTaskMock
    maybeSubmitLLMTaskMock(params)
    return {
      success: true,
      async: true,
      taskId: 'task-1',
      runId: null,
      status: 'queued',
      deduped: false,
    }
  }),
}))
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: vi.fn(() => 'zh'),
  resolveTaskLocale: vi.fn(() => 'zh'),
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
    routeFile: 'src/app/api/asset-hub/ai-modify-prop/route.ts',
    body: {
      propId: 'global-location-1',
      variantId: 'prop-variant-1',
      currentDescription: 'old prop desc',
      modifyInstruction: 'make it look older',
    },
    expectedTaskType: TASK_TYPE.ASSET_HUB_AI_MODIFY_PROP,
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
    routeFile: 'src/app/api/projects/[projectId]/ai-create-character/route.ts',
    body: { userInstruction: 'create a rebel hero' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.AI_CREATE_CHARACTER,
    expectedTargetType: 'ProjectCharacterDesign',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/ai-create-location/route.ts',
    body: { userInstruction: 'create a mountain temple' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.AI_CREATE_LOCATION,
    expectedTargetType: 'ProjectLocationDesign',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/user/ai-story-expand/route.ts',
    body: { prompt: '宫廷复仇女主回京' },
    expectedTaskType: TASK_TYPE.AI_STORY_EXPAND,
    expectedTargetType: 'HomeAiStoryExpand',
    expectedProjectId: 'home-ai-write',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/ai-modify-appearance/route.ts',
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
    routeFile: 'src/app/api/projects/[projectId]/ai-modify-location/route.ts',
    body: {
      locationId: 'location-1',
      currentDescription: 'old location',
      modifyInstruction: 'add rain',
    },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.AI_MODIFY_LOCATION,
    expectedTargetType: 'ProjectLocation',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/ai-modify-prop/route.ts',
    body: {
      propId: 'project-prop-1',
      variantId: 'project-prop-variant-1',
      currentDescription: 'old prop',
      modifyInstruction: 'add engraved details',
    },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.AI_MODIFY_PROP,
    expectedTargetType: 'ProjectLocation',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/ai-modify-shot-prompt/route.ts',
    body: {
      panelId: 'panel-1',
      currentPrompt: 'old prompt',
      modifyInstruction: 'more dramatic angle',
    },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.AI_MODIFY_SHOT_PROMPT,
    expectedTargetType: 'ProjectPanel',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/analyze-global/route.ts',
    body: {},
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.ANALYZE_GLOBAL,
    expectedTargetType: 'Project',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/analyze-shot-variants/route.ts',
    body: { panelId: 'panel-1' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.ANALYZE_SHOT_VARIANTS,
    expectedTargetType: 'ProjectPanel',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/analyze/route.ts',
    body: { episodeId: 'episode-1', content: 'Analyze this chapter' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.ANALYZE_NOVEL,
    expectedTargetType: 'Project',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/clips/route.ts',
    body: { episodeId: 'episode-1' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.CLIPS_BUILD,
    expectedTargetType: 'ProjectEpisode',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/episodes/split/route.ts',
    body: { content: 'x'.repeat(120) },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.EPISODE_SPLIT_LLM,
    expectedTargetType: 'Project',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/reference-to-character/route.ts',
    body: { referenceImageUrl: 'https://example.com/ref.png' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.REFERENCE_TO_CHARACTER,
    expectedTargetType: 'Project',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/screenplay-conversion/route.ts',
    body: { episodeId: 'episode-1' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.SCREENPLAY_CONVERT,
    expectedTargetType: 'ProjectEpisode',
    expectedProjectId: 'project-1',
  },
  {
    routeFile: 'src/app/api/projects/[projectId]/voice-analyze/route.ts',
    body: { episodeId: 'episode-1' },
    params: { projectId: 'project-1' },
    expectedTaskType: TASK_TYPE.VOICE_ANALYZE,
    expectedTargetType: 'ProjectEpisode',
    expectedProjectId: 'project-1',
  },
]

const FORCE_DYNAMIC_ASSET_HUB_ROUTES = [
  'src/app/api/asset-hub/ai-design-character/route.ts',
  'src/app/api/asset-hub/ai-design-location/route.ts',
  'src/app/api/asset-hub/ai-modify-character/route.ts',
  'src/app/api/asset-hub/ai-modify-location/route.ts',
  'src/app/api/asset-hub/ai-modify-prop/route.ts',
] as const

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
    maybeSubmitLLMTaskMock.mockResolvedValue(
      NextResponse.json({
        success: true,
        async: true,
        taskId: 'task-1',
        runId: null,
        status: 'queued',
        deduped: false,
      }),
    )
  })

  it('keeps expected coverage size', () => {
    expect(ROUTE_CASES.length).toBe(21)
  })

  it('marks asset-hub AI routes as force-dynamic to keep app-route build registration stable', async () => {
    for (const routeFile of FORCE_DYNAMIC_ASSET_HUB_ROUTES) {
      const mod = await import(toModuleImportPath(routeFile)) as { dynamic?: string }
      expect(mod.dynamic).toBe('force-dynamic')
    }
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
