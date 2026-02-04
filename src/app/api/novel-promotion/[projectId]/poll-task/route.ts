import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { queryFalStatus, queryArkVideoStatus } from '@/lib/async-submit'
import { queryGeminiBatchStatus } from '@/lib/gemini-batch-utils'
import { downloadAndUploadVideoToCOS, uploadToCOS, getSignedUrl, generateUniqueKey } from '@/lib/cos'
import { getTaskStatus, markTaskCompleted, markTaskFailed, TASK_STATUS } from '@/lib/async-task-manager'
import { getFalApiKey, getGoogleAiKey, getArkApiKey } from '@/lib/api-config'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * 统一任务轮询API（使用AsyncTask表）
 * 
 * 参数：
 * - taskId: AsyncTask表的ID
 * 
 * 或者旧模式（向后兼容）：
 * - type: 'video' | 'image' | 'tts' | 'panel-candidates'
 * - entityId: 实体ID
 * - externalId: 外部平台任务ID
 * - provider: 'fal' | 'ark'
 * - endpoint: FAL端点
 */
export const GET = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const { searchParams } = new URL(request.url)
    const asyncTaskId = searchParams.get('taskId')  // 新模式：直接用AsyncTask ID

    // === 新模式：直接用AsyncTask ID查询 ===
    // 跳过特殊值如'multi'（用于panel-candidates旧模式）
    if (asyncTaskId && asyncTaskId !== 'multi') {
        const task = await getTaskStatus(asyncTaskId)

        if (!task) {
            throw new ApiError('NOT_FOUND', { message: 'Task not found' })
        }

        // 如果已完成，直接返回
        if (task.status === TASK_STATUS.COMPLETED) {
            const result = task.result as any
            let resultUrl = result?.imageUrl || result?.videoUrl || result?.audioUrl
            if (resultUrl && !resultUrl.startsWith('http')) {
                resultUrl = getSignedUrl(resultUrl)
            }
            return NextResponse.json({
                status: 'completed',
                resultUrl,
                result: task.result
            })
        }

        if (task.status === TASK_STATUS.FAILED) {
            return NextResponse.json({
                status: 'failed',
                error: task.error || '任务失败'
            })
        }

        // 如果还在pending，查询外部状态
        if (task.externalId) {
            const externalStatus = await queryExternalTaskStatus(task.externalId, session.user.id)

            if (externalStatus.completed && externalStatus.resultUrl) {
                // 下载并保存
                const savedUrl = await saveTaskResult(task, externalStatus.resultUrl)

                // 更新任务状态
                await markTaskCompleted(asyncTaskId, {
                    imageUrl: savedUrl,
                    videoUrl: savedUrl,
                    audioUrl: savedUrl
                })

                // 更新目标实体
                await updateTargetEntity(task, savedUrl)

                return NextResponse.json({
                    status: 'completed',
                    resultUrl: getSignedUrl(savedUrl)
                })
            }

            if (externalStatus.failed) {
                await markTaskFailed(asyncTaskId, externalStatus.error || 'Unknown error')
                await updateTargetEntityFailed(task)

                return NextResponse.json({
                    status: 'failed',
                    error: externalStatus.error
                })
            }

            // 更新检查时间
            await (prisma as any).asyncTask.update({
                where: { id: asyncTaskId },
                data: { updatedAt: new Date() }
            })
        }

        // 从payload获取阶段信息
        const payload = task.payload as any || {}

        return NextResponse.json({
            status: 'pending',
            progress: task.progress,
            phase: payload.phase,
            phaseLabel: payload.phaseLabel,
            clipIndex: payload.clipIndex,
            totalClips: payload.totalClips
        })
    }

    // === 旧模式：向后兼容 ===
    const type = searchParams.get('type')
    const entityId = searchParams.get('entityId')

    if (!type || !entityId) {
        throw new ApiError('INVALID_PARAMS', { message: 'Missing required parameters' })
    }

    // 处理Panel候选图
    if (type === 'panel-candidates') {
        return handlePanelCandidates(entityId, session.user.id)
    }

    // 查找该实体的AsyncTask
    const tasks = await (prisma as any).asyncTask.findMany({
        where: {
            targetId: entityId,
            status: { in: [TASK_STATUS.PENDING, TASK_STATUS.PROCESSING] }
        },
        orderBy: { createdAt: 'desc' },
        take: 1
    })

    if (tasks.length === 0) {
        // 没有进行中的任务，检查实体状态
        return NextResponse.json({ status: 'no_task' })
    }

    const task = tasks[0]

    // 递归调用新模式
    searchParams.set('taskId', task.id)
    return GET(request, context)
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
    error?: string
}> {
    if (externalId.startsWith('FAL:')) {
        const parts = externalId.split(':')
        const endpoint = parts.slice(1, -1).join(':')
        const requestId = parts[parts.length - 1]
        const apiKey = await getFalApiKey(userId)
        return await queryFalStatus(endpoint, requestId, apiKey)
    } else if (externalId.startsWith('batches/') || externalId.startsWith('GEMINI_BATCH:')) {
        // Gemini Batch 任务
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
        // Ark
        const apiKey = await getArkApiKey(userId)
        return await queryArkVideoStatus(externalId, apiKey)
    }
}

