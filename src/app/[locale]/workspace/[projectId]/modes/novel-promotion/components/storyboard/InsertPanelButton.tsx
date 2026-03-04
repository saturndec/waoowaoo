'use client'

import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
/**
 * InsertPanelButton - 面板间插入按钮
 * 在两个 PanelCard 之间显示一个 + 号按钮
 */

interface InsertPanelButtonProps {
    onClick: () => void
    disabled?: boolean
}

export default function InsertPanelButton({ onClick, disabled }: InsertPanelButtonProps) {
    const t = useTranslations('storyboard')
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`
                group relative h-7 w-7 rounded-full
                inline-flex items-center justify-center border border-border
                bg-card text-muted-foreground
                shadow-sm transition-all duration-200 ease-out
                flex items-center justify-center
                ${disabled
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 hover:bg-primary/10'
                }
            `}
            title={t('panelActions.insertHere')}
        >
            <AppIcon name="plus" className="w-4 h-4" />

            {/* Hover 时显示提示 */}
            <span className={`
                absolute -top-8 left-1/2 -translate-x-1/2
                px-2 py-1 text-xs text-white bg-black/55 rounded
                opacity-0 group-hover:opacity-100
                transition-opacity duration-200
                whitespace-nowrap pointer-events-none
                ${disabled ? 'hidden' : ''}
            `}>
                {t('panelActions.insertPanel')}
            </span>
        </button>
    )
}
