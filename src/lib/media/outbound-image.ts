import path from 'node:path'
import { createScopedLogger } from '@/lib/logging/core'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'

type StorageHelpers = Pick<typeof import('@/lib/storage'), 'getSignedUrl' | 'toFetchableUrl'>

type InputIssueReason =
  | 'next_image_unwrapped'
  | 'empty_value_skipped'
  | 'relative_path_rejected'
  | 'non_string_skipped'

export type OutboundImageInputIssue = {
  index: number
  input: unknown
  normalized?: string
  reason: InputIssueReason
}

export type OutboundImageNormalizeStage =
  | 'normalize_original'
  | 'normalize_base64'
  | 'normalize_reference'

export type OutboundImageNormalizeErrorCode =
  | 'OUTBOUND_IMAGE_EMPTY_INPUT'
  | 'OUTBOUND_IMAGE_UNSUPPORTED_INPUT'
  | 'OUTBOUND_IMAGE_MEDIA_ROUTE_UNRESOLVED'
  | 'OUTBOUND_IMAGE_FETCH_FAILED'
  | 'OUTBOUND_IMAGE_FETCH_EXCEPTION'
  | 'OUTBOUND_IMAGE_REFERENCE_ALL_FAILED'

export class OutboundImageNormalizeError extends Error {
  readonly code: OutboundImageNormalizeErrorCode
  readonly stage: OutboundImageNormalizeStage
  readonly input: string

  constructor(params: {
    code: OutboundImageNormalizeErrorCode
    stage: OutboundImageNormalizeStage
    input: string
    message: string
  }) {
    super(params.message)
    this.name = 'OutboundImageNormalizeError'
    this.code = params.code
    this.stage = params.stage
    this.input = params.input
  }
}

export type OutboundImageNormalizationIssue = {
  index: number
  input: string
  code: OutboundImageNormalizeErrorCode | 'OUTBOUND_IMAGE_UNKNOWN'
  stage: OutboundImageNormalizeStage
  message: string
}

const logger = createScopedLogger({
  module: 'media.outbound-image',
})

const NEXT_IMAGE_PATH = '/_next/image'
const MAX_NEXT_IMAGE_UNWRAP_DEPTH = 6
const SIGNED_URL_TTL_SECONDS = 3600
const STORAGE_KEY_PREFIXES = ['images/', 'video/', 'voice/'] as const
const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
}

let storageHelpersPromise: Promise<StorageHelpers> | null = null

async function getStorageHelpers(): Promise<StorageHelpers> {
  if (!storageHelpersPromise) {
    storageHelpersPromise = import('@/lib/storage').then((mod) => ({
      getSignedUrl: mod.getSignedUrl,
      toFetchableUrl: mod.toFetchableUrl,
    }))
  }
  return await storageHelpersPromise
}

function normalizeInput(input: string): string {
  const value = typeof input === 'string' ? input.trim() : ''
  if (!value) {
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_EMPTY_INPUT',
      stage: 'normalize_original',
      input: String(input ?? ''),
      message: 'outbound image input is empty',
    })
  }
  return value
}

function isDataUrl(value: string): boolean {
  return value.startsWith('data:')
}

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}

function isAbsoluteOrRootPath(value: string): boolean {
  return isHttpUrl(value) || value.startsWith('/')
}

function isStorageKey(value: string): boolean {
  return STORAGE_KEY_PREFIXES.some((prefix) => value.startsWith(prefix))
}

function isNextImagePath(pathname: string): boolean {
  return pathname === NEXT_IMAGE_PATH || pathname.endsWith(NEXT_IMAGE_PATH)
}

function decodeRepeatedly(raw: string): string {
  let value = raw
  for (let i = 0; i < MAX_NEXT_IMAGE_UNWRAP_DEPTH; i += 1) {
    try {
      const decoded = decodeURIComponent(value)
      if (decoded === value) {
        break
      }
      value = decoded
    } catch {
      break
    }
  }
  return value
}

function normalizeUnwrappedTarget(raw: string): string {
  const value = decodeRepeatedly(raw).trim()
  if (!value) return value
  if (isAbsoluteOrRootPath(value) || isDataUrl(value) || isStorageKey(value)) return value
  if (value.startsWith('m/')) return `/${value}`
  if (value.startsWith('api/')) return `/${value}`
  return value
}

