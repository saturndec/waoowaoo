import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { updateCharacterAppearanceLabels, updateLocationImageLabels } from '@/lib/image-label'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/novel-promotion/[projectId]/copy-from-global
 * 从资产中心复制角色/场景的形象数据到项目资产
 * 
 * 复制而非引用：即使全局资产被删除，项目资产也不受影响
 */
export const POST = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult
    const session = authResult.session

    const body = await request.json()
    const { type, targetId, globalAssetId } = body

    if (!type || !targetId || !globalAssetId) {
        throw new ApiError('INVALID_PARAMS', { message: 'Missing required fields: type, targetId, globalAssetId' })
    }

    if (type === 'character') {
        return await copyCharacterFromGlobal(session.user.id, targetId, globalAssetId)
    } else if (type === 'location') {
        return await copyLocationFromGlobal(session.user.id, targetId, globalAssetId)
    } else if (type === 'voice') {
        return await copyVoiceFromGlobal(session.user.id, targetId, globalAssetId)
    } else {
        throw new ApiError('INVALID_PARAMS', { message: 'Invalid type. Must be "character", "location", or "voice"' })
    }
})

/**
 * 复制全局角色的形象到项目角色
 */
async function copyCharacterFromGlobal(userId: string, targetId: string, globalCharacterId: string) {
    console.log(`[Copy from Global] 复制角色: global=${globalCharacterId} -> project=${targetId}`)

    // 1. 获取全局角色及其形象
    const globalCharacter = await (prisma as any).globalCharacter.findFirst({
        where: { id: globalCharacterId, userId },
        include: { appearances: true }
    })

    if (!globalCharacter) {
        throw new ApiError('NOT_FOUND', { message: 'Global character not found' })
    }

    // 2. 获取项目角色
    const projectCharacter = await prisma.novelPromotionCharacter.findUnique({
        where: { id: targetId },
        include: { appearances: true }
    })

    if (!projectCharacter) {
        throw new ApiError('NOT_FOUND', { message: 'Project character not found' })
    }

    // 3. 删除项目角色的旧形象
    if (projectCharacter.appearances.length > 0) {
        await prisma.characterAppearance.deleteMany({
            where: { characterId: targetId }
        })
        console.log(`[Copy from Global] 删除了 ${projectCharacter.appearances.length} 个旧形象`)
    }

    // 4. 🔥 更新黑边标签：使用项目角色名替换资产中心的角色名
    console.log(`[Copy from Global] 更新黑边标签: ${globalCharacter.name} -> ${projectCharacter.name}`)
    const updatedLabels = await updateCharacterAppearanceLabels(
        globalCharacter.appearances.map((app: any) => ({
            imageUrl: app.imageUrl,
            imageUrls: app.imageUrls,
            changeReason: app.changeReason
        })),
        projectCharacter.name
    )

    // 5. 复制全局形象到项目（使用更新后的图片URL）
    const copiedAppearances = []
    for (let i = 0; i < globalCharacter.appearances.length; i++) {
        const app = globalCharacter.appearances[i]
        const labelUpdate = updatedLabels[i]

        const newAppearance = await prisma.characterAppearance.create({
            data: {
                characterId: targetId,
                appearanceIndex: app.appearanceIndex,
                changeReason: app.changeReason,
                description: app.description,
                descriptions: app.descriptions,
                // 🔥 使用更新了标签的新图片URL
                imageUrl: labelUpdate?.imageUrl || app.imageUrl,
                imageUrls: labelUpdate?.imageUrls || app.imageUrls,
                selectedIndex: app.selectedIndex
            }
        })
        copiedAppearances.push(newAppearance)
    }
    console.log(`[Copy from Global] 复制了 ${copiedAppearances.length} 个形象（已更新标签）`)

    // 6. 更新项目角色：记录来源ID，并标记档案已确认
    const updatedCharacter = await prisma.novelPromotionCharacter.update({
        where: { id: targetId },
        data: {
            sourceGlobalCharacterId: globalCharacterId,
            // 使用已有形象相当于确认了角色档案
            profileConfirmed: true,
            // 可选：复制语音设置
            voiceId: globalCharacter.voiceId,
            voiceType: globalCharacter.voiceType,
            customVoiceUrl: globalCharacter.customVoiceUrl
        },
        include: { appearances: true }
    })

    console.log(`[Copy from Global] 角色复制完成: ${projectCharacter.name}`)

    return NextResponse.json({
        success: true,
        character: updatedCharacter,
        copiedAppearancesCount: copiedAppearances.length
    })
}

