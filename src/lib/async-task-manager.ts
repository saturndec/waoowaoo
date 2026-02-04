/**
 * 统一异步任务管理库
 * 
 * 所有异步任务（图片生成、视频生成、文字分镜等）统一通过这里管理。
 */

import { prisma } from '@/lib/prisma'

// 任务类型常量
export const TASK_TYPES = {
    IMAGE_CHARACTER: 'image_character',      // 角色图片
    IMAGE_LOCATION: 'image_location',        // 场景图片
    IMAGE_PANEL: 'image_panel',              // 分镜图片
    IMAGE_FAL: 'image_fal',                  // FAL Banana 图片生成
    IMAGE_GEMINI_BATCH: 'image_gemini_batch', // Gemini Batch 图片生成
    IMAGE_ASSET_HUB_EDIT: 'image_asset_hub_edit',  // 🔥 Asset Hub 图片编辑（异步）
    VIDEO_PANEL: 'video_panel',              // 分镜视频
    LIP_SYNC_PANEL: 'lip_sync_panel',        // 口型同步视频
    VOICE_LINE: 'voice_line',                // TTS语音
    STORYBOARD_TEXT: 'storyboard_text',      // 文字分镜生成
    REGENERATE_STORYBOARD: 'regenerate_storyboard',  // 重新生成分镜
    INSERT_PANEL: 'insert_panel',            // 插入分镜
    PANEL_VARIANT: 'panel_variant'           // 镜头变体
} as const

export type TaskType = typeof TASK_TYPES[keyof typeof TASK_TYPES]

// 任务状态常量
export const TASK_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed'
} as const

export type TaskStatus = typeof TASK_STATUS[keyof typeof TASK_STATUS]

// 📊 计费信息类型
export interface BillingInfo {
    projectId: string
    model: string
    action: string
    quantity: number
    unit: string  // 'image' | 'video' | 'call' | 'second'
}

// 任务结果类型
export interface AsyncTaskResult {
    id: string
    type: string
    targetId: string
    targetType: string
    externalId: string | null
    status: string
    progress: number | null
    error: string | null
    payload: any
    result: any
    createdAt: Date
    updatedAt: Date
    // 📊 计费相关
    userId: string | null
    billingInfo: BillingInfo | null
    billedAt: Date | null
}

/**
 * 创建异步任务
 * @param params.userId - 发起任务的用户ID（用于计费时获取API Key）
 * @param params.billingInfo - 计费信息（任务完成时自动计费）
 */
export async function createAsyncTask(params: {
    type: TaskType
    targetId: string
    targetType: string
    externalId?: string
    payload?: any
    // 📊 计费相关
    userId?: string
    billingInfo?: BillingInfo
}): Promise<AsyncTaskResult> {
    const task = await prisma.asyncTask.create({
        data: {
            type: params.type,
            targetId: params.targetId,
            targetType: params.targetType,
            externalId: params.externalId || null,
            status: TASK_STATUS.PENDING,
            payload: params.payload || null,
            // 📊 计费相关
            userId: params.userId || null,
            billingInfo: params.billingInfo || null
        }
    })

    console.log(`[AsyncTask] 创建任务: ${task.id} (${params.type} -> ${params.targetType}:${params.targetId})`)
    return task as AsyncTaskResult
}

/**
 * 更新任务状态
 */
export async function updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    options?: {
        progress?: number
        result?: any
        error?: string
        externalId?: string
    }
): Promise<void> {
    await prisma.asyncTask.update({
        where: { id: taskId },
        data: {
            status,
            progress: options?.progress,
            result: options?.result,
            error: options?.error,
            externalId: options?.externalId,
            updatedAt: new Date()
        }
    })

    console.log(`[AsyncTask] 更新任务状态: ${taskId} -> ${status}`)
}

/**
 * 标记任务开始处理
 */
export async function markTaskProcessing(taskId: string, externalId?: string): Promise<void> {
    await updateTaskStatus(taskId, TASK_STATUS.PROCESSING, { externalId })
}

