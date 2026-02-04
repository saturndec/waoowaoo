import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateUniqueKey, getSignedUrl, uploadToCOS } from '@/lib/cos'
import { addCharacterPromptSuffix, addLocationPromptSuffix, CHARACTER_IMAGE_SIZE, CHARACTER_IMAGE_BANANA_RATIO, LOCATION_IMAGE_BANANA_RATIO, ART_STYLES } from '@/lib/constants'
import { generateImage } from '@/lib/generator-api'
import { getModelResolution, getFalApiKey } from '@/lib/api-config'
import { queryFalStatus } from '@/lib/async-submit'
import sharp from 'sharp'
import { initializeFonts, createLabelSVG } from '@/lib/fonts'
import { fetchWithTimeoutAndRetry } from '@/lib/ark-api'
import { createAsyncTask, TASK_TYPES } from '@/lib/async-task-manager'
import { getUserModelConfig } from '@/lib/config-service'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/asset-hub/generate-image
 * 为资产中心角色/场景生成图片（3张候选）
 */
export const POST = apiHandler(async (request: NextRequest) => {
    await initializeFonts()

    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const body = await request.json()
    const { type, id, appearanceIndex, artStyle } = body

    // 获取风格提示词
    const selectedStyle = ART_STYLES.find(s => s.value === artStyle)
    const artStylePrompt = selectedStyle?.prompt || ''

    // 🔥 使用统一配置服务获取用户模型配置
    const userConfig = await getUserModelConfig(session.user.id)

    // 根据类型选择对应的模型
    let selectedModel: string
    if (type === 'character') {
        if (!userConfig.characterModel) {
            throw new ApiError('MISSING_CONFIG', { message: '请先在用户设置中配置"角色图像模型"' })
        }
        selectedModel = userConfig.characterModel
    } else if (type === 'location') {
        if (!userConfig.locationModel) {
            throw new ApiError('MISSING_CONFIG', { message: '请先在用户设置中配置"场景图像模型"' })
        }
        selectedModel = userConfig.locationModel
    } else {
        throw new ApiError('INVALID_PARAMS', { message: 'Invalid type' })
    }

    if (type === 'character') {
        // 获取角色和形象
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

        if (appearance.generating) {
            throw new ApiError('BUSY', { message: '正在生成中，请稍候...' })
        }

        // 设置生成状态
        await (prisma as any).globalCharacterAppearance.update({
            where: { id: appearance.id },
            data: { generating: true }
        })

        // 保存当前图片作为历史版本
        if (appearance.imageUrl || appearance.imageUrls) {
            await (prisma as any).globalCharacterAppearance.update({
                where: { id: appearance.id },
                data: {
                    previousImageUrl: appearance.imageUrl,
                    previousImageUrls: appearance.imageUrls
                }
            })
        }

        // 获取描述
        let descriptions: string[] = []
        if (appearance.descriptions) {
            try { descriptions = JSON.parse(appearance.descriptions) } catch { }
        }
        if (descriptions.length === 0 && appearance.description) {
            descriptions = [appearance.description, appearance.description, appearance.description]
        }
        if (descriptions.length === 0) {
            await (prisma as any).globalCharacterAppearance.update({
                where: { id: appearance.id },
                data: { generating: false }
            })
            throw new ApiError('INVALID_PARAMS', { message: 'No description found' })
        }

        // 确保有3个描述用于生成3张图
        while (descriptions.length < 3) {
            descriptions.push(descriptions[0])
        }

        const falApiKey = await getFalApiKey(session.user.id)

        const generateSingleImage = async (i: number): Promise<string | null> => {
            let fullPrompt = addCharacterPromptSuffix(descriptions[i])
            // 添加风格提示词
            if (artStylePrompt) {
                fullPrompt = `${fullPrompt}，${artStylePrompt}`
            }

            try {
                const resolution = await getModelResolution(session.user.id, selectedModel)
                const result = await generateImage(
                    session.user.id,
                    selectedModel,
                    fullPrompt,
                    {
                        aspectRatio: CHARACTER_IMAGE_BANANA_RATIO,
                        resolution
                    }
                )

                // 🔥 处理异步任务：轮询等待完成
                let finalImageUrl = result.imageUrl
                if (result.async && result.requestId && result.endpoint) {
                    console.log(`[Asset Hub] 角色图片 ${i} 是异步任务，开始轮询: ${result.requestId}`)
                    const maxPollAttempts = 60
                    const pollInterval = 2000

                    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
                        await new Promise(resolve => setTimeout(resolve, pollInterval))
                        const status = await queryFalStatus(result.endpoint, result.requestId, falApiKey)

                        if (status.completed && status.resultUrl) {
                            finalImageUrl = status.resultUrl
                            console.log(`[Asset Hub] 角色图片 ${i} 异步任务完成`)
                            break
                        }
                        if (status.failed) {
                            console.error(`[Asset Hub] 角色图片 ${i} 异步任务失败:`, status.error)
                            return null
                        }
                    }
                }

                if (!result.success || !finalImageUrl) {
                    console.error(`[Asset Hub] 角色图片生成失败 ${i}: ${result.error}`)
                    return null
                }

                // 下载并添加标签
                const imgRes = await fetchWithTimeoutAndRetry(finalImageUrl, { logPrefix: `[Asset Hub 角色图片 ${i}]` })
                const buffer = Buffer.from(await imgRes.arrayBuffer())
                const meta = await sharp(buffer).metadata()
                const w = meta.width || 2160, h = meta.height || 2160
                const fontSize = Math.floor(h * 0.04), pad = Math.floor(fontSize * 0.5), barH = fontSize + pad * 2

                const svg = await createLabelSVG(w, barH, fontSize, pad, `${character.name} - ${appearance.changeReason}`)

                const processed = await sharp(buffer)
                    .extend({ top: barH, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
                    .composite([{ input: svg, top: 0, left: 0 }])
                    .jpeg({ quality: 90, mozjpeg: true })
                    .toBuffer()

                const key = generateUniqueKey(`global-char-${id}-${targetIndex}-v${i}`, 'jpg')
                return await uploadToCOS(processed, key)
            } catch (e) {
                console.error(`[Asset Hub] 图片生成异常 ${i}:`, e)
                return null
            }
        }

        // 并行生成3张图片
        const results = await Promise.all([0, 1, 2].map(i => generateSingleImage(i)))
        const successCount = results.filter(r => r !== null).length

        if (successCount === 0) {
            await (prisma as any).globalCharacterAppearance.update({
                where: { id: appearance.id },
                data: { generating: false }
            })
            throw new ApiError('GENERATION_FAILED', { message: '图片生成失败' })
        }

        // 保存结果
        const imageUrls = JSON.stringify(results)
        const firstUrl = results.find(u => u !== null) || null

        await (prisma as any).globalCharacterAppearance.update({
            where: { id: appearance.id },
            data: {
                imageUrls,
                imageUrl: firstUrl,
                selectedIndex: null, // 重置选择
                generating: false
            }
        })

        const signedUrls = results.map(k => k ? getSignedUrl(k, 7 * 24 * 3600) : null)

        return NextResponse.json({
            success: true,
            imageUrls: signedUrls,
            imageUrl: signedUrls.find(u => u) || null
        })

    } else if (type === 'location') {
        // 获取场景
        const location = await (prisma as any).globalLocation.findFirst({
            where: { id, userId: session.user.id },
            include: { images: { orderBy: { imageIndex: 'asc' } } }
        })
        if (!location) {
            throw new ApiError('NOT_FOUND', { message: 'Location not found' })
        }

        const isGenerating = location.images?.some((img: any) => img.generating)
        if (isGenerating) {
            throw new ApiError('BUSY', { message: '正在生成中，请稍候...' })
        }

        // 设置生成状态
        await (prisma as any).globalLocationImage.updateMany({
            where: { locationId: id },
            data: { generating: true }
        })

        // 保存历史版本
        for (const img of location.images || []) {
            if (img.imageUrl) {
                await (prisma as any).globalLocationImage.update({
                    where: { id: img.id },
                    data: { previousImageUrl: img.imageUrl }
                })
            }
        }

        const falApiKey = await getFalApiKey(session.user.id)

        const generateSingleLocationImage = async (img: any): Promise<string | null> => {
            if (!img.description) return null
            let fullPrompt = addLocationPromptSuffix(img.description)
            // 添加风格提示词
            if (artStylePrompt) {
                fullPrompt = `${fullPrompt}，${artStylePrompt}`
            }

            try {
                const resolution = await getModelResolution(session.user.id, selectedModel)
                const result = await generateImage(
                    session.user.id,
                    selectedModel,
                    fullPrompt,
                    {
                        aspectRatio: LOCATION_IMAGE_BANANA_RATIO,
                        resolution
                    }
                )

                // 🔥 处理异步任务：轮询等待完成
                let finalImageUrl = result.imageUrl
                if (result.async && result.requestId && result.endpoint) {
                    console.log(`[Asset Hub] 场景图片是异步任务，开始轮询: ${result.requestId}`)
                    const maxPollAttempts = 60
                    const pollInterval = 2000

                    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
                        await new Promise(resolve => setTimeout(resolve, pollInterval))
                        const status = await queryFalStatus(result.endpoint, result.requestId, falApiKey)

                        if (status.completed && status.resultUrl) {
                            finalImageUrl = status.resultUrl
                            console.log(`[Asset Hub] 场景图片异步任务完成`)
                            break
                        }
                        if (status.failed) {
                            console.error(`[Asset Hub] 场景图片异步任务失败:`, status.error)
                            return null
                        }
                    }
                }

                if (!result.success || !finalImageUrl) {
                    console.error(`[Asset Hub] 场景图片生成失败: ${result.error}`)
                    return null
                }

                // 下载并添加标签
                const imgRes = await fetchWithTimeoutAndRetry(finalImageUrl, { logPrefix: `[Asset Hub 场景图片]` })
                const buffer = Buffer.from(await imgRes.arrayBuffer())
                const meta = await sharp(buffer).metadata()
                const w = meta.width || 2160, h = meta.height || 2160
                const fontSize = Math.floor(h * 0.04), pad = Math.floor(fontSize * 0.5), barH = fontSize + pad * 2

                const svg = await createLabelSVG(w, barH, fontSize, pad, location.name)

                const processed = await sharp(buffer)
                    .extend({ top: barH, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
                    .composite([{ input: svg, top: 0, left: 0 }])
                    .jpeg({ quality: 90, mozjpeg: true })
                    .toBuffer()

                const key = generateUniqueKey(`global-loc-${id}-v${img.imageIndex}`, 'jpg')
                return await uploadToCOS(processed, key)
            } catch (e) {
                console.error(`[Asset Hub] 场景图片生成异常:`, e)
                return null
            }
        }

        // 并行生成所有图片
        const results = await Promise.all((location.images || []).map((img: any) => generateSingleLocationImage(img)))

        // 更新数据库
        for (let i = 0; i < (location.images || []).length; i++) {
            await (prisma as any).globalLocationImage.update({
                where: { id: location.images[i].id },
                data: {
                    imageUrl: results[i],
                    generating: false
                }
            })
        }

        const signedUrls = results.map(k => k ? getSignedUrl(k, 7 * 24 * 3600) : null)

        return NextResponse.json({
            success: true,
            imageUrls: signedUrls,
            imageUrl: signedUrls.find(u => u) || null
        })

    } else {
        throw new ApiError('INVALID_PARAMS', { message: 'Invalid type' })
    }
})
