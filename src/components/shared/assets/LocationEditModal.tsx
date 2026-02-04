'use client'

/**
 * 共享的场景编辑弹窗组件
 * 支持 Asset Hub 和项目级两种模式
 */

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { shouldShowError } from '@/lib/error-utils'

export interface LocationEditModalProps {
    mode: 'asset-hub' | 'project'
    locationId: string
    locationName: string
    description: string
    // Asset Hub 模式使用
    summary?: string
    imageIndex?: number
    // 项目模式使用
    projectId?: string
    descriptionIndex?: number
    isGenerating?: boolean
    onClose: () => void
    onSave: (locationId: string) => void
    onUpdate?: (newDescription: string) => void
    onNameUpdate?: (newName: string) => void
    onRefresh?: () => void
}

export function LocationEditModal({
    mode,
    locationId,
    locationName,
    description,
    summary,
    imageIndex,
    projectId,
    descriptionIndex,
    isGenerating = false,
    onClose,
    onSave,
    onUpdate,
    onNameUpdate,
    onRefresh
}: LocationEditModalProps) {
    const t = useTranslations('assets')

    // 统一使用 imgIndex
    const imgIndex = mode === 'asset-hub' ? (imageIndex ?? 0) : (descriptionIndex ?? 0)

    // 根据模式确定 API 路径
    const getApiPath = (endpoint: string) => {
        if (mode === 'asset-hub') {
            return `/api/asset-hub/${endpoint}`
        }
        return `/api/novel-promotion/${projectId}/${endpoint}`
    }

    const [editingName, setEditingName] = useState(locationName)
    const [editingDescription, setEditingDescription] = useState(description || summary || '')
    const [aiModifyInstruction, setAiModifyInstruction] = useState('')
    const [isAiModifying, setIsAiModifying] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isNameUpdating, setIsNameUpdating] = useState(false)
    const [isWaitingForGeneration, setIsWaitingForGeneration] = useState(false)
    const [wasGenerating, setWasGenerating] = useState(false)

    // 🔥 内部查询 generating 状态（替代外部 prop 传递）
    const [internalGenerating, setInternalGenerating] = useState(isGenerating)

    // 🔥 定时轮询获取最新的 generating 状态
    useEffect(() => {
        // 只在项目模式下轮询
        if (mode !== 'project' || !projectId || !locationId) return

        let isMounted = true

        const checkGeneratingStatus = async () => {
            try {
                const res = await fetch(`/api/novel-promotion/${projectId}/location-status?locationId=${locationId}&imageIndex=${imgIndex}`)
                if (!res.ok) return
                const data = await res.json()
                if (isMounted) {
                    setInternalGenerating(data.generating ?? false)
                }
            } catch {
                // 静默处理错误
            }
        }

        // 立即检查一次
        checkGeneratingStatus()

        // 每 2 秒检查一次
        const interval = setInterval(checkGeneratingStatus, 2000)

        return () => {
            isMounted = false
            clearInterval(interval)
        }
    }, [mode, projectId, locationId, imgIndex])

    // 使用内部状态或外部 prop
    const effectiveGenerating = mode === 'project' ? internalGenerating : isGenerating

    // 监听生成状态，当生成完成时关闭弹窗（仅项目模式）
    useEffect(() => {
        if (mode === 'project' && isWaitingForGeneration && wasGenerating && !effectiveGenerating) {
            setIsWaitingForGeneration(false)
            setWasGenerating(false)
            onRefresh?.()
            onClose()
        } else if (effectiveGenerating) {
            setWasGenerating(true)
        }
    }, [mode, effectiveGenerating, isWaitingForGeneration, wasGenerating, onRefresh, onClose])

    // AI 修改描述
    const handleAiModify = async () => {
        if (!aiModifyInstruction.trim()) return

        try {
            setIsAiModifying(true)

            const body = mode === 'asset-hub'
                ? {
                    locationId,
                    imageIndex: imgIndex,
                    currentDescription: editingDescription,
                    modifyInstruction: aiModifyInstruction
                }
                : {
                    locationId,
                    currentDescription: editingDescription,
                    modifyInstruction: aiModifyInstruction
                }

            const res = await fetch(getApiPath('ai-modify-location'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || t('modal.modifyFailed'))
            }

            const data = await res.json()
            const newDescription = data.modifiedDescription || data.prompt

            setEditingDescription(newDescription)
            setAiModifyInstruction('')
            onUpdate?.(newDescription)
        } catch (error: any) {
            if (shouldShowError(error)) {
                alert(t('modal.modifyFailed') + ': ' + error.message)
            }
        } finally {
            setIsAiModifying(false)
        }
    }

    // 保存名字
    const handleSaveName = async () => {
        if (!editingName.trim() || editingName === locationName) return

        try {
            setIsNameUpdating(true)

            if (mode === 'asset-hub') {
                await fetch(`/api/asset-hub/locations/${locationId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: editingName.trim() })
                })

                // 后台更新图片标签
                fetch('/api/asset-hub/update-asset-label', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'location',
                        id: locationId,
                        newName: editingName.trim()
                    })
                }).catch(e => console.error('更新图片标签失败:', e))
            } else {
                await fetch(getApiPath('location'), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        locationId,
                        name: editingName.trim()
                    })
                })

                // 后台更新图片标签
                fetch(getApiPath('update-asset-label'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'location',
                        id: locationId,
                        newName: editingName.trim()
                    })
                }).then(() => onRefresh?.()).catch(e => console.error('更新图片标签失败:', e))
            }

            onNameUpdate?.(editingName.trim())
            onRefresh?.()
        } catch (error: any) {
            if (shouldShowError(error)) {
                alert(t('modal.saveName') + t('errors.failed'))
            }
        } finally {
            setIsNameUpdating(false)
        }
    }

    // 仅保存（不生成图片）
    const handleSaveOnly = async () => {
        try {
            setIsSaving(true)

            if (mode === 'asset-hub') {
                // Asset Hub: 保存名字和 summary
                await fetch(`/api/asset-hub/locations/${locationId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: editingName.trim(),
                        summary: editingDescription
                    })
                })
            } else {
                // 项目模式
                if (editingName.trim() !== locationName) {
                    await fetch(getApiPath('location'), {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            locationId,
                            name: editingName.trim()
                        })
                    })
                }

                await fetch(getApiPath('location'), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        locationId,
                        imageIndex: imgIndex,
                        description: editingDescription
                    })
                })
            }

            onUpdate?.(editingDescription)
            onRefresh?.()
            onClose()
        } catch (error: any) {
            if (shouldShowError(error)) {
                alert(t('errors.saveFailed'))
            }
        } finally {
            setIsSaving(false)
        }
    }

    // 保存并生成图片
    const handleSaveAndGenerate = async () => {
        const descToSave = editingDescription
        const nameToSave = editingName.trim()

        // 立即关闭弹窗
        onClose()

            // 后台执行保存和生成
            ; (async () => {
                try {
                    if (mode === 'asset-hub') {
                        // 保存名字和描述
                        await fetch(`/api/asset-hub/locations/${locationId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                name: nameToSave,
                                summary: descToSave
                            })
                        })
                    } else {
                        // 如果名字有变化，先保存名字
                        if (nameToSave && nameToSave !== locationName) {
                            await fetch(getApiPath('location'), {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    locationId,
                                    name: nameToSave
                                })
                            })
                            onNameUpdate?.(nameToSave)
                        }

                        // 保存描述
                        await fetch(getApiPath('location'), {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                locationId,
                                imageIndex: imgIndex,
                                description: descToSave
                            })
                        })
                    }

                    onUpdate?.(descToSave)
                    onSave(locationId)
                    onRefresh?.()
                } catch (error: any) {
                    console.error('保存并生成失败:', error)
                    if (shouldShowError(error)) {
                        alert(t('errors.saveFailed'))
                    }
                }
            })()
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    {/* 标题 */}
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900">
                            {t('modal.editLocation')} - {locationName}
                        </h3>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* 场景名字编辑 */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                            {t('location.name')}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder={t('modal.namePlaceholder')}
                            />
                            {editingName !== locationName && (
                                <button
                                    onClick={handleSaveName}
                                    disabled={isNameUpdating || !editingName.trim()}
                                    className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
                                >
                                    {isNameUpdating ? t('smartImport.preview.saving') : t('modal.saveName')}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* AI 修改区域 */}
                    <div className="space-y-2 bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <label className="block text-sm font-medium text-blue-900 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            {t('modal.smartModify')}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={aiModifyInstruction}
                                onChange={(e) => setAiModifyInstruction(e.target.value)}
                                placeholder={t('modal.modifyPlaceholder')}
                                className="flex-1 px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                disabled={isAiModifying}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        handleAiModify()
                                    }
                                }}
                            />
                            <button
                                onClick={handleAiModify}
                                disabled={isAiModifying || !aiModifyInstruction.trim()}
                                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                            >
                                {isAiModifying ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        {t('modal.modifying')}
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        {t('modal.smartModify')}
                                    </>
                                )}
                            </button>
                        </div>
                        <p className="text-xs text-blue-700">
                            💡 {t('modal.aiLocationTip')}
                        </p>
                    </div>

                    {/* 描述编辑 */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                            {t('location.description')}
                        </label>
                        <textarea
                            value={editingDescription}
                            onChange={(e) => setEditingDescription(e.target.value)}
                            className="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                            placeholder={t('modal.descPlaceholder')}
                            disabled={isAiModifying}
                        />
                    </div>

                    {/* 生成中提示（仅项目模式） */}
                    {mode === 'project' && isWaitingForGeneration && (
                        <div className="text-sm text-blue-600 flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-lg">
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {t('modal.generatingAutoClose')}
                        </div>
                    )}
                </div>

                {/* 固定底部操作按钮区 */}
                <div className="flex gap-3 justify-end p-4 border-t bg-gray-50 rounded-b-lg flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        disabled={isSaving || isWaitingForGeneration}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleSaveOnly}
                        disabled={isSaving || isWaitingForGeneration || !editingDescription.trim()}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isSaving ? (
                            <>
                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                {t('smartImport.preview.saving')}
                            </>
                        ) : (
                            t('modal.saveOnly')
                        )}
                    </button>
                    <button
                        onClick={handleSaveAndGenerate}
                        disabled={isSaving || isWaitingForGeneration || !editingDescription.trim()}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isWaitingForGeneration ? (
                            <>
                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                {t('storyboard.group.generating')}
                            </>
                        ) : (
                            t('modal.saveAndGenerate')
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
