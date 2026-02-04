import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'

// 删除音色
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        const { id } = await params

        // 验证音色所有权
        const voice = await prisma.globalVoice.findUnique({
            where: { id }
        })

        if (!voice) {
            return NextResponse.json({ error: 'Voice not found' }, { status: 404 })
        }

        if (voice.userId !== session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        // 删除音色
        await prisma.globalVoice.delete({
            where: { id }
        })

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Delete voice error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 更新音色
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        const { id } = await params
        const body = await request.json()

        // 验证音色所有权
        const voice = await prisma.globalVoice.findUnique({
            where: { id }
        })

        if (!voice) {
            return NextResponse.json({ error: 'Voice not found' }, { status: 404 })
        }

        if (voice.userId !== session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        // 更新音色
        const updatedVoice = await prisma.globalVoice.update({
            where: { id },
            data: {
                name: body.name?.trim() || voice.name,
                description: body.description !== undefined ? body.description?.trim() || null : voice.description,
                folderId: body.folderId !== undefined ? body.folderId : voice.folderId
            }
        })

        return NextResponse.json({ success: true, voice: updatedVoice })
    } catch (error: any) {
        console.error('Update voice error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
