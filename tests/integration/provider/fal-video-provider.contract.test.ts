import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startScenarioServer } from '../../helpers/fakes/scenario-server'

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'fal',
  name: 'fal',
  apiKey: 'fal-key',
  gatewayRoute: 'official' as const,
})))

vi.mock('@/lib/user-api/runtime-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

import { executeFalVideoGeneration } from '@/lib/ai-providers/fal/video'

describe('provider contract - fal video', () => {
  let server: Awaited<ReturnType<typeof startScenarioServer>> | null = null

  beforeEach(async () => {
    vi.clearAllMocks()
    server = await startScenarioServer()
    process.env.FAL_QUEUE_BASE_URL = `${server.baseUrl}/fal`
  })

  afterEach(async () => {
    delete process.env.FAL_QUEUE_BASE_URL
    await server?.close()
    server = null
  })

  it('submits Happy Horse image-to-video payload to the documented fal endpoint', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/fal/alibaba/happy-horse/image-to-video',
      mode: 'success',
      submitResponse: {
        status: 200,
        body: { request_id: 'req_happy_horse_1' },
      },
    })

    const result = await executeFalVideoGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'alibaba/happy-horse/image-to-video',
        modelKey: 'fal::alibaba/happy-horse/image-to-video',
        variantSubKind: 'official',
      },
      imageUrl: 'https://example.com/frame.png',
      options: {
        prompt: 'Bring the scene to life with natural motion and sound.',
        resolution: '1080p',
        duration: 5,
        aspectRatio: '16:9',
      },
    })

    expect(result).toMatchObject({
      success: true,
      async: true,
      requestId: 'req_happy_horse_1',
      endpoint: 'alibaba/happy-horse/image-to-video',
      externalId: 'FAL:VIDEO:alibaba/happy-horse/image-to-video:req_happy_horse_1',
    })

    const requests = server!.getRequests('POST', '/fal/alibaba/happy-horse/image-to-video')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.headers.authorization).toBe('Key fal-key')
    expect(JSON.parse(requests[0]?.bodyText || '{}')).toEqual({
      image_url: 'https://example.com/frame.png',
      prompt: 'Bring the scene to life with natural motion and sound.',
      resolution: '1080p',
      duration: 5,
    })
  })

  it('submits Happy Horse multi-reference payloads to reference-to-video', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/fal/alibaba/happy-horse/reference-to-video',
      mode: 'success',
      submitResponse: {
        status: 200,
        body: { request_id: 'req_happy_horse_ref_1' },
      },
    })

    const result = await executeFalVideoGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'alibaba/happy-horse/image-to-video',
        modelKey: 'fal::alibaba/happy-horse/image-to-video',
        variantSubKind: 'official',
      },
      imageUrl: 'https://example.com/character-1.png',
      options: {
        prompt: 'character1 and character2 walk through the scene.',
        referenceImages: ['https://example.com/character-1.png', 'https://example.com/character-2.png'],
        resolution: '1080p',
        duration: 5,
        aspectRatio: '16:9',
      },
    })

    expect(result).toMatchObject({
      endpoint: 'alibaba/happy-horse/reference-to-video',
      externalId: 'FAL:VIDEO:alibaba/happy-horse/reference-to-video:req_happy_horse_ref_1',
    })

    const requests = server!.getRequests('POST', '/fal/alibaba/happy-horse/reference-to-video')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.headers.authorization).toBe('Key fal-key')
    expect(JSON.parse(requests[0]?.bodyText || '{}')).toEqual({
      prompt: 'character1 and character2 walk through the scene.',
      image_urls: ['https://example.com/character-1.png', 'https://example.com/character-2.png'],
      aspect_ratio: '16:9',
      resolution: '1080p',
      duration: 5,
    })
  })

  it('submits Seedance 2.0 single-image requests to image-to-video', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/fal/bytedance/seedance-2.0/image-to-video',
      mode: 'success',
      submitResponse: {
        status: 200,
        body: { request_id: 'req_seedance_i2v_1' },
      },
    })

    const result = await executeFalVideoGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'bytedance/seedance-2.0',
        modelKey: 'fal::bytedance/seedance-2.0',
        variantSubKind: 'official',
      },
      imageUrl: 'https://example.com/start.png',
      options: {
        prompt: 'A slow cinematic dolly in.',
        resolution: '1080p',
        duration: 8,
        aspectRatio: '16:9',
        generateAudio: true,
      },
    })

    expect(result).toMatchObject({
      endpoint: 'bytedance/seedance-2.0/image-to-video',
      externalId: 'FAL:VIDEO:bytedance/seedance-2.0/image-to-video:req_seedance_i2v_1',
    })
    const requests = server!.getRequests('POST', '/fal/bytedance/seedance-2.0/image-to-video')
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0]?.bodyText || '{}')).toEqual({
      prompt: 'A slow cinematic dolly in.',
      image_url: 'https://example.com/start.png',
      resolution: '1080p',
      duration: '8',
      aspect_ratio: '16:9',
      generate_audio: true,
    })
  })

  it('submits Seedance 2.0 multi-reference requests to reference-to-video', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/fal/bytedance/seedance-2.0/reference-to-video',
      mode: 'success',
      submitResponse: {
        status: 200,
        body: { request_id: 'req_seedance_ref_1' },
      },
    })

    const result = await executeFalVideoGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'bytedance/seedance-2.0',
        modelKey: 'fal::bytedance/seedance-2.0',
        variantSubKind: 'official',
      },
      imageUrl: 'https://example.com/hero.png',
      options: {
        prompt: 'Use @Image1 as the hero and @Image2 as the location.',
        referenceImages: ['https://example.com/hero.png', 'https://example.com/location.png'],
        resolution: '720p',
        duration: 6,
        aspectRatio: 'auto',
        generateAudio: false,
      },
    })

    expect(result).toMatchObject({
      endpoint: 'bytedance/seedance-2.0/reference-to-video',
      externalId: 'FAL:VIDEO:bytedance/seedance-2.0/reference-to-video:req_seedance_ref_1',
    })
    const requests = server!.getRequests('POST', '/fal/bytedance/seedance-2.0/reference-to-video')
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0]?.bodyText || '{}')).toEqual({
      prompt: 'Use @Image1 as the hero and @Image2 as the location.',
      image_urls: ['https://example.com/hero.png', 'https://example.com/location.png'],
      resolution: '720p',
      duration: '6',
      aspect_ratio: 'auto',
      generate_audio: false,
    })
  })

  it('submits Seedance 2.0 prompt-only requests to text-to-video', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/fal/bytedance/seedance-2.0/text-to-video',
      mode: 'success',
      submitResponse: {
        status: 200,
        body: { request_id: 'req_seedance_text_1' },
      },
    })

    const result = await executeFalVideoGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'bytedance/seedance-2.0',
        modelKey: 'fal::bytedance/seedance-2.0',
        variantSubKind: 'official',
      },
      imageUrl: '',
      options: {
        prompt: 'A wide cinematic establishing shot of a futuristic harbor.',
        resolution: '720p',
        duration: 5,
        aspectRatio: '21:9',
        generateAudio: true,
      },
    })

    expect(result).toMatchObject({
      endpoint: 'bytedance/seedance-2.0/text-to-video',
      externalId: 'FAL:VIDEO:bytedance/seedance-2.0/text-to-video:req_seedance_text_1',
    })
    const requests = server!.getRequests('POST', '/fal/bytedance/seedance-2.0/text-to-video')
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0]?.bodyText || '{}')).toEqual({
      prompt: 'A wide cinematic establishing shot of a futuristic harbor.',
      resolution: '720p',
      duration: '5',
      aspect_ratio: '21:9',
      generate_audio: true,
    })
  })

  it('submits Seedance 2.0 Fast single-image requests to fast image-to-video', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/fal/bytedance/seedance-2.0/fast/image-to-video',
      mode: 'success',
      submitResponse: {
        status: 200,
        body: { request_id: 'req_seedance_fast_i2v_1' },
      },
    })

    const result = await executeFalVideoGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'bytedance/seedance-2.0/fast',
        modelKey: 'fal::bytedance/seedance-2.0/fast',
        variantSubKind: 'official',
      },
      imageUrl: 'https://example.com/start.png',
      options: {
        prompt: 'A fast production render.',
        resolution: '720p',
        duration: 4,
        aspectRatio: '16:9',
        generateAudio: true,
      },
    })

    expect(result).toMatchObject({
      endpoint: 'bytedance/seedance-2.0/fast/image-to-video',
      externalId: 'FAL:VIDEO:bytedance/seedance-2.0/fast/image-to-video:req_seedance_fast_i2v_1',
    })
    const requests = server!.getRequests('POST', '/fal/bytedance/seedance-2.0/fast/image-to-video')
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0]?.bodyText || '{}')).toEqual({
      prompt: 'A fast production render.',
      image_url: 'https://example.com/start.png',
      resolution: '720p',
      duration: '4',
      aspect_ratio: '16:9',
      generate_audio: true,
    })
  })

  it('submits Seedance 2.0 Fast multi-reference requests to fast reference-to-video', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/fal/bytedance/seedance-2.0/fast/reference-to-video',
      mode: 'success',
      submitResponse: {
        status: 200,
        body: { request_id: 'req_seedance_fast_ref_1' },
      },
    })

    const result = await executeFalVideoGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'bytedance/seedance-2.0/fast',
        modelKey: 'fal::bytedance/seedance-2.0/fast',
        variantSubKind: 'official',
      },
      imageUrl: 'https://example.com/hero.png',
      options: {
        prompt: 'Use @Image1 as the hero and @Image2 as the location.',
        referenceImages: ['https://example.com/location.png'],
        resolution: '480p',
        duration: 6,
        aspectRatio: 'auto',
        generateAudio: false,
      },
    })

    expect(result).toMatchObject({
      endpoint: 'bytedance/seedance-2.0/fast/reference-to-video',
      externalId: 'FAL:VIDEO:bytedance/seedance-2.0/fast/reference-to-video:req_seedance_fast_ref_1',
    })
    const requests = server!.getRequests('POST', '/fal/bytedance/seedance-2.0/fast/reference-to-video')
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0]?.bodyText || '{}')).toEqual({
      prompt: 'Use @Image1 as the hero and @Image2 as the location.',
      image_urls: ['https://example.com/hero.png', 'https://example.com/location.png'],
      resolution: '480p',
      duration: '6',
      aspect_ratio: 'auto',
      generate_audio: false,
    })
  })

  it('submits Seedance 2.0 Fast prompt-only requests to fast text-to-video', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/fal/bytedance/seedance-2.0/fast/text-to-video',
      mode: 'success',
      submitResponse: {
        status: 200,
        body: { request_id: 'req_seedance_fast_text_1' },
      },
    })

    const result = await executeFalVideoGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'bytedance/seedance-2.0/fast',
        modelKey: 'fal::bytedance/seedance-2.0/fast',
        variantSubKind: 'official',
      },
      imageUrl: '',
      options: {
        prompt: 'A fast prompt-only cinematic scene.',
        resolution: '720p',
        duration: 5,
        aspectRatio: '16:9',
        generateAudio: true,
      },
    })

    expect(result).toMatchObject({
      endpoint: 'bytedance/seedance-2.0/fast/text-to-video',
      externalId: 'FAL:VIDEO:bytedance/seedance-2.0/fast/text-to-video:req_seedance_fast_text_1',
    })
    const requests = server!.getRequests('POST', '/fal/bytedance/seedance-2.0/fast/text-to-video')
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0]?.bodyText || '{}')).toEqual({
      prompt: 'A fast prompt-only cinematic scene.',
      resolution: '720p',
      duration: '5',
      aspect_ratio: '16:9',
      generate_audio: true,
    })
  })
})
