export type ClipMatchLevel = 'L1' | 'L2' | 'L3'
export type TextMatchLevel = ClipMatchLevel

export type TextMarkerMatch = {
  startIndex: number
  endIndex: number
  level: TextMatchLevel
  confidence: number
}

export type ClipBoundaryMatch = {
  startIndex: number
  endIndex: number
  level: ClipMatchLevel
  confidence: number
}

export type ClipContentMatcher = {
  matchBoundary: (startText: string, endText: string, fromIndex: number) => ClipBoundaryMatch | null
}

export type TextMarkerMatcher = {
  matchMarker: (markerText: string, fromIndex: number) => TextMarkerMatch | null
}

type NormalizedContent = {
  text: string
  rawStartByNorm: number[]
  rawEndByNorm: number[]
}

type ApproximateNormMatch = {
  startNorm: number
  endNorm: number
  confidence: number
}

const APPROX_CONFIDENCE_THRESHOLD = 0.9
const APPROX_MAX_CANDIDATES = 240

const PUNCTUATION_MAP: Record<string, string> = {
  '，': ',',
  '。': '.',
  '！': '!',
  '？': '?',
  '；': ';',
  '：': ':',
  '（': '(',
  '）': ')',
  '【': '[',
  '】': ']',
  '《': '<',
  '》': '>',
  '「': '"',
  '」': '"',
  '『': '"',
  '』': '"',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '、': ',',
  '…': '...',
}

function normalizeChar(ch: string): string {
  const code = ch.charCodeAt(0)
  let normalized = ch
  if (code === 0x3000) {
    normalized = ' '
  } else if (code >= 0xff01 && code <= 0xff5e) {
    normalized = String.fromCharCode(code - 0xfee0)
  }
  const mapped = PUNCTUATION_MAP[normalized]
  return (mapped ?? normalized).toLowerCase()
}

function isWhitespace(ch: string): boolean {
  return /\s/u.test(ch)
}

function buildNormalizedContent(raw: string): NormalizedContent {
  const rawStartByNorm: number[] = []
  const rawEndByNorm: number[] = []
  let text = ''

  for (let i = 0; i < raw.length; i += 1) {
    const transformed = normalizeChar(raw[i])
    for (let j = 0; j < transformed.length; j += 1) {
      const ch = transformed[j]
      if (isWhitespace(ch)) continue
      text += ch
      rawStartByNorm.push(i)
      rawEndByNorm.push(i + 1)
    }
  }

  return {
    text,
    rawStartByNorm,
    rawEndByNorm,
  }
}

function normalizeQuery(text: string): string {
  return buildNormalizedContent(text).text
}

function findNormIndexForRaw(normalized: NormalizedContent, rawIndex: number): number {
  if (normalized.rawStartByNorm.length === 0) return 0
  let left = 0
  let right = normalized.rawStartByNorm.length
  while (left < right) {
    const mid = left + ((right - left) >> 1)
    if (normalized.rawStartByNorm[mid] < rawIndex) {
      left = mid + 1
    } else {
      right = mid
    }
  }
  return left
}

function tryExactRawMatch(content: string, startText: string, endText: string, fromIndex: number): ClipBoundaryMatch | null {
  let startCursor = Math.max(0, fromIndex)
  while (startCursor < content.length) {
    const startIndex = content.indexOf(startText, startCursor)
    if (startIndex === -1) return null
    const endIndex = content.indexOf(endText, startIndex + startText.length)
    if (endIndex !== -1) {
      return {
        startIndex,
        endIndex: endIndex + endText.length,
        level: 'L1',
        confidence: 1,
      }
    }
    startCursor = startIndex + 1
  }
  return null
}

function tryExactRawMarkerMatch(content: string, markerText: string, fromIndex: number): TextMarkerMatch | null {
  const markerIndex = content.indexOf(markerText, Math.max(0, fromIndex))
  if (markerIndex === -1) return null
  return {
    startIndex: markerIndex,
    endIndex: markerIndex + markerText.length,
    level: 'L1',
    confidence: 1,
  }
}

function tryExactNormalizedMatch(
  normalized: NormalizedContent,
  startQuery: string,
  endQuery: string,
  fromIndex: number,
): ClipBoundaryMatch | null {
  let startNormCursor = findNormIndexForRaw(normalized, fromIndex)
  while (startNormCursor < normalized.text.length) {
    const startNormIndex = normalized.text.indexOf(startQuery, startNormCursor)
    if (startNormIndex === -1) return null

    const rawStart = normalized.rawStartByNorm[startNormIndex]
    if (rawStart < fromIndex) {
      startNormCursor = startNormIndex + 1
      continue
    }

    let endNormCursor = startNormIndex + startQuery.length
    while (endNormCursor < normalized.text.length) {
      const endNormIndex = normalized.text.indexOf(endQuery, endNormCursor)
      if (endNormIndex === -1) break
      const endNormLast = endNormIndex + endQuery.length - 1
      const rawEnd = normalized.rawEndByNorm[endNormLast]
      if (rawEnd > rawStart) {
        return {
          startIndex: rawStart,
          endIndex: rawEnd,
          level: 'L2',
          confidence: 0.97,
        }
      }
      endNormCursor = endNormIndex + 1
    }

    startNormCursor = startNormIndex + 1
  }
  return null
}

