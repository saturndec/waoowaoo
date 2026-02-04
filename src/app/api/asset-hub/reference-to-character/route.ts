import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateUniqueKey, getSignedUrl, uploadToCOS } from '@/lib/cos'
import { REFERENCE_TO_CHARACTER_PROMPT, IMAGE_TO_CHARACTER_DESCRIPTION_PROMPT, CHARACTER_IMAGE_BANANA_RATIO, CHARACTER_PROMPT_SUFFIX, addCharacterPromptSuffix, ART_STYLES } from '@/lib/constants'
import { generateImage } from '@/lib/generator-api'
import { getModelResolution, getFalApiKey } from '@/lib/api-config'
import { chatCompletionWithVision, getCompletionContent } from '@/lib/llm-client'
import { queryFalStatus } from '@/lib/async-submit'
import sharp from 'sharp'
import { initializeFonts, createLabelSVG } from '@/lib/fonts'
import { fetchWithTimeoutAndRetry } from '@/lib/ark-api'
import { getUserModelConfig } from '@/lib/config-service'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/asset-hub/reference-to-character
 * 将用户上传的参考图片转换为标准的角色三视图设定图，同时生成角色描述
 * 
 * 支持三种模式：
 * 1. extractOnly=true：仅提取图片描述（反推提示词），不生成图片
 * 2. customDescription：使用用户提供的描述文本进行文生图（不使用参考图）
 * 3. 默认模式：图生图，直接基于参考图生成三视图
 * 
 * 额外支持：
 * - isBackgroundJob=true：后台模式，直接更新数据库中的角色形象
 */