function toUrlMaybe(value: string): URL | null {
  try {
    if (isHttpUrl(value)) return new URL(value)
    if (value.startsWith('/')) return new URL(value, 'http://localhost')
  } catch {
    return null
  }
  return null
}

function detectMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length < 4) return null
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  if (buffer.length >= 6 && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a')) return 'image/gif'
  return null
}

function guessContentType(input: string, contentTypeHeader: string | null): string {
  const headerType = contentTypeHeader?.split(';')[0]?.trim()
  if (headerType && headerType !== DEFAULT_CONTENT_TYPE) return headerType
  const parsed = toUrlMaybe(input)
  const pathname = parsed?.pathname ?? input
  const ext = path.extname(pathname).toLowerCase()
  return MIME_BY_EXT[ext] || DEFAULT_CONTENT_TYPE
}

async function signStorageKey(storageKey: string): Promise<string> {
  const { getSignedUrl, toFetchableUrl } = await getStorageHelpers()
  return toFetchableUrl(getSignedUrl(storageKey, SIGNED_URL_TTL_SECONDS))
}

async function toFetchableAbsoluteUrl(value: string): Promise<string> {
  const { toFetchableUrl } = await getStorageHelpers()
  return toFetchableUrl(value)
}

function unwrapNextImageInternal(input: string): string {
  let current = input.trim()
  for (let i = 0; i < MAX_NEXT_IMAGE_UNWRAP_DEPTH; i += 1) {
    const parsed = toUrlMaybe(current)
    if (!parsed || !isNextImagePath(parsed.pathname)) {
      break
    }
    const wrapped = parsed.searchParams.get('url')
    if (!wrapped) {
      break
    }
    const unwrapped = normalizeUnwrappedTarget(wrapped)
    if (!unwrapped || unwrapped === current) {
      break
    }
    current = unwrapped
  }
  return current
}

async function normalizeMediaRouteUrl(input: string): Promise<string | null> {
  const parsed = toUrlMaybe(input)
  if (!parsed || !parsed.pathname.startsWith('/m/')) {
    return null
  }

  const mediaPath = parsed.pathname
  const storageKey = await resolveStorageKeyFromMediaValue(mediaPath)
  if (!storageKey) {
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_MEDIA_ROUTE_UNRESOLVED',
      stage: 'normalize_original',
      input,
      message: `failed to resolve /m route to storage key: ${mediaPath}`,
    })
  }

  return await signStorageKey(storageKey)
}

export function unwrapNextImageDisplayUrl(input: string): string {
  return unwrapNextImageInternal(input)
}

export async function normalizeToOriginalMediaUrl(input: string): Promise<string> {
  const normalizedInput = normalizeInput(input)
  if (isDataUrl(normalizedInput)) {
    return normalizedInput
  }

  const unwrappedInput = unwrapNextImageInternal(normalizedInput)
  if (unwrappedInput !== normalizedInput) {
    return await normalizeToOriginalMediaUrl(unwrappedInput)
  }

  if (isStorageKey(unwrappedInput)) {
    return await signStorageKey(unwrappedInput)
  }

  const mediaRouteUrl = await normalizeMediaRouteUrl(unwrappedInput)
  if (mediaRouteUrl) {
    return mediaRouteUrl
  }

  if (unwrappedInput.startsWith('/')) {
    if (unwrappedInput.startsWith('/api/')) {
      const apiPath = unwrappedInput
      return await toFetchableAbsoluteUrl(apiPath)
    }
    const rootStorageKey = unwrappedInput.slice(1)
    if (isStorageKey(rootStorageKey)) {
      return await signStorageKey(rootStorageKey)
    }
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_UNSUPPORTED_INPUT',
      stage: 'normalize_original',
      input: unwrappedInput,
      message: `unsupported root-relative outbound image input: ${unwrappedInput}`,
    })
  }

  if (isHttpUrl(unwrappedInput)) {
    return unwrappedInput
  }

  const storageKey = await resolveStorageKeyFromMediaValue(unwrappedInput)
  if (storageKey) {
    return await signStorageKey(storageKey)
  }

  throw new OutboundImageNormalizeError({
    code: 'OUTBOUND_IMAGE_UNSUPPORTED_INPUT',
    stage: 'normalize_original',
    input: unwrappedInput,
    message: `unsupported outbound image input: ${unwrappedInput}`,
  })
}

