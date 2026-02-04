'use client'

import { useState, useRef, useEffect } from 'react'

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
    const [isExpanded, setIsExpanded] = useState(false)
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
            console.error('创建剧集失败:', err)
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
            console.error('重命名失败:', err)
        }
    }

    // 删除剧集
    const handleDelete = async (id: string) => {
        try {
            await onEpisodeDelete(id)
            setDeleteConfirmId(null)
        } catch (err) {
            console.error('删除失败:', err)
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
                        className="w-6 h-4 bg-gray-200 rounded-t cursor-ns-resize flex items-center justify-center hover:bg-gray-300 transition-colors"
                        onMouseDown={handleDragStart}
                        title="拖动调整位置"
                    >
                        <div className="flex gap-0.5">
                            <div className="w-0.5 h-1.5 bg-gray-400 rounded-full" />
                            <div className="w-0.5 h-1.5 bg-gray-400 rounded-full" />
                            <div className="w-0.5 h-1.5 bg-gray-400 rounded-full" />
                        </div>
                    </div>

                    {/* 展开按钮 */}
                    <div
                        className={`bg-white border border-gray-200 rounded-r-xl cursor-pointer hover:shadow-md transition-all flex items-center gap-1 px-2 py-3 ${isExpanded ? 'bg-blue-50 border-blue-200' : ''
                            }`}
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        <svg
                            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180 text-blue-500' : 'text-gray-400'}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className={`text-xs font-medium whitespace-nowrap ${isExpanded ? 'text-blue-600' : 'text-gray-500'}`}>
                            剧集
                        </span>
                    </div>
                </div>
            </div>

            {/* 弹出面板 */}
            {isExpanded && (
                <>
                    {/* 背景遮罩 */}
                    <div
                        className="fixed inset-0 bg-black/10 z-40"
                        onClick={() => setIsExpanded(false)}
                    />

                    {/* 侧边面板 */}
                    <div
                        className="fixed left-12 bg-white shadow-xl rounded-r-xl z-50 w-64 max-h-[70vh] overflow-hidden flex flex-col"
                        style={{ top: position.y - 50 }}
                    >
                        {/* 标题栏 */}
                        <div className="p-4 border-b bg-gray-50">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-bold text-gray-800 text-sm">📺 剧集列表</h3>
                                    <p className="text-xs text-gray-500 mt-0.5 truncate" title={projectName}>
                                        {projectName}
                                    </p>
                                </div>
                                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                                    {episodes.length}集
                                </span>
                            </div>
                        </div>

                        {/* 全局资产入口 */}
                        <div className="px-3 py-2 border-b">
                            <button
                                onClick={() => {
                                    onGlobalAssetsClick()
                                    setIsExpanded(false)
                                }}
                                className={`w-full py-2 px-3 rounded-lg text-left text-sm transition-colors flex items-center gap-2 ${isGlobalAssetsView
                                        ? 'bg-purple-500 text-white'
                                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                                    }`}
                            >
                                <span>🎨</span>
                                <span>全局资产管理</span>
                            </button>
                        </div>

                        {/* 剧集列表 */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-1">
                            {episodes.length === 0 ? (
                                <div className="text-center py-6 text-gray-400 text-sm">
                                    暂无剧集，点击下方创建
                                </div>
                            ) : (
                                episodes.map((ep) => (
                                    <div key={ep.id} className="group relative">
                                        {editingId === ep.id ? (
                                            // 编辑模式
                                            <div className="flex gap-1">
                                                <input
                                                    type="text"
                                                    value={editingName}
                                                    onChange={(e) => setEditingName(e.target.value)}
                                                    className="flex-1 px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleRename(ep.id)
                                                        if (e.key === 'Escape') setEditingId(null)
                                                    }}
                                                />
                                                <button
                                                    onClick={() => handleRename(ep.id)}
                                                    className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                                                >
                                                    ✓
                                                </button>
                                            </div>
                                        ) : deleteConfirmId === ep.id ? (
                                            // 删除确认
                                            <div className="bg-red-50 p-2 rounded-lg">
                                                <p className="text-xs text-red-600 mb-2">确定删除「{ep.name}」？</p>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => handleDelete(ep.id)}
                                                        className="flex-1 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                                                    >
                                                        删除
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteConfirmId(null)}
                                                        className="flex-1 py-1 bg-gray-200 text-gray-600 text-xs rounded hover:bg-gray-300"
                                                    >
                                                        取消
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            // 正常显示
                                            <button
                                                onClick={() => {
                                                    onEpisodeSelect(ep.id)
                                                    setIsExpanded(false)
                                                }}
                                                className={`w-full py-2 px-3 rounded-lg text-left text-sm transition-colors flex items-center gap-2 ${currentEpisodeId === ep.id && !isGlobalAssetsView
                                                        ? 'bg-blue-500 text-white'
                                                        : 'hover:bg-gray-50 text-gray-600'
                                                    }`}
                                            >
                                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${currentEpisodeId === ep.id && !isGlobalAssetsView ? 'bg-white/20' : 'bg-gray-100'
                                                    }`}>
                                                    {ep.episodeNumber}
                                                </span>
                                                <span className="truncate flex-1">{ep.name}</span>

                                                {/* 操作按钮 */}
                                                <div className={`flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${currentEpisodeId === ep.id && !isGlobalAssetsView ? 'text-white/70 hover:text-white' : 'text-gray-400'
                                                    }`}>
                                                    <span
                                                        className="cursor-pointer hover:scale-110 transition-transform"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setEditingId(ep.id)
                                                            setEditingName(ep.name)
                                                        }}
                                                        title="重命名"
                                                    >
                                                        ✏️
                                                    </span>
                                                    <span
                                                        className="cursor-pointer hover:scale-110 transition-transform"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setDeleteConfirmId(ep.id)
                                                        }}
                                                        title="删除"
                                                    >
                                                        🗑️
                                                    </span>
                                                </div>
                                            </button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        {/* 添加剧集 */}
                        <div className="p-3 border-t bg-gray-50">
                            {isCreating ? (
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={newEpisodeName}
                                        onChange={(e) => setNewEpisodeName(e.target.value)}
                                        placeholder="输入剧集名称..."
                                        className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                                        <button
                                            onClick={handleCreate}
                                            disabled={!newEpisodeName.trim()}
                                            className="flex-1 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            创建
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsCreating(false)
                                                setNewEpisodeName('')
                                            }}
                                            className="flex-1 py-1.5 bg-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-300"
                                        >
                                            取消
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsCreating(true)}
                                    className="w-full py-2 px-3 rounded-lg text-sm bg-green-50 text-green-600 hover:bg-green-100 transition-colors flex items-center justify-center gap-1"
                                >
                                    <span>+</span>
                                    <span>添加剧集</span>
                                </button>
                            )}
                        </div>
                    </div>
                </>
            )}
        </>
    )
}