export const POST = apiHandler(async (request: NextRequest) => {
    await initializeFonts()

    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const body = await request.json()
    const {
        referenceImageUrl,
        referenceImageUrls,
        characterName,
        characterId,
        appearanceId,
        isBackgroundJob,
        artStyle,
        extractOnly,        // 🔥 新增：仅提取描述模式
        customDescription   // 🔥 新增：使用用户提供的描述进行文生图
    } = body

    // 🔥 支持多张参考图（最多 5 张），兼容单张旧格式
    let allReferenceImages: string[] = []
    if (referenceImageUrls && Array.isArray(referenceImageUrls)) {
        allReferenceImages = referenceImageUrls.slice(0, 5)  // 最多 5 张
    } else if (referenceImageUrl) {
        allReferenceImages = [referenceImageUrl]
    }

    if (allReferenceImages.length === 0) {
        throw new ApiError('INVALID_PARAMS', { message: 'Missing referenceImageUrl or referenceImageUrls' })
    }

    console.log(`[Reference to Character] 参考图数量: ${allReferenceImages.length}`)

    // 后台任务模式：需要 characterId 和 appearanceId
    if (isBackgroundJob && (!characterId || !appearanceId)) {
        throw new ApiError('INVALID_PARAMS', { message: 'Missing characterId or appearanceId for background job' })
    }

    // 🔥 使用统一配置服务获取用户模型配置
    const userConfig = await getUserModelConfig(session.user.id)
    const imageModel = userConfig.characterModel
    const analysisModel = userConfig.analysisModel

    if (!imageModel) {
        // 后台任务模式：标记失败
        if (isBackgroundJob && appearanceId) {
            await (prisma as any).globalCharacterAppearance.update({
                where: { id: appearanceId },
                data: { generating: false }
            })
        }
        throw new ApiError('MISSING_CONFIG', { message: '请先在设置页面配置角色图片模型' })
    }

    console.log(`[Reference to Character] 开始转换，图片模型: ${imageModel}, 后台模式: ${!!isBackgroundJob}, 仅提取: ${!!extractOnly}, 自定义描述: ${!!customDescription}`)

    // 🔥 模式1：仅提取描述（反推提示词）
    if (extractOnly) {
        if (!analysisModel) {
            throw new ApiError('MISSING_CONFIG', { message: '请先在设置页面配置分析模型' })
        }

        console.log('[Reference to Character] 仅提取描述模式')
        console.log('[Reference to Character] 传入 Vision 的图片 URL:', allReferenceImages)
        const completion = await chatCompletionWithVision(
            session.user.id,
            analysisModel,
            IMAGE_TO_CHARACTER_DESCRIPTION_PROMPT,
            allReferenceImages,
            { temperature: 0.3 }
        )
        const extractedDescription = getCompletionContent(completion)

        console.log(`[Reference to Character] 描述提取完成: ${extractedDescription?.substring(0, 50)}...`)
        return NextResponse.json({
            success: true,
            description: extractedDescription
        })
    }

    // 🔥 模式2：使用自定义描述进行文生图（不使用参考图）
    // 🔥 模式3（默认）：图生图，直接基于参考图生成

    // 获取风格提示词
    const selectedStyle = ART_STYLES.find(s => s.value === artStyle)
    const artStylePrompt = selectedStyle?.prompt || ''

    let prompt = customDescription
        ? addCharacterPromptSuffix(customDescription)  // 文生图：使用用户描述 + 后缀
        : REFERENCE_TO_CHARACTER_PROMPT                 // 图生图：使用固定提示词

    // 🔥 追加风格提示词
    if (artStylePrompt) {
        prompt = `${prompt}，${artStylePrompt}`
    }

    const useReferenceImages = !customDescription      // 文生图模式不传参考图

    const resolution = await getModelResolution(session.user.id, imageModel)
    const falApiKey = await getFalApiKey(session.user.id)

    // 🔥 并行执行：1) 生成 3 张图片 2) 分析图片生成描述
    const generateSingleImage = async (index: number): Promise<string | null> => {
        try {
            console.log(`[Reference to Character] 生成第 ${index + 1}/3 张图片`)
            const result = await generateImage(
                session.user.id,
                imageModel,
                prompt,
                {
                    referenceImages: useReferenceImages ? allReferenceImages : undefined,  // 🔥 文生图模式不传参考图
                    aspectRatio: CHARACTER_IMAGE_BANANA_RATIO,
                    resolution
                }
            )

            // 🔥 处理异步任务：轮询等待完成
            let finalImageUrl = result.imageUrl
            if (result.async && result.requestId && result.endpoint) {
                console.log(`[Reference to Character] 第 ${index + 1} 张是异步任务，开始轮询: ${result.requestId}`)
                const maxPollAttempts = 60  // 最多轮询 60 次（约 2 分钟）
                const pollInterval = 2000   // 每 2 秒轮询一次

                for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
                    await new Promise(resolve => setTimeout(resolve, pollInterval))
                    const status = await queryFalStatus(result.endpoint, result.requestId, falApiKey)

                    if (status.completed && status.resultUrl) {
                        finalImageUrl = status.resultUrl
                        console.log(`[Reference to Character] 第 ${index + 1} 张异步任务完成: ${finalImageUrl?.substring(0, 50)}...`)
                        break
                    }
                    if (status.failed) {
                        console.error(`[Reference to Character] 第 ${index + 1} 张异步任务失败:`, status.error)
                        return null
                    }
                    if (attempt % 10 === 0) {
                        console.log(`[Reference to Character] 第 ${index + 1} 张轮询中... (${attempt}/${maxPollAttempts})`)
                    }
                }
            }

            if (!result.success || !finalImageUrl) {
                console.error(`[Reference to Character] 第 ${index + 1} 张生成失败:`, result.error)
                return null
            }

            // 下载并添加标签
            const imgRes = await fetchWithTimeoutAndRetry(finalImageUrl, {
                logPrefix: `[Reference to Character 图片 ${index + 1}]`
            })
            const buffer = Buffer.from(await imgRes.arrayBuffer())
            const meta = await sharp(buffer).metadata()
            const w = meta.width || 2160, h = meta.height || 2160
            const fontSize = Math.floor(h * 0.04)
            const pad = Math.floor(fontSize * 0.5)
            const barH = fontSize + pad * 2

            const labelText = characterName?.trim() || '新角色 - 初始形象'
            const svg = await createLabelSVG(w, barH, fontSize, pad, labelText)

            const processed = await sharp(buffer)
                .extend({ top: barH, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
                .composite([{ input: svg, top: 0, left: 0 }])
                .jpeg({ quality: 90, mozjpeg: true })
                .toBuffer()

            // 上传到 COS
            const key = generateUniqueKey(`ref-char-${Date.now()}-${index}`, 'jpg')
            const cosKey = await uploadToCOS(processed, key)
            console.log(`[Reference to Character] 第 ${index + 1} 张上传成功: ${cosKey}`)
            return cosKey
        } catch (error: any) {
            console.error(`[Reference to Character] 第 ${index + 1} 张处理失败:`, error.message)
            return null
        }
    }

    const [imageResults, descriptionResult] = await Promise.all([
        // 🔥 并行生成 3 张图片
        Promise.all([0, 1, 2].map(i => generateSingleImage(i))),
        // 分析图片生成描述
        (async () => {
            if (!analysisModel) return null

            const analysisPrompt = `请分析这张角色图片，生成一段详细的角色外貌描述（用于 AI 图片生成）。

要求：
1. 描述长度 150-200 字
2. 包含：脸型、五官、发型发色、体态、服装配饰
3. 使用客观描述，避免主观评价
4. 禁止描写：皮肤颜色、眼睛颜色、表情、背景

只返回描述文字，不要有其他内容。`

            const completion = await chatCompletionWithVision(
                session.user.id,
                analysisModel,
                analysisPrompt,
                allReferenceImages,  // 🔥 分析所有参考图
                { temperature: 0.3 }
            )
            return getCompletionContent(completion)
        })()
    ])

    // 过滤成功的图片
    const successfulCosKeys = imageResults.filter((key): key is string => key !== null)

    if (successfulCosKeys.length === 0) {
        console.error('[Reference to Character] 所有图片生成都失败')
        if (isBackgroundJob && appearanceId) {
            await (prisma as any).globalCharacterAppearance.update({
                where: { id: appearanceId },
                data: { generating: false }
            })
        }
        throw new ApiError('GENERATION_FAILED', { message: '图片生成失败' })
    }

    const mainCosKey = successfulCosKeys[0]
    const mainSignedUrl = getSignedUrl(mainCosKey, 7 * 24 * 3600)
    const description = descriptionResult

    console.log(`[Reference to Character] 生成完成: ${successfulCosKeys.length}/3 张成功`)

    // 后台任务模式：直接更新数据库
    if (isBackgroundJob && appearanceId) {
        await (prisma as any).globalCharacterAppearance.update({
            where: { id: appearanceId },
            data: {
                imageUrl: mainCosKey,
                imageUrls: JSON.stringify(successfulCosKeys),
                generating: false,
                description: description || undefined
            }
        })
        console.log(`[Reference to Character] 后台任务完成: ${successfulCosKeys.length} 张图片`)
        return NextResponse.json({ success: true })
    }

    console.log(`[Reference to Character] 转换成功: ${successfulCosKeys.length} 张, 描述: ${description ? '已生成' : '未生成'}`)

    return NextResponse.json({
        success: true,
        imageUrl: mainSignedUrl,
        cosKey: mainCosKey,
        cosKeys: successfulCosKeys,  // 🔥 返回所有图片 key
        description
    })
})
