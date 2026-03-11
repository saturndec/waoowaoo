'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'

type StepStatus = 'empty' | 'active' | 'processing' | 'ready'

interface NavItemData {
    id: string
    icon: string
    label: string
    status: StepStatus
    href?: string  // 可选的链接地址
    disabled?: boolean  // 是否禁用（开发中）
    disabledLabel?: string  // 禁用时显示的提示文字
}

interface CapsuleNavProps {
    items: NavItemData[]
    activeId: string
    onItemClick: (id: string) => void
    projectId?: string  // 用于构建链接
    episodeId?: string  // 用于构建链接
}

/**
 * NavItem - 胶囊导航单项
 * 支持左键点击切换、中键/Ctrl+点击在新标签页打开
 */
function NavItem({
    active,
    onClick,
    label,
    status,
    href,
    disabled,
    disabledLabel
}: {
    active: boolean
    onClick: () => void
    label: string
    status: StepStatus
    href?: string
    disabled?: boolean
    disabledLabel?: string
}) {
    const handleClick = (e: React.MouseEvent) => {
        if (disabled) return
        if (e.button === 1 || e.ctrlKey || e.metaKey) {
            if (href) {
                window.open(href, '_blank')
            }
            return
        }
        onClick()
    }

    const handleAuxClick = (e: React.MouseEvent) => {
        if (disabled) return
        if (e.button === 1 && href) {
            e.preventDefault()
            window.open(href, '_blank')
        }
    }

    return (
        <div className="relative group">
            <button
                onClick={handleClick}
                onAuxClick={handleAuxClick}
                disabled={disabled}
                className={`
                    relative flex min-h-[46px] sm:min-h-[52px] items-center gap-1 px-3 sm:px-6 pt-2.5 sm:pt-3.5 pb-3 sm:pb-4 transition-all duration-300 ease-out
                    ${disabled
                        ? 'cursor-not-allowed'
                        : active
                            ? 'text-[var(--glass-tone-info-fg)]'
                            : 'text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-primary)]'}
                    ${!disabled && 'active:scale-[0.98]'}
                `}
            >
                {disabled ? (
                    <span className="text-base font-medium text-[var(--glass-text-tertiary)] opacity-80">
                        {label}
                    </span>
                ) : (
                    <span className="text-sm sm:text-base font-semibold">{label}</span>
                )}
                {/* 底部指示条 */}
                <span className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 h-[3px] rounded-full transition-all duration-300 ease-out
                    ${active
                        ? 'w-6 bg-gradient-to-r from-[var(--glass-accent-from)] to-[var(--glass-accent-to)] shadow-[0_2px_8px_var(--glass-accent-shadow-soft)]'
                        : 'w-0 bg-transparent'
                    }`}
                />
                {status === 'ready' && !disabled && (
                    <span className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full transition-colors
                        ${active ? 'bg-[var(--glass-tone-info-fg)]' : 'bg-[var(--glass-tone-success-fg)]'}`}
                    />
                )}
                {status === 'processing' && !disabled && (
                    <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[var(--glass-accent-from)] animate-pulse" />
                )}
            </button>
            {disabled && disabledLabel && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-[90]">
                    <div className="glass-surface-soft text-xs px-3 py-2 max-w-[min(16rem,80vw)] whitespace-normal text-center text-[var(--glass-text-primary)]">
                        {disabledLabel}
                    </div>
                    <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-2 h-2 bg-[var(--glass-bg-surface-strong)] rotate-45 border-l border-t border-[var(--glass-stroke-base)]" />
                </div>
            )}
        </div>
    )
}


/**
 * CapsuleNav - 胶囊形态悬浮导航
 * 支持中键和Ctrl+点击在新标签页打开
 */
