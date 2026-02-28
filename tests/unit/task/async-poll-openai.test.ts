import { beforeEach, describe, expect, it, vi } from 'vitest'

const openaiState = vi.hoisted(() => ({
  retrieve: vi.fn(),
}))

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'openai-compatible:oa-1',
  apiKey: 'oa-key',
  baseUrl: 'https://oa.test/v1',
})))

vi.mock('openai', () => ({
  default: class OpenAI {
    videos = {
      retrieve: openaiState.retrieve,
    }
  },
}))

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

import { pollAsyncTask } from '@/lib/async-poll'

const PROVIDER_TOKEN = Buffer.from('openai-compatible:oa-1', 'utf8').toString('base64url')

describe('async poll OPENAI video status mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getProviderConfigMock.mockResolvedValue({
      id: 'openai-compatible:oa-1',
      apiKey: 'oa-key',
      baseUrl: 'https://oa.test/v1',
    })
  })

  it('maps queued/in_progress to pending', async () => {
    openaiState.retrieve
      .mockResolvedValueOnce({ status: 'queued' })
      .mockResolvedValueOnce({ status: 'in_progress' })

    const queued = await pollAsyncTask(`OPENAI:VIDEO:${PROVIDER_TOKEN}:vid_queued`, 'user-1')
    const progress = await pollAsyncTask(`OPENAI:VIDEO:${PROVIDER_TOKEN}:vid_running`, 'user-1')

    expect(queued).toEqual({ status: 'pending' })
    expect(progress).toEqual({ status: 'pending' })
  })

  it('maps completed to downloadable url and auth headers', async () => {
    openaiState.retrieve.mockResolvedValueOnce({
      id: 'vid_done',
      status: 'completed',
    })

    const result = await pollAsyncTask(`OPENAI:VIDEO:${PROVIDER_TOKEN}:vid_done`, 'user-1')

    expect(result.status).toBe('completed')
    expect(result.resultUrl).toBe('https://oa.test/v1/videos/vid_done/content')
    expect(result.videoUrl).toBe('https://oa.test/v1/videos/vid_done/content')
    expect(result.downloadHeaders).toEqual({
      Authorization: 'Bearer oa-key',
    })
  })

  it('maps failed to failed with provider error message', async () => {
    openaiState.retrieve.mockResolvedValueOnce({
      id: 'vid_failed',
      status: 'failed',
      error: { message: 'generation failed' },
    })

    const result = await pollAsyncTask(`OPENAI:VIDEO:${PROVIDER_TOKEN}:vid_failed`, 'user-1')
    expect(result).toEqual({ status: 'failed', error: 'generation failed' })
  })
})