/**
 * 标记任务完成
 */
export async function markTaskCompleted(taskId: string, result?: any): Promise<void> {
    await updateTaskStatus(taskId, TASK_STATUS.COMPLETED, { result, progress: 100 })
}

/**
 * 标记任务失败
 */
export async function markTaskFailed(taskId: string, error: string): Promise<void> {
    await updateTaskStatus(taskId, TASK_STATUS.FAILED, { error })
}

/**
 * 更新任务进度
 */
export async function updateTaskProgress(taskId: string, progress: number): Promise<void> {
    await prisma.asyncTask.update({
        where: { id: taskId },
        data: { progress, updatedAt: new Date() }
    })
}

/**
 * 获取任务状态
 */
export async function getTaskStatus(taskId: string): Promise<AsyncTaskResult | null> {
    const task = await prisma.asyncTask.findUnique({
        where: { id: taskId }
    })
    return task as AsyncTaskResult | null
}

/**
 * 获取目标实体的所有任务
 */
export async function getTasksForTarget(
    targetId: string,
    targetType?: string
): Promise<AsyncTaskResult[]> {
    const where: any = { targetId }
    if (targetType) where.targetType = targetType

    const tasks = await prisma.asyncTask.findMany({
        where,
        orderBy: { createdAt: 'desc' }
    })
    return tasks as AsyncTaskResult[]
}

/**
 * 获取所有待处理的任务（Cron用）
 */
export async function getPendingTasks(options?: {
    type?: TaskType
    coldThresholdMinutes?: number
    limit?: number
}): Promise<AsyncTaskResult[]> {
    const coldThreshold = options?.coldThresholdMinutes ?? 2
    const coldTimeThreshold = new Date(Date.now() - coldThreshold * 60 * 1000)

    const where: any = {
        status: TASK_STATUS.PENDING,
        updatedAt: { lt: coldTimeThreshold }
    }
    if (options?.type) where.type = options.type

    const tasks = await prisma.asyncTask.findMany({
        where,
        take: options?.limit ?? 100,
        orderBy: { createdAt: 'asc' }
    })
    return tasks as AsyncTaskResult[]
}

/**
 * 检查目标是否有进行中的任务
 */
export async function hasActiveTasks(
    targetId: string,
    type?: TaskType
): Promise<boolean> {
    const where: any = {
        targetId,
        status: { in: [TASK_STATUS.PENDING, TASK_STATUS.PROCESSING] }
    }
    if (type) where.type = type

    const count = await prisma.asyncTask.count({ where })
    return count > 0
}

/**
 * 取消任务（标记为失败）
 */
export async function cancelTask(taskId: string): Promise<void> {
    await updateTaskStatus(taskId, TASK_STATUS.FAILED, { error: '任务已取消' })
}

/**
 * 删除任务
 */
export async function deleteTask(taskId: string): Promise<void> {
    await prisma.asyncTask.delete({ where: { id: taskId } })
}

/**
 * 清理旧任务（超过指定天数）
 */
export async function cleanupOldTasks(days: number = 7): Promise<number> {
    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const result = await prisma.asyncTask.deleteMany({
        where: {
            status: { in: [TASK_STATUS.COMPLETED, TASK_STATUS.FAILED] },
            createdAt: { lt: threshold }
        }
    })

    console.log(`[AsyncTask] 清理了 ${result.count} 个旧任务`)
    return result.count
}

/**
 * 标记超时任务（超过24小时的pending任务）
 */
export async function markTimeoutTasks(): Promise<number> {
    const timeout = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const result = await prisma.asyncTask.updateMany({
        where: {
            status: TASK_STATUS.PENDING,
            createdAt: { lt: timeout }
        },
        data: {
            status: TASK_STATUS.FAILED,
            error: '任务超时（24小时）'
        }
    })

    if (result.count > 0) {
        console.log(`[AsyncTask] 标记了 ${result.count} 个超时任务`)
    }
    return result.count
}
