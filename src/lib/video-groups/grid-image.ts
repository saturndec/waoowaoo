import sharp from 'sharp'
import { generateUniqueKey, getObjectBuffer, toFetchableUrl, uploadObject } from '@/lib/storage'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import type { MediaRef } from '@/lib/media/types'
import type { VideoGridMode } from './types'

interface GridImageCell {
  readonly imageUrl?: string | null
  readonly storageKey?: string | null
}

const GRID_SIDE = {
  '2x2': 2,
  '3x3': 3,
} as const satisfies Record<VideoGridMode, number>

async function loadImageBuffer(cell: GridImageCell): Promise<Buffer> {
  if (cell.storageKey) return await getObjectBuffer(cell.storageKey)
  const imageUrl = typeof cell.imageUrl === 'string' ? cell.imageUrl.trim() : ''
  if (!imageUrl) throw new Error('VIDEO_GROUP_REFERENCE_IMAGE_MISSING')
  const response = await fetch(toFetchableUrl(imageUrl))
  if (!response.ok) {
    throw new Error(`VIDEO_GROUP_REFERENCE_IMAGE_DOWNLOAD_FAILED:${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

export async function composeAndStoreGridReferenceImage(params: {
  readonly gridMode: VideoGridMode
  readonly cells: readonly GridImageCell[]
  readonly targetId: string
}): Promise<MediaRef> {
  const side = GRID_SIDE[params.gridMode]
  const expectedCells = side * side
  if (params.cells.length !== expectedCells) {
    throw new Error(`VIDEO_GROUP_REFERENCE_CELL_COUNT_MISMATCH:${params.cells.length}:${expectedCells}`)
  }

  const cellSize = params.gridMode === '2x2' ? 768 : 512
  const gap = 12
  const canvasSize = side * cellSize + (side - 1) * gap
  const background = { r: 8, g: 10, b: 14, alpha: 1 }
  const images = await Promise.all(params.cells.map(async (cell, index) => {
    const buffer = await loadImageBuffer(cell)
    const row = Math.floor(index / side)
    const column = index % side
    const input = await sharp(buffer)
      .resize(cellSize, cellSize, {
        fit: 'contain',
        background,
      })
      .png()
      .toBuffer()
    return {
      input,
      top: row * (cellSize + gap),
      left: column * (cellSize + gap),
    }
  }))

  const output = await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background,
    },
  })
    .composite(images)
    .png()
    .toBuffer()

  const storageKey = await uploadObject(
    output,
    generateUniqueKey(`images/video-group-reference/${params.targetId}`, 'png'),
    1,
    'image/png',
  )

  return await ensureMediaObjectFromStorageKey(storageKey, {
    mimeType: 'image/png',
    sizeBytes: output.byteLength,
    width: canvasSize,
    height: canvasSize,
  })
}
