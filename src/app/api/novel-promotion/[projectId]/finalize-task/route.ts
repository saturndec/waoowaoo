import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { queryFalStatus, queryArkVideoStatus } from '@/lib/async-submit'
import { queryGeminiBatchStatus } from '@/lib/gemini-batch-utils'
import { downloadAndUploadVideoToCOS, uploadToCOS, getSignedUrl, generateUniqueKey } from '@/lib/cos'
import { TASK_STATUS } from '@/lib/async-task-manager'
import { getFalApiKey, getGoogleAiKey, getArkApiKey } from '@/lib/api-config'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * 🔥 任务完成处理 API
 * 
 * 职责：处理单个已完成的外部任务
 * - 下载生成的文件
 * - 上传到 COS
 * - 更新数据库
 * - 标记 AsyncTask 完成
 * 
 * 设计目的：将下载/上传逻辑从 poll-tasks 中分离出来
 * 让 poll-tasks 只做轻量级的状态查询
 */
export const POST = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult
    const session = authResult.session

    const body = await request.json()
    const { taskId, taskType, targetId, targetType, externalId, candidateIndex } = body

    if (!taskId && !externalId) {
        throw new ApiError('INVALID_PARAMS', { message: 'taskId or externalId required' })
    }

    console.log(`[finalize-task] 📥 收到请求:`, JSON.stringify({
        taskId,
        taskType,
        targetId,
        targetType,
        externalId,
        candidateIndex
    }, null, 2))

    // 查询外部任务状态
    console.log(`[finalize-task] 🔍 查询外部状态: externalId=${externalId}`)
    const externalStatus = await queryExternalTaskStatus(externalId, session.user.id)
    console.log(`[finalize-task] 📊 外部状态结果:`, JSON.stringify({
        status: externalStatus.status,
        completed: externalStatus.completed,
        failed: externalStatus.failed,
        hasResultUrl: !!externalStatus.resultUrl,
        hasImageBase64: !!externalStatus.imageBase64,
        error: externalStatus.error
    }, null, 2))

    // 🔥 处理失败的任务
    if (externalStatus.failed) {
        console.error(`[finalize-task] ❌ 任务失败: externalId=${externalId}, error=${externalStatus.error}`)

        if (taskId) {
            await (prisma as any).asyncTask.update({
                where: { id: taskId },
                data: {
                    status: TASK_STATUS.FAILED,
                    result: { error: externalStatus.error || '外部任务失败' }
                }
            })
        }

        if (targetType === 'NovelPromotionPanel' && targetId) {
            await prisma.novelPromotionPanel.update({
                where: { id: targetId },
                data: { generatingImage: false }
            }).catch(() => { })
        }

        throw new ApiError('EXTERNAL_ERROR', {
            message: 'External task failed',
            details: externalStatus.error || '外部任务执行失败'
        })
    }

    if (!externalStatus.completed) {
        console.error(`[finalize-task] ❌ 任务未完成: externalId=${externalId}, status=${externalStatus.status}`)
        throw new ApiError('TASK_NOT_READY', {
            message: 'Task not completed yet',
            details: '外部任务尚未完成，可能是时序问题'
        })
    }

    if (!externalStatus.resultUrl && !externalStatus.imageBase64) {
        console.error(`[finalize-task] ❌ 无结果可用: externalId=${externalId}, status=${externalStatus.status}`)

        // 🔥 标记任务为失败，防止无限重试
        if (taskId) {
            await (prisma as any).asyncTask.update({
                where: { id: taskId },
                data: {
                    status: TASK_STATUS.FAILED,
                    result: { error: externalStatus.error || '任务完成但没有返回数据' }
                }
            })
        }

        // 🔥 重置 Panel 的生成状态
        if (targetType === 'NovelPromotionPanel' && targetId) {
            await prisma.novelPromotionPanel.update({
                where: { id: targetId },
                data: { generatingImage: false }
            }).catch(() => { })
        }

        throw new ApiError('NO_RESULT', {
            message: 'No result available',
            details: externalStatus.error || '任务已完成但没有结果URL或Base64数据'
        })
    }

    // 根据任务类型处理
    let savedUrl: string | null = null

    if (targetType === 'CharacterAppearance') {
        savedUrl = await handleCharacterAppearance(targetId, externalStatus)
    } else if (targetType === 'LocationImage') {
        savedUrl = await handleLocationImage(targetId, externalStatus)
    } else if (targetType === 'NovelPromotionPanel') {
        if (taskType?.includes('video') || taskType === 'lip_sync_panel') {
            savedUrl = await handlePanelVideo(targetId, externalStatus, taskType)
        } else {
            savedUrl = await handlePanelImage(targetId, externalStatus, candidateIndex)
        }
    } else if (targetType === 'NovelPromotionVoiceLine') {
        savedUrl = await handleVoiceLine(targetId, externalStatus)
    }

    // 更新 AsyncTask 状态
    if (taskId) {
        await (prisma as any).asyncTask.update({
            where: { id: taskId },
            data: {
                status: TASK_STATUS.COMPLETED,
                result: { url: savedUrl }
            }
        })
    }

    console.log(`[finalize-task] ✅ 完成: ${targetType}:${targetId} -> ${savedUrl}`)

    return NextResponse.json({
        success: true,
        savedUrl: savedUrl ? getSignedUrl(savedUrl) : null
    })
})

/**
 * 查询外部任务状态
 * @param externalId 外部任务ID
 * @param userId 用户ID，用于获取API Key
 */
