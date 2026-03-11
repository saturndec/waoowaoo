import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveModelSelectionMock = vi.hoisted(() =>
  vi.fn(async () => ({
    provider: 'openai-compatible:oa-1',
    modelId: 'gpt-image-1',
    modelKey: 'openai-compatible:oa-1::gpt-image-1',
    mediaType: 'image',
    compatMediaTemplate: undefined,
  })),
)
const getProviderConfigMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'openai-compatible:oa-1',
    name: 'OpenAI Compat',
    apiKey: 'oa-key',
    gatewayRoute: 'openai-compat' as const,
  })),
)
const resolveModelGatewayRouteMock = vi.hoisted(() => vi.fn(() => 'openai-compat'))
const generateImageViaOpenAICompatMock = vi.hoisted(() => vi.fn(async () => ({ success: true, imageUrl: 'image' })))
const generateVideoViaOpenAICompatMock = vi.hoisted(() => vi.fn(async () => ({ success: true, videoUrl: 'video' })))
const generateImageViaOpenAICompatTemplateMock = vi.hoisted(() => vi.fn(async () => ({ success: true, imageUrl: 'image' })))
const generateVideoViaOpenAICompatTemplateMock = vi.hoisted(() => vi.fn(async () => ({ success: true, videoUrl: 'video' })))

vi.mock('@/lib/api-config', () => ({
  resolveModelSelection: resolveModelSelectionMock,
  getProviderConfig: getProviderConfigMock,
  getProviderKey: (providerId: string) => providerId.split(':')[0] || providerId,
}))

vi.mock('@/lib/model-gateway', () => ({
  resolveModelGatewayRoute: resolveModelGatewayRouteMock,
  generateImageViaOpenAICompat: generateImageViaOpenAICompatMock,
  generateVideoViaOpenAICompat: generateVideoViaOpenAICompatMock,
  generateImageViaOpenAICompatTemplate: generateImageViaOpenAICompatTemplateMock,
  generateVideoViaOpenAICompatTemplate: generateVideoViaOpenAICompatTemplateMock,
}))

vi.mock('@/lib/generators/factory', () => ({
  createImageGenerator: vi.fn(() => ({ generate: vi.fn() })),
  createVideoGenerator: vi.fn(() => ({ generate: vi.fn() })),
  createAudioGenerator: vi.fn(() => ({ generate: vi.fn() })),
}))

vi.mock('@/lib/providers/bailian', () => ({
  generateBailianImage: vi.fn(),
  generateBailianVideo: vi.fn(),
  generateBailianAudio: vi.fn(),
}))

vi.mock('@/lib/providers/siliconflow', () => ({
  generateSiliconFlowImage: vi.fn(),
  generateSiliconFlowVideo: vi.fn(),
  generateSiliconFlowAudio: vi.fn(),
}))

import { generateImage, generateVideo } from '@/lib/generator-api'

describe('generator-api requires compat media template for openai-compatible media', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveModelGatewayRouteMock.mockReturnValue('openai-compat')
    getProviderConfigMock.mockResolvedValue({
      id: 'openai-compatible:oa-1',
      name: 'OpenAI Compat',
      apiKey: 'oa-key',
      gatewayRoute: 'openai-compat',
    })
  })

  it('throws for image model without compatMediaTemplate', async () => {
    resolveModelSelectionMock.mockResolvedValueOnce({
      provider: 'openai-compatible:oa-1',
      modelId: 'gpt-image-1',
      modelKey: 'openai-compatible:oa-1::gpt-image-1',
      mediaType: 'image',
      compatMediaTemplate: undefined,
    })

    await expect(
      generateImage('user-1', 'openai-compatible:oa-1::gpt-image-1', 'draw cat'),
    ).rejects.toThrow('MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED')

    expect(generateImageViaOpenAICompatMock).not.toHaveBeenCalled()
    expect(generateImageViaOpenAICompatTemplateMock).not.toHaveBeenCalled()
  })

  it('throws for video model without compatMediaTemplate', async () => {
    resolveModelSelectionMock.mockResolvedValueOnce({
      provider: 'openai-compatible:oa-1',
      modelId: 'veo3.1',
      modelKey: 'openai-compatible:oa-1::veo3.1',
      mediaType: 'video',
      compatMediaTemplate: undefined,
    })

    await expect(
      generateVideo('user-1', 'openai-compatible:oa-1::veo3.1', 'https://example.com/a.png', { prompt: 'animate' }),
    ).rejects.toThrow('MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED')

    expect(generateVideoViaOpenAICompatMock).not.toHaveBeenCalled()
    expect(generateVideoViaOpenAICompatTemplateMock).not.toHaveBeenCalled()
  })

  it('throws for grok image model without compatMediaTemplate', async () => {
    resolveModelSelectionMock.mockResolvedValueOnce({
      provider: 'grok-compatible:gk-1',
      modelId: 'grok-2-image',
      modelKey: 'grok-compatible:gk-1::grok-2-image',
      mediaType: 'image',
      compatMediaTemplate: undefined,
    })
    getProviderConfigMock.mockResolvedValueOnce({
      id: 'grok-compatible:gk-1',
      name: 'Grok Compat',
      apiKey: 'xai-key',
      gatewayRoute: 'openai-compat',
    })

    await expect(
      generateImage('user-1', 'grok-compatible:gk-1::grok-2-image', 'draw cat'),
    ).rejects.toThrow('MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED')

    expect(generateImageViaOpenAICompatMock).not.toHaveBeenCalled()
    expect(generateImageViaOpenAICompatTemplateMock).not.toHaveBeenCalled()
  })

  it('throws for grok video model without compatMediaTemplate', async () => {
    resolveModelSelectionMock.mockResolvedValueOnce({
      provider: 'grok-compatible:gk-1',
      modelId: 'grok-video-1',
      modelKey: 'grok-compatible:gk-1::grok-video-1',
      mediaType: 'video',
      compatMediaTemplate: undefined,
    })
    getProviderConfigMock.mockResolvedValueOnce({
      id: 'grok-compatible:gk-1',
      name: 'Grok Compat',
      apiKey: 'xai-key',
      gatewayRoute: 'openai-compat',
    })

    await expect(
      generateVideo('user-1', 'grok-compatible:gk-1::grok-video-1', 'https://example.com/a.png', { prompt: 'animate' }),
    ).rejects.toThrow('MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED')

    expect(generateVideoViaOpenAICompatMock).not.toHaveBeenCalled()
    expect(generateVideoViaOpenAICompatTemplateMock).not.toHaveBeenCalled()
  })
})
