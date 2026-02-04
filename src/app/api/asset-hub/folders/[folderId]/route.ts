import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'

// 更新文件夹
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ folderId: string }> }
) {
    const { folderId } = await context.params

    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        const body = await request.json()
        const { name } = body

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Missing folder name' }, { status: 400 })
        }

        // 验证所有权
        const folder = await prisma.globalAssetFolder.findUnique({
            where: { id: folderId }
        })

        if (!folder || folder.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const updatedFolder = await prisma.globalAssetFolder.update({
            where: { id: folderId },
            data: { name: name.trim() }
        })

        return NextResponse.json({ success: true, folder: updatedFolder })
    } catch (error: any) {
        console.error('Update folder error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 删除文件夹
export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ folderId: string }> }
) {
    const { folderId } = await context.params

    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        // 验证所有权
        const folder = await prisma.globalAssetFolder.findUnique({
            where: { id: folderId }
        })

        if (!folder || folder.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // 删除前，将文件夹内的资产移动到根目录（folderId = null）
        await prisma.globalCharacter.updateMany({
            where: { folderId },
            data: { folderId: null }
        })

        await prisma.globalLocation.updateMany({
            where: { folderId },
            data: { folderId: null }
        })

        // 删除文件夹
        await prisma.globalAssetFolder.delete({
            where: { id: folderId }
        })

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Delete folder error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
