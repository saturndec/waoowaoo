import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@/lib/cos'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'

// 签名单个 URL（COS key -> 完整 URL）
const signUrl = (key: string | null): string | null => {
    if (!key) return null
    // 如果已经是完整 URL，直接返回
    if (key.startsWith('http://') || key.startsWith('https://')) return key
    return getSignedUrl(key, 7 * 24 * 3600)
}

// 获取用户所有场景（支持 folderId 筛选）
export async function GET(request: NextRequest) {
    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        const { searchParams } = new URL(request.url)
        const folderId = searchParams.get('folderId')

        const where: any = { userId: session.user.id }
        if (folderId === 'null') {
            where.folderId = null
        } else if (folderId) {
            where.folderId = folderId
        }

        const locations = await prisma.globalLocation.findMany({
            where,
            include: { images: true },
            orderBy: { createdAt: 'desc' }
        })

        // 对图片 URL 进行签名
        const signedLocations = locations.map((loc: any) => ({
            ...loc,
            images: loc.images.map((img: any) => ({
                ...img,
                imageUrl: signUrl(img.imageUrl),
                previousImageUrl: signUrl(img.previousImageUrl)
            }))
        }))

        return NextResponse.json({ locations: signedLocations })
    } catch (error: any) {
        console.error('Get locations error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 新建场景
export async function POST(request: NextRequest) {
    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        const body = await request.json()
        const { name, summary, folderId, artStyle } = body

        if (!name) {
            return NextResponse.json({ error: 'Missing location name' }, { status: 400 })
        }

        // 如果指定了 folderId，验证其所有权
        if (folderId) {
            const folder = await prisma.globalAssetFolder.findUnique({
                where: { id: folderId }
            })
            if (!folder || folder.userId !== session.user.id) {
                return NextResponse.json({ error: 'Invalid folder' }, { status: 400 })
            }
        }

        // 创建场景
        const location = await prisma.globalLocation.create({
            data: {
                userId: session.user.id,
                folderId: folderId || null,
                name: name.trim(),
                summary: summary?.trim() || null
            }
        })

        // 创建3个图片槽位（标记为生成中）
        await prisma.globalLocationImage.createMany({
            data: [
                { locationId: location.id, imageIndex: 0, generating: true, description: summary?.trim() || name.trim() },
                { locationId: location.id, imageIndex: 1, generating: true, description: summary?.trim() || name.trim() },
                { locationId: location.id, imageIndex: 2, generating: true, description: summary?.trim() || name.trim() }
            ]
        })

        // 返回包含图片的场景数据
        const locationWithImages = await prisma.globalLocation.findUnique({
            where: { id: location.id },
            include: { images: true }
        })

        // 如果有描述，触发后台自动生成
        if (summary?.trim()) {
            const { getBaseUrl } = await import('@/lib/env')
            const baseUrl = getBaseUrl()
            fetch(`${baseUrl}/api/asset-hub/generate-image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': request.headers.get('cookie') || ''
                },
                body: JSON.stringify({
                    type: 'location',
                    id: location.id,
                    artStyle: artStyle || 'american-comic'
                })
            }).catch(err => {
                console.error('[Locations API] 后台生成任务触发失败:', err)
            })
        }

        return NextResponse.json({ success: true, location: locationWithImages })
    } catch (error: any) {
        console.error('Create location error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