export function CapsuleNav({ items, activeId, onItemClick, projectId, episodeId }: CapsuleNavProps) {
    // 构建每个导航项的链接地址
    const buildHref = (stageId: string): string | undefined => {
        if (!projectId) return undefined
        const params = new URLSearchParams()
        params.set('stage', stageId)
        if (episodeId) {
            params.set('episode', episodeId)
        }
        return `/workspace/${projectId}?${params.toString()}`
    }

    return (
        <nav className="fixed top-[calc(env(safe-area-inset-top,0px)+8.75rem)] sm:top-[calc(env(safe-area-inset-top,0px)+8rem)] left-1/2 -translate-x-1/2 z-[55] w-[calc(100vw-1rem)] sm:w-auto animate-fadeInDown">
            <div
                className="flex overflow-x-auto rounded-full px-1.5 sm:px-2 py-1 no-scrollbar"
                style={{
                    background: 'rgba(255,255,255,0.55)',
                    backdropFilter: 'blur(24px) saturate(1.6)',
                    WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
                    border: '1px solid rgba(255,255,255,0.45)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.06), 0 1.5px 6px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.7)',
                }}
            >
                {items.map((item) => (
                    <NavItem
                        key={item.id}
                        active={activeId === item.id}
                        onClick={() => onItemClick(item.id)}
                        label={item.label}
                        status={item.status}
                        href={buildHref(item.id)}
                        disabled={item.disabled}
                        disabledLabel={item.disabledLabel}
                    />
                ))}
            </div>
        </nav>
    )
}

/**
 * EpisodeSelector - 剧集选择器
 */
interface Episode {
    id: string
    title: string
    summary?: string
    status?: {
        story?: StepStatus
        script?: StepStatus
        visual?: StepStatus
    }
}

interface EpisodeSelectorProps {
    episodes: Episode[]
    currentId: string
    onSelect: (id: string) => void
    onAdd?: () => void
    onRename?: (id: string, newName: string) => void
    onDelete?: (id: string) => void
    projectName?: string  // 项目名称，显示在左上角
}

