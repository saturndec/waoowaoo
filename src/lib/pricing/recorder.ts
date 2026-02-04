/**
 * 📝 费用记录函数
 * 
 * 统一的费用记录接口，记录到 UsageCost 表
 * ⚠️ 同时会从用户余额中扣除费用
 */

import { prisma } from '../prisma'
import { ApiType, UsageUnit } from './config'
import { calcText, calcImage, calcVideo, calcTTS, calcVoice, calcVoiceDesign, calcLipSync } from './calculator'
import type { Prisma } from '@prisma/client'

// 基础记录参数
interface RecordParams {
    projectId: string
    userId: string
    action: string
    metadata?: Record<string, any>
}

// 纯记录参数（用于新的预冻结模式）
interface PureRecordParams extends RecordParams {
    apiType: ApiType
    model: string
    quantity: number
    unit: UsageUnit
    cost: number
    balanceAfter: number  // 操作后余额（由调用方传入）
}

/**
 * 🆕 纯记录函数（仅记录，不扣费）
 * 用于配合预冻结模式：freezeBalance -> confirmCharge -> recordUsageCostOnly
 * @param txOrPrisma 可以是事务对象或 prisma 实例
 */
export async function recordUsageCostOnly(
    txOrPrisma: Prisma.TransactionClient | typeof prisma,
    params: PureRecordParams
): Promise<void> {
    // 检查是否有有效的 projectId（排除 'asset-hub' 等特殊值）
    const hasValidProjectId = params.projectId &&
        params.projectId !== 'asset-hub' &&
        params.projectId !== 'system'

    // 1. 记录费用到 UsageCost（仅当有有效 projectId 时）
    if (hasValidProjectId) {
        await txOrPrisma.usageCost.create({
            data: {
                projectId: params.projectId,
                userId: params.userId,
                apiType: params.apiType,
                model: params.model,
                action: params.action,
                quantity: params.quantity,
                unit: params.unit,
                cost: params.cost,
                metadata: params.metadata ? JSON.stringify(params.metadata) : null,
            }
        })
    } else {
        console.log(`[计费] 跳过 UsageCost 记录 (projectId=${params.projectId})，仅记录流水`)
    }

    // 2. 记录消费流水到 BalanceTransaction（始终记录）
    await txOrPrisma.balanceTransaction.create({
        data: {
            userId: params.userId,
            type: 'consume',
            amount: -params.cost,
            balanceAfter: params.balanceAfter,
            description: `${params.action} - ${params.model}${hasValidProjectId ? '' : ' (Asset Hub)'}`
        }
    })

    console.log(`[计费] ${params.action} - ${params.model} - ¥${params.cost.toFixed(4)} (已记录${hasValidProjectId ? '' : '，无项目归属'})`)
}

