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
import { AppIcon } from '@/components/ui/icons'

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
    showError: (code: string, details?: Record<string, unknown>) => void
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
    const t = useTranslations('errors')

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
    const showError = useCallback((code: string, details?: Record<string, unknown>) => {
        let message: string

        // 尝试翻译错误码
        try {
            const translationValues = Object.fromEntries(
                Object.entries(details || {}).map(([key, value]) => {
                    if (typeof value === 'string' || typeof value === 'number') {
                        return [key, value]
                    }
                    if (value instanceof Date) {
                        return [key, value]
                    }
                    return [key, String(value)]
                })
            )
            message = t(code, translationValues)
        } catch {
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
                        rounded-xl
                        animate-in slide-in-from-right-full duration-300
                        max-w-md
                        border
                        ${getToastStyle(toast.type)}
                    `}
                >
                    {/* 图标 */}
                    <span className="w-5 h-5 flex items-center justify-center">{getToastIcon(toast.type)}</span>

                    {/* 消息 */}
                    <span className="text-sm font-medium flex-1">{toast.message}</span>

                    {/* 关闭按钮 */}
                    <button
                        onClick={() => onDismiss(toast.id)}
                        className="inline-flex items-center justify-center bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground w-6 h-6 rounded-md p-0 opacity-70 hover:opacity-100 transition-opacity"
                    >
                        <AppIcon name="close" className="w-4 h-4" />
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
            return 'bg-emerald-100 text-emerald-700 border-[color:color-mix(in_srgb,#15803d_22%,transparent)]'
        case 'error':
            return 'bg-destructive/10 text-destructive border-[color:color-mix(in_srgb,#b91c1c_22%,transparent)]'
        case 'warning':
            return 'bg-amber-100 text-amber-700 border-[color:color-mix(in_srgb,#b45309_22%,transparent)]'
        case 'info':
        default:
            return 'bg-primary/10 text-primary border-[color:color-mix(in_srgb,#1d4ed8_22%,transparent)]'
    }
}

function getToastIcon(type: Toast['type']) {
    switch (type) {
        case 'success':
            return (
                <AppIcon name="check" className="w-4 h-4" />
            )
        case 'error':
            return (
                <AppIcon name="close" className="w-4 h-4" />
            )
        case 'warning':
            return (
                <AppIcon name="alertOutline" className="w-4 h-4" />
            )
        case 'info':
        default:
            return (
                <AppIcon name="infoCircle" className="w-4 h-4" />
            )
    }
}
