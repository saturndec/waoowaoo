'use client'
import { logError as _ulogError } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'

import { useState, useRef, useEffect } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Episode {
    id: string
    episodeNumber: number
    name: string
    description?: string | null
}

interface SidebarProps {
    projectId: string
    projectName: string
    episodes: Episode[]
    currentEpisodeId: string | null
    onEpisodeSelect: (id: string) => void
    onEpisodeCreate: (name: string, description?: string) => Promise<void>
    onEpisodeDelete: (id: string) => Promise<void>
    onEpisodeRename: (id: string, newName: string) => Promise<void>
    onGlobalAssetsClick: () => void
    isGlobalAssetsView: boolean
}

export default function Sidebar({
    projectId,
    projectName,
    episodes,
    currentEpisodeId,
    onEpisodeSelect,
    onEpisodeCreate,
    onEpisodeDelete,
    onEpisodeRename,
    onGlobalAssetsClick,
    isGlobalAssetsView
}: SidebarProps) {
    const t = useTranslations('workspaceDetail')
    const [isExpanded, setIsExpanded] = useState(false)
    void projectId
    const [isCreating, setIsCreating] = useState(false)
    const [newEpisodeName, setNewEpisodeName] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingName, setEditingName] = useState('')
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

    // 可拖动位置
    const [position, setPosition] = useState({ y: 200 }) // 初始Y位置
    const [isDragging, setIsDragging] = useState(false)
    const dragStartY = useRef(0)
    const dragStartPos = useRef(0)

    // 拖动逻辑
    const handleDragStart = (e: React.MouseEvent) => {
        e.preventDefault()
        setIsDragging(true)
        dragStartY.current = e.clientY
        dragStartPos.current = position.y
    }

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return
            const deltaY = e.clientY - dragStartY.current
            const newY = Math.max(100, Math.min(window.innerHeight - 200, dragStartPos.current + deltaY))
            setPosition({ y: newY })
        }

        const handleMouseUp = () => {
            setIsDragging(false)
        }

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isDragging])

    // 创建剧集
    const handleCreate = async () => {
        if (!newEpisodeName.trim()) return
        try {
            await onEpisodeCreate(newEpisodeName.trim())
            setNewEpisodeName('')
            setIsCreating(false)
        } catch (err) {
            _ulogError('创建剧集失败:', err)
        }
    }

    // 重命名剧集
    const handleRename = async (id: string) => {
        if (!editingName.trim()) return
        try {
            await onEpisodeRename(id, editingName.trim())
            setEditingId(null)
            setEditingName('')
        } catch (err) {
            _ulogError('重命名失败:', err)
        }
    }

    // 删除剧集
    const handleDelete = async (id: string) => {
        try {
            await onEpisodeDelete(id)
            setDeleteConfirmId(null)
        } catch (err) {
            _ulogError('删除失败:', err)
        }
    }

    return (
        <>
            {/* 触发条 - 固定在左侧，可拖动 */}
            <div
                className="fixed left-0 z-50"
                style={{ top: position.y }}
            >
                {/* 拖动手柄 + 触发按钮 */}
                <div className="flex flex-col items-center">
                    {/* 拖动手柄 */}
                    <div
                        className="flex h-4 w-7 cursor-ns-resize items-center justify-center rounded-r-md rounded-t-md border border-border border-l-0 bg-muted transition-colors hover:bg-accent"
                        onMouseDown={handleDragStart}
                        title={t('sidebar.dragToMove')}
                    >
                        <div className="flex gap-0.5">
                            <div className="h-1.5 w-0.5 rounded-full bg-muted-foreground" />
                            <div className="h-1.5 w-0.5 rounded-full bg-muted-foreground" />
                            <div className="h-1.5 w-0.5 rounded-full bg-muted-foreground" />
                        </div>
                    </div>

                    {/* 展开按钮 */}
                    <Button
                        type="button"
                        variant={isExpanded ? 'secondary' : 'outline'}
                        size="sm"
                        className={cn(
                            'h-10 rounded-l-none rounded-r-xl border-l-0 px-2',
                            isExpanded && 'text-foreground',
                        )}
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        <AppIcon name="chevronRight" className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')} />
                        <span className="whitespace-nowrap text-xs font-medium">{t('episode')}</span>
                    </Button>
                </div>
            </div>

            {/* 弹出面板 */}
            {isExpanded && (
                <>
                    {/* 背景遮罩 */}
                    <div
                        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                        onClick={() => setIsExpanded(false)}
                    />

                    {/* 侧边面板 */}
                    <Card
                        className="fixed left-12 z-50 flex w-72 max-h-[70vh] flex-col overflow-hidden rounded-l-none rounded-r-xl"
                        style={{ top: position.y - 50 }}
                    >
                        {/* 标题栏 */}
                        <div className="border-b border-border bg-muted/40 p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                                        <AppIcon name="monitor" className="h-4 w-4 text-muted-foreground" />
                                        <span>{t('sidebar.listTitle')}</span>
                                    </h3>
                                    <p className="mt-0.5 truncate text-xs text-muted-foreground" title={projectName}>
                                        {projectName}
                                    </p>
                                </div>
                                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                                    {t('sidebar.episodeCount', { count: episodes.length })}
                                </span>
                            </div>
                        </div>

                        {/* 全局资产入口 */}
                        <div className="border-b border-border px-3 py-2">
                            <Button
                                type="button"
                                onClick={() => {
                                    onGlobalAssetsClick()
                                    setIsExpanded(false)
                                }}
                                variant={isGlobalAssetsView ? 'secondary' : 'ghost'}
                                className="h-9 w-full justify-start gap-2 text-sm"
                            >
                                <AppIcon name="coins" className="h-4 w-4" />
                                <span>{t('globalAssets')}</span>
                            </Button>
                        </div>

                        {/* 剧集列表 */}
                        <div className="flex-1 space-y-1 overflow-y-auto p-3">
                            {episodes.length === 0 ? (
                                <div className="py-6 text-center text-sm text-muted-foreground">
                                    {t('sidebar.empty')}
                                </div>
                            ) : (
                                episodes.map((ep) => (
                                    <div key={ep.id} className="group relative">
                                        {editingId === ep.id ? (
                                            // 编辑模式
                                            <div className="flex gap-1">
                                                <Input
                                                    type="text"
                                                    value={editingName}
                                                    onChange={(e) => setEditingName(e.target.value)}
                                                    className="h-8 flex-1 px-2 py-1.5 text-sm"
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleRename(ep.id)
                                                        if (e.key === 'Escape') setEditingId(null)
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    onClick={() => handleRename(ep.id)}
                                                    size="sm"
                                                    className="h-8 px-2 text-xs"
                                                >
                                                    {t('sidebar.save')}
                                                </Button>
                                            </div>
                                        ) : deleteConfirmId === ep.id ? (
                                            // 删除确认
                                            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2">
                                                <p className="mb-2 text-xs text-destructive">{t('sidebar.deleteConfirm', { name: ep.name })}</p>
                                                <div className="flex gap-1">
                                                    <Button
                                                        type="button"
                                                        onClick={() => handleDelete(ep.id)}
                                                        variant="destructive"
                                                        size="sm"
                                                        className="h-7 flex-1 text-xs"
                                                    >
                                                        {t('sidebar.delete')}
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        onClick={() => setDeleteConfirmId(null)}
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 flex-1 text-xs"
                                                    >
                                                        {t('sidebar.cancel')}
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            // 正常显示
                                            <div
                                                className={cn(
                                                    'flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors',
                                                    currentEpisodeId === ep.id && !isGlobalAssetsView
                                                        ? 'border-primary/30 bg-primary/10 text-foreground'
                                                        : 'border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-muted/40',
                                                )}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        onEpisodeSelect(ep.id)
                                                        setIsExpanded(false)
                                                    }}
                                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                                >
                                                    <span className={cn(
                                                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                                                        currentEpisodeId === ep.id && !isGlobalAssetsView
                                                            ? 'bg-primary/20 text-primary'
                                                            : 'bg-muted text-muted-foreground',
                                                    )}>
                                                        {ep.episodeNumber}
                                                    </span>
                                                    <span className="truncate text-sm">{ep.name}</span>
                                                </button>

                                                {/* 操作按钮 */}
                                                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={() => {
                                                            setEditingId(ep.id)
                                                            setEditingName(ep.name)
                                                        }}
                                                        title={t('sidebar.rename')}
                                                    >
                                                        <AppIcon name="editSquare" className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 hover:text-destructive"
                                                        onClick={() => {
                                                            setDeleteConfirmId(ep.id)
                                                        }}
                                                        title={t('sidebar.delete')}
                                                    >
                                                        <AppIcon name="trash" className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        {/* 添加剧集 */}
                        <div className="border-t border-border bg-muted/40 p-3">
                            {isCreating ? (
                                <div className="space-y-2">
                                    <Input
                                        type="text"
                                        value={newEpisodeName}
                                        onChange={(e) => setNewEpisodeName(e.target.value)}
                                        placeholder={t('sidebar.newEpisodePlaceholder')}
                                        className="h-9 w-full text-sm"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCreate()
                                            if (e.key === 'Escape') {
                                                setIsCreating(false)
                                                setNewEpisodeName('')
                                            }
                                        }}
                                    />
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            onClick={handleCreate}
                                            disabled={!newEpisodeName.trim()}
                                            className="h-8 flex-1 text-sm"
                                        >
                                            {t('sidebar.create')}
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={() => {
                                                setIsCreating(false)
                                                setNewEpisodeName('')
                                            }}
                                            variant="outline"
                                            className="h-8 flex-1 text-sm"
                                        >
                                            {t('sidebar.cancel')}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <Button
                                    type="button"
                                    onClick={() => setIsCreating(true)}
                                    variant="secondary"
                                    className="h-9 w-full justify-center gap-1 text-sm"
                                >
                                    <AppIcon name="plus" className="h-4 w-4" />
                                    <span>{t('sidebar.addEpisode')}</span>
                                </Button>
                            )}
                        </div>
                    </Card>
                </>
            )}
        </>
    )
}