// 统一记录函数（内部使用）
// ⚠️ 此函数会同时记录费用并从余额扣除
async function record(params: RecordParams & {
    apiType: ApiType
    model: string
    quantity: number
    unit: UsageUnit
    cost: number
}): Promise<void> {
    // 🔴 开源模式：完全跳过计费
    if (process.env.ENABLE_BILLING !== 'true') {
        return
    }
    try {
        // 检查是否有有效的 projectId（排除 'asset-hub' 等特殊值）
        const hasValidProjectId = params.projectId &&
            params.projectId !== 'asset-hub' &&
            params.projectId !== 'system'

        // 使用事务确保记录和扣费的原子性
        // ⚠️ 增加超时时间以应对跨境数据库延迟
        await prisma.$transaction(async (tx) => {
            // 1. 记录费用（仅当有有效 projectId 时）
            if (hasValidProjectId) {
                await tx.usageCost.create({
                    data: {
                        projectId: params.projectId,
                        userId: params.userId,
                        apiType: params.apiType,
                        model: params.model,
                        action: params.action,
                        quantity: params.quantity,
                        unit: params.unit,
                        cost: params.cost,
                        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
                    }
                })
            }

            // 2. 从余额扣除（使用 upsert 确保余额记录存在）
            const balance = await tx.userBalance.findUnique({
                where: { userId: params.userId }
            })

            if (balance) {
                // 更新余额
                await tx.userBalance.update({
                    where: { userId: params.userId },
                    data: {
                        balance: { decrement: params.cost },
                        totalSpent: { increment: params.cost }
                    }
                })

                // 3. 记录消费流水
                await tx.balanceTransaction.create({
                    data: {
                        userId: params.userId,
                        type: 'consume',
                        amount: -params.cost,
                        balanceAfter: balance.balance - params.cost,
                        description: `${params.action} - ${params.model}${hasValidProjectId ? '' : ' (Asset Hub)'}`
                    }
                })
            } else {
                // 🔴 WARNING: 允许创建负余额（临时兼容，后续将禁止）
                await tx.userBalance.create({
                    data: {
                        userId: params.userId,
                        balance: -params.cost,
                        frozenAmount: 0,
                        totalSpent: params.cost
                    }
                })

                // 记录消费流水
                await tx.balanceTransaction.create({
                    data: {
                        userId: params.userId,
                        type: 'consume',
                        amount: -params.cost,
                        balanceAfter: -params.cost,
                        description: `${params.action} - ${params.model}${hasValidProjectId ? '' : ' (Asset Hub)'}`
                    }
                })
            }
        }, {
            maxWait: 10000,    // 最大等待 10 秒
            timeout: 10000     // 最大执行 10 秒
        })

        console.log(`[计费] ${params.action} - ${params.model} - ¥${params.cost.toFixed(4)} (已扣费${hasValidProjectId ? '' : '，无项目归属'})`)
    } catch (error) {
        console.error('[计费] 记录/扣费失败:', error)
        // 不抛出错误，避免影响主流程
    }
}

// ============================================================
// 对外记录函数
// ============================================================

/**
 * 记录 LLM 文本分析费用
 */
export async function recordText(
    params: RecordParams & { model: string; inputTokens: number; outputTokens: number }
): Promise<void> {
    const cost = calcText(params.model, params.inputTokens, params.outputTokens)
    await record({
        ...params,
        apiType: 'text',
        quantity: params.inputTokens + params.outputTokens,
        unit: 'token',
        cost,
        metadata: {
            ...params.metadata,
            inputTokens: params.inputTokens,
            outputTokens: params.outputTokens
        }
    })
}

/**
 * 记录图片生成费用
 */
export async function recordImage(
    params: RecordParams & { model: string; count?: number }
): Promise<void> {
    const count = params.count ?? 1
    const cost = calcImage(params.model, count)
    await record({
        ...params,
        apiType: 'image',
        quantity: count,
        unit: 'image',
        cost
    })
}

/**
 * 记录视频生成费用
 */
export async function recordVideo(
    params: RecordParams & { model: string; resolution?: string; count?: number }
): Promise<void> {
    const count = params.count ?? 1
    const cost = calcVideo(params.model, params.resolution, count)
    await record({
        ...params,
        apiType: 'video',
        quantity: count,
        unit: 'video',
        cost,
        metadata: { ...params.metadata, resolution: params.resolution }
    })
}

/**
 * 记录 Azure TTS 费用
 */
export async function recordTTS(
    params: RecordParams & { characters: number }
): Promise<void> {
    const cost = calcTTS(params.characters)
    await record({
        ...params,
        apiType: 'tts',
        model: 'azure',
        quantity: params.characters,
        unit: 'character',
        cost
    })
}

/**
 * 记录 IndexTTS2 配音费用
 */
export async function recordVoice(
    params: RecordParams & { durationSeconds: number }
): Promise<void> {
    const cost = calcVoice(params.durationSeconds)
    await record({
        ...params,
        apiType: 'voice',
        model: 'index-tts2',
        quantity: params.durationSeconds,
        unit: 'second',
        cost
    })
}

/**
 * 记录 Qwen 声音设计费用
 */
export async function recordVoiceDesign(params: RecordParams): Promise<void> {
    const cost = calcVoiceDesign()
    await record({
        ...params,
        apiType: 'voice-design',
        model: 'qwen',
        quantity: 1,
        unit: 'call',
        cost
    })
}

