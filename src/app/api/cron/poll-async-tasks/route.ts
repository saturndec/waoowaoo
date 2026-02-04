/**
 * Cron Job: 统一异步任务轮询
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
    getPendingTasks,
    markTaskCompleted,
    markTaskFailed,
    markTimeoutTasks,
    TASK_TYPES,
    TASK_STATUS,
    AsyncTaskResult,
    BillingInfo
} from '@/lib/async-task-manager'
import { queryFalStatus } from '@/lib/async-submit'
import { queryBananaTaskStatus, queryGeminiBatchStatus } from '@/lib/async-task-utils'
import { pollAsyncTask } from '@/lib/async-poll'
import { handleMediaTaskResult } from '@/lib/services/media-handler'
import { downloadAndUploadVideoToCOS, generateUniqueKey, uploadToCOS, getSignedUrl } from '@/lib/cos'
import sharp from 'sharp'
import { initializeFonts, createLabelSVG } from '@/lib/fonts'
import { getFalApiKey, getGoogleAiKey, getArkApiKey } from '@/lib/api-config'
import { recordImage, recordVideo, recordLipSync } from '@/lib/pricing'
import { logInternal } from '@/lib/logger'

// 辅助函数：从 AsyncTask 中获取用户ID（通过关联实体）
async function getUserIdFromTask(task: AsyncTaskResult): Promise<string | null> {
    try {
        // 使用 as any 绕过 Prisma 的类型检查 - 运行时关系存在
        if (task.targetType === 'NovelPromotionPanel') {
            // 🔥 修复：正确的关系链是 panel -> storyboard -> clip -> episode -> novelPromotionProject -> project
            const panel = await (prisma.novelPromotionPanel.findUnique as any)({
                where: { id: task.targetId },
                include: { storyboard: { include: { clip: { include: { episode: { include: { novelPromotionProject: { include: { project: { select: { userId: true } } } } } } } } } } }
            })
            return panel?.storyboard?.clip?.episode?.novelPromotionProject?.project?.userId || null
        } else if (task.targetType === 'CharacterAppearance') {
            const appearance = await (prisma.characterAppearance.findUnique as any)({
                where: { id: task.targetId },
                include: { character: { include: { novelPromotion: { include: { project: { select: { userId: true } } } } } } }
            })
            return appearance?.character?.novelPromotion?.project?.userId || null
        }
        return null
    } catch {
        return null
    }
}

/**
 * 📊 异步任务计费辅助函数
 * 任务完成时自动记录计费并标记 billedAt
 */
async function recordAsyncTaskBilling(
    task: AsyncTaskResult,
    type: 'image' | 'video' | 'lip-sync'
): Promise<void> {
    // 如果没有计费信息或已经计费过，跳过
    if (!task.billingInfo || task.billedAt) {
        console.log(`[Cron] 跳过计费: ${task.id} (${task.billingInfo ? '已计费' : '无计费信息'})`)
        return
    }

    // 如果没有 userId，尝试从关联实体获取
    const userId = task.userId || await getUserIdFromTask(task)
    if (!userId) {
        console.error(`[Cron] 无法获取用户ID，跳过计费: ${task.id}`)
        return
    }

    const billing = task.billingInfo as BillingInfo

    try {
        // 根据类型调用对应的计费函数
        if (type === 'image') {
            await recordImage({
                projectId: billing.projectId,
                userId,
                model: billing.model,
                action: billing.action,
                count: billing.quantity
            })
        } else if (type === 'video') {
            await recordVideo({
                projectId: billing.projectId,
                userId,
                model: billing.model,
                action: billing.action,
                count: billing.quantity
            })
        } else if (type === 'lip-sync') {
            await recordLipSync({
                projectId: billing.projectId,
                userId,
                action: billing.action
            })
        }

        // 标记已计费
        await prisma.asyncTask.update({
            where: { id: task.id },
            data: { billedAt: new Date() }
        })

        console.log(`[Cron] 💰 异步任务计费成功: ${task.id} (${type}, ${billing.model}, ¥${billing.quantity})`)
    } catch (err: any) {
        console.error(`[Cron] 异步任务计费失败:`, task.id, err.message)
        // 计费失败不影响任务状态
    }
}


