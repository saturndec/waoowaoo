import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'

/**
 * POST /api/asset-hub/appearances
 * 添加子形象
 */
export async function POST(request: NextRequest) {
    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        const body = await request.json()
        const { characterId, changeReason, description } = body

        if (!characterId || !changeReason) {
            return NextResponse.json({ error: 'characterId and changeReason are required' }, { status: 400 })
        }

        // 验证角色属于用户
        const character = await (prisma as any).globalCharacter.findFirst({
            where: { id: characterId, userId: session.user.id },
            include: { appearances: true }
        })
        if (!character) {
            return NextResponse.json({ error: 'Character not found' }, { status: 404 })
        }

        // 获取下一个形象索引
        const maxIndex = character.appearances?.reduce((max: number, a: any) => Math.max(max, a.appearanceIndex), 0) || 0
        const nextIndex = maxIndex + 1

        // 创建子形象
        const appearance = await (prisma as any).globalCharacterAppearance.create({
            data: {
                characterId,
                appearanceIndex: nextIndex,
                changeReason,
                description: description || null,
                descriptions: description ? JSON.stringify([description, description, description]) : null
            }
        })

        return NextResponse.json({ success: true, appearance })

    } catch (error: any) {
        console.error('[Asset Hub appearances POST] Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

/**
 * PATCH /api/asset-hub/appearances
 * 更新子形象描述
 */
export async function PATCH(request: NextRequest) {
    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        const body = await request.json()
        const { characterId, appearanceIndex, description, changeReason } = body

        if (!characterId || appearanceIndex === undefined) {
            return NextResponse.json({ error: 'characterId and appearanceIndex are required' }, { status: 400 })
        }

        // 验证角色属于用户
        const character = await (prisma as any).globalCharacter.findFirst({
            where: { id: characterId, userId: session.user.id }
        })
        if (!character) {
            return NextResponse.json({ error: 'Character not found' }, { status: 404 })
        }

        const appearance = await (prisma as any).globalCharacterAppearance.findFirst({
            where: { characterId, appearanceIndex }
        })
        if (!appearance) {
            return NextResponse.json({ error: 'Appearance not found' }, { status: 404 })
        }

        const updateData: any = {}
        if (description !== undefined) {
            updateData.description = description
            updateData.descriptions = JSON.stringify([description, description, description])
        }
        if (changeReason !== undefined) {
            updateData.changeReason = changeReason
        }

        await (prisma as any).globalCharacterAppearance.update({
            where: { id: appearance.id },
            data: updateData
        })

        return NextResponse.json({ success: true })

    } catch (error: any) {
        console.error('[Asset Hub appearances PATCH] Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

/**
 * DELETE /api/asset-hub/appearances
 * 删除子形象
 */
export async function DELETE(request: NextRequest) {
    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        const { searchParams } = new URL(request.url)
        const characterId = searchParams.get('characterId')
        const appearanceIndex = searchParams.get('appearanceIndex')

        if (!characterId || !appearanceIndex) {
            return NextResponse.json({ error: 'characterId and appearanceIndex are required' }, { status: 400 })
        }

        // 验证角色属于用户
        const character = await (prisma as any).globalCharacter.findFirst({
            where: { id: characterId, userId: session.user.id }
        })
        if (!character) {
            return NextResponse.json({ error: 'Character not found' }, { status: 404 })
        }

        // 不能删除主形象（index=1）
        if (parseInt(appearanceIndex) === 1) {
            return NextResponse.json({ error: 'Cannot delete primary appearance' }, { status: 400 })
        }

        await (prisma as any).globalCharacterAppearance.deleteMany({
            where: { characterId, appearanceIndex: parseInt(appearanceIndex) }
        })

        return NextResponse.json({ success: true })

    } catch (error: any) {
        console.error('[Asset Hub appearances DELETE] Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
