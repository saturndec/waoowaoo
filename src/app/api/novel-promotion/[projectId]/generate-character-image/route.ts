import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/novel-promotion/[projectId]/generate-character-image
 * 专门用于后台触发角色图片生成的简化 API
 * 内部调用 generate-image API
 */
export const POST = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const body = await request.json()
    const { characterId, appearanceId, artStyle } = body

    if (!characterId) {
        throw new ApiError('INVALID_PARAMS', { message: 'Missing characterId' })
    }

    // 如果没有传 appearanceId，获取第一个 appearance 的 id
    let targetAppearanceId = appearanceId
    if (!targetAppearanceId) {
        const character = await prisma.novelPromotionCharacter.findUnique({
            where: { id: characterId },
            include: { appearances: { orderBy: { appearanceIndex: 'asc' } } }
        })
        if (!character) {
            throw new ApiError('NOT_FOUND', { message: 'Character not found' })
        }
        const firstAppearance = (character as any).appearances?.[0]
        if (!firstAppearance) {
            throw new ApiError('NOT_FOUND', { message: 'No appearance found' })
        }
        targetAppearanceId = firstAppearance.id
    }

    // 如果设置了 artStyle，需要更新到 novelPromotionProject 中（供 generate-image 使用）
    if (artStyle) {
        const novelData = await prisma.novelPromotionProject.findUnique({ where: { projectId } })
        if (novelData) {
            // 将风格转换为提示词
            const ART_STYLES = [
                { value: 'american-comic', prompt: '美式漫画风格' },
                { value: 'chinese-comic', prompt: '精致国漫风格' },
                { value: 'anime', prompt: '日系动漫风格' },
                { value: 'realistic', prompt: '真人照片写实风格' }
            ]
            const style = ART_STYLES.find(s => s.value === artStyle)
            if (style) {
                await prisma.novelPromotionProject.update({
                    where: { id: novelData.id },
                    data: { artStylePrompt: style.prompt }
                })
            }
        }
    }

    // 调用 generate-image API
    const { getBaseUrl } = await import('@/lib/env')
    const baseUrl = getBaseUrl()
    const generateRes = await fetch(`${baseUrl}/api/novel-promotion/${projectId}/generate-image`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('cookie') || ''
        },
        body: JSON.stringify({
            type: 'character',
            id: characterId,
            appearanceId: targetAppearanceId  // 使用真正的 UUID
        })
    })

    const result = await generateRes.json()

    if (!generateRes.ok) {
        console.error('[Generate Character Image] 失败:', result.error)
        throw new ApiError('GENERATION_FAILED', { message: result.error })
    }

    return NextResponse.json(result)
})
