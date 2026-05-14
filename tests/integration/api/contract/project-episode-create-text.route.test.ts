import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
    project: { id: 'project-1' },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  projectEpisode: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => ({
      id: 'episode-1',
      projectId: 'project-1',
      episodeNumber: 1,
      name: '第 1 集',
      description: null,
      novelText: '第一章内容',
    })),
  },
  project: {
    findUnique: vi.fn(async () => ({
      id: 'project-1',
    })),
    update: vi.fn(async () => ({
      id: 'project-1',
      lastEpisodeId: 'episode-1',
    })),
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('api specific - novel promotion episode create text', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists novelText when callers explicitly provide episode text', async () => {
    const mod = await import('@/app/api/projects/[projectId]/episodes/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/episodes',
      method: 'POST',
      body: {
        name: '第 1 集',
        novelText: '第一章内容',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })

    expect(res.status).toBe(201)
    expect(prismaMock.projectEpisode.create).toHaveBeenCalledWith({
      data: {
        projectId: 'project-1',
        episodeNumber: 1,
        name: '第 1 集',
        description: null,
        novelText: '第一章内容',
      },
    })
    expect(prismaMock.project.update).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: { lastEpisodeId: 'episode-1' },
    })
  })
})
