import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@/lib/cos'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'

/**
 * GET /api/asset-hub/picker
 * 获取用户的全局资产列表，用于在项目中选择要复制的资产
 * 
 * Query params:
 * - type: 'character' | 'location'
 */
export async function GET(request: NextRequest) {
    try {
        // 🔐 统一权限验证
        const authResult = await requireUserAuth()
        if (isErrorResponse(authResult)) return authResult
        const { session } = authResult

        const { searchParams } = new URL(request.url)
        const type = searchParams.get('type') || 'character'

        if (type === 'character') {
            const characters = await (prisma as any).globalCharacter.findMany({
                where: { userId: session.user.id },
                include: {
                    appearances: {
                        orderBy: { appearanceIndex: 'asc' }
                    },
                    folder: true
                },
                orderBy: { updatedAt: 'desc' }
            })

            // 处理图片 URL 签名
            const processedCharacters = await Promise.all(characters.map(async (char: any) => {
                const primaryAppearance = char.appearances.find((a: any) => a.appearanceIndex === 1) || char.appearances[0]
                let previewUrl = null

                if (primaryAppearance?.imageUrls) {
                    try {
                        const urls = JSON.parse(primaryAppearance.imageUrls)
                        const selectedUrl = urls[primaryAppearance.selectedIndex ?? 0] || urls[0]
                        if (selectedUrl) {
                            previewUrl = await getSignedUrl(selectedUrl)
                        }
                    } catch { }
                } else if (primaryAppearance?.imageUrl) {
                    previewUrl = await getSignedUrl(primaryAppearance.imageUrl)
                }

                return {
                    id: char.id,
                    name: char.name,
                    folderName: char.folder?.name || null,
                    previewUrl,
                    appearanceCount: char.appearances.length,
                    hasVoice: !!(char.voiceId || char.customVoiceUrl)
                }
            }))

            return NextResponse.json({ characters: processedCharacters })

        } else if (type === 'location') {
            const locations = await (prisma as any).globalLocation.findMany({
                where: { userId: session.user.id },
                include: {
                    images: {
                        orderBy: { imageIndex: 'asc' }
                    },
                    folder: true
                },
                orderBy: { updatedAt: 'desc' }
            })

            // 处理图片 URL 签名
            const processedLocations = await Promise.all(locations.map(async (loc: any) => {
                const selectedImage = loc.images.find((img: any) => img.isSelected) || loc.images[0]
                let previewUrl = null

                if (selectedImage?.imageUrl) {
                    previewUrl = await getSignedUrl(selectedImage.imageUrl)
                }

                return {
                    id: loc.id,
                    name: loc.name,
                    summary: loc.summary,
                    folderName: loc.folder?.name || null,
                    previewUrl,
                    imageCount: loc.images.length
                }
            }))

            return NextResponse.json({ locations: processedLocations })

        } else if (type === 'voice') {
            // 🆕 音色选择器
            const voices = await (prisma as any).globalVoice.findMany({
                where: { userId: session.user.id },
                include: {
                    folder: true
                },
                orderBy: { updatedAt: 'desc' }
            })

            // 处理音频 URL 签名
            const processedVoices = await Promise.all(voices.map(async (voice: any) => {
                let previewUrl = null
                if (voice.customVoiceUrl) {
                    previewUrl = await getSignedUrl(voice.customVoiceUrl)
                }

                return {
                    id: voice.id,
                    name: voice.name,
                    description: voice.description,
                    folderName: voice.folder?.name || null,
                    previewUrl,
                    voiceId: voice.voiceId,
                    voiceType: voice.voiceType,
                    gender: voice.gender,
                    language: voice.language
                }
            }))

            return NextResponse.json({ voices: processedVoices })

        } else {
            return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
        }

    } catch (error: any) {
        console.error('[Asset Hub Picker] Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
