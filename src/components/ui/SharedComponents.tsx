'use client'

/**
 * AnimatedBackground - 流光极光背景动画
 * 用于页面全局背景
 */
export function AnimatedBackground() {
    return (
        <div className="fixed inset-0 -z-10 overflow-hidden bg-slate-50">
            <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] opacity-40 animate-aurora filter blur-[100px]">
                <div className="absolute top-0 left-0 w-1/2 h-1/2 bg-blue-300 rounded-full mix-blend-multiply animate-blob" />
                <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-cyan-300 rounded-full mix-blend-multiply animate-blob animation-delay-2000" />
                <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-indigo-300 rounded-full mix-blend-multiply animate-blob animation-delay-4000" />
            </div>
            <div className="absolute inset-0 bg-white/60 backdrop-blur-3xl" />
        </div>
    )
}

/**
 * GlassPanel - 毛玻璃卡片容器
 */
export function GlassPanel({
    children,
    className = ''
}: {
    children: React.ReactNode
    className?: string
}) {
    return (
        <div className={`
      bg-white/70 backdrop-blur-xl border border-white/60 shadow-xl shadow-slate-200/40 rounded-3xl
      ${className}
    `}>
            {children}
        </div>
    )
}

/**
 * Button - 通用按钮组件
 */
export function Button({
    children,
    primary = false,
    onClick,
    disabled = false,
    icon,
    className = ''
}: {
    children: React.ReactNode
    primary?: boolean
    onClick?: () => void
    disabled?: boolean
    icon?: React.ReactNode
    className?: string
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`
        flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all
        ${primary
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:-translate-y-0.5'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-blue-600'}
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
        >
            {icon && <span>{icon}</span>}
            {children}
        </button>
    )
}
