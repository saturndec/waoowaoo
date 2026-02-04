import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'

// 获取单个场景
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ locationId: string }> }
) {
    const { locationId } = await context.params

    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        const location = await prisma.globalLocation.findUnique({
            where: { id: locationId },
            include: { images: true }
        })

        if (!location || location.userId !== session.user.id) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }

        return NextResponse.json({ location })
    } catch (error: any) {
        console.error('Get location error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 更新场景
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ locationId: string }> }
) {
    const { locationId } = await context.params

    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        const location = await prisma.globalLocation.findUnique({
            where: { id: locationId }
        })

        if (!location || location.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const body = await request.json()
        const { name, summary, folderId } = body

        const updateData: any = {}
        if (name !== undefined) updateData.name = name.trim()
        if (summary !== undefined) updateData.summary = summary?.trim() || null
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

        const updatedLocation = await prisma.globalLocation.update({
            where: { id: locationId },
            data: updateData,
            include: { images: true }
        })

        return NextResponse.json({ success: true, location: updatedLocation })
    } catch (error: any) {
        console.error('Update location error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 删除场景
export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ locationId: string }> }
) {
    const { locationId } = await context.params

    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        const location = await prisma.globalLocation.findUnique({
            where: { id: locationId }
        })

        if (!location || location.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // 删除场景（GlobalLocationImage 会级联删除）
        await prisma.globalLocation.delete({
            where: { id: locationId }
        })

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Delete location error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