/**
 * 保存任务结果到COS
 */
async function saveTaskResult(task: any, resultUrl: string): Promise<string> {
    const response = await fetch(resultUrl)
    const buffer = Buffer.from(await response.arrayBuffer())

    let ext = 'jpg'
    if (task.type.includes('video')) ext = 'mp4'
    else if (task.type.includes('voice') || task.type.includes('tts')) ext = 'wav'
    else if (task.type.includes('image')) ext = 'png'

    const key = generateUniqueKey(`async-${task.type}-${task.targetId}`, ext)

    if (ext === 'mp4') {
        return await downloadAndUploadVideoToCOS(resultUrl, key)
    } else {
        return await uploadToCOS(buffer, key)
    }
}

/**
 * 更新目标实体状态（完成）
 */
async function updateTargetEntity(task: any, savedUrl: string): Promise<void> {
    switch (task.targetType) {
        case 'CharacterAppearance':
            await prisma.characterAppearance.update({
                where: { id: task.targetId },
                data: { imageUrl: savedUrl, generating: false }
            })
            break
        case 'LocationImage':
            await (prisma as any).locationImage.update({
                where: { id: task.targetId },
                data: { imageUrl: savedUrl, generating: false }
            })
            break
        case 'NovelPromotionPanel':
            if (task.type.includes('video')) {
                await prisma.novelPromotionPanel.update({
                    where: { id: task.targetId },
                    data: { videoUrl: savedUrl, generatingVideo: false }
                })
            } else {
                await prisma.novelPromotionPanel.update({
                    where: { id: task.targetId },
                    data: { imageUrl: savedUrl, generatingImage: false }
                })
            }
            break
        case 'NovelPromotionVoiceLine':
            await prisma.novelPromotionVoiceLine.update({
                where: { id: task.targetId },
                data: { audioUrl: savedUrl, generating: false }
            })
            break
    }
}

/**
 * 更新目标实体状态（失败）
 */
async function updateTargetEntityFailed(task: any): Promise<void> {
    switch (task.targetType) {
        case 'CharacterAppearance':
            await prisma.characterAppearance.update({
                where: { id: task.targetId },
                data: { generating: false }
            })
            break
        case 'LocationImage':
            await (prisma as any).locationImage.update({
                where: { id: task.targetId },
                data: { generating: false }
            })
            break
        case 'NovelPromotionPanel':
            if (task.type.includes('video')) {
                await prisma.novelPromotionPanel.update({
                    where: { id: task.targetId },
                    data: { generatingVideo: false }
                })
            } else {
                await prisma.novelPromotionPanel.update({
                    where: { id: task.targetId },
                    data: { generatingImage: false }
                })
            }
            break
        case 'NovelPromotionVoiceLine':
            await prisma.novelPromotionVoiceLine.update({
                where: { id: task.targetId },
                data: { generating: false }
            })
            break
    }
}

/**
 * 处理Panel候选图轮询
 * @param entityId Panel ID
 * @param userId 用户ID，用于获取API Key
 */
