import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * GET /api/novel-promotion/[projectId]/appearance-status
 * 查询角色形象的 generating 状态（用于弹窗轮询）
 */
export const GET = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params
    const { searchParams } = new URL(request.url)
    const appearanceId = searchParams.get('appearanceId')

    if (!appearanceId) {
        throw new ApiError('INVALID_PARAMS', { message: 'Missing appearanceId' })
    }

    // 🔐 权限验证
    const authResult = await requireProjectAuth(projectId)
    if (isErrorResponse(authResult)) return authResult

    // 查询 appearance 状态
    const appearance = await prisma.characterAppearance.findUnique({
        where: { id: appearanceId },
        select: { generating: true }
    })

    if (!appearance) {
        throw new ApiError('NOT_FOUND', { message: 'Appearance not found' })
    }

    return NextResponse.json({
        generating: appearance.generating ?? false
    })
})
