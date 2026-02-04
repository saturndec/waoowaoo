import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { addSignedUrlsToProject } from '@/lib/cos'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * ⚡ 延迟加载 API - 获取项目的 characters 和 locations 资产
 * 用于资产管理页面，避免首次加载时的性能开销
 */
export const GET = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    // 验证项目所有权
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { userId: true }
    })

    if (!project) {
        throw new ApiError('NOT_FOUND', { message: 'Project not found' })
    }

    if (project.userId !== session.user.id) {
        throw new ApiError('FORBIDDEN')
    }

    // 获取 characters 和 locations（包含嵌套数据）
    const novelPromotionData = await prisma.novelPromotionProject.findUnique({
        where: { projectId },
        include: {
            characters: {
                include: { appearances: { orderBy: { appearanceIndex: 'asc' } } },
                orderBy: { createdAt: 'asc' }
            },
            locations: {
                include: { images: { orderBy: { imageIndex: 'asc' } } },
                orderBy: { createdAt: 'asc' }
            }
        }
    })

    if (!novelPromotionData) {
        throw new ApiError('NOT_FOUND', { message: 'Novel promotion data not found' })
    }

    // 转换 COS Key 为签名 URL
    const dataWithSignedUrls = addSignedUrlsToProject(novelPromotionData)

    return NextResponse.json({
        characters: dataWithSignedUrls.characters || [],
        locations: dataWithSignedUrls.locations || []
    })
})