async function handlePanelCandidates(entityId: string, userId: string) {
    const entity = await prisma.novelPromotionPanel.findUnique({
        where: { id: entityId },
        select: {
            id: true,
            candidateImages: true,
            generatingImage: true,
            imageUrl: true
        }
    })

    if (!entity) {
        throw new ApiError('NOT_FOUND', { message: 'Panel not found' })
    }

    let candidates: string[] = []
    try {
        candidates = entity.candidateImages ? JSON.parse(entity.candidateImages) : []
    } catch { candidates = [] }

    const pendingTasks = candidates.filter((c: string) => c.startsWith('PENDING:'))
    const completedUrls = candidates.filter((c: string) => !c.startsWith('PENDING:'))

    if (pendingTasks.length === 0) {
        return NextResponse.json({
            status: 'completed',
            completedCount: completedUrls.length,
            candidates: completedUrls.map((url: string) => getSignedUrl(url))
        })
    }

    // 检查每个PENDING任务
    let updatedCandidates = [...candidates]

    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i]
        if (!candidate.startsWith('PENDING:')) continue

        const pendingType = candidate.split(':')[1]  // FAL or GEMINI_BATCH

        if (pendingType === 'FAL') {
            const parts = candidate.replace('PENDING:FAL:', '').split(':')
            const taskEndpoint = parts.slice(0, -1).join(':')
            const taskRequestId = parts[parts.length - 1]

            try {
                const falApiKey = await getFalApiKey(userId)
                const falStatus = await queryFalStatus(taskEndpoint, taskRequestId, falApiKey)

                if (falStatus.completed && falStatus.resultUrl) {
                    const cosKey = generateUniqueKey(`panel-${entityId}-candidate-${i}`, 'png')
                    const imageResponse = await fetch(falStatus.resultUrl)
                    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
                    const cosUrl = await uploadToCOS(imageBuffer, cosKey)
                    updatedCandidates[i] = cosUrl
                    console.log(`[poll-task] Panel ${entityId} FAL候选图 ${i} 完成`)
                } else if (falStatus.failed) {
                    updatedCandidates[i] = ''
                }
            } catch (err) {
                console.error(`[poll-task] 检查FAL任务 ${i} 失败:`, err)
            }
        } else if (pendingType === 'GEMINI_BATCH') {
            // 🔥 Gemini Batch 任务
            const batchName = candidate.replace('PENDING:GEMINI_BATCH:', '')

            try {
                const googleApiKey = await getGoogleAiKey(userId)
                const geminiStatus = await queryGeminiBatchStatus(batchName, googleApiKey)

                if (geminiStatus.completed && geminiStatus.imageBase64) {
                    const cosKey = generateUniqueKey(`panel-${entityId}-candidate-${i}`, 'png')
                    const imageBuffer = Buffer.from(geminiStatus.imageBase64, 'base64')
                    const cosUrl = await uploadToCOS(imageBuffer, cosKey)
                    updatedCandidates[i] = cosUrl
                    console.log(`[poll-task] Panel ${entityId} Gemini Batch候选图 ${i} 完成`)
                } else if (geminiStatus.failed) {
                    console.error(`[poll-task] Gemini Batch任务失败:`, geminiStatus.error)
                    updatedCandidates[i] = ''
                }
            } catch (err) {
                console.error(`[poll-task] 检查Gemini Batch任务 ${i} 失败:`, err)
            }
        }
    }

    updatedCandidates = updatedCandidates.filter(c => c !== '')
    const stillPending = updatedCandidates.filter(c => c.startsWith('PENDING:')).length

    const shouldAutoSelect = stillPending === 0 && updatedCandidates.length > 0 && !entity.imageUrl

    if (shouldAutoSelect) {
        await prisma.novelPromotionPanel.update({
            where: { id: entityId },
            data: {
                imageUrl: updatedCandidates[0],
                candidateImages: null,
                generatingImage: false
            }
        })
    } else {
        await prisma.novelPromotionPanel.update({
            where: { id: entityId },
            data: {
                candidateImages: JSON.stringify(updatedCandidates),
                generatingImage: stillPending > 0
            }
        })
    }

    const completedNow = updatedCandidates.filter(c => !c.startsWith('PENDING:'))
    return NextResponse.json({
        status: stillPending > 0 ? 'pending' : 'completed',
        pendingCount: stillPending,
        completedCount: completedNow.length,
        candidates: !shouldAutoSelect && stillPending === 0
            ? completedNow.map(url => getSignedUrl(url))
            : undefined,
        autoSelected: shouldAutoSelect,
        selectedUrl: shouldAutoSelect ? getSignedUrl(updatedCandidates[0]) : undefined
    })
}
