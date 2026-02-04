import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import archiver from 'archiver'
import { getCOSClient, getSignedUrl } from '@/lib/cos'
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

  // 获取配音台词
  const whereClause: any = {
    audioUrl: { not: null }
  }

  if (episodeId) {
    whereClause.episodeId = episodeId
  } else {
    // 如果没有指定 episodeId，获取该项目所有剧集的配音
    const npData = await prisma.novelPromotionProject.findFirst({
      where: { projectId },
      include: { episodes: { select: { id: true } } }
    })
    if (npData?.episodes) {
      whereClause.episodeId = { in: npData.episodes.map(e => e.id) }
    }
  }

  const voiceLines = await prisma.novelPromotionVoiceLine.findMany({
    where: whereClause,
    orderBy: [
      { lineIndex: 'asc' }  // 按台词序号排序（绝对顺序）
    ]
  })

  if (voiceLines.length === 0) {
    throw new ApiError('NOT_FOUND', { message: 'No voice lines to download' })
  }

  console.log(`Preparing to download ${voiceLines.length} voice lines for project ${projectId}`)

  const archive = archiver('zip', { zlib: { level: 9 } })

  const stream = new ReadableStream({
    start(controller) {
      archive.on('data', (chunk) => controller.enqueue(chunk))
      archive.on('end', () => controller.close())
      archive.on('error', (err) => controller.error(err))
      processVoices()
    }
  })

  async function processVoices() {
    const cos = getCOSClient()

    for (const line of voiceLines) {
      try {
        if (!line.audioUrl) continue

        console.log(`Downloading voice ${line.lineIndex}: ${line.audioUrl}`)

        let audioData: Buffer

        // 判断是 COS Key 还是外部 URL
        if (line.audioUrl.startsWith('http://') || line.audioUrl.startsWith('https://')) {
          // 外部 URL，直接下载
          const response = await fetch(line.audioUrl)
          if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.statusText}`)
          }
          const arrayBuffer = await response.arrayBuffer()
          audioData = Buffer.from(arrayBuffer)
        } else {
          // COS Key，从 COS 下载
          audioData = await new Promise<Buffer>((resolve, reject) => {
            cos.getObject(
              {
                Bucket: process.env.COS_BUCKET!,
                Region: process.env.COS_REGION!,
                Key: line.audioUrl!
              },
              (err, data) => {
                if (err) reject(err)
                else resolve(data.Body as Buffer)
              }
            )
          })
        }

        // 清理发言人名称中的非法字符
        const safeSpeaker = line.speaker.replace(/[\\/:*?"<>|]/g, '_')

        // 截取台词内容前15字作为文件名的一部分
        const safeContent = line.content.slice(0, 15).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')

        // 确定文件扩展名
        const ext = line.audioUrl.endsWith('.wav') ? 'wav' : 'mp3'

        // 文件名格式: 序号_名字_语音内容.mp3（按绝对顺序排列，不按发言人分文件夹）
        const fileName = `${String(line.lineIndex).padStart(3, '0')}_${safeSpeaker}_${safeContent}.${ext}`

        archive.append(audioData, { name: fileName })
        console.log(`Added ${fileName} to archive`)
      } catch (error) {
        console.error(`Failed to download voice line ${line.lineIndex}:`, error)
      }
    }

    await archive.finalize()
    console.log('Archive finalized')
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(project.name)}_voices.zip"`
    }
  })
})
