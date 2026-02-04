import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@/lib/cos'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * GET /api/novel-promotion/[projectId]/storyboards
 * 获取剧集的分镜数据（用于测试页面）
 */
export const GET = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const { searchParams } = new URL(request.url)
    const episodeId = searchParams.get('episodeId')

    if (!episodeId) {
        throw new ApiError('INVALID_PARAMS', { message: 'episodeId is required' })
    }

    // 获取剧集的分镜数据
    const storyboards = await prisma.novelPromotionStoryboard.findMany({
        where: { episodeId },
        include: {
            clip: true,
            panels: { orderBy: { panelIndex: 'asc' } }
        },
        orderBy: { createdAt: 'asc' }
    })

    // 处理图片URL签名
    const processedStoryboards = storyboards.map(sb => ({
        ...sb,
        storyboardImageUrl: sb.storyboardImageUrl?.startsWith('images/')
            ? getSignedUrl(sb.storyboardImageUrl, 3600)
            : sb.storyboardImageUrl,
        panels: sb.panels.map(p => ({
            ...p,
            imageUrl: p.imageUrl?.startsWith('images/')
                ? getSignedUrl(p.imageUrl, 3600)
                : p.imageUrl
        }))
    }))

    return NextResponse.json({ storyboards: processedStoryboards })
})
