import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mediaServiceMock = vi.hoisted(() => ({
  getMediaObjectByPublicId: vi.fn(),
}))

const cosMock = vi.hoisted(() => ({
  getSignedUrl: vi.fn(),
  toFetchableUrl: vi.fn((value: string) => value),
}))

vi.mock('@/lib/media/service', () => ({
  getMediaObjectByPublicId: mediaServiceMock.getMediaObjectByPublicId,
}))

vi.mock('@/lib/cos', () => ({
  getSignedUrl: cosMock.getSignedUrl,
  toFetchableUrl: cosMock.toFetchableUrl,
}))

type FetchMock = ReturnType<typeof vi.fn>

function buildMediaRow() {
  return {
    id: 'media-1',
    publicId: 'm_public_1',
    storageKey: 'images/sample.png',
    sha256: null,
    mimeType: 'image/png',
    sizeBytes: 128,
    width: 32,
    height: 32,
    durationMs: null,
    updatedAt: '2026-02-28T00:00:00.000Z',
    url: '/m/m_public_1',
  }
}

describe('api specific - /m/[publicId] route', () => {
  let fetchMock: FetchMock

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('bugfix: resolves relative signed url with request origin instead of localhost fallback', async () => {
    mediaServiceMock.getMediaObjectByPublicId.mockResolvedValueOnce(buildMediaRow())
    cosMock.getSignedUrl.mockReturnValueOnce('/api/files/images%2Fsample.png')
    fetchMock.mockResolvedValueOnce(new Response('png-bytes', {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }))

    const mod = await import('@/app/m/[publicId]/route')
    const request = new NextRequest('http://127.0.0.1:4173/m/m_public_1', { method: 'GET' })
    const response = await mod.GET(request, { params: Promise.resolve({ publicId: 'm_public_1' }) })

    expect(response.status).toBe(200)
    const firstCallArgs = fetchMock.mock.calls[0]
    expect(firstCallArgs).toBeDefined()
    if (!firstCallArgs) {
      throw new Error('fetch should be called once')
    }
    const calledUrl = firstCallArgs[0] as string
    const parsed = new URL(calledUrl)
    expect(parsed.port).toBe('4173')
    expect(parsed.pathname).toBe('/api/files/images%2Fsample.png')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: undefined }),
    )
  })

  it('bugfix: returns 502 when upstream fetch throws connection refused', async () => {
    mediaServiceMock.getMediaObjectByPublicId.mockResolvedValueOnce(buildMediaRow())
    cosMock.getSignedUrl.mockReturnValueOnce('/api/files/images%2Fsample.png')
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))

    const mod = await import('@/app/m/[publicId]/route')
    const request = new NextRequest('http://127.0.0.1:4173/m/m_public_1', { method: 'GET' })
    const response = await mod.GET(request, { params: Promise.resolve({ publicId: 'm_public_1' }) })
    const payload = await response.json() as { error?: string }

    expect(response.status).toBe(502)
    expect(payload.error).toBe('Failed to fetch media')
  })
})
