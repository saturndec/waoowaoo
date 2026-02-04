/**
 * 撤回重新生成的图片，恢复到上一版本
 * POST /api/novel-promotion/[projectId]/undo-regenerate
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deleteCOSObject } from '@/lib/cos'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

export const POST = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const { type, id, appearanceId } = await request.json()

    // 🔒 UUID 格式验证辅助函数
    const isValidUUID = (str: any): boolean => {
        if (typeof str !== 'string') return false
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        return uuidRegex.test(str)
    }

    if (!type || !id) {
        throw new ApiError('INVALID_PARAMS', { message: 'Missing required parameters' })
    }

    if (type === 'character') {
        // 🔒 验证 appearanceId 是有效的 UUID
        if (!appearanceId || !isValidUUID(appearanceId)) {
            console.error(`[undo-regenerate] 收到无效的 appearanceId: ${appearanceId} (类型: ${typeof appearanceId})`)
            throw new ApiError('INVALID_PARAMS', {
                message: `appearanceId 必须是有效的 UUID，但收到: ${appearanceId}`
            })
        }
        return await undoCharacterRegenerate(id, appearanceId)
    } else if (type === 'location') {
        return await undoLocationRegenerate(id)
    } else if (type === 'panel') {
        return await undoPanelRegenerate(id)
    }

    throw new ApiError('INVALID_PARAMS', { message: 'Invalid type' })
})

async function undoCharacterRegenerate(characterId: string, appearanceId: string) {
    // 使用 UUID 直接查询形象
    const appearance = await (prisma as any).characterAppearance.findUnique({
        where: { id: appearanceId },
        include: { character: true }
    })

    if (!appearance) {
        throw new ApiError('NOT_FOUND', { message: 'Appearance not found' })
    }

    // 检查是否有上一版本
    if (!appearance.previousImageUrl && !appearance.previousImageUrls) {
        throw new ApiError('INVALID_PARAMS', { message: '没有可以撤回的历史版本' })
    }

    // 删除当前图片
    let currentImageUrls: string[] = []
    if (appearance.imageUrls) {
        try { currentImageUrls = JSON.parse(appearance.imageUrls) } catch { }
    }
    for (const key of currentImageUrls) {
        if (key) {
            try { await deleteCOSObject(key) } catch { }
        }
    }

    // 恢复上一版本
    let previousImageUrls: string[] = []
    if (appearance.previousImageUrls) {
        try { previousImageUrls = JSON.parse(appearance.previousImageUrls) } catch { }
    }

    await prisma.$transaction(async (tx) => {
        await (tx as any).characterAppearance.update({
            where: { id: appearance.id },
            data: {
                imageUrl: appearance.previousImageUrl,
                imageUrls: previousImageUrls.length > 0 ? JSON.stringify(previousImageUrls) : null,
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
    })

    return NextResponse.json({
        success: true,
        message: '已撤回到上一版本（图片和描述词）'
    })
}

async function undoLocationRegenerate(locationId: string) {
    // 获取场景和图片
    const location = await (prisma as any).novelPromotionLocation.findUnique({
        where: { id: locationId },
        include: { images: { orderBy: { imageIndex: 'asc' } } }
    })

    if (!location) {
        throw new ApiError('NOT_FOUND', { message: 'Location not found' })
    }

    // 检查是否有上一版本
    const hasPrevious = location.images?.some((img: any) => img.previousImageUrl)
    if (!hasPrevious) {
        throw new ApiError('INVALID_PARAMS', { message: '没有可以撤回的历史版本' })
    }

    // 删除当前图片并恢复上一版本
    await prisma.$transaction(async (tx) => {
        for (const img of location.images || []) {
            if (img.previousImageUrl) {
                // 删除当前图片
                if (img.imageUrl) {
                    try { await deleteCOSObject(img.imageUrl) } catch { }
                }
                // 恢复上一版本（图片 + 描述词）
                await (tx as any).locationImage.update({
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
    })

    return NextResponse.json({
        success: true,
        message: '已撤回到上一版本（图片和描述词）'
    })
}

/**
 * 撤回 Panel 镜头图片到上一版本
 */
async function undoPanelRegenerate(panelId: string) {
    // 获取镜头
    const panel = await (prisma as any).novelPromotionPanel.findUnique({
        where: { id: panelId }
    })

    if (!panel) {
        throw new ApiError('NOT_FOUND', { message: 'Panel not found' })
    }

    // 检查是否有上一版本
    if (!panel.previousImageUrl) {
        throw new ApiError('INVALID_PARAMS', { message: '没有可以撤回的历史版本' })
    }

    // 删除当前图片（如果存在）
    if (panel.imageUrl) {
        try { await deleteCOSObject(panel.imageUrl) } catch { }
    }

    // 恢复上一版本
    await (prisma as any).novelPromotionPanel.update({
        where: { id: panelId },
        data: {
            imageUrl: panel.previousImageUrl,
            previousImageUrl: null,
            candidateImages: null  // 清空候选图片
        }
    })

    return NextResponse.json({
        success: true,
        message: '镜头图片已撤回到上一版本'
    })
}
