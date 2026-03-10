import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

type AuthState = { authenticated: boolean }

const authState = vi.hoisted<AuthState>(() => ({ authenticated: true }))
const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(async () => null),
  },
  project: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'project-dual-journey-1',
      ...data,
    })),
  },
  novelPromotionProject: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'np-dual-journey-1', ...data })),
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
vi.mock('@/lib/logging/semantic', () => ({ logProjectAction: vi.fn() }))

describe('api contract - /api/projects POST dual-journey onboarding payload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true
  })

  it('accepts dual-journey payload and persists onboarding source context via additive compatibility bridge', async () => {
    const { POST } = await import('@/app/api/projects/route')
    const req = buildMockRequest({
      path: '/api/projects',
      method: 'POST',
      body: {
        name: 'Dual Journey Manga Project',
        description: 'Created from VAT-120 wizard',
        journeyType: 'manga_webtoon',
        entryIntent: 'manga_story_to_panels',
        sourceType: 'import_script',
        sourceContent: 'EXT. CITY - NIGHT\nPanel sequence...',
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(201)

    expect(prismaMock.project.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'Dual Journey Manga Project',
        description: 'Created from VAT-120 wizard',
        mode: 'novel-promotion',
        userId: 'user-1',
      }),
    }))

    expect(prismaMock.novelPromotionProject.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        projectId: 'project-dual-journey-1',
        capabilityOverrides: expect.any(String),
      }),
    }))

    const createArg = prismaMock.novelPromotionProject.create.mock.calls[0]?.[0]
    const parsedOverrides = JSON.parse(String(createArg?.data?.capabilityOverrides || '{}'))

    expect(parsedOverrides.__workspaceOnboardingContext).toMatchObject({
      journeyType: 'manga_webtoon',
      entryIntent: 'manga_story_to_panels',
      sourceType: 'import_script',
      sourceContent: 'EXT. CITY - NIGHT\nPanel sequence...',
    })
  })
})
