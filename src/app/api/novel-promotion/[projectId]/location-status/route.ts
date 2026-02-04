import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * GET /api/novel-promotion/[projectId]/location-status
 * 查询场景的 generating 状态（用于弹窗轮询）
 */
export const GET = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params
    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get('locationId')
    const imageIndex = searchParams.get('imageIndex')

    if (!locationId) {
        throw new ApiError('INVALID_PARAMS', { message: 'Missing locationId' })
    }

    // 🔐 权限验证
    const authResult = await requireProjectAuth(projectId)
    if (isErrorResponse(authResult)) return authResult

    // 查询 location 下所有图片的 generating 状态
    const location = await prisma.novelPromotionLocation.findUnique({
        where: { id: locationId },
        include: {
            images: {
                select: { imageIndex: true, generating: true }
            }
        }
    })

    if (!location) {
        throw new ApiError('NOT_FOUND', { message: 'Location not found' })
    }

    // 如果指定了 imageIndex，返回特定图片的状态
    if (imageIndex !== null && imageIndex !== undefined) {
        const idx = parseInt(imageIndex, 10)
        const image = location.images.find(img => img.imageIndex === idx)
        return NextResponse.json({
            generating: image?.generating ?? false
        })
    }

    // 否则返回任意图片正在生成的状态（用于判断整体 location 是否在生成）
    const anyGenerating = location.images.some(img => img.generating)
    return NextResponse.json({
        generating: anyGenerating
    })
})