export async function GET(request: NextRequest) {
    // 验证 Cron 密钥
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stats = {
        total: 0,
        checked: 0,
        completed: 0,
        failed: 0,
        timeout: 0,
        // 🔥 按任务类型统计
        byType: {} as Record<string, { pending: number; completed: number; failed: number }>
    }

    // 辅助函数：更新类型统计
    const updateTypeStats = (type: string, status: 'pending' | 'completed' | 'failed') => {
        if (!stats.byType[type]) {
            stats.byType[type] = { pending: 0, completed: 0, failed: 0 }
        }
        stats.byType[type][status]++
    }

    try {
        // 1. 标记超时任务
        stats.timeout = await markTimeoutTasks()

        // 2. 获取待处理的任务 - 🔥 查询全部待处理任务
        const pendingTasks = await getPendingTasks({ coldThresholdMinutes: 0, limit: 100 })
        stats.total = pendingTasks.length

        // 🔥 没有任务时静默返回，避免刷屏
        if (stats.total === 0 && stats.timeout === 0) {
            return NextResponse.json({ stats })
        }

        console.log(`[Cron] 找到 ${stats.total} 个待处理任务`)

        // 3. 🔥 完全并行处理所有任务（外部API查询状态通常不限流）
        const startTime = Date.now()
        await Promise.all(pendingTasks.map(async (task) => {
            try {
                stats.checked++
                await processTask(task, stats, updateTypeStats)
            } catch (error: any) {
                console.error(`[Cron] 处理任务失败 ${task.id}:`, error.message)
                await handleTaskError(task, error, stats, updateTypeStats)
            }
        }))
        console.log(`[Cron] 并行处理 ${pendingTasks.length} 个任务，耗时 ${Date.now() - startTime}ms`)

        // 🔥 构建详细的类型统计日志
        const typeLabels: Record<string, string> = {
            [TASK_TYPES.IMAGE_CHARACTER]: '角色图',
            [TASK_TYPES.IMAGE_LOCATION]: '场景图',
            [TASK_TYPES.IMAGE_PANEL]: '分镜图',
            [TASK_TYPES.IMAGE_FAL]: 'FAL图片',
            [TASK_TYPES.IMAGE_GEMINI_BATCH]: 'Gemini图片',
            [TASK_TYPES.VIDEO_PANEL]: '视频',
            [TASK_TYPES.LIP_SYNC_PANEL]: '口型同步',
            [TASK_TYPES.VOICE_LINE]: '语音',
            [TASK_TYPES.STORYBOARD_TEXT]: '文字分镜',
            [TASK_TYPES.REGENERATE_STORYBOARD]: '重新分镜',
            [TASK_TYPES.INSERT_PANEL]: '插入分镜',
            [TASK_TYPES.IMAGE_ASSET_HUB_EDIT]: '资产编辑',
            [TASK_TYPES.PANEL_VARIANT]: '镜头变体'
        }

        const typeDetails = Object.entries(stats.byType)
            .map(([type, counts]) => {
                const label = typeLabels[type] || type
                const parts = []
                if (counts.completed > 0) parts.push(`✅${counts.completed}`)
                if (counts.failed > 0) parts.push(`❌${counts.failed}`)
                if (counts.pending > 0) parts.push(`⏳${counts.pending}`)
                return `${label}(${parts.join('/')})`
            })
            .join(', ')

        console.log(`[Cron] 完成: 检查${stats.checked}, 成功${stats.completed}, 失败${stats.failed}, 超时${stats.timeout}`)
        if (typeDetails) {
            console.log(`[Cron] 详情: ${typeDetails}`)
        }

        return NextResponse.json({ stats })

    } catch (error: any) {
        console.error('[Cron] 轮询失败:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 🔥 提取任务处理逻辑为独立函数
async function processTask(
    task: AsyncTaskResult,
    stats: { completed: number; failed: number },
    updateTypeStats: (type: string, status: 'pending' | 'completed' | 'failed') => void
) {
    switch (task.type) {
        case TASK_TYPES.IMAGE_CHARACTER:
        case TASK_TYPES.IMAGE_LOCATION:
            await handleImageTask(task)
            break

        case TASK_TYPES.IMAGE_PANEL:
        case TASK_TYPES.IMAGE_FAL:
        case TASK_TYPES.IMAGE_GEMINI_BATCH:
            await handlePanelImageTask(task)
            break

        case TASK_TYPES.VIDEO_PANEL:
            await handlePanelVideoTask(task)
            break

        case TASK_TYPES.LIP_SYNC_PANEL:
            await handleLipSyncTask(task)
            break

        case TASK_TYPES.VOICE_LINE:
            await handleVoiceLineTask(task)
            break

        case TASK_TYPES.STORYBOARD_TEXT:
            await handleStoryboardTextTask(task)
            break

        case TASK_TYPES.REGENERATE_STORYBOARD:
            await handleRegenerateStoryboardTask(task)
            break

        case TASK_TYPES.INSERT_PANEL:
            await handleInsertPanelTask(task)
            break

        case TASK_TYPES.IMAGE_ASSET_HUB_EDIT:
            await handleAssetHubEditTask(task)
            break

        case TASK_TYPES.PANEL_VARIANT:
            await handlePanelVariantTask(task)
            break

        default:
            console.warn(`[Cron] 未知任务类型: ${task.type}`)
    }

    // 检查任务是否完成
    const updatedTask = await prisma.asyncTask.findUnique({ where: { id: task.id } })
    if (updatedTask?.status === TASK_STATUS.COMPLETED) {
        stats.completed++
        updateTypeStats(task.type, 'completed')
    } else if (updatedTask?.status === TASK_STATUS.FAILED) {
        stats.failed++
        updateTypeStats(task.type, 'failed')
    } else {
        updateTypeStats(task.type, 'pending')
    }
}

// 🔥 提取错误处理逻辑
async function handleTaskError(
    task: AsyncTaskResult,
    error: any,
    stats: { failed: number },
    updateTypeStats: (type: string, status: 'pending' | 'completed' | 'failed') => void
) {
    // 重置目标实体的 generating 状态，避免前端一直转圈
    try {
        if (task.targetType === 'CharacterAppearance') {
            await prisma.characterAppearance.update({
                where: { id: task.targetId },
                data: { generating: false }
            })
            console.log(`[Cron] 已重置 CharacterAppearance ${task.targetId} 的 generating 状态`)
        } else if (task.targetType === 'LocationImage') {
            await (prisma as any).locationImage.update({
                where: { id: task.targetId },
                data: { generating: false }
            })
            console.log(`[Cron] 已重置 LocationImage ${task.targetId} 的 generating 状态`)
        }
    } catch (resetError: any) {
        console.error(`[Cron] 重置 generating 状态失败:`, resetError.message)
    }

    await markTaskFailed(task.id, error.message)
    stats.failed++
    updateTypeStats(task.type, 'failed')
}




/**
 * 处理图片任务（角色/场景）
 */
async function handleImageTask(task: AsyncTaskResult) {
    if (!task.externalId) {
        await markTaskFailed(task.id, '缺少外部任务ID')
        return
    }
    // 🔥 获取用户ID用于读取API Key配置
    const userId = task.userId || await getUserIdFromTask(task)
    const status = await queryExternalStatus(task.externalId, userId)

    // 🔥 支持 resultUrl 或 imageUrl（Gemini Batch 返回 imageUrl，可能是 data: URL）
    const imageSource = status.resultUrl || status.imageUrl
    if (status.completed && imageSource) {
        let buffer: Buffer

        // 检查是否是 data: URL（Gemini Batch 返回的格式）
        if (imageSource.startsWith('data:')) {
            // 🔥 使用安全的字符串操作替代正则，避免大 base64 栈溢出
            const base64Start = imageSource.indexOf(';base64,')
            if (base64Start !== -1) {
                const base64Data = imageSource.substring(base64Start + 8)
                buffer = Buffer.from(base64Data, 'base64')
                console.log(`[Cron] 解析 Gemini Batch base64 图片`)
            } else {
                await markTaskFailed(task.id, '无法解析 data: URL')
                return
            }
        } else {
            // 普通 URL，下载图片
            const response = await fetch(imageSource)
            buffer = Buffer.from(await response.arrayBuffer())
        }

        // 🔥 如果是 modify 操作，需要添加黑边标签
        const payload = task.payload as any
        if (payload?.action === 'modify' && payload?.labelInfo) {
            try {
                await initializeFonts()
                buffer = await addLabelToImage(buffer, payload.labelInfo)
                console.log(`[Cron] 已添加黑边标签: ${payload.labelInfo.assetName}`)
            } catch (labelError) {
                console.error(`[Cron] 添加标签失败，使用原图:`, labelError)
            }
        }

        const key = generateUniqueKey(`async-${task.type}-${task.targetId}`, 'jpg')
        const cosUrl = await uploadToCOS(buffer, key)

        // 更新目标实体
        if (task.targetType === 'CharacterAppearance') {
            // 🔥 先获取当前图片信息，用于撤回功能
            const currentAppearance = await prisma.characterAppearance.findUnique({
                where: { id: task.targetId }
            })

            // 🔥 构建更新数据
            const updateData: any = {
                generating: false,
                // 保存旧图片用于撤回
                previousImageUrl: currentAppearance?.imageUrl || null,
                previousImageUrls: currentAppearance?.imageUrls || null
            }

            // 🔥 如果有 imageIndex 和 currentImageUrls，更新 imageUrls 数组
            const payload = task.payload as any
            if (payload?.imageIndex !== undefined && payload?.currentImageUrls) {
                const newImageUrls = [...payload.currentImageUrls]
                newImageUrls[payload.imageIndex] = cosUrl
                updateData.imageUrls = JSON.stringify(newImageUrls)
                console.log(`[Cron] 更新 imageUrls[${payload.imageIndex}] = ${cosUrl.substring(0, 50)}...`)

                // 判断是否需要同时更新 imageUrl（选中的图片或第一张）
                const selectedIndex = payload.selectedIndex
                const shouldUpdateImageUrl =
                    selectedIndex === payload.imageIndex ||  // 修改的是选中的图片
                    (selectedIndex === null && payload.imageIndex === 0) ||  // 没有选中任何图片，修改的是第一张
                    (selectedIndex === undefined && payload.imageIndex === 0)  // 旧数据兼容

                if (shouldUpdateImageUrl) {
                    updateData.imageUrl = cosUrl
                    console.log(`[Cron] 同步更新 imageUrl`)
                }
            } else {
                // 兼容旧任务：直接更新 imageUrl
                updateData.imageUrl = cosUrl
            }

            await prisma.characterAppearance.update({
                where: { id: task.targetId },
                data: updateData
            })
        } else if (task.targetType === 'LocationImage') {
            // 🔥 先获取当前图片信息，用于撤回功能
            const currentImage = await (prisma as any).locationImage.findUnique({
                where: { id: task.targetId }
            })

            await (prisma as any).locationImage.update({
                where: { id: task.targetId },
                data: {
                    imageUrl: cosUrl,
                    generating: false,
                    // 保存旧图片用于撤回
                    previousImageUrl: currentImage?.imageUrl || null
                }
            })
        }

        await markTaskCompleted(task.id, { imageUrl: cosUrl })

        // 💰 异步任务计费
        await recordAsyncTaskBilling(task, 'image')

        console.log(`[Cron] ✅ 图片任务完成: ${task.id}`)

    } else if (status.failed || status.error) {
        // 更新目标实体
        if (task.targetType === 'CharacterAppearance') {
            await prisma.characterAppearance.update({
                where: { id: task.targetId },
                data: { generating: false }
            })
        } else if (task.targetType === 'LocationImage') {
            await (prisma as any).locationImage.update({
                where: { id: task.targetId },
                data: { generating: false }
            })
        }

        await markTaskFailed(task.id, status.error || 'Unknown error')
        console.log(`[Cron] ❌ 图片任务失败: ${task.id}`)

    } else {
        // 更新检查时间
        await prisma.asyncTask.update({
            where: { id: task.id },
            data: { updatedAt: new Date() }
        })
        console.log(`[Cron] ⏳ 图片任务等待中: ${task.id}`)
    }
}

/**
 * 给图片添加黑边标签
 */
async function addLabelToImage(
    imageBuffer: Buffer,
    labelInfo: { assetName: string; changeReason?: string }
): Promise<Buffer> {
    const meta = await sharp(imageBuffer).metadata()
    const w = meta.width || 2160
    const h = meta.height || 2160

    // 计算标签条高度（与生成时一致：基于最终高度的 4%）
    const totalHeight = h + Math.floor(h * 0.04) + Math.floor(Math.floor(h * 0.04) * 0.5) * 2
    const fontSize = Math.floor(totalHeight * 0.04)
    const pad = Math.floor(fontSize * 0.5)
    const barH = fontSize + pad * 2

    // 构建标签文本
    const labelText = labelInfo.changeReason
        ? `${labelInfo.assetName} - ${labelInfo.changeReason}`
        : labelInfo.assetName

    // 创建 SVG 标签条
    const svg = await createLabelSVG(w, barH, fontSize, pad, labelText)

    // 添加标签条到图片顶部
    const processed = await sharp(imageBuffer)
        .extend({ top: barH, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
        .composite([{ input: svg, top: 0, left: 0 }])
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer()

    return processed
}

/**
 * 处理分镜图片任务（支持多候选图）
 */
async function handlePanelImageTask(task: AsyncTaskResult) {
    // 获取Panel的candidateImages
    const panel = await prisma.novelPromotionPanel.findUnique({
        where: { id: task.targetId }
    })

    if (!panel) {
        await markTaskFailed(task.id, 'Panel not found')
        return
    }

    let candidates: string[] = []
    try {
        candidates = panel.candidateImages ? JSON.parse(panel.candidateImages) : []
    } catch { }

    const hasPending = candidates.some(c => c.startsWith('PENDING:'))
    if (!hasPending && !task.externalId) {
        await markTaskCompleted(task.id)
        return
    }

    // 处理候选图中的PENDING
    let updatedCandidates = [...candidates]
    let allCompleted = true

    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i]
        if (!candidate.startsWith('PENDING:')) continue

        allCompleted = false
        const pendingType = candidate.split(':')[1]  // FAL, BANANA, or GEMINI_BATCH

        // 🔥 FAL 图片任务 - 同时支持历史遗留的 BANANA 格式
        if (pendingType === 'FAL' || pendingType === 'BANANA') {
            const prefix = pendingType === 'FAL' ? 'PENDING:FAL:' : 'PENDING:BANANA:'
            const parts = candidate.replace(prefix, '').split(':')
            const taskEndpoint = parts.slice(0, -1).join(':')
            const taskRequestId = parts[parts.length - 1]
            const payload = task.payload as any || {}
            const projectName = payload.projectName || undefined

            try {
                // 获取用户ID并获取 API Key
                const userId = await getUserIdFromTask(task)
                if (!userId) {
                    logInternal('Cron', 'ERROR', `无法获取用户ID，跳过FAL候选图 ${i}`, { taskId: task.id }, projectName)
                    updatedCandidates[i] = ''  // 标记为失败
                    continue
                }
                const falApiKey = await getFalApiKey(userId)
                const falStatus = await queryFalStatus(taskEndpoint, taskRequestId, falApiKey)

                if (falStatus.completed && falStatus.resultUrl) {
                    const cosKey = generateUniqueKey(`panel-${task.targetId}-cron-${i}`, 'png')
                    const imageResponse = await fetch(falStatus.resultUrl)
                    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
                    const cosUrl = await uploadToCOS(imageBuffer, cosKey)
                    updatedCandidates[i] = cosUrl
                    logInternal('FAL', 'INFO', `✅ Panel ${task.targetId} 候选图 ${i} 完成`, { cosUrl }, projectName)
                } else if (falStatus.failed) {
                    updatedCandidates[i] = ''
                    logInternal('FAL', 'ERROR', `❌ Panel ${task.targetId} 候选图 ${i} 失败: ${falStatus.error}`, {}, projectName)
                }
            } catch (err: any) {
                logInternal('FAL', 'ERROR', `检查候选图失败`, { error: err.message }, projectName)
            }
        } else if (pendingType === 'GEMINI_BATCH') {
            // 🔥 Gemini Batch 任务
            const batchName = candidate.replace('PENDING:GEMINI_BATCH:', '')
            const payload = task.payload as any || {}
            const projectName = payload.projectName || undefined

            try {
                // 获取用户ID并获取 API Key（优先使用 task.userId）
                const userId = task.userId || await getUserIdFromTask(task)
                if (!userId) {
                    logInternal('Cron', 'ERROR', `无法获取用户ID，跳过Gemini Batch候选图 ${i}`, { taskId: task.id }, projectName)
                    updatedCandidates[i] = ''  // 标记为失败
                    continue
                }
                const googleApiKey = await getGoogleAiKey(userId)
                const geminiStatus = await queryGeminiBatchStatus(batchName, googleApiKey)
                if (geminiStatus.status === 'completed' && geminiStatus.imageUrl) {
                    // imageUrl 是 data: URL，需要提取 base64 并上传到 COS
                    // 🔥 使用安全的字符串操作替代正则，避免大 base64 栈溢出
                    const base64Start = geminiStatus.imageUrl.indexOf(';base64,')
                    if (base64Start !== -1) {
                        const cosKey = generateUniqueKey(`panel-${task.targetId}-cron-${i}`, 'png')
                        const base64Data = geminiStatus.imageUrl.substring(base64Start + 8)
                        const imageBuffer = Buffer.from(base64Data, 'base64')
                        const cosUrl = await uploadToCOS(imageBuffer, cosKey)
                        updatedCandidates[i] = cosUrl
                        logInternal('GeminiBatch', 'INFO', `✅ Panel ${task.targetId} 候选图 ${i} 完成`, { batchName, cosUrl }, projectName)
                    }
                } else if (geminiStatus.status === 'failed') {
                    logInternal('GeminiBatch', 'ERROR', `任务失败`, { batchName, error: geminiStatus.error }, projectName)
                    updatedCandidates[i] = ''
                }
            } catch (err: any) {
                logInternal('GeminiBatch', 'ERROR', `检查候选图失败`, { batchName, error: err.message }, projectName)
            }
        }
    }

    // 过滤空结果
    updatedCandidates = updatedCandidates.filter(c => c !== '')
    const stillPending = updatedCandidates.filter(c => c.startsWith('PENDING:')).length

    const shouldAutoSelect = stillPending === 0 && updatedCandidates.length > 0 && !panel.imageUrl

    // 更新Panel
    if (shouldAutoSelect) {
        // 首次生成：自动确认第一张候选图，跳过确认
        await prisma.novelPromotionPanel.update({
            where: { id: task.targetId },
            data: {
                imageUrl: updatedCandidates[0],
                candidateImages: null,
                generatingImage: false
            }
        })
    } else {
        await prisma.novelPromotionPanel.update({
            where: { id: task.targetId },
            data: {
                candidateImages: JSON.stringify(updatedCandidates),
                generatingImage: stillPending > 0
            }
        })
    }

    const payload = task.payload as any || {}
    const projectName = payload.projectName || undefined

    if (stillPending === 0) {
        await markTaskCompleted(task.id, {
            candidateImages: updatedCandidates,
            imageUrl: shouldAutoSelect ? updatedCandidates[0] : undefined
        })
        logInternal(
            'Cron',
            'INFO',
            `✅ 分镜图片任务完成: ${task.id}`,
            { targetId: task.targetId, count: updatedCandidates.length, autoSelected: shouldAutoSelect },
            projectName
        )
    } else {
        await prisma.asyncTask.update({
            where: { id: task.id },
            data: { updatedAt: new Date() }
        })
        logInternal('Cron', 'DEBUG', `⏳ 分镜图片任务等待中: ${task.id}`, { stillPending }, projectName)
    }
}

/**
 * 处理分镜视频任务
 * 🔥 使用服务层统一处理
 */
async function handlePanelVideoTask(task: AsyncTaskResult) {
    await handleMediaTaskResult(task, {
        table: 'novelPromotionPanel',
        mediaField: 'videoUrl',
        generatingField: 'generatingVideo',
        mediaType: 'video'
    }, getUserIdFromTask)
}

/**
 * 处理口型同步任务
 * 🔥 使用服务层统一处理
 */
async function handleLipSyncTask(task: AsyncTaskResult) {
    await handleMediaTaskResult(task, {
        table: 'novelPromotionPanel',
        mediaField: 'lipSyncVideoUrl',
        generatingField: 'generatingLipSync',
        mediaType: 'video'
    }, getUserIdFromTask)
}

/**
 * 处理TTS语音任务
 * 🔥 使用服务层统一处理
 */
async function handleVoiceLineTask(task: AsyncTaskResult) {
    await handleMediaTaskResult(task, {
        table: 'novelPromotionVoiceLine',
        mediaField: 'audioUrl',
        generatingField: 'generating',
        mediaType: 'audio'
    }, getUserIdFromTask)
}

/**
 * 处理文字分镜生成任务
 * 这类任务是长时间运行的LLM调用，由Worker API处理
 */
async function handleStoryboardTextTask(task: AsyncTaskResult) {
    // 检查任务是否仍在处理中
    // 如果payload中有workerStarted标记，说明Worker正在处理
    const payload = task.payload as any
    if (payload?.workerStarted) {
        // 更新检查时间，等待Worker完成
        await prisma.asyncTask.update({
            where: { id: task.id },
            data: { updatedAt: new Date() }
        })
        console.log(`[Cron] ⏳ 文字分镜任务Worker处理中: ${task.id}`)
        return
    }

    // 如果没有workerStarted标记，说明Worker还没开始或失败了
    // 这里可以触发Worker重新处理，或者标记失败
    const taskAge = Date.now() - task.createdAt.getTime()
    if (taskAge > 30 * 60 * 1000) { // 超过30分钟
        await markTaskFailed(task.id, 'Worker处理超时')
    } else {
        await prisma.asyncTask.update({
            where: { id: task.id },
            data: { updatedAt: new Date() }
        })
        console.log(`[Cron] ⏳ 文字分镜任务等待Worker: ${task.id}`)
    }
}

/**
 * 处理重新生成分镜任务
 */
async function handleRegenerateStoryboardTask(task: AsyncTaskResult) {
    // 与handleStoryboardTextTask类似
    const payload = task.payload as any
    if (payload?.workerStarted) {
        await prisma.asyncTask.update({
            where: { id: task.id },
            data: { updatedAt: new Date() }
        })
        console.log(`[Cron] ⏳ 重新生成分镜任务Worker处理中: ${task.id}`)
        return
    }

    const taskAge = Date.now() - task.createdAt.getTime()
    if (taskAge > 30 * 60 * 1000) {
        await markTaskFailed(task.id, 'Worker处理超时')
    } else {
        await prisma.asyncTask.update({
            where: { id: task.id },
            data: { updatedAt: new Date() }
        })
        console.log(`[Cron] ⏳ 重新生成分镜任务等待Worker: ${task.id}`)
    }
}

/**
 * 处理插入分镜任务
 * 新流程：占位panel已创建，这里恢复AI内容生成
 */
async function handleInsertPanelTask(task: AsyncTaskResult) {
    const payload = task.payload as any

    // 如果任务已经开始处理（有进度），等待完成
    if (task.progress && task.progress > 0) {
        await prisma.asyncTask.update({
            where: { id: task.id },
            data: { updatedAt: new Date() }
        })
        console.log(`[Cron] ⏳ 插入分镜任务处理中: ${task.id} (${task.progress}%)`)
        return
    }

    // 检查任务年龄，超过10分钟视为超时
    const taskAge = Date.now() - task.createdAt.getTime()
    if (taskAge > 10 * 60 * 1000) {
        await markTaskFailed(task.id, '插入分镜任务超时')
        // 标记占位panel为失败
        if (payload?.panelId) {
            await prisma.novelPromotionPanel.update({
                where: { id: payload.panelId },
                data: { generatingImage: false, description: '生成超时，请重试' }
            }).catch(() => { })
        }
        console.log(`[Cron] ❌ 插入分镜任务超时: ${task.id}`)
        return
    }

    // 尝试重新触发任务处理
    console.log(`[Cron] 🔄 重新触发插入分镜任务: ${task.id}`)
    try {
        const { getBaseUrl } = await import('@/lib/env')
        const baseUrl = getBaseUrl()
        const res = await fetch(`${baseUrl}/api/novel-promotion/${payload.projectId}/insert-panel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                storyboardId: payload.storyboardId,
                insertAfterPanelId: payload.insertAfterPanelId,
                userInput: payload.userInput,
                _internal: true,
                _taskId: task.id,
                _panelId: payload.panelId
            })
        })

        if (!res.ok) {
            const error = await res.text()
            console.error(`[Cron] 重新触发插入分镜失败: ${error}`)
        }
    } catch (err: any) {
        console.error(`[Cron] 重新触发插入分镜异常: ${err.message}`)
    }
}

/**
 * 查询外部任务状态（FAL/Gemini/Ark）
 * 🔥 使用统一的 pollAsyncTask 函数
 * @param externalId 外部任务ID
 * @param userId 用户ID，用于获取API Key（必须）
 */
async function queryExternalStatus(externalId: string, userId: string | null): Promise<{
    status: string
    completed: boolean
    failed: boolean
    resultUrl?: string
    imageUrl?: string
    videoUrl?: string
    error?: string
}> {
    if (!userId) {
        throw new Error('缺少用户ID，无法获取 API Key 配置。请确保任务创建时传递了 userId。')
    }

    try {
        const result = await pollAsyncTask(externalId, userId)
        return {
            status: result.status,
            completed: result.status === 'completed',
            failed: result.status === 'failed',
            resultUrl: result.resultUrl,
            imageUrl: result.imageUrl,
            videoUrl: result.videoUrl,
            error: result.error
        }
    } catch (err: any) {
        console.error(`[Cron] 轮询失败:`, err.message)
        return { status: 'error', completed: false, failed: false, error: err.message }
    }
}

/**
 * 🔥 处理 Asset Hub 图片编辑异步任务
 */
async function handleAssetHubEditTask(task: AsyncTaskResult) {
    const payload = task.payload as any
    const externalId = task.externalId

    if (!externalId) {
        await markTaskFailed(task.id, 'Missing external ID')
        return
    }

    console.log(`[Cron] 处理 Asset Hub 编辑任务: ${task.id}, targetType=${task.targetType}`)

    // FAL 任务查询
    const parts = externalId.split(':')
    let endpoint = 'fal-ai/nano-banana-pro/edit'
    let requestId = externalId
    if (parts.length > 1) {
        requestId = parts.pop()!
        endpoint = parts.join(':')
    } else if (payload?.endpoint) {
        endpoint = payload.endpoint
    }

    try {
        await initializeFonts()  // 🔥 初始化字体

        // 获取用户 API Key
        const userId = task.userId
        if (!userId) {
            await markTaskFailed(task.id, 'Missing userId for FAL query')
            return
        }
        const falApiKey = await getFalApiKey(userId)
        const falStatus = await queryFalStatus(endpoint, requestId, falApiKey)

        if (!falStatus.completed && !falStatus.failed) {
            console.log(`[Cron] Asset Hub 任务 ${task.id} 仍在处理中`)
            return  // 仍在处理中，等待下次轮询
        }

        if (falStatus.failed || !falStatus.resultUrl) {
            console.error(`[Cron] Asset Hub 任务失败:`, falStatus.error)
            // 清除 generating 状态
            if (task.targetType === 'character_appearance') {
                await (prisma as any).globalCharacterAppearance.update({
                    where: { id: task.targetId },
                    data: { generating: false }
                })
            } else if (task.targetType === 'location_image') {
                await (prisma as any).globalLocationImage.update({
                    where: { id: task.targetId },
                    data: { generating: false }
                })
            }
            await markTaskFailed(task.id, falStatus.error || 'FAL task failed')
            return
        }

        // 下载编辑后的图片
        console.log(`[Cron] Asset Hub 任务完成，下载结果: ${falStatus.resultUrl}`)
        const imageResponse = await fetch(falStatus.resultUrl)
        const editedBuffer = Buffer.from(await imageResponse.arrayBuffer())

        const editedMeta = await sharp(editedBuffer).metadata()
        const editedWidth = editedMeta.width || 2160
        const editedHeight = editedMeta.height || 2160

        // 添加标签
        const assetName = payload?.assetName || '编辑后的图片'
        const newFontSize = Math.floor(editedHeight * 0.04)
        const newPad = Math.floor(newFontSize * 0.5)
        const newBarH = newFontSize + newPad * 2
        const svg = await createLabelSVG(editedWidth, newBarH, newFontSize, newPad, assetName)

        const finalBuffer = await sharp(editedBuffer)
            .extend({ top: newBarH, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
            .composite([{ input: svg, top: 0, left: 0 }])
            .jpeg({ quality: 90, mozjpeg: true })
            .toBuffer()

        if (task.targetType === 'character_appearance') {
            const cosKey = generateUniqueKey(`global-char-${payload?.characterId}-async-edit`, 'jpg')
            await uploadToCOS(finalBuffer, cosKey)

            // 🔥 先获取当前图片信息，用于撤回功能
            const appearance = await (prisma as any).globalCharacterAppearance.findUnique({
                where: { id: task.targetId }
            })

            // 更新数据库
            const targetImageIndex = payload?.targetImageIndex ?? 0
            const imageUrls = payload?.imageUrls || []
            const newImageUrls = [...imageUrls]
            newImageUrls[targetImageIndex] = cosKey

            // 🔥 确定是否应该更新 imageUrl
            const shouldUpdateMainImage = !appearance?.selectedIndex || appearance.selectedIndex === targetImageIndex

            // 🔥 保存旧图片用于撤回
            const previousImageUrl = appearance?.imageUrl || null
            const previousImageUrls = appearance?.imageUrls || null

            await (prisma as any).globalCharacterAppearance.update({
                where: { id: task.targetId },
                data: {
                    generating: false,
                    imageUrls: JSON.stringify(newImageUrls),
                    previousImageUrl,  // 🔥 保存撤回历史
                    previousImageUrls, // 🔥 保存撤回历史
                    ...(shouldUpdateMainImage ? { imageUrl: cosKey } : {})
                }
            })

            console.log(`[Cron] ✅ Asset Hub 角色编辑完成: ${task.targetId} -> ${cosKey}`)

        } else if (task.targetType === 'location_image') {
            const cosKey = generateUniqueKey(`global-loc-${payload?.locationId}-async-edit`, 'jpg')
            await uploadToCOS(finalBuffer, cosKey)

            // 🔥 先获取当前图片信息，用于撤回功能
            const locationImage = await (prisma as any).globalLocationImage.findUnique({
                where: { id: task.targetId }
            })

            await (prisma as any).globalLocationImage.update({
                where: { id: task.targetId },
                data: {
                    generating: false,
                    imageUrl: cosKey,
                    previousImageUrl: locationImage?.imageUrl || null  // 🔥 保存撤回历史
                }
            })

            console.log(`[Cron] ✅ Asset Hub 场景编辑完成: ${task.targetId} -> ${cosKey}`)
        }

        await markTaskCompleted(task.id, { cosKey: 'completed' })

    } catch (err: any) {
        console.error(`[Cron] 处理 Asset Hub 编辑任务失败:`, err.message)
        // 清除 generating 状态
        try {
            if (task.targetType === 'character_appearance') {
                await (prisma as any).globalCharacterAppearance.update({
                    where: { id: task.targetId },
                    data: { generating: false }
                })
            } else if (task.targetType === 'location_image') {
                await (prisma as any).globalLocationImage.update({
                    where: { id: task.targetId },
                    data: { generating: false }
                })
            }
        } catch { }
        await markTaskFailed(task.id, err.message)
    }
}

/**
 * 处理镜头变体任务
 * 与 handleInsertPanelTask 类似，监控任务状态
 */
async function handlePanelVariantTask(task: AsyncTaskResult) {
    const payload = task.payload as any

    // 如果任务已经开始处理（有进度），等待完成
    if (task.progress && task.progress > 0) {
        await prisma.asyncTask.update({
            where: { id: task.id },
            data: { updatedAt: new Date() }
        })
        console.log(`[Cron] ⏳ 镜头变体任务处理中: ${task.id} (${task.progress}%)`)
        return
    }

    // 检查任务年龄，超过10分钟视为超时
    const taskAge = Date.now() - task.createdAt.getTime()
    if (taskAge > 10 * 60 * 1000) {
        await markTaskFailed(task.id, '镜头变体任务超时')
        // 标记占位panel为失败
        if (payload?.panelId) {
            await prisma.novelPromotionPanel.update({
                where: { id: payload.panelId },
                data: { generatingImage: false, imageErrorMessage: '生成超时，请重试' }
            }).catch(() => { })
        }
        console.log(`[Cron] ❌ 镜头变体任务超时: ${task.id}`)
        return
    }

    // 尝试重新触发任务处理
    console.log(`[Cron] 🔄 重新触发镜头变体任务: ${task.id}`)
    try {
        const { getBaseUrl } = await import('@/lib/env')
        const baseUrl = getBaseUrl()
        const res = await fetch(`${baseUrl}/api/novel-promotion/${payload.projectId}/panel-variant`, {
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
                _taskId: task.id,
                _panelId: payload.panelId
            })
        })

        if (!res.ok) {
            const error = await res.text()
            console.error(`[Cron] 重新触发镜头变体失败: ${error}`)
        }
    } catch (err: any) {
        console.error(`[Cron] 重新触发镜头变体异常: ${err.message}`)
    }
}
