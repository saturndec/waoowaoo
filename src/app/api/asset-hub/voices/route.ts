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

// 获取用户所有音色（支持 folderId 筛选）
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

        const voices = await prisma.globalVoice.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        })

        // 对音频 URL 进行签名
        const signedVoices = voices.map((voice: any) => ({
            ...voice,
            customVoiceUrl: signUrl(voice.customVoiceUrl)
        }))

        return NextResponse.json({ voices: signedVoices })
    } catch (error: any) {
        console.error('Get voices error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 新建音色
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
            voiceId,
            voiceType,
            customVoiceUrl,
            voicePrompt,
            gender,
            language
        } = body

        if (!name) {
            return NextResponse.json({ error: 'Missing required fields: name' }, { status: 400 })
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

        // 创建音色
        const voice = await prisma.globalVoice.create({
            data: {
                userId: session.user.id,
                folderId: folderId || null,
                name: name.trim(),
                description: description?.trim() || null,
                voiceId: voiceId || null,
                voiceType: voiceType || 'qwen-designed',
                customVoiceUrl: customVoiceUrl || null,
                voicePrompt: voicePrompt?.trim() || null,
                gender: gender || null,
                language: language || 'zh'
            }
        })

        return NextResponse.json({ success: true, voice })
    } catch (error: any) {
        console.error('Create voice error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
