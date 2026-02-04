import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateUniqueKey, getSignedUrl, uploadToCOS } from '@/lib/cos'
import { generateImage } from '@/lib/generator-api'
import { getModelResolution } from '@/lib/api-config'
import { CHARACTER_IMAGE_BANANA_RATIO, LOCATION_IMAGE_BANANA_RATIO } from '@/lib/constants'
import sharp from 'sharp'
import { initializeFonts, createLabelSVG } from '@/lib/fonts'
import { fetchWithTimeoutAndRetry } from '@/lib/ark-api'
import { createAsyncTask, TASK_TYPES } from '@/lib/async-task-manager'
import { getUserModelConfig } from '@/lib/config-service'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/asset-hub/modify-image
 * AI 图片编辑接口
 */
export const POST = apiHandler(async (request: NextRequest) => {
    const LOG_PREFIX = '[Asset Hub modify-image]'
    console.log(`${LOG_PREFIX} ========== 开始处理修改图片请求 ==========`)

    await initializeFonts()

    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult
    console.log(`${LOG_PREFIX} 用户已认证: ${session.user.id}`)

    const body = await request.json()
    const { type, modifyPrompt, id, appearanceIndex, imageIndex } = body
    console.log(`${LOG_PREFIX} 请求参数:`, {
        type,
        id,
        appearanceIndex,
        imageIndex,
        modifyPromptPreview: modifyPrompt?.substring(0, 50) + '...'
    })

    if (!type || !modifyPrompt || !id) {
        console.log(`${LOG_PREFIX} 缺少必填字段: type=${!!type}, modifyPrompt=${!!modifyPrompt}, id=${!!id}`)
        throw new ApiError('INVALID_PARAMS', { message: 'Missing required fields' })
    }

    // 🔥 使用统一配置服务获取用户模型配置
    const userConfig = await getUserModelConfig(session.user.id)
    if (!userConfig.editModel) {
        console.log(`${LOG_PREFIX} 未配置修图模型`)
        throw new ApiError('MISSING_CONFIG', { message: '请先在用户设置中配置"修图/编辑模型"' })
    }
    const editModel = userConfig.editModel
    console.log(`${LOG_PREFIX} 使用修图模型: ${editModel}`)

    let currentImageKey: string
    let assetName: string

    if (type === 'character') {
        const character = await (prisma as any).globalCharacter.findFirst({
            where: { id, userId: session.user.id },
            include: { appearances: true }
        })
        if (!character) {
            throw new ApiError('NOT_FOUND', { message: 'Character not found' })
        }

        const targetIndex = appearanceIndex ?? 1
        const appearance = character.appearances?.find((a: any) => a.appearanceIndex === targetIndex)
        if (!appearance) {
            throw new ApiError('NOT_FOUND', { message: 'Appearance not found' })
        }

        // 设置编辑状态
        await (prisma as any).globalCharacterAppearance.update({
            where: { id: appearance.id },
            data: { generating: true }
        })

        let imageUrls: (string | null)[] = []
        if (appearance.imageUrls) {
            try { imageUrls = JSON.parse(appearance.imageUrls) } catch { }
        }

        const targetImageIndex = imageIndex ?? appearance.selectedIndex ?? 0
        currentImageKey = imageUrls[targetImageIndex] || appearance.imageUrl
        if (!currentImageKey) {
            await (prisma as any).globalCharacterAppearance.update({
                where: { id: appearance.id },
                data: { generating: false }
            })
            throw new ApiError('INVALID_PARAMS', { message: 'No image to modify' })
        }

        assetName = `${character.name} - ${appearance.changeReason}`

        // 下载并裁剪原图
        const signedUrl = getSignedUrl(currentImageKey, 3600)
        const originalResponse = await fetchWithTimeoutAndRetry(signedUrl, { logPrefix: '[Asset Hub 下载原图]' })
        const originalBuffer = Buffer.from(await originalResponse.arrayBuffer())

        const meta = await sharp(originalBuffer).metadata()
        const originalWidth = meta.width || 2160
        const originalHeight = meta.height || 2160
        const fontSize = Math.floor(originalHeight * 0.04)
        const pad = Math.floor(fontSize * 0.5)
        const barH = fontSize + pad * 2

        // 裁剪掉顶部标签
        const croppedBuffer = await sharp(originalBuffer)
            .extract({ left: 0, top: barH, width: originalWidth, height: originalHeight - barH })
            .jpeg({ quality: 95 })
            .toBuffer()

        // 上传裁剪后的图片
        const tempKey = generateUniqueKey(`global-temp-cropped`, 'jpg')
        await uploadToCOS(croppedBuffer, tempKey)
        const croppedImageUrl = getSignedUrl(tempKey, 3600)

        // 🔥 计算裁剪后的实际尺寸
        const croppedWidth = originalWidth
        const croppedHeight = originalHeight - barH
        const croppedSize = `${croppedWidth}x${croppedHeight}`
        console.log(`${LOG_PREFIX} 角色图片编辑: 原图尺寸=${originalWidth}x${originalHeight}, 裁剪后尺寸=${croppedSize}`)

        // 调用 AI 编辑
        const prompt = `请根据以下指令修改图片，保持人物的面部特征、五官、神态、体型一致：\n${modifyPrompt}`
        console.log(`${LOG_PREFIX} 角色图片编辑: 开始调用 AI 生成，模型=${editModel}`)

        const result = await generateImage(
            session.user.id,
            editModel,
            prompt,
            {
                referenceImages: [croppedImageUrl],
                resolution: await getModelResolution(session.user.id, editModel),
                size: croppedSize  // 🔥 传入裁剪后的实际尺寸
            }
        )

        console.log(`${LOG_PREFIX} 角色图片编辑: AI 生成结果:`, {
            success: result.success,
            hasImageUrl: !!result.imageUrl,
            async: result.async,
            requestId: result.requestId,
            endpoint: result.endpoint,
            error: result.error
        })

        // ⚠️ 检查是否是异步任务（FAL 模型会返回 async: true）
        if (result.async && result.requestId) {
            console.log(`${LOG_PREFIX} 🔥 检测到异步任务，创建 AsyncTask 记录`)
            console.log(`${LOG_PREFIX} 异步任务详情: requestId=${result.requestId}, endpoint=${result.endpoint}`)

            // 🔥 创建异步任务，让 cron 轮询处理
            await createAsyncTask({
                type: TASK_TYPES.IMAGE_ASSET_HUB_EDIT,
                targetId: appearance.id,
                targetType: 'character_appearance',
                externalId: result.requestId,
                userId: session.user.id,
                payload: {
                    endpoint: result.endpoint,
                    characterId: id,
                    appearanceId: appearance.id,
                    appearanceIndex: targetIndex,
                    targetImageIndex,
                    assetName,
                    originalWidth,
                    originalHeight,
                    barH,
                    imageUrls  // 保存当前的图片数组
                }
            })

            console.log(`${LOG_PREFIX} ✅ 异步任务已创建，等待 cron 轮询处理`)
            return NextResponse.json({
                success: true,
                async: true,
                message: '图片编辑任务已提交，请稍后刷新查看结果'
            })
        }

        if (!result.success || !result.imageUrl) {
            console.log(`${LOG_PREFIX} 角色图片编辑失败: success=${result.success}, error=${result.error}`)
            await (prisma as any).globalCharacterAppearance.update({
                where: { id: appearance.id },
                data: { generating: false }
            })
            throw new ApiError('GENERATION_FAILED', { message: result.error || '图片编辑失败' })
        }

        // 下载编辑后的图片
        const editedResponse = await fetchWithTimeoutAndRetry(result.imageUrl, { logPrefix: '[Asset Hub 下载编辑图片]' })
        const editedBuffer = Buffer.from(await editedResponse.arrayBuffer())

        const editedMeta = await sharp(editedBuffer).metadata()
        const editedWidth = editedMeta.width || originalWidth
        const editedHeight = editedMeta.height || (originalHeight - barH)

        // 添加标签
        const newFontSize = Math.floor((editedHeight + barH) * 0.04)
        const newPad = Math.floor(newFontSize * 0.5)
        const newBarH = newFontSize + newPad * 2
        const svg = await createLabelSVG(editedWidth, newBarH, newFontSize, newPad, assetName)

        const finalBuffer = await sharp(editedBuffer)
            .extend({ top: newBarH, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
            .composite([{ input: svg, top: 0, left: 0 }])
            .jpeg({ quality: 90, mozjpeg: true })
            .toBuffer()

        const key = generateUniqueKey(`global-char-${id}-modified`, 'jpg')
        const cosKey = await uploadToCOS(finalBuffer, key)

        // 保存历史并更新
        const newImageUrls = [...imageUrls]
        newImageUrls[targetImageIndex] = cosKey

        // 🔥 修复：确定是否应该更新 imageUrl
        const shouldUpdateImageUrl =
            appearance.selectedIndex === targetImageIndex ||
            (appearance.selectedIndex === null && targetImageIndex === 0) ||
            imageUrls.length === 1

        console.log(`${LOG_PREFIX} 更新逻辑: selectedIndex=${appearance.selectedIndex}, targetImageIndex=${targetImageIndex}, shouldUpdateImageUrl=${shouldUpdateImageUrl}`)

        await (prisma as any).globalCharacterAppearance.update({
            where: { id: appearance.id },
            data: {
                previousImageUrl: appearance.imageUrl,
                previousImageUrls: appearance.imageUrls,
                // 🔥 同时保存旧的描述词，支持撤回时同步恢复
                previousDescription: appearance.description || null,
                previousDescriptions: appearance.descriptions || null,
                imageUrl: shouldUpdateImageUrl ? cosKey : appearance.imageUrl,
                imageUrls: JSON.stringify(newImageUrls),
                generating: false
            }
        })

        console.log(`${LOG_PREFIX} 角色图片编辑成功: cosKey=${cosKey}`)
        console.log(`${LOG_PREFIX} ========== 角色修改图片完成 ==========`)
        return NextResponse.json({
            success: true,
            imageUrl: getSignedUrl(cosKey, 7 * 24 * 3600)
        })

    } else if (type === 'location') {
        const location = await (prisma as any).globalLocation.findFirst({
            where: { id, userId: session.user.id },
            include: { images: { orderBy: { imageIndex: 'asc' } } }
        })
        if (!location) {
            throw new ApiError('NOT_FOUND', { message: 'Location not found' })
        }

        const targetImageIndex = imageIndex ?? 0
        const locationImage = location.images?.find((img: any) => img.imageIndex === targetImageIndex)
        if (!locationImage || !locationImage.imageUrl) {
            throw new ApiError('INVALID_PARAMS', { message: 'No image to modify' })
        }

        // 设置编辑状态
        await (prisma as any).globalLocationImage.update({
            where: { id: locationImage.id },
            data: { generating: true }
        })

        currentImageKey = locationImage.imageUrl
        assetName = location.name

        // 下载并裁剪原图
        const signedUrl = getSignedUrl(currentImageKey, 3600)
        const originalResponse = await fetchWithTimeoutAndRetry(signedUrl, { logPrefix: '[Asset Hub 下载场景原图]' })
        const originalBuffer = Buffer.from(await originalResponse.arrayBuffer())

        const meta = await sharp(originalBuffer).metadata()
        const originalWidth = meta.width || 2160
        const originalHeight = meta.height || 2160
        const fontSize = Math.floor(originalHeight * 0.04)
        const pad = Math.floor(fontSize * 0.5)
        const barH = fontSize + pad * 2

        const croppedBuffer = await sharp(originalBuffer)
            .extract({ left: 0, top: barH, width: originalWidth, height: originalHeight - barH })
            .jpeg({ quality: 95 })
            .toBuffer()

        const tempKey = generateUniqueKey(`global-loc-temp-cropped`, 'jpg')
        await uploadToCOS(croppedBuffer, tempKey)
        const croppedImageUrl = getSignedUrl(tempKey, 3600)

        // 🔥 计算裁剪后的实际尺寸
        const croppedWidth = originalWidth
        const croppedHeight = originalHeight - barH
        const croppedSize = `${croppedWidth}x${croppedHeight}`
        console.log(`${LOG_PREFIX} 场景图片编辑: 原图尺寸=${originalWidth}x${originalHeight}, 裁剪后尺寸=${croppedSize}`)

        // 调用 AI 编辑
        const prompt = `请根据以下指令修改场景图片，保持整体风格和氛围一致：\n${modifyPrompt}`
        console.log(`${LOG_PREFIX} 场景图片编辑: 开始调用 AI 生成，模型=${editModel}`)

        const result = await generateImage(
            session.user.id,
            editModel,
            prompt,
            {
                referenceImages: [croppedImageUrl],
                resolution: await getModelResolution(session.user.id, editModel),
                size: croppedSize  // 🔥 传入裁剪后的实际尺寸
            }
        )

        console.log(`${LOG_PREFIX} 场景图片编辑: AI 生成结果:`, {
            success: result.success,
            hasImageUrl: !!result.imageUrl,
            async: result.async,
            requestId: result.requestId,
            endpoint: result.endpoint,
            error: result.error
        })

        // ⚠️ 检查是否是异步任务（FAL 模型会返回 async: true）
        if (result.async && result.requestId) {
            console.log(`${LOG_PREFIX} 🔥 检测到异步任务，创建 AsyncTask 记录`)
            console.log(`${LOG_PREFIX} 异步任务详情: requestId=${result.requestId}, endpoint=${result.endpoint}`)

            // 🔥 创建异步任务，让 cron 轮询处理
            await createAsyncTask({
                type: TASK_TYPES.IMAGE_ASSET_HUB_EDIT,
                targetId: locationImage.id,
                targetType: 'location_image',
                externalId: result.requestId,
                userId: session.user.id,
                payload: {
                    endpoint: result.endpoint,
                    locationId: id,
                    locationImageId: locationImage.id,
                    targetImageIndex,
                    assetName,
                    originalWidth,
                    originalHeight,
                    barH
                }
            })

            console.log(`${LOG_PREFIX} ✅ 异步任务已创建，等待 cron 轮询处理`)
            return NextResponse.json({
                success: true,
                async: true,
                message: '图片编辑任务已提交，请稍后刷新查看结果'
            })
        }

        if (!result.success || !result.imageUrl) {
            console.log(`${LOG_PREFIX} 场景图片编辑失败: success=${result.success}, error=${result.error}`)
            await (prisma as any).globalLocationImage.update({
                where: { id: locationImage.id },
                data: { generating: false }
            })
            throw new ApiError('GENERATION_FAILED', { message: result.error || '图片编辑失败' })
        }

        // 下载编辑后的图片
        const editedResponse = await fetchWithTimeoutAndRetry(result.imageUrl, { logPrefix: '[Asset Hub 下载编辑场景图片]' })
        const editedBuffer = Buffer.from(await editedResponse.arrayBuffer())

        const editedMeta = await sharp(editedBuffer).metadata()
        const editedWidth = editedMeta.width || originalWidth
        const editedHeight = editedMeta.height || (originalHeight - barH)

        const newFontSize = Math.floor((editedHeight + barH) * 0.04)
        const newPad = Math.floor(newFontSize * 0.5)
        const newBarH = newFontSize + newPad * 2
        const svg = await createLabelSVG(editedWidth, newBarH, newFontSize, newPad, assetName)

        const finalBuffer = await sharp(editedBuffer)
            .extend({ top: newBarH, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
            .composite([{ input: svg, top: 0, left: 0 }])
            .jpeg({ quality: 90, mozjpeg: true })
            .toBuffer()

        const key = generateUniqueKey(`global-loc-${id}-modified`, 'jpg')
        const cosKey = await uploadToCOS(finalBuffer, key)

        // 保存历史并更新
        console.log(`${LOG_PREFIX} 场景更新: 旧图片=${locationImage.imageUrl}, 新图片=${cosKey}`)
        await (prisma as any).globalLocationImage.update({
            where: { id: locationImage.id },
            data: {
                previousImageUrl: locationImage.imageUrl,
                // 🔥 同时保存旧的描述词，支持撤回时同步恢复
                previousDescription: locationImage.description || null,
                imageUrl: cosKey,
                generating: false
            }
        })

        console.log(`${LOG_PREFIX} 场景图片编辑成功: cosKey=${cosKey}`)
        console.log(`${LOG_PREFIX} ========== 场景修改图片完成 ==========`)
        return NextResponse.json({
            success: true,
            imageUrl: getSignedUrl(cosKey, 7 * 24 * 3600)
        })

    } else {
        throw new ApiError('INVALID_PARAMS', { message: 'Invalid type' })
    }
})
