import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest, callRoute } from '../../../helpers/request'

type AuthState = { authenticated: boolean }

const authState = vi.hoisted<AuthState>(() => ({ authenticated: true }))
const logProjectActionMock = vi.hoisted(() => vi.fn())

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(async () => ({
      analysisModel: 'llm::analysis',
      characterModel: 'img::character',
      locationModel: 'img::location',
      storyboardModel: 'img::storyboard',
      editModel: 'img::edit',
      videoModel: 'vid::model',
      videoRatio: '9:16',
      artStyle: 'american-comic',
      ttsRate: 1,
    })),
  },
  project: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'project-1',
      ...data,
    })),
    findUnique: vi.fn(async () => ({
      id: 'project-1',
      name: 'Project 1',
      description: null,
      mode: 'novel-promotion',
      userId: 'user-1',
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
      updatedAt: new Date('2026-03-10T00:00:00.000Z'),
      lastAccessedAt: null,
      user: { id: 'user-1' },
    })),
    update: vi.fn(async () => ({})),
  },
  novelPromotionProject: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'np-1', ...data })),
    findUnique: vi.fn(async () => ({
      id: 'np-1',
      projectId: 'project-1',
      capabilityOverrides: null,
      episodes: [],
      characters: [],
      locations: [],
    })),
  },
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireUserAuth: async () => {
      if (!authState.authenticated) return unauthorized()
      return { session: { user: { id: 'user-1' } } }
    },
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/logging/semantic', () => ({ logProjectAction: logProjectActionMock }))

describe('api contract - /api/projects POST projectMode compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true
  })

  it('accepts projectMode=manga and logs manga conversion analytics', async () => {
    const { POST } = await import('@/app/api/projects/route')
    const req = buildMockRequest({
      path: '/api/projects',
      method: 'POST',
      body: {
        name: 'Manga Launch',
        description: 'desc',
        projectMode: 'manga',
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(prismaMock.project.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'Manga Launch',
        description: 'desc',
        mode: 'novel-promotion',
        userId: 'user-1',
      }),
    }))
    expect(logProjectActionMock).toHaveBeenCalledWith(
      'WORKSPACE_MANGA_CONVERSION',
      'workspace manga conversion captured',
      expect.objectContaining({
        event: 'workspace_manga_conversion',
        projectMode: 'manga',
        projectId: 'project-1',
      }),
      'user-1',
    )
  })

  it('keeps backward compatibility when projectMode is omitted without emitting conversion analytics', async () => {
    const { POST } = await import('@/app/api/projects/route')
    const req = buildMockRequest({
      path: '/api/projects',
      method: 'POST',
      body: {
        name: 'Story Launch',
        description: 'desc',
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(logProjectActionMock).not.toHaveBeenCalled()
  })

  it('maps journeyType=manga_webtoon to manga compatibility when projectMode is absent', async () => {
    const { POST } = await import('@/app/api/projects/route')
    const req = buildMockRequest({
      path: '/api/projects',
      method: 'POST',
      body: {
        name: 'Manga via Journey',
        description: 'desc',
        journeyType: 'manga_webtoon',
        entryIntent: 'manga_story_to_panels',
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(logProjectActionMock).toHaveBeenCalledWith(
      'WORKSPACE_MANGA_CONVERSION',
      'workspace manga conversion captured',
      expect.objectContaining({
        event: 'workspace_manga_conversion',
        projectMode: 'manga',
        journeyType: 'manga_webtoon',
        entryIntent: 'manga_story_to_panels',
        projectId: 'project-1',
      }),
      'user-1',
    )
  })

  it('keeps explicit projectMode precedence even when journeyType conflicts', async () => {
    const { POST } = await import('@/app/api/projects/route')
    const req = buildMockRequest({
      path: '/api/projects',
      method: 'POST',
      body: {
        name: 'Explicit Story Wins',
        description: 'desc',
        projectMode: 'story',
        journeyType: 'manga_webtoon',
        entryIntent: 'manga_quickstart',
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(logProjectActionMock).not.toHaveBeenCalled()
  })

  it('persists sourceType/sourceContent via onboarding context bridge for dual-journey create', async () => {
    const { POST } = await import('@/app/api/projects/route')
    const req = buildMockRequest({
      path: '/api/projects',
      method: 'POST',
      body: {
        name: 'Manga Story Source',
        description: 'desc',
        journeyType: 'manga_webtoon',
        entryIntent: 'manga_story_to_panels',
        sourceType: 'story_text',
        sourceContent: 'Panel 1 setup and dialogue',
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(prismaMock.novelPromotionProject.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        projectId: 'project-1',
        capabilityOverrides: expect.any(String),
      }),
    }))

    const createArg = prismaMock.novelPromotionProject.create.mock.calls[0]?.[0]
    const capabilityOverrides = String(createArg?.data?.capabilityOverrides || '{}')
    const parsed = JSON.parse(capabilityOverrides)

    expect(parsed.__workspaceOnboardingContext).toMatchObject({
      journeyType: 'manga_webtoon',
      entryIntent: 'manga_story_to_panels',
      sourceType: 'story_text',
      sourceContent: 'Panel 1 setup and dialogue',
    })
  })

  it('returns onboardingContext in GET /api/projects/[projectId]/data response', async () => {
    prismaMock.novelPromotionProject.findUnique.mockResolvedValueOnce({
      id: 'np-1',
      projectId: 'project-1',
      capabilityOverrides: JSON.stringify({
        __workspaceOnboardingContext: {
          journeyType: 'manga_webtoon',
          entryIntent: 'manga_story_to_panels',
          sourceType: 'import_script',
          sourceContent: 'SCENE 1',
          capturedAt: '2026-03-10T16:00:00.000Z',
        },
      }),
      episodes: [],
      characters: [],
      locations: [],
    })

    const { GET } = await import('@/app/api/projects/[projectId]/data/route')
    const res = await callRoute(GET, {
      path: '/api/projects/project-1/data',
      method: 'GET',
      context: { params: Promise.resolve({ projectId: 'project-1' }) },
    })

    expect(res.status).toBe(200)
    const payload = await res.json()
    expect(payload?.project?.novelPromotionData?.onboardingContext).toMatchObject({
      journeyType: 'manga_webtoon',
      entryIntent: 'manga_story_to_panels',
      sourceType: 'import_script',
      sourceContent: 'SCENE 1',
    })
  })
})
