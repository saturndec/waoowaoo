import { NextRequest, NextResponse } from 'next/server'
import { getSignedUrl, toFetchableUrl } from '@/lib/cos'
import { getMediaObjectByPublicId } from '@/lib/media/service'
import { createScopedLogger } from '@/lib/logging/core'
import { getRequestId } from '@/lib/api-errors'

export const runtime = 'nodejs'

function buildEtag(media: { sha256?: string | null; id: string; updatedAt?: string | null }) {
  if (media.sha256) return `"${media.sha256}"`
  return `W/"media-${media.id}-${media.updatedAt || '0'}"`
}

function toUrlLogMeta(url: string, base?: string): {
  isRelative: boolean
  origin: string | null
  pathname: string | null
} {
  const isRelative = url.startsWith('/')
  try {
    const parsed = isRelative ? new URL(url, base) : new URL(url)
    return {
      isRelative,
      origin: parsed.origin,
      pathname: parsed.pathname,
    }
  } catch {
    return {
      isRelative,
      origin: null,
      pathname: null,
    }
  }
}

function toLogError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  return {
    name: 'UnknownError',
    message: String(error),
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await context.params
  const logger = createScopedLogger({
    module: 'api.media.public',
    action: 'media.public.get',
    requestId: getRequestId(request),
  })
  const media = await getMediaObjectByPublicId(publicId)
  const range = request.headers.get('range')

  if (!media) {
    logger.warn({
      message: 'public media not found',
      details: {
        publicId,
      },
    })
    return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  }
  if (!media.storageKey) {
    logger.error({
      message: 'public media storage key missing',
      errorCode: 'MEDIA_STORAGE_KEY_MISSING',
      retryable: false,
      details: {
        publicId,
        mediaId: media.id,
      },
    })
    return NextResponse.json({ error: 'Media storage key missing' }, { status: 500 })
  }

  const etag = buildEtag({
    id: media.id,
    sha256: media.sha256,
    updatedAt: media.updatedAt || null,
  })

  const ifNoneMatch = request.headers.get('if-none-match')
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }

  const signedUrl = getSignedUrl(media.storageKey)
  const fetchUrl = signedUrl.startsWith('/')
    ? new URL(signedUrl, request.nextUrl.origin).toString()
    : toFetchableUrl(signedUrl)
  logger.info({
    message: 'public media upstream fetch started',
    details: {
      publicId,
      mediaId: media.id,
      mimeType: media.mimeType || null,
      hasRange: Boolean(range),
      storageKeyPrefix: media.storageKey.substring(0, 80),
      signedUrl: toUrlLogMeta(signedUrl, request.nextUrl.origin),
      fetchUrl: toUrlLogMeta(fetchUrl, request.nextUrl.origin),
    },
  })

  let upstream: Response
  try {
    upstream = await fetch(fetchUrl, {
      headers: range ? { Range: range } : undefined,
    })
  } catch (error) {
    logger.error({
      message: 'public media upstream fetch failed',
      errorCode: 'MEDIA_UPSTREAM_FETCH_FAILED',
      retryable: true,
      details: {
        publicId,
        mediaId: media.id,
        hasRange: Boolean(range),
        storageKeyPrefix: media.storageKey.substring(0, 80),
        fetchUrl: toUrlLogMeta(fetchUrl, request.nextUrl.origin),
      },
      error: toLogError(error),
    })
    return NextResponse.json({ error: 'Failed to fetch media' }, { status: 502 })
  }

  if (!upstream.ok) {
    const status = upstream.status === 404 ? 404 : 502
    logger.error({
      message: 'public media upstream returned non-ok status',
      errorCode: 'MEDIA_UPSTREAM_BAD_STATUS',
      retryable: status >= 500,
      details: {
        publicId,
        mediaId: media.id,
        upstreamStatus: upstream.status,
        upstreamContentType: upstream.headers.get('content-type'),
        upstreamContentRange: upstream.headers.get('content-range'),
        upstreamRequestId: upstream.headers.get('x-cos-request-id'),
      },
    })
    return NextResponse.json({ error: 'Failed to fetch media' }, { status })
  }

  const contentType = media.mimeType || upstream.headers.get('content-type') || 'application/octet-stream'
  const contentLength = upstream.headers.get('content-length')
  const contentRange = upstream.headers.get('content-range')
  const acceptRanges = upstream.headers.get('accept-ranges') || (contentType.startsWith('video/') ? 'bytes' : null)

  const headers = new Headers()
  headers.set('Content-Type', contentType)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('ETag', etag)
  if (contentLength) headers.set('Content-Length', contentLength)
  if (contentRange) headers.set('Content-Range', contentRange)
  if (acceptRanges) headers.set('Accept-Ranges', acceptRanges)

  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
  })
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await context.params
  const media = await getMediaObjectByPublicId(publicId)
  if (!media) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  }

  const etag = buildEtag({
    id: media.id,
    sha256: media.sha256,
    updatedAt: media.updatedAt || null,
  })

  const headers = new Headers()
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('ETag', etag)
  if (media.mimeType) headers.set('Content-Type', media.mimeType)
  if (media.sizeBytes != null) headers.set('Content-Length', String(media.sizeBytes))
  return new Response(null, { status: 200, headers })
}