/**
 * 记录 Kling 口型同步费用
 */
export async function recordLipSync(params: RecordParams): Promise<void> {
    const cost = calcLipSync()
    await record({
        ...params,
        apiType: 'lip-sync',
        model: 'kling',
        quantity: 1,
        unit: 'call',
        cost
    })
}

// ============================================================
// 兼容旧 API（逐步废弃）
// ============================================================

/** @deprecated 使用 recordText 代替 */
export async function recordTextUsage(
    projectId: string,
    userId: string,
    model: string,
    action: string,
    inputTokens: number,
    outputTokens: number,
    metadata?: Record<string, any>
): Promise<void> {
    await recordText({ projectId, userId, model, action, inputTokens, outputTokens, metadata })
}

/** @deprecated 使用 recordImage 代替 */
export async function recordImageUsage(
    projectId: string,
    userId: string,
    model: string,
    action: string,
    count: number = 1,
    metadata?: Record<string, any>
): Promise<void> {
    await recordImage({ projectId, userId, model, action, count, metadata })
}

/** @deprecated 使用 recordVideo 代替 */
export async function recordVideoUsage(
    projectId: string,
    userId: string,
    model: string,
    action: string,
    resolution: string = '720p',
    count: number = 1,
    metadata?: Record<string, any>
): Promise<void> {
    await recordVideo({ projectId, userId, model, action, resolution, count, metadata })
}

/** @deprecated 使用 recordTTS 代替 */
export async function recordTTSUsage(
    projectId: string,
    userId: string,
    action: string,
    characters: number,
    metadata?: Record<string, any>
): Promise<void> {
    await recordTTS({ projectId, userId, action, characters, metadata })
}

// ============================================================
// 费用查询函数
// ============================================================

/**
 * 获取项目总费用
 */
export async function getProjectTotalCost(projectId: string): Promise<number> {
    try {
        const result = await prisma.usageCost.aggregate({
            where: { projectId },
            _sum: { cost: true }
        })
        // 使用 ?? 处理 null/undefined，防止 Rust Panic
        return result._sum.cost ?? 0
    } catch (error) {
        console.error('[计费] 查询项目总费用失败:', error)
        return 0  // 查询失败返回 0，防止系统崩溃
    }
}

/**
 * 获取项目费用明细
 */
export async function getProjectCostDetails(projectId: string) {
    // 按类型汇总
    const byType = await prisma.usageCost.groupBy({
        by: ['apiType'],
        where: { projectId },
        _sum: { cost: true },
        _count: true,
    })

    // 按操作汇总
    const byAction = await prisma.usageCost.groupBy({
        by: ['action'],
        where: { projectId },
        _sum: { cost: true },
        _count: true,
    })

    // 最近记录
    const recentRecords = await prisma.usageCost.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: 50,
    })

    // 总费用
    const total = await getProjectTotalCost(projectId)

    return {
        total,
        byType,
        byAction,
        recentRecords,
    }
}

/**
 * 获取用户所有项目费用汇总
 */
export async function getUserCostSummary(userId: string) {
    try {
        // 按项目汇总
        const byProject = await prisma.usageCost.groupBy({
            by: ['projectId'],
            where: { userId },
            _sum: { cost: true },
            _count: true,
        })

        // 总费用
        const totalResult = await prisma.usageCost.aggregate({
            where: { userId },
            _sum: { cost: true }
        })

        return {
            total: totalResult._sum.cost ?? 0,  // 使用 ?? 防止 Panic
            byProject,
        }
    } catch (error) {
        console.error('[计费] 查询用户费用汇总失败:', error)
        return {
            total: 0,
            byProject: [],
        }
    }
}

/**
 * 获取用户费用明细（分页）
 */
export async function getUserCostDetails(userId: string, page: number = 1, pageSize: number = 20) {
    const skip = (page - 1) * pageSize

    const [records, total] = await Promise.all([
        prisma.usageCost.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            skip,
            take: pageSize,
        }),
        prisma.usageCost.count({ where: { userId } })
    ])

    return {
        records,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
    }
}

