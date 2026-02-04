'use client'
import { useTranslations } from 'next-intl'

/**
 * PanelActionButtons - 面板间操作按钮组
 * 包含两个按钮：
 * - + 插入分镜（原有功能）
 * - 🎥 镜头变体（新功能）
 */

interface PanelActionButtonsProps {
    onInsertPanel: () => void
    onVariant: () => void
    disabled?: boolean
    hasImage: boolean // 原镜头是否有图片（没图片不能做变体）
}

export default function PanelActionButtons({
    onInsertPanel,
    onVariant,
    disabled,
    hasImage
}: PanelActionButtonsProps) {
    const t = useTranslations('storyboard')
    return (
        <div className="flex flex-col items-center gap-1">
            {/* 插入分镜按钮 */}
            <button
                onClick={onInsertPanel}
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
                title={t('panelActions.insertHere')}
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
                    {t('panelActions.insertPanel')}
                </span>
            </button>

            {/* 镜头变体按钮 */}
            <button
                onClick={onVariant}
                disabled={disabled || !hasImage}
                className={`
                    group relative w-7 h-7 rounded-full
                    flex items-center justify-center
                    transition-all duration-200 ease-out
                    border shadow-sm
                    ${disabled || !hasImage
                        ? 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed'
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-purple-500 hover:text-white hover:border-purple-500 hover:scale-110 hover:shadow-lg hover:shadow-purple-500/30'
                    }
                `}
                title={hasImage ? t('panelActions.generateVariant') : t('panelActions.needImage')}
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>

                {/* Hover 时显示提示 */}
                <span className={`
                    absolute -top-8 left-1/2 -translate-x-1/2
                    px-2 py-1 text-xs text-white bg-slate-700 rounded
                    opacity-0 group-hover:opacity-100
                    transition-opacity duration-200
                    whitespace-nowrap pointer-events-none
                    ${disabled || !hasImage ? 'hidden' : ''}
                `}>
                    {t('panelActions.panelVariant')}
                </span>
            </button>
        </div>
    )
}
