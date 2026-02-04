/**
 * 🚨 统一 API 错误处理模块
 * 
 * 职责：
 * 1. 定义标准化错误码
 * 2. 提供 ApiError 类
 * 3. 提供 apiHandler HOF 包装器
 * 
 * 使用示例：
 * ```typescript
 * import { apiHandler, ApiError } from '@/lib/api-errors'
 * 
 * export const POST = apiHandler(async (req, ctx) => {
 *   // 业务逻辑，出错自动处理
 *   if (!valid) throw new ApiError('INVALID_PARAMS', { field: 'name' })
 *   return NextResponse.json({ success: true })
 * })
 * ```
 */

import { NextRequest, NextResponse } from 'next/server'
import { InsufficientBalanceError } from '@/lib/pricing/billing-helper'

// ============================================================
// 错误码定义
// ============================================================

/**
 * 标准化 API 错误码
 * 每个错误码对应一个 HTTP 状态码
 */
export const API_ERROR_CODES = {
    // 认证与权限
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },

    // 计费相关
    INSUFFICIENT_BALANCE: { status: 402 },

    // 限流与配额
    RATE_LIMIT: { status: 429 },
    QUOTA_EXCEEDED: { status: 429 },

    // 生成相关
    GENERATION_FAILED: { status: 500 },
    GENERATION_TIMEOUT: { status: 504 },
    SENSITIVE_CONTENT: { status: 422 },

    // 验证相关
    INVALID_PARAMS: { status: 400 },
    MISSING_CONFIG: { status: 400 },

    // 异步任务相关
    TASK_NOT_READY: { status: 202 },  // 任务尚未完成
    NO_RESULT: { status: 404 },       // 任务无结果
    EXTERNAL_ERROR: { status: 502 },  // 外部服务错误

    // 状态冲突
    CONFLICT: { status: 409 },        // 资源状态冲突

    // 通用
    INTERNAL_ERROR: { status: 500 },
    NETWORK_ERROR: { status: 502 },
} as const

export type ApiErrorCode = keyof typeof API_ERROR_CODES

// ============================================================
// ApiError 类
// ============================================================

/**
 * 标准化 API 错误
 * 
 * @example
 * throw new ApiError('RATE_LIMIT', { retryAfter: 55 })
 * throw new ApiError('INSUFFICIENT_BALANCE', { required: 10, available: 5 })
 */
export class ApiError extends Error {
    code: ApiErrorCode
    status: number
    details?: Record<string, any>

    constructor(code: ApiErrorCode, details?: Record<string, any>) {
        super(code)
        this.name = 'ApiError'
        this.code = code
        this.status = API_ERROR_CODES[code].status
        this.details = details
    }
}

// ============================================================
// 错误规范化
// ============================================================

/**
 * 将各种错误转换为标准 ApiError
 * 
 * 支持的错误类型：
 * - ApiError (直接返回)
 * - InsufficientBalanceError (计费错误)
 * - 429/限流错误
 * - 敏感内容错误
 * - 其他错误 (转为 INTERNAL_ERROR)
 */
