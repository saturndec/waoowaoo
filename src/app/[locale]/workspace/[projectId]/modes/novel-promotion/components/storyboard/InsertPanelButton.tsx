'use client'

/**
 * InsertPanelButton - 面板间插入按钮
 * 在两个 PanelCard 之间显示一个 + 号按钮
 */

interface InsertPanelButtonProps {
    onClick: () => void
    disabled?: boolean
}

export default function InsertPanelButton({ onClick, disabled }: InsertPanelButtonProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`
                group relative w-7 h-7 rounded-full
                flex items-center justify-center
                transition-all duration-200 ease-out
                border shadow-sm
                ${disabled
                    ? 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-blue-500 hover:text-white hover:border-blue-500 hover:scale-110 hover:shadow-lg hover:shadow-blue-500/30'
                }
            `}
            title="在此处插入分镜"
        >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>

            {/* Hover 时显示提示 */}
            <span className={`
                absolute -top-8 left-1/2 -translate-x-1/2
                px-2 py-1 text-xs text-white bg-slate-700 rounded
                opacity-0 group-hover:opacity-100
                transition-opacity duration-200
                whitespace-nowrap pointer-events-none
                ${disabled ? 'hidden' : ''}
            `}>
                插入分镜
            </span>
        </button>
    )
}