/**
 * 复制全局场景的图片到项目场景
 */
async function copyLocationFromGlobal(userId: string, targetId: string, globalLocationId: string) {
    console.log(`[Copy from Global] 复制场景: global=${globalLocationId} -> project=${targetId}`)

    // 1. 获取全局场景及其图片
    const globalLocation = await (prisma as any).globalLocation.findFirst({
        where: { id: globalLocationId, userId },
        include: { images: true }
    })

    if (!globalLocation) {
        throw new ApiError('NOT_FOUND', { message: 'Global location not found' })
    }

    // 2. 获取项目场景
    const projectLocation = await prisma.novelPromotionLocation.findUnique({
        where: { id: targetId },
        include: { images: true }
    })

    if (!projectLocation) {
        throw new ApiError('NOT_FOUND', { message: 'Project location not found' })
    }

    // 3. 删除项目场景的旧图片
    if (projectLocation.images.length > 0) {
        await prisma.locationImage.deleteMany({
            where: { locationId: targetId }
        })
        console.log(`[Copy from Global] 删除了 ${projectLocation.images.length} 个旧图片`)
    }

    // 4. 🔥 更新黑边标签：使用项目场景名替换资产中心的场景名
    console.log(`[Copy from Global] 更新黑边标签: ${globalLocation.name} -> ${projectLocation.name}`)
    const updatedLabels = await updateLocationImageLabels(
        globalLocation.images.map((img: any) => ({
            imageUrl: img.imageUrl
        })),
        projectLocation.name
    )

    // 5. 复制全局图片到项目（使用更新后的图片URL）
    const copiedImages = []
    for (let i = 0; i < globalLocation.images.length; i++) {
        const img = globalLocation.images[i]
        const labelUpdate = updatedLabels[i]

        const newImage = await prisma.locationImage.create({
            data: {
                locationId: targetId,
                imageIndex: img.imageIndex,
                description: img.description,
                // 🔥 使用更新了标签的新图片URL
                imageUrl: labelUpdate?.imageUrl || img.imageUrl,
                isSelected: img.isSelected
            }
        })
        copiedImages.push(newImage)
    }
    console.log(`[Copy from Global] 复制了 ${copiedImages.length} 个图片（已更新标签）`)

    // 6. 更新项目场景：记录来源ID 和 summary
    const updatedLocation = await prisma.novelPromotionLocation.update({
        where: { id: targetId },
        data: {
            sourceGlobalLocationId: globalLocationId,
            summary: globalLocation.summary
        },
        include: { images: true }
    })

    console.log(`[Copy from Global] 场景复制完成: ${projectLocation.name}`)

    return NextResponse.json({
        success: true,
        location: updatedLocation,
        copiedImagesCount: copiedImages.length
    })
}

/**
 * 复制全局音色到项目角色
 */
async function copyVoiceFromGlobal(userId: string, targetCharacterId: string, globalVoiceId: string) {
    console.log(`[Copy from Global] 复制音色: global=${globalVoiceId} -> project character=${targetCharacterId}`)

    // 1. 获取全局音色
    const globalVoice = await (prisma as any).globalVoice.findFirst({
        where: { id: globalVoiceId, userId }
    })

    if (!globalVoice) {
        throw new ApiError('NOT_FOUND', { message: 'Global voice not found' })
    }

    // 2. 获取项目角色
    const projectCharacter = await prisma.novelPromotionCharacter.findUnique({
        where: { id: targetCharacterId }
    })

    if (!projectCharacter) {
        throw new ApiError('NOT_FOUND', { message: 'Project character not found' })
    }

    // 3. 更新项目角色的音色设置
    const updatedCharacter = await prisma.novelPromotionCharacter.update({
        where: { id: targetCharacterId },
        data: {
            voiceId: globalVoice.voiceId,
            voiceType: globalVoice.voiceType,  // 'qwen-designed' | 'custom'
            customVoiceUrl: globalVoice.customVoiceUrl
        }
    })

    console.log(`[Copy from Global] 音色复制完成: ${projectCharacter.name} <- ${globalVoice.name}`)

    return NextResponse.json({
        success: true,
        character: updatedCharacter,
        voiceName: globalVoice.name
    })
}