export function EpisodeSelector({
    episodes,
    currentId,
    onSelect,
    onAdd,
    onRename,
    onDelete,
    projectName
}: EpisodeSelectorProps) {
    const t = useTranslations('common')
    const [isOpen, setIsOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingName, setEditingName] = useState('')
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const currentEp = episodes.find(e => e.id === currentId) || episodes[0]
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    if (!currentEp) return null

    return (
        <div className="fixed top-[calc(env(safe-area-inset-top,0px)+8.75rem)] sm:top-[calc(env(safe-area-inset-top,0px)+8rem)] left-3 sm:left-6 z-[56] max-w-[calc(100vw-0.75rem)] sm:max-w-none" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="glass-btn-base glass-btn-secondary flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 transition-all group w-full sm:w-auto"
                style={{ borderRadius: '1.5rem' }}
            >
                <div className="glass-surface-soft flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold text-[var(--glass-tone-info-fg)]">
                    {t('episode')}
                </div>
                <div className="flex flex-col items-start text-left mr-2">
                    <span className="text-sm font-bold text-[var(--glass-text-primary)] line-clamp-1 max-w-[160px]">
                        {projectName || t('project')}
                    </span>
                    <span className="text-sm text-[var(--glass-text-secondary)] line-clamp-1 max-w-[160px]">
                        {currentEp.title}
                    </span>
                </div>
                <AppIcon name="chevronDown" className={`w-4 h-4 text-[var(--glass-text-tertiary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="glass-surface-modal absolute left-0 top-full mt-2 w-72 origin-top-left p-2 animate-fadeIn">
                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-1">
                        {episodes.map(ep => {
                            const statusColor = ep.status?.visual === 'ready'
                                ? 'bg-[var(--glass-tone-success-fg)]'
                                : ep.status?.script === 'ready'
                                    ? 'bg-[var(--glass-accent-from)]'
                                    : 'bg-[var(--glass-stroke-strong)]'

                            // 编辑模式
                            if (editingId === ep.id) {
                                return (
                                    <div key={ep.id} className="flex items-center gap-2 p-3 rounded-xl bg-[var(--glass-tone-info-bg)] border border-[var(--glass-stroke-focus)]">
                                        <div className={`w-2 h-10 rounded-full ${statusColor}`} />
                                        <input
                                            type="text"
                                            value={editingName}
                                            onChange={(e) => setEditingName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && editingName.trim()) {
                                                    onRename?.(ep.id, editingName.trim())
                                                    setEditingId(null)
                                                } else if (e.key === 'Escape') {
                                                    setEditingId(null)
                                                }
                                            }}
                                            className="flex-1 px-2 py-1 text-sm border border-[var(--glass-stroke-focus)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--glass-focus-ring-strong)]"
                                            autoFocus
                                        />
                                        <button
                                            onClick={() => {
                                                if (editingName.trim()) {
                                                    onRename?.(ep.id, editingName.trim())
                                                }
                                                setEditingId(null)
                                            }}
                                            className="w-7 h-7 rounded-lg bg-[var(--glass-accent-from)] text-white hover:bg-[var(--glass-accent-to)] flex items-center justify-center"
                                        >
                                            <AppIcon name="check" className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="w-7 h-7 rounded-lg bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-surface-strong)] flex items-center justify-center"
                                        >
                                            <AppIcon name="close" className="w-4 h-4" />
                                        </button>
                                    </div>
                                )
                            }

                            // 删除确认模式
                            if (deletingId === ep.id) {
                                return (
                                    <div key={ep.id} className="flex items-center gap-2 p-3 rounded-xl bg-[var(--glass-tone-danger-bg)] border border-[var(--glass-tone-danger-fg)]/30">
                                        <div className="flex-1 text-sm font-medium text-[var(--glass-tone-danger-fg)] truncate">
                                            {t('deleteEpisode')}：{ep.title}
                                        </div>
                                        <button
                                            onClick={() => {
                                                onDelete?.(ep.id)
                                                setDeletingId(null)
                                                setIsOpen(false)
                                            }}
                                            className="px-2 py-1 rounded-lg bg-[var(--glass-tone-danger-fg)] text-white text-xs font-medium hover:opacity-90 transition-opacity"
                                        >
                                            {t('deleteEpisodeConfirm')}
                                        </button>
                                        <button
                                            onClick={() => setDeletingId(null)}
                                            className="w-7 h-7 rounded-lg bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-surface-strong)] flex items-center justify-center"
                                        >
                                            <AppIcon name="close" className="w-4 h-4" />
                                        </button>
                                    </div>
                                )
                            }

                            return (
                                <div
                                    key={ep.id}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${ep.id === currentId
                                        ? 'bg-[var(--glass-tone-info-bg)] border border-[var(--glass-stroke-focus)]'
                                        : 'hover:bg-[var(--glass-bg-muted)] border border-transparent'
                                        }`}
                                >
                                    <button
                                        onClick={() => { onSelect(ep.id); setIsOpen(false); }}
                                        className="flex-1 flex items-center gap-3 text-left"
                                    >
                                        <div className={`w-2 h-10 rounded-full ${statusColor}`} />
                                        <div className="flex-1">
                                            <div className="font-bold text-[var(--glass-text-primary)] text-sm truncate">{ep.title}</div>
                                            {ep.summary && (
                                                <div className="text-xs text-[var(--glass-text-tertiary)] truncate">{ep.summary}</div>
                                            )}
                                        </div>
                                        {ep.id === currentId && (
                                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]">
                                                <AppIcon name="checkDot" className="h-2.5 w-2.5" />
                                            </span>
                                        )}
                                    </button>
                                    {onRename && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setEditingId(ep.id)
                                                setEditingName(ep.title)
                                            }}
                                            className="w-7 h-7 rounded-lg hover:bg-[var(--glass-bg-surface-strong)] flex items-center justify-center text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)] transition-colors"
                                            title={t('editEpisodeName')}
                                        >
                                            <AppIcon name="edit" className="w-4 h-4" />
                                        </button>
                                    )}
                                    {onDelete && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setDeletingId(ep.id)
                                            }}
                                            className="w-7 h-7 rounded-lg hover:bg-[var(--glass-tone-danger-bg)] flex items-center justify-center text-[var(--glass-text-tertiary)] hover:text-[var(--glass-tone-danger-fg)] transition-colors"
                                            title={t('deleteEpisode')}
                                        >
                                            <AppIcon name="trash" className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                    {onAdd && (
                        <>
                            <div className="h-px bg-[var(--glass-bg-muted)] my-2 mx-2" />
                            <button
                                onClick={() => { onAdd(); setIsOpen(false); }}
                                className="w-full flex items-center justify-center gap-2 p-2 rounded-xl text-[var(--glass-text-tertiary)] hover:text-[var(--glass-tone-info-fg)] hover:bg-[var(--glass-tone-info-bg)] font-medium text-sm transition-colors"
                            >
                                <span className="text-lg">+</span> {t('newEpisode')}
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

export default CapsuleNav
