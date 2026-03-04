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
                    relative flex min-h-[52px] items-center gap-1 px-6 pt-3.5 pb-4 transition-all duration-300 ease-out
                    ${disabled
                        ? 'cursor-not-allowed'
                        : active
                            ? 'text-primary'
                            : 'text-muted-foreground hover:text-foreground'}
                    ${!disabled && 'active:scale-[0.98]'}
                `}
            >
                {disabled ? (
                    <span className="text-base font-medium text-muted-foreground opacity-80">
                        {label}
                    </span>
                ) : (
                    <span className="text-base font-semibold">{label}</span>
                )}
                {/* 底部指示条 */}
                <span className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 h-[3px] rounded-full transition-all duration-300 ease-out
                    ${active
                        ? 'w-6 bg-gradient-to-r from-primary to-primary shadow-[0_2px_8px_rgba(59,130,246,0.28)]'
                        : 'w-0 bg-transparent'
                    }`}
                />
                {status === 'ready' && !disabled && (
                    <span className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full transition-colors
                        ${active ? 'bg-[#1d4ed8]' : 'bg-[#15803d]'}`}
                    />
                )}
                {status === 'processing' && !disabled && (
                    <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                )}
            </button>
            {disabled && disabledLabel && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                    <div className="rounded-xl border border-border bg-muted/30 text-xs px-3 py-2 whitespace-nowrap text-foreground">
                        {disabledLabel}
                    </div>
                    <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-2 h-2 bg-muted/40 rotate-45 border-l border-t border-border" />
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
        <nav className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-fadeInDown">
            <div
                className="flex rounded-full px-2 py-1"
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
        <div className="fixed top-20 left-6 z-[60]" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="inline-flex items-center justify-center border border-input bg-background hover:bg-accent hover:text-accent-foreground flex items-center gap-3 px-4 py-3 transition-all group"
                style={{ borderRadius: '1.5rem' }}
            >
                <div className="rounded-xl border border-border bg-muted/30 flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold text-primary">
                    {t('episode')}
                </div>
                <div className="flex flex-col items-start text-left mr-2">
                    <span className="text-sm font-bold text-foreground line-clamp-1 max-w-[160px]">
                        {projectName || t('project')}
                    </span>
                    <span className="text-sm text-muted-foreground line-clamp-1 max-w-[160px]">
                        {currentEp.title}
                    </span>
                </div>
                <AppIcon name="chevronDown" className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="rounded-xl border border-border bg-card shadow-lg absolute left-0 top-full mt-2 w-72 origin-top-left p-2 animate-fadeIn">
                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-1">
                        {episodes.map(ep => {
                            const statusColor = ep.status?.visual === 'ready'
                                ? 'bg-[#15803d]'
                                : ep.status?.script === 'ready'
                                    ? 'bg-primary'
                                    : 'bg-[var(--border)]'

                            // 编辑模式
                            if (editingId === ep.id) {
                                return (
                                    <div key={ep.id} className="flex items-center gap-2 p-3 rounded-xl bg-primary/10 border border-primary/40">
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
                                            className="flex-1 px-2 py-1 text-sm border border-primary/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                                            autoFocus
                                        />
                                        <button
                                            onClick={() => {
                                                if (editingName.trim()) {
                                                    onRename?.(ep.id, editingName.trim())
                                                }
                                                setEditingId(null)
                                            }}
                                            className="w-7 h-7 rounded-lg bg-primary text-white hover:bg-primary/90 flex items-center justify-center"
                                        >
                                            <AppIcon name="check" className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="w-7 h-7 rounded-lg bg-muted text-muted-foreground hover:bg-muted/40 flex items-center justify-center"
                                        >
                                            <AppIcon name="close" className="w-4 h-4" />
                                        </button>
                                    </div>
                                )
                            }

                            // 删除确认模式
                            if (deletingId === ep.id) {
                                return (
                                    <div key={ep.id} className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-[#b91c1c]/30">
                                        <div className="flex-1 text-sm font-medium text-destructive truncate">
                                            {t('deleteEpisode')}：{ep.title}
                                        </div>
                                        <button
                                            onClick={() => {
                                                onDelete?.(ep.id)
                                                setDeletingId(null)
                                                setIsOpen(false)
                                            }}
                                            className="px-2 py-1 rounded-lg bg-destructive text-white text-xs font-medium hover:opacity-90 transition-opacity"
                                        >
                                            {t('deleteEpisodeConfirm')}
                                        </button>
                                        <button
                                            onClick={() => setDeletingId(null)}
                                            className="w-7 h-7 rounded-lg bg-muted text-muted-foreground hover:bg-muted/40 flex items-center justify-center"
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
                                        ? 'bg-primary/10 border border-primary/40'
                                        : 'hover:bg-muted border border-transparent'
                                        }`}
                                >
                                    <button
                                        onClick={() => { onSelect(ep.id); setIsOpen(false); }}
                                        className="flex-1 flex items-center gap-3 text-left"
                                    >
                                        <div className={`w-2 h-10 rounded-full ${statusColor}`} />
                                        <div className="flex-1">
                                            <div className="font-bold text-foreground text-sm truncate">{ep.title}</div>
                                            {ep.summary && (
                                                <div className="text-xs text-muted-foreground truncate">{ep.summary}</div>
                                            )}
                                        </div>
                                        {ep.id === currentId && (
                                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary">
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
                                            className="w-7 h-7 rounded-lg hover:bg-muted/40 flex items-center justify-center text-muted-foreground hover:text-muted-foreground transition-colors"
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
                                            className="w-7 h-7 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
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
                            <div className="h-px bg-muted my-2 mx-2" />
                            <button
                                onClick={() => { onAdd(); setIsOpen(false); }}
                                className="w-full flex items-center justify-center gap-2 p-2 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 font-medium text-sm transition-colors"
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
