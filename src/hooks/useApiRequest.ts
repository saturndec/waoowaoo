'use client'

/**
 * 🌐 统一 API 请求 Hook
 * 
 * 职责：
 * 1. 统一的 fetch 封装
 * 2. 自动处理错误并显示 Toast
 * 3. 支持静默模式（不显示错误）
 * 4. 自动过滤 AbortError（页面刷新导致的请求中断）
 * 
 * 使用示例：
 * ```typescript
 * const { request } = useApiRequest()
 * 
 * // 基本用法
 * const result = await request('/api/generate-image', { method: 'POST', body: ... })
 * if (result) {
 *   // 成功处理
 * }
 * // 失败自动弹 Toast，无需任何 catch
 * 
 * // 静默模式（不显示错误）
 * const result = await request('/api/xxx', { silent: true })
 * ```
 */

import { useCallback } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { isAbortError } from '@/lib/error-utils'

// ============================================================
// 类型定义
// ============================================================

interface RequestOptions extends RequestInit {
    /**
     * 是否静默模式（不显示错误 Toast）
     * 适用于后台轮询等场景
     */
    silent?: boolean
}

interface ApiErrorResponse {
    error: {
        code: string
        message?: string
        [key: string]: any
    }
}

// ============================================================
// Hook
// ============================================================

/**
 * 统一 API 请求 Hook
 * 
 * 特性：
 * - 自动处理错误并显示 Toast
 * - 自动翻译错误码
 * - 支持静默模式
 * - 过滤 AbortError
 */
export function useApiRequest() {
    const { showError, showToast } = useToast()

    /**
     * 发送 API 请求
     * 
     * @param url 请求 URL
     * @param options 请求选项（扩展了 RequestInit）
     * @returns 成功返回数据，失败返回 null
     */
    const request = useCallback(async <T>(
        url: string,
        options?: RequestOptions
    ): Promise<T | null> => {
        try {
            const { silent, ...fetchOptions } = options || {}

            const res = await fetch(url, fetchOptions)

            // 请求成功
            if (res.ok) {
                // 处理空响应
                const text = await res.text()
                if (!text) return null as T
                return JSON.parse(text) as T
            }

            // 请求失败，解析错误
            let errorData: ApiErrorResponse | null = null
            try {
                errorData = await res.json()
            } catch {
                // 无法解析 JSON
            }

            const error = errorData?.error || {} as { code?: string; message?: string }

            // 显示错误（除非静默模式）
            if (!silent) {
                if (error.code) {
                    // 使用错误码（自动翻译）
                    showError(error.code, error)
                } else if (error.message) {
                    // 使用原始错误消息
                    showToast(error.message, 'error')
                } else {
                    // 通用错误
                    showError('INTERNAL_ERROR')
                }
            }

            return null
        } catch (error: any) {
            // 页面刷新导致的请求中断，静默处理
            if (isAbortError(error)) {
                return null
            }

            // 网络错误
            const { silent } = options || {}
            if (!silent) {
                showError('NETWORK_ERROR')
            }

            return null
        }
    }, [showError, showToast])

    return { request }
}

// ============================================================
// 便捷函数（可选）
// ============================================================

/**
 * 创建带有默认配置的请求函数
 * 
 * @example
 * const postJson = createRequest('POST')
 * const result = await postJson('/api/xxx', { data: 123 })
 */
export function createRequestFactory(
    showError: (code: string, details?: Record<string, any>) => void,
    showToast: (message: string, type: 'error') => void
) {
    return async function request<T>(
        url: string,
        options?: RequestOptions
    ): Promise<T | null> {
        try {
            const { silent, ...fetchOptions } = options || {}

            const res = await fetch(url, fetchOptions)

            if (res.ok) {
                const text = await res.text()
                if (!text) return null as T
                return JSON.parse(text) as T
            }

            let errorData: ApiErrorResponse | null = null
            try {
                errorData = await res.json()
            } catch {
                // 无法解析 JSON
            }

            const error = errorData?.error || {} as { code?: string; message?: string }

            if (!silent) {
                if (error.code) {
                    showError(error.code, error)
                } else if (error.message) {
                    showToast(error.message, 'error')
                } else {
                    showError('INTERNAL_ERROR')
                }
            }

            return null
        } catch (error: any) {
            if (isAbortError(error)) {
                return null
            }

            const { silent } = options || {}
            if (!silent) {
                showError('NETWORK_ERROR')
            }

            return null
        }
    }
}