function tryExactNormalizedMarkerMatch(
  normalized: NormalizedContent,
  markerQuery: string,
  fromIndex: number,
): TextMarkerMatch | null {
  const fromNorm = findNormIndexForRaw(normalized, fromIndex)
  const markerNormIndex = normalized.text.indexOf(markerQuery, fromNorm)
  if (markerNormIndex === -1) return null

  const rawStart = normalized.rawStartByNorm[markerNormIndex]
  if (rawStart < fromIndex) return null
  const markerNormLast = markerNormIndex + markerQuery.length - 1
  const rawEnd = normalized.rawEndByNorm[markerNormLast]
  return {
    startIndex: rawStart,
    endIndex: rawEnd,
    level: 'L2',
    confidence: 0.97,
  }
}

function buildLengthCandidates(baseLength: number): number[] {
  const delta = Math.max(2, Math.floor(baseLength * 0.2))
  const half = Math.max(1, Math.floor(delta / 2))
  const candidates = [
    baseLength - delta,
    baseLength - half,
    baseLength,
    baseLength + half,
    baseLength + delta,
  ].filter((value) => value > 0)

  return [...new Set(candidates)]
}

function collectApproximateStarts(haystack: string, query: string, fromNorm: number): number[] {
  const maxCandidates = APPROX_MAX_CANDIDATES
  const candidates = new Set<number>()
  const queryLength = query.length
  const anchorLength = Math.min(4, queryLength)
  const midOffset = Math.max(0, Math.floor((queryLength - anchorLength) / 2))
  const endOffset = Math.max(0, queryLength - anchorLength)
  const anchors: Array<{ text: string; offset: number }> = [
    { text: query.slice(0, anchorLength), offset: 0 },
    { text: query.slice(midOffset, midOffset + anchorLength), offset: midOffset },
    { text: query.slice(endOffset, endOffset + anchorLength), offset: endOffset },
  ]

  for (const anchor of anchors) {
    if (!anchor.text) continue
    let anchorIdx = haystack.indexOf(anchor.text, fromNorm)
    let scanCount = 0
    while (anchorIdx !== -1 && scanCount < maxCandidates * 4) {
      const candidateStart = anchorIdx - anchor.offset
      if (candidateStart >= fromNorm && candidateStart < haystack.length) {
        candidates.add(candidateStart)
      }
      if (candidates.size >= maxCandidates * 2) break
      anchorIdx = haystack.indexOf(anchor.text, anchorIdx + 1)
      scanCount += 1
    }
  }

  if (candidates.size === 0) {
    const stride = Math.max(1, Math.floor(queryLength / 2))
    for (let i = fromNorm; i < haystack.length; i += stride) {
      candidates.add(i)
      if (candidates.size >= maxCandidates) break
    }
  }

  const sorted = [...candidates].sort((a, b) => a - b)
  if (sorted.length <= maxCandidates) return sorted

  const sampled: number[] = []
  const stride = sorted.length / maxCandidates
  for (let i = 0; i < maxCandidates; i += 1) {
    sampled.push(sorted[Math.floor(i * stride)])
  }
  return sampled
}

function levenshteinDistance(a: string, b: string, maxDistance: number): number {
  if (a === b) return 0
  const aLen = a.length
  const bLen = b.length
  if (Math.abs(aLen - bLen) > maxDistance) return maxDistance + 1

  const prev = new Array<number>(bLen + 1)
  const curr = new Array<number>(bLen + 1)
  for (let j = 0; j <= bLen; j += 1) prev[j] = j

  for (let i = 1; i <= aLen; i += 1) {
    curr[0] = i
    let rowMin = curr[0]
    const aCode = a.charCodeAt(i - 1)
    for (let j = 1; j <= bLen; j += 1) {
      const substitution = aCode === b.charCodeAt(j - 1) ? 0 : 1
      const insertCost = curr[j - 1] + 1
      const deleteCost = prev[j] + 1
      const replaceCost = prev[j - 1] + substitution
      const value = Math.min(insertCost, deleteCost, replaceCost)
      curr[j] = value
      if (value < rowMin) rowMin = value
    }
    if (rowMin > maxDistance) return maxDistance + 1
    for (let j = 0; j <= bLen; j += 1) prev[j] = curr[j]
  }

  return prev[bLen]
}

