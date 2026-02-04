import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@/lib/cos'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/asset-hub/select-image
 * 选择/确认图片方案
 */
export const POST = apiHandler(async (request: NextRequest) => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const body = await request.json()
    const { type, id, appearanceIndex, imageIndex, confirm } = body

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

        // 如果是确认选择，将 selectedIndex 对应的图片设置为 imageUrl
        if (confirm && appearance.selectedIndex !== null) {
            let imageUrls: (string | null)[] = []
            if (appearance.imageUrls) {
                try { imageUrls = JSON.parse(appearance.imageUrls) } catch { }
            }
            const selectedUrl = imageUrls[appearance.selectedIndex]

            if (selectedUrl) {
                await (prisma as any).globalCharacterAppearance.update({
                    where: { id: appearance.id },
                    data: {
                        imageUrl: selectedUrl,
                        imageUrls: JSON.stringify([selectedUrl]), // 只保留选中的图片
                        selectedIndex: 0
                    }
                })
            }
        } else {
            // 只是选择，不确认
            await (prisma as any).globalCharacterAppearance.update({
                where: { id: appearance.id },
                data: { selectedIndex: imageIndex }
            })
        }

        return NextResponse.json({ success: true })

    } else if (type === 'location') {
        const location = await (prisma as any).globalLocation.findFirst({
            where: { id, userId: session.user.id },
            include: { images: true }
        })

        if (!location) {
            throw new ApiError('NOT_FOUND', { message: 'Location not found' })
        }

        // 更新选中状态
        await (prisma as any).globalLocationImage.updateMany({
            where: { locationId: id },
            data: { isSelected: false }
        })

        if (imageIndex !== null && imageIndex !== undefined) {
            const targetImage = location.images?.find((img: any) => img.imageIndex === imageIndex)
            if (targetImage) {
                await (prisma as any).globalLocationImage.update({
                    where: { id: targetImage.id },
                    data: { isSelected: true }
                })
            }
        }

        return NextResponse.json({ success: true })

    } else {
        throw new ApiError('INVALID_PARAMS', { message: 'Invalid type' })
    }
})