export function normalizeError(error: any): ApiError {
    // 1. 已经是 ApiError，直接返回
    if (error instanceof ApiError) {
        return error
    }

    // 2. 计费错误（余额不足）
    if (error instanceof InsufficientBalanceError) {
        return new ApiError('INSUFFICIENT_BALANCE', {
            required: error.required,
            available: error.available
        })
    }

    // 3. 429 限流/配额错误
    if (
        error?.status === 429 ||
        error?.message?.toLowerCase().includes('quota') ||
        error?.message?.toLowerCase().includes('rate limit') ||
        error?.message?.toLowerCase().includes('resource_exhausted')
    ) {
        // 尝试从错误消息中提取重试时间
        const retryMatch = error?.message?.match(/retry.{0,10}?(\d+)/i)
        return new ApiError('RATE_LIMIT', {
            retryAfter: retryMatch ? parseInt(retryMatch[1]) : 60
        })
    }

    // 4. 敏感内容错误
    if (
        error?.message?.toLowerCase().includes('sensitive') ||
        error?.message?.toLowerCase().includes('safety') ||
        error?.message?.toLowerCase().includes('blocked') ||
        error?.message?.toLowerCase().includes('unsafe')  // Flow2API 返回的 UNSAFE_GENERATION
    ) {
        return new ApiError('SENSITIVE_CONTENT')
    }

    // 5. 超时错误
    if (
        error?.message?.toLowerCase().includes('timeout') ||
        error?.message?.toLowerCase().includes('timed out')
    ) {
        return new ApiError('GENERATION_TIMEOUT')
    }

    // 6. 外部服务过载/不可用错误 (503 UNAVAILABLE)
    if (
        error?.status === 503 ||
        error?.message?.toLowerCase().includes('overloaded') ||
        error?.message?.toLowerCase().includes('unavailable') ||
        error?.message?.includes('503')
    ) {
        return new ApiError('EXTERNAL_ERROR', {
            reason: 'service_overloaded',
            message: error?.message
        })
    }

    // 7. MiniMax 特定错误
    if (error?.message?.includes('MiniMax:')) {
        const errorMsg = error.message.toLowerCase()

        // 余额不足
        if (errorMsg.includes('insufficient balance')) {
            return new ApiError('INSUFFICIENT_BALANCE', {
                provider: 'MiniMax'
            })
        }

        // 敏感内容（MiniMax也会检测）
        if (errorMsg.includes('sensitive') || errorMsg.includes('safety')) {
            return new ApiError('SENSITIVE_CONTENT')
        }

        // 限流
        if (errorMsg.includes('rate limit') || errorMsg.includes('quota')) {
            return new ApiError('RATE_LIMIT')
        }

        // 其他MiniMax错误归为生成失败
        return new ApiError('GENERATION_FAILED', {
            provider: 'MiniMax',
            originalError: error.message
        })
    }

    // 8. Vidu 特定错误
    if (error?.message?.includes('Vidu')) {
        const errorMsg = error.message.toLowerCase()

        // Vidu 返回的错误码（从 err_code 字段）
        // 余额不足: CreditInsufficient
        if (errorMsg.includes('creditinsufficient') || errorMsg.includes('insufficient')) {
            return new ApiError('INSUFFICIENT_BALANCE', {
                provider: 'Vidu'
            })
        }

        // 敏感内容
        if (errorMsg.includes('sensitive') || errorMsg.includes('safety') || errorMsg.includes('content')) {
            return new ApiError('SENSITIVE_CONTENT')
        }

        // 限流
        if (errorMsg.includes('rate limit') || errorMsg.includes('quota') || errorMsg.includes('throttle')) {
            return new ApiError('RATE_LIMIT')
        }

        // 参数错误
        if (errorMsg.includes('fieldinvalid') || errorMsg.includes('invalid')) {
            return new ApiError('INVALID_PARAMS', {
                provider: 'Vidu',
                originalError: error.message
            })
        }

        // 其他Vidu错误归为生成失败
        return new ApiError('GENERATION_FAILED', {
            provider: 'Vidu',
            originalError: error.message
        })
    }

    // 9. 默认：内部错误
    return new ApiError('INTERNAL_ERROR')
}

// ============================================================
// HOF 包装器
// ============================================================

/**
 * API Handler 类型定义
 * 使用 any 类型的 params 以支持各种路由参数结构
 */
type ApiHandler = (
    req: NextRequest,
    ctx: { params: Promise<any> }
) => Promise<NextResponse>

/**
 * API 处理器包装器
 * 
 * 自动处理所有未捕获的错误，转换为标准格式返回
 * 
 * @example
 * ```typescript
 * // Before (需要手写 catch)
 * export async function POST(req, ctx) {
 *   try {
 *     // 业务逻辑
 *   } catch (error) {
 *     console.error(error)
 *     return NextResponse.json({ error: error.message }, { status: 500 })
 *   }
 * }
 * 
 * // After (自动处理错误)
 * export const POST = apiHandler(async (req, ctx) => {
 *   // 业务逻辑，出错自动处理
 * })
 * ```
 */
export function apiHandler(handler: ApiHandler): ApiHandler {
    return async (req, ctx) => {
        try {
            return await handler(req, ctx)
        } catch (error: any) {
            const apiError = normalizeError(error)

            // 🔥 增强错误日志记录
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
            console.error(`[API Error] ${apiError.code}:`, error?.message || error)
            console.error('[错误类型]', error?.constructor?.name || typeof error)
            console.error('[错误堆栈]', error?.stack?.substring(0, 1000))

            // 记录错误详细信息
            if (error?.response) {
                console.error('[响应状态]', error.response.status)
                console.error('[响应数据]', JSON.stringify(error.response.data, null, 2).substring(0, 1000))
            }

            // 记录完整错误对象(用于调试)
            try {
                const errorDetails = {
                    name: error?.name,
                    message: error?.message,
                    status: error?.status,
                    code: error?.code,
                    details: error?.details
                }
                console.error('[错误详情]', JSON.stringify(errorDetails, null, 2))
            } catch (e) {
                console.error('[错误详情] (无法序列化)', error)
            }
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

            // 返回标准化错误响应
            // 🔥 使用扁平格式，与 handleBillingError 保持一致，方便前端解析
            return NextResponse.json(
                {
                    error: error?.message || apiError.code, // 人类可读的错误消息
                    code: apiError.code,                    // 错误码（供程序判断）
                    ...apiError.details                     // 额外详情（如 required, available）
                },
                { status: apiError.status }
            )
        }
    }
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 快速抛出 API 错误
 * 
 * @example
 * throwApiError('INVALID_PARAMS', { field: 'name' })
 */
export function throwApiError(code: ApiErrorCode, details?: Record<string, any>): never {
    throw new ApiError(code, details)
}

/**
 * 检查是否是 API 错误
 */
export function isApiError(error: any): error is ApiError {
    return error instanceof ApiError
}
