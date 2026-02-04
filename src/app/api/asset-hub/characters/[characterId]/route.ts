import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'

// 获取单个角色
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ characterId: string }> }
) {
    const { characterId } = await context.params

    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        const character = await prisma.globalCharacter.findUnique({
            where: { id: characterId },
            include: { appearances: true }
        })

        if (!character || character.userId !== session.user.id) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }

        return NextResponse.json({ character })
    } catch (error: any) {
        console.error('Get character error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 更新角色
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ characterId: string }> }
) {
    const { characterId } = await context.params

    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        const character = await prisma.globalCharacter.findUnique({
            where: { id: characterId }
        })

        if (!character || character.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const body = await request.json()
        const { name, aliases, profileData, profileConfirmed, voiceId, voiceType, customVoiceUrl, folderId, globalVoiceId } = body

        const updateData: any = {}
        if (name !== undefined) updateData.name = name.trim()
        if (aliases !== undefined) updateData.aliases = aliases
        if (profileData !== undefined) updateData.profileData = profileData
        if (profileConfirmed !== undefined) updateData.profileConfirmed = profileConfirmed
        if (voiceId !== undefined) updateData.voiceId = voiceId
        if (voiceType !== undefined) updateData.voiceType = voiceType
        if (customVoiceUrl !== undefined) updateData.customVoiceUrl = customVoiceUrl
        if (globalVoiceId !== undefined) updateData.globalVoiceId = globalVoiceId
        if (folderId !== undefined) {
            // 验证文件夹所有权
            if (folderId) {
                const folder = await prisma.globalAssetFolder.findUnique({
                    where: { id: folderId }
                })
                if (!folder || folder.userId !== session.user.id) {
                    return NextResponse.json({ error: 'Invalid folder' }, { status: 400 })
                }
            }
            updateData.folderId = folderId || null
        }

        const updatedCharacter = await prisma.globalCharacter.update({
            where: { id: characterId },
            data: updateData,
            include: { appearances: true }
        })

        return NextResponse.json({ success: true, character: updatedCharacter })
    } catch (error: any) {
        console.error('Update character error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 删除角色
export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ characterId: string }> }
) {
    const { characterId } = await context.params

    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        const character = await prisma.globalCharacter.findUnique({
            where: { id: characterId }
        })

        if (!character || character.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // 删除角色（GlobalCharacterAppearance 会级联删除）
        await prisma.globalCharacter.delete({
            where: { id: characterId }
        })

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Delete character error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
