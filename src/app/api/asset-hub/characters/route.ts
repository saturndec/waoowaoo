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

// 签名 JSON 数组中的 URL
const signUrlArray = (jsonStr: string | null): string | null => {
    if (!jsonStr) return null
    try {
        const urls = JSON.parse(jsonStr) as (string | null)[]
        const signed = urls.map(u => signUrl(u))
        return JSON.stringify(signed)
    } catch {
        return null
    }
}

// 获取用户所有角色（支持 folderId 筛选）
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

        const characters = await prisma.globalCharacter.findMany({
            where,
            include: { appearances: true },
            orderBy: { createdAt: 'desc' }
        })

        // 对图片 URL 进行签名
        const signedCharacters = characters.map((char: any) => ({
            ...char,
            customVoiceUrl: signUrl(char.customVoiceUrl),
            appearances: char.appearances.map((app: any) => ({
                ...app,
                imageUrl: signUrl(app.imageUrl),
                imageUrls: signUrlArray(app.imageUrls),
                previousImageUrl: signUrl(app.previousImageUrl),
                previousImageUrls: signUrlArray(app.previousImageUrls)
            }))
        }))

        return NextResponse.json({ characters: signedCharacters })
    } catch (error: any) {
        console.error('Get characters error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 新建角色
export async function POST(request: NextRequest) {
    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        const body = await request.json()
        const {
            name,
            description,
            folderId,
            initialImageUrl,
            referenceImageUrl,
            referenceImageUrls,
            generateFromReference,
            artStyle,
            customDescription  // 🔥 新增：文生图模式使用的自定义描述
        } = body

        if (!name) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        // 🔥 支持多张参考图（最多 5 张），兼容单张旧格式
        let allReferenceImages: string[] = []
        if (referenceImageUrls && Array.isArray(referenceImageUrls)) {
            allReferenceImages = referenceImageUrls.slice(0, 5)
        } else if (referenceImageUrl) {
            allReferenceImages = [referenceImageUrl]
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

        // 创建角色
        const character = await prisma.globalCharacter.create({
            data: {
                userId: session.user.id,
                folderId: folderId || null,
                name: name.trim(),
                aliases: null
            }
        })

        // 创建初始形象
        const descText = description?.trim() || `${name.trim()} 的角色设定`
        const appearance = await prisma.globalCharacterAppearance.create({
            data: {
                characterId: character.id,
                appearanceIndex: 1,
                changeReason: '初始形象',
                description: descText,
                descriptions: JSON.stringify([descText]),
                imageUrl: initialImageUrl || null,
                imageUrls: initialImageUrl ? JSON.stringify([initialImageUrl]) : null,
                // 如果需要从参考图生成，标记为生成中
                generating: generateFromReference ? true : false
            }
        })

        if (generateFromReference && allReferenceImages.length > 0) {
            // 使用 fetch 触发后台生成，不等待响应
            const { getBaseUrl } = await import('@/lib/env')
            const baseUrl = getBaseUrl()
            fetch(`${baseUrl}/api/asset-hub/reference-to-character`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': request.headers.get('cookie') || ''
                },
                body: JSON.stringify({
                    referenceImageUrls: allReferenceImages,
                    characterName: name.trim(),
                    characterId: character.id,
                    appearanceId: appearance.id,
                    isBackgroundJob: true,
                    artStyle: artStyle || 'american-comic',
                    customDescription: customDescription || undefined  // 🔥 传递自定义描述（文生图模式）
                })
            }).catch(err => {
                console.error('[Characters API] 后台生成任务触发失败:', err)
            })
        }

        // 返回包含形象的角色数据
        const characterWithAppearances = await prisma.globalCharacter.findUnique({
            where: { id: character.id },
            include: { appearances: true }
        })

        return NextResponse.json({ success: true, character: characterWithAppearances })
    } catch (error: any) {
        console.error('Create character error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
