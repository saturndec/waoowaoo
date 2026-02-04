import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'

// 更新形象描述
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ characterId: string; appearanceIndex: string }> }
) {
    const { characterId, appearanceIndex } = await context.params

    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        // 验证角色所有权
        const character = await prisma.globalCharacter.findUnique({
            where: { id: characterId }
        })

        if (!character || character.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const body = await request.json()
        const { description, descriptionIndex, changeReason } = body

        const appearance = await prisma.globalCharacterAppearance.findFirst({
            where: { characterId, appearanceIndex: parseInt(appearanceIndex) }
        })

        if (!appearance) {
            return NextResponse.json({ error: 'Appearance not found' }, { status: 404 })
        }

        const updateData: any = {}

        if (description !== undefined) {
            const trimmedDescription = description.trim()

            // 解析 descriptions JSON
            let descriptions: string[] = []
            if (appearance.descriptions) {
                try { descriptions = JSON.parse(appearance.descriptions) } catch { }
            }
            if (descriptions.length === 0) {
                descriptions = [appearance.description || '']
            }

            // 更新指定索引的描述
            if (descriptionIndex !== undefined && descriptionIndex !== null) {
                descriptions[descriptionIndex] = trimmedDescription
            } else {
                descriptions[0] = trimmedDescription
            }

            updateData.descriptions = JSON.stringify(descriptions)
            updateData.description = descriptions[0]
        }

        if (changeReason !== undefined) {
            updateData.changeReason = changeReason
        }

        await prisma.globalCharacterAppearance.update({
            where: { id: appearance.id },
            data: updateData
        })

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Update appearance error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 添加新形象
export async function POST(
    request: NextRequest,
    context: { params: Promise<{ characterId: string; appearanceIndex: string }> }
) {
    const { characterId } = await context.params

    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        // 验证角色所有权
        const character = await prisma.globalCharacter.findUnique({
            where: { id: characterId },
            include: { appearances: true }
        })

        if (!character || character.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const body = await request.json()
        const { description, changeReason } = body

        if (!description) {
            return NextResponse.json({ error: 'Missing description' }, { status: 400 })
        }

        // 计算新的 appearanceIndex
        const maxIndex = character.appearances.reduce((max, a) => Math.max(max, a.appearanceIndex), 0)
        const newIndex = maxIndex + 1

        const appearance = await prisma.globalCharacterAppearance.create({
            data: {
                characterId,
                appearanceIndex: newIndex,
                changeReason: changeReason || '形象变化',
                description: description.trim(),
                descriptions: JSON.stringify([description.trim()])
            }
        })

        return NextResponse.json({ success: true, appearance })
    } catch (error: any) {
        console.error('Create appearance error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 删除形象
export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ characterId: string; appearanceIndex: string }> }
) {
    const { characterId, appearanceIndex } = await context.params

    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        // 验证角色所有权
        const character = await prisma.globalCharacter.findUnique({
            where: { id: characterId },
            include: { appearances: true }
        })

        if (!character || character.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // 不能删除最后一个形象
        if (character.appearances.length <= 1) {
            return NextResponse.json({ error: 'Cannot delete last appearance' }, { status: 400 })
        }

        const appearance = await prisma.globalCharacterAppearance.findFirst({
            where: { characterId, appearanceIndex: parseInt(appearanceIndex) }
        })

        if (!appearance) {
            return NextResponse.json({ error: 'Appearance not found' }, { status: 404 })
        }

        await prisma.globalCharacterAppearance.delete({
            where: { id: appearance.id }
        })

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Delete appearance error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
