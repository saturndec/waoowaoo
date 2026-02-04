/**
 * 💰 计费工具函数
 * 
 * 提供预扣费包装器，确保所有付费操作安全执行
 * 
 * 💡 开源模式：设置 ENABLE_BILLING=false 可完全关闭计费
 */

import { freezeBalance, confirmChargeWithRecord, rollbackFreeze, getBalance } from './balance'

// ============================================================
// 全局计费开关
// ============================================================

/**
 * 是否启用计费系统
 * - 默认 false（开源模式，不计费）
 * - 设置 ENABLE_BILLING=true 启用计费
 */
export const BILLING_ENABLED = process.env.ENABLE_BILLING === 'true'
import { NextResponse } from 'next/server'
import { calcText, calcImage, calcVideo, calcVoice, calcVoiceDesign, calcLipSync } from './calculator'
import type { ApiType, UsageUnit } from './config'

// ============================================================
// 错误类型
// ============================================================

export class InsufficientBalanceError extends Error {
    public available: number
    public required: number

    constructor(required: number, available: number) {
        super(`余额不足，需要 ¥${required.toFixed(4)}，当前可用 ¥${available.toFixed(4)}`)
        this.name = 'InsufficientBalanceError'
        this.required = required
        this.available = available
    }
}

// ============================================================
// 记录参数接口
// ============================================================

interface RecordParams {
    projectId: string
    action: string
    metadata?: Record<string, any>
}

// ============================================================
// 计费包装器（统一入口）
// ============================================================

/**
 * 图片生成计费
 */
export async function withImageBilling<T>(
    userId: string,
    model: string,
    count: number,
    recordParams: RecordParams,
    generateFn: () => Promise<T>
): Promise<T> {
    // 开源模式：跳过计费
    if (!BILLING_ENABLED) {
        return await generateFn()
    }

    const cost = calcImage(model, count)
    const freezeId = await freezeBalance(userId, cost)

    if (!freezeId) {
        const balance = await getBalance(userId)
        throw new InsufficientBalanceError(cost, balance.balance)
    }

    try {
        const result = await generateFn()
        const success = await confirmChargeWithRecord(freezeId, {
            ...recordParams,
            apiType: 'image',
            model,
            quantity: count,
            unit: 'image'
        })
        if (!success) throw new Error('确认扣费失败')
        return result
    } catch (error) {
        await rollbackFreeze(freezeId)
        throw error
    }
}

/**
 * 视频生成计费
 */
export async function withVideoBilling<T>(
    userId: string,
    model: string,
    resolution: string,
    count: number,
    recordParams: RecordParams,
    generateFn: () => Promise<T>
): Promise<T> {
    // 开源模式：跳过计费
    if (!BILLING_ENABLED) {
        return await generateFn()
    }

    const cost = calcVideo(model, resolution, count)
    const freezeId = await freezeBalance(userId, cost)

    if (!freezeId) {
        const balance = await getBalance(userId)
        throw new InsufficientBalanceError(cost, balance.balance)
    }

    try {
        const result = await generateFn()
        const success = await confirmChargeWithRecord(freezeId, {
            ...recordParams,
            apiType: 'video',
            model,
            quantity: count,
            unit: 'video',
            metadata: { ...recordParams.metadata, resolution }
        })
        if (!success) throw new Error('确认扣费失败')
        return result
    } catch (error) {
        await rollbackFreeze(freezeId)
        throw error
    }
}

/**
 * 文本/LLM 计费
 */
export async function withTextBilling<T>(
    userId: string,
    model: string,
    estimatedInputTokens: number,
    estimatedOutputTokens: number,
    recordParams: RecordParams,
    generateFn: () => Promise<T>
): Promise<T> {
    // 开源模式：跳过计费
    if (!BILLING_ENABLED) {
        return await generateFn()
    }

    const cost = calcText(model, estimatedInputTokens, estimatedOutputTokens)
    const freezeId = await freezeBalance(userId, cost)

    if (!freezeId) {
        const balance = await getBalance(userId)
        throw new InsufficientBalanceError(cost, balance.balance)
    }

    try {
        const result = await generateFn()
        const success = await confirmChargeWithRecord(freezeId, {
            ...recordParams,
            apiType: 'text',
            model,
            quantity: estimatedInputTokens + estimatedOutputTokens,
            unit: 'token',
            metadata: {
                ...recordParams.metadata,
                inputTokens: estimatedInputTokens,
                outputTokens: estimatedOutputTokens
            }
        })
        if (!success) throw new Error('确认扣费失败')
        return result
    } catch (error) {
        await rollbackFreeze(freezeId)
        throw error
    }
}

