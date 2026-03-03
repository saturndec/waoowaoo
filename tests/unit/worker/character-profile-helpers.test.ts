import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

import { resolveProjectModel } from '@/lib/workers/handlers/character-profile-helpers'

describe('worker character-profile helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('bugfix: uses fallback analysisModel when project analysisModel is empty', async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      novelPromotionData: {
        id: 'np-project-1',
        analysisModel: null,
      },
    })

    const result = await resolveProjectModel('project-1', 'llm::analysis-from-payload')

    expect(result).toEqual({
      id: 'project-1',
      novelPromotionData: {
        id: 'np-project-1',
        analysisModel: 'llm::analysis-from-payload',
      },
    })
  })

  it('throws explicit error when both project and fallback analysisModel are missing', async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      novelPromotionData: {
        id: 'np-project-1',
        analysisModel: null,
      },
    })

    await expect(resolveProjectModel('project-1', '')).rejects.toThrow('请先在项目设置中配置分析模型')
  })
})