async function queryExternalTaskStatus(externalId: string, userId: string): Promise<{
    status: string
    completed: boolean
    failed: boolean
    resultUrl?: string
    imageBase64?: string
    videoUrl?: string
    error?: string
}> {
    if (externalId.startsWith('FAL:')) {
        const parts = externalId.split(':')
        const endpoint = parts.slice(1, -1).join(':')
        const requestId = parts[parts.length - 1]
        const apiKey = await getFalApiKey(userId)
        return await queryFalStatus(endpoint, requestId, apiKey)
    } else if (externalId.startsWith('batches/') || externalId.startsWith('GEMINI_BATCH:')) {
        const batchName = externalId.startsWith('GEMINI_BATCH:')
            ? externalId.replace('GEMINI_BATCH:', '')
            : externalId
        const apiKey = await getGoogleAiKey(userId)
        const result = await queryGeminiBatchStatus(batchName, apiKey)
        return {
            status: result.status,
            completed: result.completed,
            failed: result.failed,
            resultUrl: result.imageUrl,
            imageBase64: result.imageBase64,
            error: result.error
        }
    } else {
        const apiKey = await getArkApiKey(userId)
        const result = await queryArkVideoStatus(externalId, apiKey)
        return {
            ...result,
            videoUrl: result.resultUrl
        }
    }
}

/**
 * 处理角色外观图片
 */
async function handleCharacterAppearance(targetId: string, status: any): Promise<string> {
    const response = await fetch(status.resultUrl)
    const buffer = Buffer.from(await response.arrayBuffer())
    const key = generateUniqueKey(`character-${targetId}`, 'png')
    const cosUrl = await uploadToCOS(buffer, key)

    // 获取当前数据用于撤回
    const current = await prisma.characterAppearance.findUnique({
        where: { id: targetId }
    })

    await prisma.characterAppearance.update({
        where: { id: targetId },
        data: {
            imageUrl: cosUrl,
            generating: false,
            previousImageUrl: current?.imageUrl || null,
            previousImageUrls: current?.imageUrls || null
        }
    })

    return cosUrl
}

/**
 * 处理场景图片
 */
async function handleLocationImage(targetId: string, status: any): Promise<string> {
    const response = await fetch(status.resultUrl)
    const buffer = Buffer.from(await response.arrayBuffer())
    const key = generateUniqueKey(`location-${targetId}`, 'png')
    const cosUrl = await uploadToCOS(buffer, key)

    // 获取当前数据用于撤回
    const current = await (prisma as any).locationImage.findUnique({
        where: { id: targetId }
    })

    await (prisma as any).locationImage.update({
        where: { id: targetId },
        data: {
            imageUrl: cosUrl,
            generating: false,
            previousImageUrl: current?.imageUrl || null
        }
    })

    return cosUrl
}

/**
 * 处理分镜视频
 */
async function handlePanelVideo(targetId: string, status: any, taskType?: string): Promise<string> {
    const videoUrl = status.videoUrl || status.resultUrl
    const prefix = taskType === 'lip_sync_panel' ? 'lip-sync' : 'panel-video'
    const key = generateUniqueKey(`${prefix}-${targetId}`, 'mp4')
    const cosUrl = await downloadAndUploadVideoToCOS(videoUrl, key)

    if (taskType === 'lip_sync_panel') {
        await prisma.novelPromotionPanel.update({
            where: { id: targetId },
            data: { lipSyncVideoUrl: cosUrl, generatingLipSync: false }
        })
    } else {
        await prisma.novelPromotionPanel.update({
            where: { id: targetId },
            data: { videoUrl: cosUrl, generatingVideo: false }
        })
    }

    return cosUrl
}

/**
 * 处理分镜图片（候选图）
 */
async function handlePanelImage(targetId: string, status: any, candidateIndex?: number): Promise<string> {
    let imageBuffer: Buffer

    if (status.imageBase64) {
        imageBuffer = Buffer.from(status.imageBase64, 'base64')
    } else if (status.resultUrl) {
        const response = await fetch(status.resultUrl)
        imageBuffer = Buffer.from(await response.arrayBuffer())
    } else {
        throw new Error('No image data available')
    }

    const key = generateUniqueKey(`panel-${targetId}-${candidateIndex ?? 0}`, 'png')
    const cosUrl = await uploadToCOS(imageBuffer, key)

    // 更新候选图（如果指定了索引）
    if (candidateIndex !== undefined) {
        const panel = await prisma.novelPromotionPanel.findUnique({
            where: { id: targetId }
        })

        if (panel?.candidateImages) {
            let candidates: string[] = []
            try {
                candidates = JSON.parse(panel.candidateImages)
            } catch { }

            if (candidates[candidateIndex]?.startsWith('PENDING:')) {
                candidates[candidateIndex] = cosUrl
                const stillPending = candidates.filter(c => c.startsWith('PENDING:')).length

                await prisma.novelPromotionPanel.update({
                    where: { id: targetId },
                    data: {
                        candidateImages: JSON.stringify(candidates),
                        generatingImage: stillPending > 0
                    }
                })
            }
        }
    } else {
        // 直接设置主图
        await prisma.novelPromotionPanel.update({
            where: { id: targetId },
            data: { imageUrl: cosUrl, generatingImage: false }
        })
    }

    return cosUrl
}

/**
 * 处理语音
 */
async function handleVoiceLine(targetId: string, status: any): Promise<string> {
    const response = await fetch(status.resultUrl)
    const buffer = Buffer.from(await response.arrayBuffer())
    const key = generateUniqueKey(`voice-${targetId}`, 'wav')
    const cosUrl = await uploadToCOS(buffer, key)

    await prisma.novelPromotionVoiceLine.update({
        where: { id: targetId },
        data: { audioUrl: cosUrl, generating: false }
    })

    return cosUrl
}
