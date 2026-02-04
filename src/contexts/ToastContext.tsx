'use client'

/**
 * 🔔 全局 Toast 通知系统
 * 
 * 职责：
 * 1. 提供全局 Toast 状态管理
 * 2. 支持成功/错误/警告/信息四种类型
 * 3. 支持自动翻译错误码
 * 
 * 使用示例：
 * ```typescript
 * const { showToast, showError } = useToast()
 * 
 * // 显示普通消息
 * showToast('操作成功', 'success')
 * 
 * // 显示错误（自动翻译错误码）
 * showError('RATE_LIMIT', { retryAfter: 55 })
 * // 显示为: "请求过于频繁，请 55 秒后重试"
 * ```
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { useTranslations } from 'next-intl'

// ============================================================
// 类型定义
// ============================================================

export interface Toast {
    id: string
    message: string
    type: 'success' | 'error' | 'warning' | 'info'
    duration: number
}

interface ToastContextValue {
    toasts: Toast[]
    showToast: (message: string, type?: Toast['type'], duration?: number) => void
    showError: (code: string, details?: Record<string, any>) => void
    dismissToast: (id: string) => void
}

// ============================================================
// Context
// ============================================================

const ToastContext = createContext<ToastContextValue | null>(null)

// ============================================================
// Provider 组件
// ============================================================

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    // 尝试获取翻译函数（可能失败，所以用 try-catch）
    let t: ((key: string, values?: Record<string, any>) => string) | null = null
    try {
        t = useTranslations('errors')
    } catch {
        // 翻译函数不可用（可能在某些边缘情况下）
    }

    /**
     * 显示 Toast 消息
     */
    const showToast = useCallback((
        message: string,
        type: Toast['type'] = 'info',
        duration = 5000
    ) => {
        const id = Math.random().toString(36).slice(2, 9)

        setToasts(prev => [...prev, { id, message, type, duration }])

        // 自动消失
        if (duration > 0) {
            setTimeout(() => {
                setToasts(prev => prev.filter(toast => toast.id !== id))
            }, duration)
        }
    }, [])

    /**
     * 显示错误消息（自动翻译错误码）
     */
    const showError = useCallback((code: string, details?: Record<string, any>) => {
        let message: string

        // 尝试翻译错误码
        if (t) {
            try {
                message = t(code, details || {})
            } catch {
                // 翻译失败，使用原始 code
                message = code
            }
        } else {
            message = code
        }

        showToast(message, 'error', 8000)
    }, [t, showToast])

    /**
     * 关闭 Toast
     */
    const dismissToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(toast => toast.id !== id))
    }, [])

    return (
        <ToastContext.Provider value={{ toasts, showToast, showError, dismissToast }}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        </ToastContext.Provider>
    )
}

// ============================================================
// Hook
// ============================================================

/**
 * 获取 Toast 上下文
 * 
 * @example
 * const { showToast, showError } = useToast()
 */
export function useToast(): ToastContextValue {
    const context = useContext(ToastContext)
    if (!context) {
        throw new Error('useToast must be used within ToastProvider')
    }
    return context
}

// ============================================================
// Toast 容器组件
// ============================================================

function ToastContainer({
    toasts,
    onDismiss
}: {
    toasts: Toast[]
    onDismiss: (id: string) => void
}) {
    if (toasts.length === 0) return null

    return (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    className={`
                        pointer-events-auto
                        flex items-center gap-3 
                        px-4 py-3 
                        rounded-xl shadow-lg
                        animate-in slide-in-from-right-full duration-300
                        max-w-md
                        ${getToastStyle(toast.type)}
                    `}
                >
                    {/* 图标 */}
                    <span className="text-lg">{getToastIcon(toast.type)}</span>

                    {/* 消息 */}
                    <span className="text-sm font-medium flex-1">{toast.message}</span>

                    {/* 关闭按钮 */}
                    <button
                        onClick={() => onDismiss(toast.id)}
                        className="opacity-70 hover:opacity-100 transition-opacity"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            ))}
        </div>
    )
}

// ============================================================
// 工具函数
// ============================================================

function getToastStyle(type: Toast['type']): string {
    switch (type) {
        case 'success':
            return 'bg-green-500 text-white'
        case 'error':
            return 'bg-red-500 text-white'
        case 'warning':
            return 'bg-yellow-500 text-white'
        case 'info':
        default:
            return 'bg-gray-800 text-white'
    }
}

function getToastIcon(type: Toast['type']): string {
    switch (type) {
        case 'success':
            return '✓'
        case 'error':
            return '✕'
        case 'warning':
            return '⚠'
        case 'info':
        default:
            return 'ℹ'
    }
}
