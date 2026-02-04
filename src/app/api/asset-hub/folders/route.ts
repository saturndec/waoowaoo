import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'

// 获取用户所有文件夹
export async function GET() {
    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        const folders = await prisma.globalAssetFolder.findMany({
            where: { userId: session.user.id },
            orderBy: { name: 'asc' }
        })

        return NextResponse.json({ folders })
    } catch (error: any) {
        console.error('Get folders error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 创建文件夹
export async function POST(request: NextRequest) {
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

        const folder = await prisma.globalAssetFolder.create({
            data: {
                userId: session.user.id,
                name: name.trim()
            }
        })

        return NextResponse.json({ success: true, folder })
    } catch (error: any) {
        console.error('Create folder error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
