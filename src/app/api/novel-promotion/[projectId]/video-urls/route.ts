import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * 获取视频下载链接列表（不在服务端下载打包）
 * 适用于客户端直接下载场景，避免大文件传输问题
 */
export const POST = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    // 解析请求体
    const body = await request.json()
    const { episodeId, panelPreferences } = body as {
        episodeId?: string
        panelPreferences?: Record<string, boolean>  // key: panelKey, value: true=口型同步, false=原始
    }

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult
    const project = authResult.project

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

    // 收集所有有视频的 panel
    interface VideoItem {
        fileName: string
        videoUrl: string  // 签名后的完整URL
        clipIndex: number
        panelIndex: number
    }
    const videos: VideoItem[] = []

    // 从 episodes 中获取所有 storyboards 和 clips
    const allStoryboards: any[] = []
    const allClips: any[] = []
    for (const episode of episodes) {
        allStoryboards.push(...(episode.storyboards || []))
        allClips.push(...(episode.clips || []))
    }

    // 遍历所有 storyboard 和 panel
    for (const storyboard of allStoryboards) {
        const clipIndex = allClips.findIndex((c: any) => c.id === storyboard.clipId)

        const panels = (storyboard as any).panels || []
        for (const panel of panels) {
            // 构建 panelKey 用于查找偏好
            const panelKey = `${storyboard.id}-${panel.panelIndex || 0}`
            const preferLipSync = panelPreferences?.[panelKey] ?? true

            // 根据用户偏好选择视频类型
            let videoKey: string | null = null

            if (preferLipSync) {
                videoKey = panel.lipSyncVideoUrl || panel.videoUrl
            } else {
                videoKey = panel.videoUrl || panel.lipSyncVideoUrl
            }

            if (videoKey) {
                // 文件名使用描述，清理非法字符
                const safeDesc = (panel.description || '镜头').slice(0, 50).replace(/[\\/:*?"<>|]/g, '_')

                videos.push({
                    fileName: '', // 临时占位，稍后统一编号
                    videoUrl: '', // 临时占位
                    clipIndex: clipIndex >= 0 ? clipIndex : 999,
                    panelIndex: panel.panelIndex || 0,
                })

                    // 保存原始数据用于后续处理
                    ; (videos[videos.length - 1] as any)._videoKey = videoKey
                    ; (videos[videos.length - 1] as any)._desc = safeDesc
            }
        }
    }

    // 按 clipIndex 和 panelIndex 排序
    videos.sort((a, b) => {
        if (a.clipIndex !== b.clipIndex) {
            return a.clipIndex - b.clipIndex
        }
        return a.panelIndex - b.panelIndex
    })

    // 重新分配连续的全局索引并生成代理URL
    const result = videos.map((v, idx) => {
        const videoKey = (v as any)._videoKey as string
        const safeDesc = (v as any)._desc as string
        const index = idx + 1
        const fileName = `${String(index).padStart(3, '0')}_${safeDesc}.mp4`

        // 使用代理 URL，避免 CORS 问题
        const proxyUrl = `/api/novel-promotion/${projectId}/video-proxy?key=${encodeURIComponent(videoKey)}`

        return {
            index,
            fileName,
            videoUrl: proxyUrl
        }
    })

    if (result.length === 0) {
        throw new ApiError('INVALID_PARAMS', { message: 'No videos to download' })
    }

    return NextResponse.json({
        projectName: project.name,
        videos: result
    })
})
