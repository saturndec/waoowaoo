/**
 * 媒体处理服务层
 * 
 * 统一的媒体结果处理：下载 → 上传 COS
 * 只处理简单场景，复杂场景（标签、数组更新）保持独立
 */

import { downloadAndUploadVideoToCOS, generateUniqueKey, uploadToCOS } from '@/lib/cos'
import { prisma } from '@/lib/prisma'
import { markTaskCompleted, markTaskFailed, AsyncTaskResult } from '@/lib/async-task-manager'
import { pollAsyncTask } from '@/lib/async-poll'

// ==================== 类型定义 ====================

export interface ProcessMediaOptions {
    /** 媒体来源：URL 或 Buffer */
    source: string | Buffer
    /** 媒体类型 */
    type: 'image' | 'video' | 'audio'
    /** COS key 前缀 */
    keyPrefix: string
    /** 目标实体 ID */
    targetId: string
}

export interface TaskHandlerConfig {
    /** 数据库表名 */
    table: 'characterAppearance' | 'novelPromotionPanel' | 'novelPromotionVoiceLine' | 'locationImage'
    /** 媒体字段名 */
    mediaField: string
    /** 生成中状态字段名 */
    generatingField: string
    /** 媒体类型 */
    mediaType: 'image' | 'video' | 'audio'
}

// ==================== 核心函数 ====================

/**
 * 处理媒体结果：下载 → 上传 COS
 * 只处理简单场景，不包含钩子
 */
export async function processMediaResult(options: ProcessMediaOptions): Promise<string> {
    const { source, type, keyPrefix, targetId } = options
    const ext = type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : 'jpg'
    const key = generateUniqueKey(`${keyPrefix}-${targetId}`, ext)

    // 如果是 URL
    if (typeof source === 'string') {
        // 检查是否是 data: URL
        if (source.startsWith('data:')) {
            const base64Start = source.indexOf(';base64,')
            if (base64Start === -1) throw new Error('无法解析 data: URL')
            const base64Data = source.substring(base64Start + 8)
            const buffer = Buffer.from(base64Data, 'base64') as Buffer
            return await uploadToCOS(buffer, key)
        }

        // 视频用专门的函数（支持重试）
        if (type === 'video') {
            return await downloadAndUploadVideoToCOS(source, key)
        }

        // 图片/音频：下载后上传
        const response = await fetch(source)
        const buffer = Buffer.from(await response.arrayBuffer()) as Buffer
        return await uploadToCOS(buffer, key)
    }

    // 如果是 Buffer，直接上传
    return await uploadToCOS(source, key)
}

/**
 * 更新实体状态
 */
export async function updateEntityStatus(
    table: string,
    targetId: string,
    data: Record<string, any>
): Promise<void> {
    await (prisma as any)[table].update({
        where: { id: targetId },
        data
    })
}

// ==================== Cron 专用函数 ====================

/**
 * 统一处理异步任务结果（简单场景）
 * 用于 Cron Job 中的视频、口型、语音等简单 handler
 */
export async function handleMediaTaskResult(
    task: AsyncTaskResult,
    config: TaskHandlerConfig,
    getUserIdFromTask: (task: AsyncTaskResult) => Promise<string | null>
): Promise<'completed' | 'failed' | 'pending'> {
    // 1. 检查 externalId
    if (!task.externalId) {
        await markTaskFailed(task.id, '缺少外部任务ID')
        return 'failed'
    }

    // 2. 获取用户 ID 并轮询状态
    const userId = task.userId || await getUserIdFromTask(task)
    if (!userId) {
        await markTaskFailed(task.id, '无法获取用户ID')
        return 'failed'
    }

    const status = await pollAsyncTask(task.externalId, userId)

    // 3. 处理完成状态
    if (status.status === 'completed' && (status.resultUrl || status.videoUrl || status.imageUrl)) {
        const sourceUrl = status.resultUrl || status.videoUrl || status.imageUrl!

        try {
            const cosUrl = await processMediaResult({
                source: sourceUrl,
                type: config.mediaType,
                keyPrefix: config.mediaField,
                targetId: task.targetId
            })

            // 更新数据库
            await updateEntityStatus(config.table, task.targetId, {
                [config.mediaField]: cosUrl,
                [config.generatingField]: false
            })

            // 标记任务完成
            await markTaskCompleted(task.id, { [config.mediaField]: cosUrl })
            console.log(`[Cron] ✅ ${config.mediaField} 任务完成: ${task.id}`)
            return 'completed'

        } catch (err: any) {
            console.error(`[Cron] 处理媒体结果失败:`, err.message)
            await updateEntityStatus(config.table, task.targetId, {
                [config.generatingField]: false
            })
            await markTaskFailed(task.id, err.message)
            return 'failed'
        }
    }

    // 4. 处理失败状态
    if (status.status === 'failed') {
        const errorMessage = status.error || 'Unknown error'

        // 🔥 解析错误码用于前端翻译
        let errorCode = 'INTERNAL_ERROR'  // 默认错误码

        // 检测敏感内容错误
        if (errorMessage.includes('sensitive information') ||
            errorMessage.includes('InputImageSensitiveContentDetected')) {
            errorCode = 'SENSITIVE_CONTENT'
        }
        // 可以添加更多错误模式识别...

        // 🔥 根据不同的媒体类型写入对应的错误字段
        const updateData: any = {
            [config.generatingField]: false
        }

        // 添加错误消息字段 - 写入错误码
        if (config.mediaField === 'videoUrl') {
            updateData.videoErrorMessage = errorCode
        } else if (config.mediaField === 'lipSyncVideoUrl') {
            updateData.lipSyncErrorMessage = errorCode
        }

        await updateEntityStatus(config.table, task.targetId, updateData)
        await markTaskFailed(task.id, errorMessage)
        console.log(`[Cron] ❌ ${config.mediaField} 任务失败: ${task.id}, 错误码: ${errorCode}`)
        return 'failed'
    }

    // 5. 仍在处理中
    await prisma.asyncTask.update({
        where: { id: task.id },
        data: { updatedAt: new Date() }
    })
    console.log(`[Cron] ⏳ ${config.mediaField} 任务等待中: ${task.id}`)
    return 'pending'
}
