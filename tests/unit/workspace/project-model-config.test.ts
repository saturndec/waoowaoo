import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  novelPromotionProject: {
    findUnique: vi.fn(),
  },
  userPreference: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

import {
  buildImageBillingPayload,
  buildImageBillingPayloadFromUserConfig,
  getProjectModelConfig,
} from '@/lib/config-service'

describe('project model config fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps project models when project has explicit values', async () => {
    prismaMock.novelPromotionProject.findUnique.mockResolvedValueOnce({
      analysisModel: 'project::analysis',
      characterModel: 'project::character',
      locationModel: 'project::location',
      storyboardModel: 'project::storyboard',
      editModel: 'project::edit',
      videoModel: 'project::video',
      videoRatio: '9:16',
      artStyle: 'american-comic',
      capabilityOverrides: null,
    })
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      analysisModel: 'user::analysis',
      characterModel: 'user::character',
      locationModel: 'user::location',
      storyboardModel: 'user::storyboard',
      editModel: 'user::edit',
      videoModel: 'user::video',
      capabilityDefaults: null,
    })

    const result = await getProjectModelConfig('project-1', 'user-1')

    expect(result.analysisModel).toBe('project::analysis')
    expect(result.characterModel).toBe('project::character')
    expect(result.locationModel).toBe('project::location')
    expect(result.storyboardModel).toBe('project::storyboard')
    expect(result.editModel).toBe('project::edit')
    expect(result.videoModel).toBe('project::video')
  })

  it('falls back to user preference models when project values are empty', async () => {
    prismaMock.novelPromotionProject.findUnique.mockResolvedValueOnce({
      analysisModel: null,
      characterModel: null,
      locationModel: null,
      storyboardModel: null,
      editModel: null,
      videoModel: null,
      videoRatio: null,
      artStyle: null,
      capabilityOverrides: null,
    })
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      analysisModel: 'user::analysis',
      characterModel: 'user::character',
      locationModel: 'user::location',
      storyboardModel: 'user::storyboard',
      editModel: 'user::edit',
      videoModel: 'user::video',
      capabilityDefaults: null,
    })

    const result = await getProjectModelConfig('project-1', 'user-1')

    expect(result.analysisModel).toBe('user::analysis')
    expect(result.characterModel).toBe('user::character')
    expect(result.locationModel).toBe('user::location')
    expect(result.storyboardModel).toBe('user::storyboard')
    expect(result.editModel).toBe('user::edit')
    expect(result.videoModel).toBe('user::video')
    expect(result.videoRatio).toBe('16:9')
  })

  it('returns null when both project and user preference models are missing', async () => {
    prismaMock.novelPromotionProject.findUnique.mockResolvedValueOnce(null)
    prismaMock.userPreference.findUnique.mockResolvedValueOnce(null)

    const result = await getProjectModelConfig('project-1', 'user-1')

    expect(result.analysisModel).toBeNull()
    expect(result.characterModel).toBeNull()
    expect(result.locationModel).toBeNull()
    expect(result.storyboardModel).toBeNull()
    expect(result.editModel).toBeNull()
    expect(result.videoModel).toBeNull()
  })

  it('maps CAPABILITY_REQUIRED to user-facing project settings message for image models', async () => {
    prismaMock.novelPromotionProject.findUnique.mockResolvedValueOnce({
      analysisModel: null,
      characterModel: 'gemini-compatible:provider-1::gemini-3.1-flash-image-preview',
      locationModel: null,
      storyboardModel: null,
      editModel: null,
      videoModel: null,
      videoRatio: null,
      artStyle: null,
      capabilityOverrides: null,
    })
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      analysisModel: null,
      characterModel: null,
      locationModel: null,
      storyboardModel: null,
      editModel: null,
      videoModel: null,
      capabilityDefaults: null,
    })

    await expect(buildImageBillingPayload({
      projectId: 'project-1',
      userId: 'user-1',
      imageModel: 'gemini-compatible:provider-1::gemini-3.1-flash-image-preview',
      basePayload: {},
    })).rejects.toThrow('请先在项目设置中为所选图像模型配置"分辨率"')
  })

  it('maps CAPABILITY_REQUIRED to user-facing user settings message for asset-hub image models', () => {
    expect(() => buildImageBillingPayloadFromUserConfig({
      userModelConfig: {
        analysisModel: null,
        characterModel: 'gemini-compatible:provider-1::gemini-3.1-flash-image-preview',
        locationModel: null,
        storyboardModel: null,
        editModel: null,
        videoModel: null,
        capabilityDefaults: {},
      },
      imageModel: 'gemini-compatible:provider-1::gemini-3.1-flash-image-preview',
      basePayload: {},
    })).toThrow('请先在用户配置中为所选图像模型配置"分辨率"')
  })
})
