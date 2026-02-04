import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * 重置所有卡住的 generating 状态
 * POST /api/novel-promotion/[projectId]/reset-generating
 */
export const POST = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const novelPromotionData = await prisma.novelPromotionProject.findUnique({
        where: { projectId },
        include: {
            characters: {
                include: { appearances: true }
            },
            locations: {
                include: { images: true }
            }
        }
    })

    if (!novelPromotionData) {
        throw new ApiError('NOT_FOUND', { message: 'Novel promotion data not found' })
    }

    let resetCount = {
        characterAppearances: 0,
        locationImages: 0
    }

    // 重置所有 CharacterAppearance 的 generating 状态
    for (const character of novelPromotionData.characters) {
        for (const appearance of character.appearances) {
            if (appearance.generating) {
                await (prisma as any).characterAppearance.update({
                    where: { id: appearance.id },
                    data: { generating: false }
                })
                resetCount.characterAppearances++
                console.log(`[reset-generating] 重置角色形象: ${character.name} - ${appearance.changeReason}`)
            }
        }
    }

    // 重置所有 LocationImage 的 generating 状态
    for (const location of novelPromotionData.locations) {
        for (const image of location.images) {
            if (image.generating) {
                await (prisma as any).locationImage.update({
                    where: { id: image.id },
                    data: { generating: false }
                })
                resetCount.locationImages++
                console.log(`[reset-generating] 重置场景图片: ${location.name} - 图片 ${image.imageIndex}`)
            }
        }
    }

    const totalReset = resetCount.characterAppearances + resetCount.locationImages

    if (totalReset === 0) {
        return NextResponse.json({
            success: true,
            message: '没有发现卡住的生成任务',
            resetCount
        })
    }

    return NextResponse.json({
        success: true,
        message: `已重置 ${totalReset} 个卡住的生成任务`,
        resetCount
    })
})