export async function normalizeToBase64ForGeneration(input: string): Promise<string> {
  const normalizedUrl = await normalizeToOriginalMediaUrl(input)
  if (isDataUrl(normalizedUrl)) {
    return normalizedUrl
  }

  const fetchUrl = await toFetchableAbsoluteUrl(normalizedUrl)
  let response: Response
  try {
    response = await fetch(fetchUrl)
  } catch {
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_FETCH_EXCEPTION',
      stage: 'normalize_base64',
      input: normalizedUrl,
      message: `normalizeToBase64ForGeneration fetch exception: ${fetchUrl}`,
    })
  }

  if (!response.ok) {
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_FETCH_FAILED',
      stage: 'normalize_base64',
      input: normalizedUrl,
      message: `normalizeToBase64ForGeneration fetch failed (${response.status}): ${fetchUrl}`,
    })
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const mimeType = detectMimeFromBuffer(buffer) || guessContentType(normalizedUrl, response.headers.get('content-type'))
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

function toNormalizationIssue(
  error: unknown,
  input: string,
  index: number,
): OutboundImageNormalizationIssue {
  if (error instanceof OutboundImageNormalizeError) {
    return {
      index,
      input,
      code: error.code,
      stage: error.stage,
      message: error.message,
    }
  }
  return {
    index,
    input,
    code: 'OUTBOUND_IMAGE_UNKNOWN',
    stage: 'normalize_reference',
    message: error instanceof Error ? error.message : String(error),
  }
}

export async function normalizeReferenceImagesForGeneration(
  inputs: string[],
  options: {
    onIssue?: (issue: OutboundImageNormalizationIssue) => void
    context?: Record<string, unknown>
  } = {},
): Promise<string[]> {
  const seen = new Set<string>()
  const normalized: string[] = []
  let candidateCount = 0

  for (let index = 0; index < inputs.length; index += 1) {
    const item = inputs[index]
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    candidateCount += 1

    try {
      normalized.push(await normalizeToBase64ForGeneration(trimmed))
    } catch (error) {
      const issue = toNormalizationIssue(error, trimmed, index)
      options.onIssue?.(issue)
      logger.warn({
        message: 'reference image normalize failed',
        details: {
          ...issue,
          context: options.context || null,
        },
      })
    }
  }

  if (candidateCount > 0 && normalized.length === 0) {
    throw new OutboundImageNormalizeError({
      code: 'OUTBOUND_IMAGE_REFERENCE_ALL_FAILED',
      stage: 'normalize_reference',
      input: `candidates=${candidateCount}`,
      message: 'all reference images failed to normalize',
    })
  }

  return normalized
}

export function sanitizeImageInputsForTaskPayload(inputs: unknown[]): {
  normalized: string[]
  issues: OutboundImageInputIssue[]
} {
  const issues: OutboundImageInputIssue[] = []
  const normalized: string[] = []
  const seen = new Set<string>()

  for (let i = 0; i < inputs.length; i += 1) {
    const raw = inputs[i]
    if (typeof raw !== 'string') {
      issues.push({ index: i, input: raw, reason: 'non_string_skipped' })
      continue
    }

    const trimmed = raw.trim()
    if (!trimmed) {
      issues.push({ index: i, input: raw, reason: 'empty_value_skipped' })
      continue
    }

    const unwrapped = unwrapNextImageInternal(trimmed)
    if (unwrapped !== trimmed) {
      issues.push({ index: i, input: raw, normalized: unwrapped, reason: 'next_image_unwrapped' })
    }

    if (unwrapped.startsWith('/') && !unwrapped.startsWith('/m/') && !unwrapped.startsWith('/api/')) {
      issues.push({ index: i, input: raw, normalized: unwrapped, reason: 'relative_path_rejected' })
      continue
    }

    if (seen.has(unwrapped)) continue
    seen.add(unwrapped)
    normalized.push(unwrapped)
  }

  return { normalized, issues }
}