function scoreApproximateSimilarity(query: string, candidate: string): number {
  const maxLen = Math.max(query.length, candidate.length)
  if (maxLen === 0) return 0
  const allowedDistance = Math.floor((1 - APPROX_CONFIDENCE_THRESHOLD) * maxLen)
  if (Math.abs(query.length - candidate.length) > allowedDistance) return 0
  const distance = levenshteinDistance(query, candidate, allowedDistance)
  if (distance > allowedDistance) return 0
  return 1 - distance / maxLen
}

function findApproximateMatch(
  normalized: NormalizedContent,
  query: string,
  fromIndex: number,
): ApproximateNormMatch | null {
  if (query.length < 8) return null
  const fromNorm = findNormIndexForRaw(normalized, fromIndex)
  const starts = collectApproximateStarts(normalized.text, query, fromNorm)
  const lengthCandidates = buildLengthCandidates(query.length)

  let best: ApproximateNormMatch | null = null
  for (const startNorm of starts) {
    for (const length of lengthCandidates) {
      const endNorm = startNorm + length
      if (endNorm > normalized.text.length) continue
      const candidate = normalized.text.slice(startNorm, endNorm)
      const confidence = scoreApproximateSimilarity(query, candidate)
      if (confidence < APPROX_CONFIDENCE_THRESHOLD) continue
      if (!best || confidence > best.confidence) {
        best = {
          startNorm,
          endNorm,
          confidence,
        }
      }
    }
  }

  return best
}

function tryApproximateNormalizedMatch(
  normalized: NormalizedContent,
  startQuery: string,
  endQuery: string,
  fromIndex: number,
): ClipBoundaryMatch | null {
  const startApprox = findApproximateMatch(normalized, startQuery, fromIndex)
  if (!startApprox) return null

  const rawStart = normalized.rawStartByNorm[startApprox.startNorm]
  if (rawStart < fromIndex) return null

  const startRawEnd = normalized.rawEndByNorm[Math.max(0, startApprox.endNorm - 1)] ?? rawStart
  const endApprox = findApproximateMatch(normalized, endQuery, Math.max(startRawEnd, rawStart))
  if (!endApprox) return null

  const rawEnd = normalized.rawEndByNorm[Math.max(0, endApprox.endNorm - 1)]
  if (rawEnd <= rawStart) return null

  return {
    startIndex: rawStart,
    endIndex: rawEnd,
    level: 'L3',
    confidence: Math.min(startApprox.confidence, endApprox.confidence),
  }
}

function tryApproximateNormalizedMarkerMatch(
  normalized: NormalizedContent,
  markerQuery: string,
  fromIndex: number,
): TextMarkerMatch | null {
  const markerApprox = findApproximateMatch(normalized, markerQuery, fromIndex)
  if (!markerApprox) return null

  const rawStart = normalized.rawStartByNorm[markerApprox.startNorm]
  if (rawStart < fromIndex) return null
  const rawEnd = normalized.rawEndByNorm[Math.max(0, markerApprox.endNorm - 1)]
  if (rawEnd <= rawStart) return null

  return {
    startIndex: rawStart,
    endIndex: rawEnd,
    level: 'L3',
    confidence: markerApprox.confidence,
  }
}

export function createTextMarkerMatcher(content: string): TextMarkerMatcher {
  const normalized = buildNormalizedContent(content)

  return {
    matchMarker(markerText: string, fromIndex: number): TextMarkerMatch | null {
      const marker = markerText.trim()
      if (!marker) return null

      const l1 = tryExactRawMarkerMatch(content, marker, fromIndex)
      if (l1) return l1

      const normalizedMarker = normalizeQuery(marker)
      if (!normalizedMarker) return null

      const l2 = tryExactNormalizedMarkerMatch(normalized, normalizedMarker, fromIndex)
      if (l2) return l2

      const l3 = tryApproximateNormalizedMarkerMatch(normalized, normalizedMarker, fromIndex)
      if (l3) return l3

      return null
    },
  }
}

export function createClipContentMatcher(content: string): ClipContentMatcher {
  const normalized = buildNormalizedContent(content)

  return {
    matchBoundary(startText: string, endText: string, fromIndex: number): ClipBoundaryMatch | null {
      const start = startText.trim()
      const end = endText.trim()
      if (!start || !end) return null

      const l1 = tryExactRawMatch(content, start, end, fromIndex)
      if (l1) return l1

      const normalizedStart = normalizeQuery(start)
      const normalizedEnd = normalizeQuery(end)
      if (!normalizedStart || !normalizedEnd) return null

      const l2 = tryExactNormalizedMatch(normalized, normalizedStart, normalizedEnd, fromIndex)
      if (l2) return l2

      const l3 = tryApproximateNormalizedMatch(normalized, normalizedStart, normalizedEnd, fromIndex)
      if (l3) return l3

      return null
    },
  }
}