/**
 * 配音计费
 */
export async function withVoiceBilling<T>(
    userId: string,
    estimatedSeconds: number,
    recordParams: RecordParams,
    generateFn: () => Promise<T>
): Promise<T> {
    // 开源模式：跳过计费
    if (!BILLING_ENABLED) {
        return await generateFn()
    }

    const cost = calcVoice(estimatedSeconds)
    const freezeId = await freezeBalance(userId, cost)

    if (!freezeId) {
        const balance = await getBalance(userId)
        throw new InsufficientBalanceError(cost, balance.balance)
    }

    try {
        const result = await generateFn()
        const success = await confirmChargeWithRecord(freezeId, {
            ...recordParams,
            apiType: 'voice',
            model: 'index-tts2',
            quantity: estimatedSeconds,
            unit: 'second'
        })
        if (!success) throw new Error('确认扣费失败')
        return result
    } catch (error) {
        await rollbackFreeze(freezeId)
        throw error
    }
}

/**
 * 声音设计计费
 */
export async function withVoiceDesignBilling<T>(
    userId: string,
    recordParams: RecordParams,
    generateFn: () => Promise<T>
): Promise<T> {
    // 开源模式：跳过计费
    if (!BILLING_ENABLED) {
        return await generateFn()
    }

    const cost = calcVoiceDesign()
    const freezeId = await freezeBalance(userId, cost)

    if (!freezeId) {
        const balance = await getBalance(userId)
        throw new InsufficientBalanceError(cost, balance.balance)
    }

    try {
        const result = await generateFn()
        const success = await confirmChargeWithRecord(freezeId, {
            ...recordParams,
            apiType: 'voice-design',
            model: 'qwen',
            quantity: 1,
            unit: 'call'
        })
        if (!success) throw new Error('确认扣费失败')
        return result
    } catch (error) {
        await rollbackFreeze(freezeId)
        throw error
    }
}

/**
 * 口型同步计费
 */
export async function withLipSyncBilling<T>(
    userId: string,
    recordParams: RecordParams,
    generateFn: () => Promise<T>
): Promise<T> {
    // 开源模式：跳过计费
    if (!BILLING_ENABLED) {
        return await generateFn()
    }

    const cost = calcLipSync()
    const freezeId = await freezeBalance(userId, cost)

    if (!freezeId) {
        const balance = await getBalance(userId)
        throw new InsufficientBalanceError(cost, balance.balance)
    }

    try {
        const result = await generateFn()
        const success = await confirmChargeWithRecord(freezeId, {
            ...recordParams,
            apiType: 'lip-sync',
            model: 'kling',
            quantity: 1,
            unit: 'call'
        })
        if (!success) throw new Error('确认扣费失败')
        return result
    } catch (error) {
        await rollbackFreeze(freezeId)
        throw error
    }
}

/**
 * TTS 计费
 */
export async function withTTSBilling<T>(
    userId: string,
    characters: number,
    recordParams: RecordParams,
    generateFn: () => Promise<T>
): Promise<T> {
    // 开源模式：跳过计费
    if (!BILLING_ENABLED) {
        return await generateFn()
    }

    const cost = calcText('azure-tts', 0, characters)
    const freezeId = await freezeBalance(userId, cost)

    if (!freezeId) {
        const balance = await getBalance(userId)
        throw new InsufficientBalanceError(cost, balance.balance)
    }

    try {
        const result = await generateFn()
        const success = await confirmChargeWithRecord(freezeId, {
            ...recordParams,
            apiType: 'tts',
            model: 'azure',
            quantity: characters,
            unit: 'character'
        })
        if (!success) throw new Error('确认扣费失败')
        return result
    } catch (error) {
        await rollbackFreeze(freezeId)
        throw error
    }
}

// ============================================================
// 错误处理
// ============================================================

/**
 * 处理计费错误并返回 402 响应
 */
export function handleBillingError(error: any): NextResponse | null {
    if (error instanceof InsufficientBalanceError) {
        return NextResponse.json(
            {
                error: error.message,
                code: 'INSUFFICIENT_BALANCE',
                required: error.required,
                available: error.available
            },
            { status: 402 }
        )
    }
    return null
}

