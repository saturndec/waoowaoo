import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadToCOS, generateUniqueKey } from '@/lib/cos'
import sharp from 'sharp'
import { initializeFonts, createLabelSVG } from '@/lib/fonts'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/asset-hub/upload-image
 * 上传用户自定义图片作为角色或场景资产
 */
export const POST = apiHandler(async (request: NextRequest) => {
    await initializeFonts()

    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const formData = await request.formData()
    const file = formData.get('file') as File
    const type = formData.get('type') as string
    const id = formData.get('id') as string
    const appearanceIndex = formData.get('appearanceIndex') as string | null
    const imageIndex = formData.get('imageIndex') as string | null
    const labelText = formData.get('labelText') as string

    if (!file || !type || !id || !labelText) {
        throw new ApiError('INVALID_PARAMS', { message: 'Missing required fields' })
    }

    // 读取文件并处理
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const meta = await sharp(buffer).metadata()
    const w = meta.width || 2160
    const h = meta.height || 2160
    const fontSize = Math.floor(h * 0.04)
    const pad = Math.floor(fontSize * 0.5)
    const barH = fontSize + pad * 2

    const svg = await createLabelSVG(w, barH, fontSize, pad, labelText)

    const processed = await sharp(buffer)
        .extend({ top: barH, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
        .composite([{ input: svg, top: 0, left: 0 }])
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer()

    const keyPrefix = type === 'character'
        ? `global-char-${id}-${appearanceIndex}-upload`
        : `global-loc-${id}-upload`
    const key = generateUniqueKey(keyPrefix, 'jpg')
    await uploadToCOS(processed, key)

    if (type === 'character' && appearanceIndex !== null) {
        const appearance = await (prisma as any).globalCharacterAppearance.findFirst({
            where: {
                characterId: id,
                appearanceIndex: parseInt(appearanceIndex),
                character: { userId: session.user.id }
            }
        })

        if (!appearance) {
            throw new ApiError('NOT_FOUND', { message: 'Appearance not found' })
        }

        // 保存历史版本
        if (appearance.imageUrl || appearance.imageUrls) {
            await (prisma as any).globalCharacterAppearance.update({
                where: { id: appearance.id },
                data: {
                    previousImageUrl: appearance.imageUrl,
                    previousImageUrls: appearance.imageUrls
                }
            })
        }

        let imageUrls: (string | null)[] = []
        if (appearance.imageUrls) {
            try { imageUrls = JSON.parse(appearance.imageUrls) } catch { }
        }

        const targetIndex = imageIndex !== null ? parseInt(imageIndex) : imageUrls.length
        while (imageUrls.length <= targetIndex) {
            imageUrls.push(null)
        }
        imageUrls[targetIndex] = key

        const selectedIndex = appearance.selectedIndex
        const shouldUpdateImageUrl =
            selectedIndex === targetIndex ||
            (selectedIndex === null && targetIndex === 0) ||
            imageUrls.filter(u => u !== null).length === 1

        const updateData: any = { imageUrls: JSON.stringify(imageUrls) }
        if (shouldUpdateImageUrl) {
            updateData.imageUrl = key
        }

        await (prisma as any).globalCharacterAppearance.update({
            where: { id: appearance.id },
            data: updateData
        })

        return NextResponse.json({ success: true, imageKey: key, imageIndex: targetIndex })

    } else if (type === 'location') {
        const location = await (prisma as any).globalLocation.findFirst({
            where: { id, userId: session.user.id },
            include: { images: { orderBy: { imageIndex: 'asc' } } }
        })

        if (!location) {
            throw new ApiError('NOT_FOUND', { message: 'Location not found' })
        }

        if (imageIndex !== null) {
            const targetImageIndex = parseInt(imageIndex)
            const existingImage = location.images?.find((img: any) => img.imageIndex === targetImageIndex)

            if (existingImage) {
                // 保存历史版本
                if (existingImage.imageUrl) {
                    await (prisma as any).globalLocationImage.update({
                        where: { id: existingImage.id },
                        data: { previousImageUrl: existingImage.imageUrl }
                    })
                }
                await (prisma as any).globalLocationImage.update({
                    where: { id: existingImage.id },
                    data: { imageUrl: key }
                })
            } else {
                await (prisma as any).globalLocationImage.create({
                    data: {
                        locationId: id,
                        imageIndex: targetImageIndex,
                        imageUrl: key,
                        description: labelText,
                        isSelected: targetImageIndex === 0
                    }
                })
            }

            return NextResponse.json({ success: true, imageKey: key, imageIndex: targetImageIndex })
        } else {
            const maxIndex = location.images?.length || 0
            await (prisma as any).globalLocationImage.create({
                data: {
                    locationId: id,
                    imageIndex: maxIndex,
                    imageUrl: key,
                    description: labelText,
                    isSelected: maxIndex === 0
                }
            })

            return NextResponse.json({ success: true, imageKey: key, imageIndex: maxIndex })
        }
    }

    throw new ApiError('INVALID_PARAMS', { message: 'Invalid type' })
})
