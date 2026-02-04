import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/asset-hub/undo-image
 * 撤回到上一版本图片（同时恢复描述词）
 */
export const POST = apiHandler(async (request: NextRequest) => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const body = await request.json()
    const { type, id, appearanceIndex, imageIndex } = body

    if (type === 'character') {
        const appearance = await (prisma as any).globalCharacterAppearance.findFirst({
            where: {
                characterId: id,
                appearanceIndex: appearanceIndex ?? 1,
                character: { userId: session.user.id }
            }
        })

        if (!appearance) {
            throw new ApiError('NOT_FOUND', { message: 'Appearance not found' })
        }

        if (!appearance.previousImageUrl && !appearance.previousImageUrls) {
            throw new ApiError('INVALID_PARAMS', { message: 'No previous version' })
        }

        // 恢复上一版本（图片 + 描述词）
        await (prisma as any).globalCharacterAppearance.update({
            where: { id: appearance.id },
            data: {
                imageUrl: appearance.previousImageUrl,
                imageUrls: appearance.previousImageUrls,
                previousImageUrl: null,
                previousImageUrls: null,
                selectedIndex: null,
                // 🔥 同时恢复描述词
                description: appearance.previousDescription ?? appearance.description,
                descriptions: appearance.previousDescriptions ?? appearance.descriptions,
                previousDescription: null,
                previousDescriptions: null
            }
        })

        return NextResponse.json({ success: true, message: '已撤回到上一版本（图片和描述词）' })

    } else if (type === 'location') {
        const location = await (prisma as any).globalLocation.findFirst({
            where: { id, userId: session.user.id },
            include: { images: true }
        })

        if (!location) {
            throw new ApiError('NOT_FOUND', { message: 'Location not found' })
        }

        // 恢复所有图片的上一版本（图片 + 描述词）
        for (const img of location.images || []) {
            if (img.previousImageUrl) {
                await (prisma as any).globalLocationImage.update({
                    where: { id: img.id },
                    data: {
                        imageUrl: img.previousImageUrl,
                        previousImageUrl: null,
                        // 🔥 同时恢复描述词
                        description: img.previousDescription ?? img.description,
                        previousDescription: null
                    }
                })
            }
        }

        return NextResponse.json({ success: true, message: '已撤回到上一版本（图片和描述词）' })

    } else {
        throw new ApiError('INVALID_PARAMS', { message: 'Invalid type' })
    }
})

