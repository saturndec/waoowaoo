/**
 * POST /api/novel-promotion/[projectId]/panel-variant
 * 
 * 执行镜头变体生成
 * 基于原图 + 变体指令创建新 Panel 并生成图片
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logAIAnalysis } from '@/lib/logger'
import { getSignedUrl, generateUniqueKey, uploadToCOS, downloadAndUploadToCOS } from '@/lib/cos'
import { generateImage } from '@/lib/generator-api'
import { getModelResolution } from '@/lib/api-config'
import { createAsyncTask, markTaskCompleted, markTaskFailed, updateTaskProgress, TASK_TYPES } from '@/lib/async-task-manager'
import { recordImageUsage } from '@/lib/pricing'
import { getProjectModelConfig } from '@/lib/config-service'
import { after } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import fs from 'fs'
import path from 'path'

// 两阶段重新编号（避免唯一约束冲突）
async function reindexPanels(reorderedPanelIds: string[]) {
    console.log(`[Panel Variant] 重新编号 ${reorderedPanelIds.length} 个分镜`)

    // Phase 1: 设置临时负数
    for (let i = 0; i < reorderedPanelIds.length; i++) {
        await prisma.novelPromotionPanel.update({
            where: { id: reorderedPanelIds[i] },
            data: { panelIndex: -(i + 1) }
        })
    }

    // Phase 2: 设置最终值
    for (let i = 0; i < reorderedPanelIds.length; i++) {
        await prisma.novelPromotionPanel.update({
            where: { id: reorderedPanelIds[i] },
            data: { panelIndex: i, panelNumber: i + 1 }
        })
    }

    console.log(`[Panel Variant] 重新编号完成`)
}

export const POST = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    const body = await request.json()
    const {
        storyboardId,
        insertAfterPanelId,
        sourcePanelId,
        variant,
        includeCharacterAssets = true,
        includeLocationAsset = true,
        _internal,
        _taskId,
        _panelId
    } = body

    // 鉴权
    let session: { user: { id: string; name?: string | null } } | null = null
    if (_internal) {
        const task = await prisma.asyncTask.findUnique({ where: { id: _taskId } })
        if (!task) {
            throw new ApiError('NOT_FOUND', { message: 'Task not found' })
        }
        const payload = task.payload as any
        session = { user: { id: payload.userId, name: payload.userName || 'Internal' } }
    } else {
        // 🔐 统一权限验证
        const { requireProjectAuthLight, isErrorResponse } = await import('@/lib/api-auth')
        const authResult = await requireProjectAuthLight(projectId)
        if (isErrorResponse(authResult)) return authResult
        session = authResult.session
    }

    if (!storyboardId || !insertAfterPanelId || !sourcePanelId) {
        throw new ApiError('INVALID_PARAMS', {
            message: 'Missing required fields: storyboardId, insertAfterPanelId, sourcePanelId'
        })
    }

    if (!variant || !variant.video_prompt) {
        throw new ApiError('INVALID_PARAMS', { message: 'Missing variant data' })
    }

    // 获取项目数据
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
            novelPromotionData: {
                include: {
                    characters: { include: { appearances: true } },
                    locations: { include: { images: true } }
                }
            }
        }
    })

    if (!project) {
        throw new ApiError('NOT_FOUND', { message: 'Project not found' })
    }

    if (!_internal && project.userId !== session!.user.id) {
        throw new ApiError('FORBIDDEN', { message: 'Forbidden' })
    }

    const novelPromotionData = project.novelPromotionData
    if (!novelPromotionData) {
        throw new ApiError('NOT_FOUND', { message: 'Project data not found' })
    }

    // 获取源 panel（用于获取图片和上下文）
    const sourcePanel = await prisma.novelPromotionPanel.findUnique({
        where: { id: sourcePanelId }
    })

    if (!sourcePanel) {
        throw new ApiError('NOT_FOUND', { message: 'Source panel not found' })
    }

    // 获取插入位置的 panel
    const prevPanel = await prisma.novelPromotionPanel.findUnique({
        where: { id: insertAfterPanelId }
    })

    if (!prevPanel || prevPanel.storyboardId !== storyboardId) {
        throw new ApiError('NOT_FOUND', { message: 'Previous panel not found or mismatch' })
    }

    // === 非内部调用：同步创建占位 + 异步生成 ===
    if (!_internal) {
        console.log(`[Panel Variant] 开始同步创建占位分镜...`)

        // 1. 创建占位 panel
        const tempPanelIndex = prevPanel.panelIndex + 10000 + Math.floor(Math.random() * 1000)
        const placeholderPanel = await prisma.novelPromotionPanel.create({
            data: {
                storyboardId,
                panelIndex: tempPanelIndex,
                panelNumber: 0,
                shotType: variant.shot_type || '中景',
                cameraMove: variant.camera_move || '固定',
                description: variant.description || '正在生成镜头变体...',
                location: sourcePanel.location,
                characters: sourcePanel.characters,
                videoPrompt: variant.video_prompt,
                generatingImage: true
            }
        })

        console.log(`[Panel Variant] 占位分镜已创建: ${placeholderPanel.id}`)

        // 2. 重新编号
        const existingPanels = await prisma.novelPromotionPanel.findMany({
            where: { storyboardId, id: { not: placeholderPanel.id } },
            orderBy: { panelIndex: 'asc' },
            select: { id: true, panelIndex: true }
        })

        const insertPosition = existingPanels.findIndex(p => p.panelIndex > prevPanel.panelIndex)
        const actualInsertPos = insertPosition === -1 ? existingPanels.length : insertPosition

        const reorderedPanelIds = [
            ...existingPanels.slice(0, actualInsertPos).map(p => p.id),
            placeholderPanel.id,
            ...existingPanels.slice(actualInsertPos).map(p => p.id)
        ]

        await reindexPanels(reorderedPanelIds)

        // 更新 storyboard 的 panelCount
        await prisma.novelPromotionStoryboard.update({
            where: { id: storyboardId },
            data: { panelCount: reorderedPanelIds.length }
        })

        const updatedPlaceholder = await prisma.novelPromotionPanel.findUnique({
            where: { id: placeholderPanel.id }
        })

        console.log(`[Panel Variant] 占位分镜编号: #${updatedPlaceholder?.panelNumber}`)

        // 3. 创建异步任务
        const asyncTask = await createAsyncTask({
            type: TASK_TYPES.PANEL_VARIANT,
            targetId: placeholderPanel.id,
            targetType: 'NovelPromotionPanel',
            payload: {
                projectId,
                storyboardId,
                insertAfterPanelId,
                sourcePanelId,
                panelId: placeholderPanel.id,
                variant,
                includeCharacterAssets,
                includeLocationAsset,
                userId: session!.user.id,
                userName: session!.user.name
            },
            userId: session!.user.id
        })

        console.log(`[Panel Variant] 异步任务已创建: ${asyncTask.id}`)

        // 4. 使用 after() 触发后台生成
        after(async () => {
            try {
                await triggerPanelVariantGeneration(projectId, asyncTask.id, placeholderPanel.id)
            } catch (error: any) {
                console.error(`[Panel Variant] 后台执行失败:`, error)
                await markTaskFailed(asyncTask.id, error.message)
                await prisma.novelPromotionPanel.update({
                    where: { id: placeholderPanel.id },
                    data: { generatingImage: false, imageErrorMessage: error.message }
                })
            }
        })

        return NextResponse.json({
            success: true,
            async: true,
            taskId: asyncTask.id,
            panelId: placeholderPanel.id,
            panelNumber: updatedPlaceholder?.panelNumber,
            message: '镜头变体已创建，正在生成图片...'
        })
    }

    // === 内部调用: 执行图片生成 ===
    console.log(`[Panel Variant] 开始生成图片，任务ID: ${_taskId}，Panel: ${_panelId}`)

    await updateTaskProgress(_taskId, 10)

    // 读取提示词模板
    const promptPath = path.join(process.cwd(), 'lib', 'prompts', 'novel-promotion', 'agent_shot_variant_generate.txt')
    const promptTemplate = fs.readFileSync(promptPath, 'utf-8')

    // 解析角色信息
    let charactersInfo = '无'
    if (sourcePanel.characters) {
        try {
            const chars = JSON.parse(sourcePanel.characters)
            if (Array.isArray(chars)) {
                charactersInfo = chars.map((c: any) => typeof c === 'string' ? c : c.name).join('、')
            }
        } catch { }
    }

    // 收集参考图片
    const referenceImageUrls: string[] = []

    // 原始图片作为主要参考
    if (sourcePanel.imageUrl) {
        const url = sourcePanel.imageUrl.startsWith('images/')
            ? getSignedUrl(sourcePanel.imageUrl, 3600)
            : sourcePanel.imageUrl
        referenceImageUrls.push(url)
    }

    // 角色资产图片
    let characterAssetsDesc = '无'
    if (includeCharacterAssets && sourcePanel.characters) {
        try {
            const chars = JSON.parse(sourcePanel.characters)
            const descParts: string[] = []
            for (const charItem of chars) {
                const charName = typeof charItem === 'string' ? charItem : charItem.name
                const character = novelPromotionData.characters.find((c: any) =>
                    c.name.toLowerCase() === charName.toLowerCase()
                )
                if (character) {
                    const appearances = (character as any).appearances || []
                    const targetAppearance = appearances[0]
                    if (targetAppearance?.imageUrl) {
                        const url = targetAppearance.imageUrl.startsWith('images/')
                            ? getSignedUrl(targetAppearance.imageUrl, 3600)
                            : targetAppearance.imageUrl
                        referenceImageUrls.push(url)
                        descParts.push(`${charName}: 参考图片已提供`)
                    }
                }
            }
            if (descParts.length > 0) {
                characterAssetsDesc = descParts.join('\n')
            }
        } catch { }
    }

    // 场景资产图片
    let locationAssetDesc = '无'
    if (includeLocationAsset && sourcePanel.location) {
        const location = novelPromotionData.locations.find((l: any) =>
            l.name.toLowerCase() === sourcePanel.location?.toLowerCase()
        )
        if (location) {
            const images = (location as any).images || []
            const selectedImage = images.find((img: any) => img.isSelected) || images[0]
            if (selectedImage?.imageUrl) {
                const url = selectedImage.imageUrl.startsWith('images/')
                    ? getSignedUrl(selectedImage.imageUrl, 3600)
                    : selectedImage.imageUrl
                referenceImageUrls.push(url)
                locationAssetDesc = `${sourcePanel.location}: 参考图片已提供`
            }
        }
    }

    await updateTaskProgress(_taskId, 30)

    // 构建提示词
    const videoRatio = novelPromotionData.videoRatio || '16:9'
    // 🔥 实时从常量获取风格 prompt
    const { getArtStylePrompt } = await import('@/lib/constants')
    const artStylePrompt = getArtStylePrompt(novelPromotionData.artStyle)

    const prompt = promptTemplate
        .replace('{original_description}', sourcePanel.description || '无')
        .replace('{original_shot_type}', sourcePanel.shotType || '中景')
        .replace('{original_camera_move}', sourcePanel.cameraMove || '固定')
        .replace('{location}', sourcePanel.location || '未知')
        .replace('{characters_info}', charactersInfo)
        .replace('{variant_title}', variant.title || '自定义变体')
        .replace('{variant_description}', variant.description || '无')
        .replace('{target_shot_type}', variant.shot_type || '中景')
        .replace('{target_camera_move}', variant.camera_move || '固定')
        .replace('{video_prompt}', variant.video_prompt)
        .replace('{character_assets}', characterAssetsDesc)
        .replace('{location_asset}', locationAssetDesc)
        .replace('{aspect_ratio}', videoRatio)
        .replace('{style}', artStylePrompt)

    // 记录日志
    logAIAnalysis(session!.user.id, session!.user.name || 'unknown', projectId, project.name, {
        action: 'PANEL_VARIANT_GENERATE',
        input: {
            sourcePanelId,
            targetPanelId: _panelId,
            variant: variant.title,
            参考图片数: referenceImageUrls.length
        },
        model: (novelPromotionData as any).storyboardModel || 'unknown'
    })

    await updateTaskProgress(_taskId, 50)

    // ✅ 使用统一的新架构生成图片
    const storyboardModel = (novelPromotionData as any).storyboardModel
    if (!storyboardModel) {
        throw new Error('请先在项目设置中配置"分镜图像模型"')
    }
    let generatedImageUrl: string | null = null

    console.log(`[Panel Variant] 使用模型: ${storyboardModel}`)

    const result = await generateImage(
        session!.user.id,
        storyboardModel,
        prompt,
        {
            referenceImages: referenceImageUrls,
            aspectRatio: videoRatio,
            resolution: await getModelResolution(session!.user.id, storyboardModel)
        }
    )

    if (!result.success) {
        throw new Error(result.error || '图片生成失败')
    }

    // 检测异步返回
    if (result.async && result.externalId) {
        // 🔥 使用生成器返回的标准格式 externalId（不再手动构造）
        await createAsyncTask({
            type: TASK_TYPES.IMAGE_FAL,
            targetId: _panelId,
            targetType: 'NovelPromotionPanel',
            externalId: result.externalId,
            payload: { prompt, model: storyboardModel, videoRatio },
            userId: session!.user.id
        })
        console.log(`[Panel Variant] 异步任务已创建: ${result.externalId}`)
    } else {
        // 处理不同的返回格式
        if (result.imageBase64) {
            // Base64格式（如 Gemini）
            const imageBuffer = Buffer.from(result.imageBase64, 'base64')
            const cosKey = generateUniqueKey(`panel-${_panelId}-variant`, 'png')
            generatedImageUrl = await uploadToCOS(imageBuffer, cosKey)
        } else if (result.imageUrl) {
            // URL格式（如 FAL/ARK）
            const cosKey = generateUniqueKey(`panel-${_panelId}-variant`, 'png')
            generatedImageUrl = await downloadAndUploadToCOS(result.imageUrl, cosKey)
        }
    }

    await updateTaskProgress(_taskId, 90)

    // 更新 Panel
    if (generatedImageUrl) {
        await prisma.novelPromotionPanel.update({
            where: { id: _panelId },
            data: {
                imageUrl: generatedImageUrl,
                generatingImage: false
            }
        })

        // 记录计费
        const billingModel = storyboardModel === 'banana' ? 'banana-2k' : storyboardModel
        await recordImageUsage(
            projectId,
            session!.user.id,
            billingModel,
            'panel_variant',
            1,
            { panelId: _panelId, variant: variant.title }
        )
    }

    // 标记任务完成
    await markTaskCompleted(_taskId, {
        success: true,
        panelId: _panelId,
        imageUrl: generatedImageUrl
    })

    console.log(`[Panel Variant] 完成!`)

    return NextResponse.json({ success: true, panelId: _panelId, imageUrl: generatedImageUrl })
})

// 触发内部图片生成
async function triggerPanelVariantGeneration(projectId: string, taskId: string, panelId: string) {
    const { getBaseUrl } = await import('@/lib/env')
    const baseUrl = getBaseUrl()

    const task = await prisma.asyncTask.findUnique({ where: { id: taskId } })
    if (!task) throw new Error('Task not found')

    const payload = task.payload as any

    const res = await fetch(`${baseUrl}/api/novel-promotion/${projectId}/panel-variant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            storyboardId: payload.storyboardId,
            insertAfterPanelId: payload.insertAfterPanelId,
            sourcePanelId: payload.sourcePanelId,
            variant: payload.variant,
            includeCharacterAssets: payload.includeCharacterAssets,
            includeLocationAsset: payload.includeLocationAsset,
            _internal: true,
            _taskId: taskId,
            _panelId: panelId
        })
    })

    if (!res.ok) {
        const error = await res.text()
        throw new Error(`图片生成执行失败: ${error}`)
    }
}
