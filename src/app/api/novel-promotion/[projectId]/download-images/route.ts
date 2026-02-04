import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import archiver from 'archiver'
import { getCOSClient } from '@/lib/cos'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params
  const { searchParams } = new URL(request.url)
  const episodeId = searchParams.get('episodeId')

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { project } = authResult

  // 根据是否指定 episodeId 来获取数据
  let episodes: any[] = []

  if (episodeId) {
    // 只获取指定剧集的数据
    const episode = await prisma.novelPromotionEpisode.findUnique({
      where: { id: episodeId },
      include: {
        storyboards: {
          include: {
            panels: { orderBy: { panelIndex: 'asc' } }
          },
          orderBy: { createdAt: 'asc' }
        },
        clips: {
          orderBy: { createdAt: 'asc' }
        }
      }
    })
    if (episode) {
      episodes = [episode]
    }
  } else {
    // 获取所有剧集的数据
    const npData = await prisma.novelPromotionProject.findFirst({
      where: { projectId },
      include: {
        episodes: {
          include: {
            storyboards: {
              include: {
                panels: { orderBy: { panelIndex: 'asc' } }
              },
              orderBy: { createdAt: 'asc' }
            },
            clips: {
              orderBy: { createdAt: 'asc' }
            }
          }
        }
      }
    })
    episodes = npData?.episodes || []
  }

  if (episodes.length === 0) {
    throw new ApiError('NOT_FOUND', { message: 'No episodes found' })
  }

  // 收集所有有图片的 panel
  interface ImageItem {
    description: string
    imageUrl: string
    clipIndex: number
    panelIndex: number
  }
  const images: ImageItem[] = []

  // 从 episodes 中获取所有 storyboards 和 clips
  const allStoryboards: any[] = []
  const allClips: any[] = []
  for (const episode of episodes) {
    allStoryboards.push(...(episode.storyboards || []))
    allClips.push(...(episode.clips || []))
  }

  // 遍历所有 storyboard 和 panel
  for (const storyboard of allStoryboards) {
    // 使用 clip 在 clips 数组中的索引来排序
    const clipIndex = allClips.findIndex((c: any) => c.id === storyboard.clipId)

    // 使用独立的 Panel 记录
    const panels = (storyboard as any).panels || []
    for (const panel of panels) {
      if (panel.imageUrl) {
        images.push({
          description: panel.description || `镜头`,
          imageUrl: panel.imageUrl,
          clipIndex: clipIndex >= 0 ? clipIndex : 999,
          panelIndex: panel.panelIndex || 0
        })
      }
    }
  }

  // 按 clipIndex 和 panelIndex 排序
  images.sort((a, b) => {
    if (a.clipIndex !== b.clipIndex) {
      return a.clipIndex - b.clipIndex
    }
    return a.panelIndex - b.panelIndex
  })

  // 重新分配连续的全局索引
  const indexedImages = images.map((v, idx) => ({
    ...v,
    index: idx + 1
  }))

  if (indexedImages.length === 0) {
    throw new ApiError('INVALID_PARAMS', { message: 'No images to download' })
  }

  console.log(`Preparing to download ${indexedImages.length} images for project ${projectId}`)

  const archive = archiver('zip', { zlib: { level: 9 } })

  const stream = new ReadableStream({
    start(controller) {
      archive.on('data', (chunk) => controller.enqueue(chunk))
      archive.on('end', () => controller.close())
      archive.on('error', (err) => controller.error(err))
      processImages()
    }
  })

  async function processImages() {
    const cos = getCOSClient()

    for (const image of indexedImages) {
      try {
        console.log(`Downloading image ${image.index}: ${image.imageUrl}`)

        let imageData: Buffer
        let extension = 'png'

        // 判断是 COS Key 还是外部 URL
        if (image.imageUrl.startsWith('http://') || image.imageUrl.startsWith('https://')) {
          // 外部 URL，直接下载
          const response = await fetch(image.imageUrl)
          if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.statusText}`)
          }
          const arrayBuffer = await response.arrayBuffer()
          imageData = Buffer.from(arrayBuffer)

          // 从 Content-Type 或 URL 获取扩展名
          const contentType = response.headers.get('content-type')
          if (contentType?.includes('jpeg') || contentType?.includes('jpg')) {
            extension = 'jpg'
          } else if (contentType?.includes('webp')) {
            extension = 'webp'
          }
        } else {
          // COS Key，从 COS 下载
          imageData = await new Promise<Buffer>((resolve, reject) => {
            cos.getObject(
              {
                Bucket: process.env.COS_BUCKET!,
                Region: process.env.COS_REGION!,
                Key: image.imageUrl
              },
              (err, data) => {
                if (err) reject(err)
                else resolve(data.Body as Buffer)
              }
            )
          })

          // 从 COS Key 获取扩展名
          const keyExt = image.imageUrl.split('.').pop()?.toLowerCase()
          if (keyExt && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(keyExt)) {
            extension = keyExt === 'jpeg' ? 'jpg' : keyExt
          }
        }

        // 文件名使用描述，清理非法字符
        const safeDesc = image.description.slice(0, 50).replace(/[\\/:*?"<>|]/g, '_')
        const fileName = `${String(image.index).padStart(3, '0')}_${safeDesc}.${extension}`
        archive.append(imageData, { name: fileName })
        console.log(`Added ${fileName} to archive`)
      } catch (error) {
        console.error(`Failed to download image ${image.index}:`, error)
      }
    }

    await archive.finalize()
    console.log('Archive finalized')
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(project.name)}_images.zip"`
    }
  })
})
