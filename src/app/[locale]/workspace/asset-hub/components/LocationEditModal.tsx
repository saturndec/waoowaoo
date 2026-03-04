'use client'
import { logError as _ulogError } from '@/lib/logging/core'

/**
 * 资产中心 - 场景编辑弹窗
 * 与项目级资产库的 LocationEditModal 保持一致
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { shouldShowError } from '@/lib/error-utils'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
    useRefreshGlobalAssets,
    useUpdateLocationName,
    useAiModifyLocationDescription,
    useUpdateLocationSummary,
} from '@/lib/query/hooks'

interface LocationEditModalProps {
    locationId: string
    locationName: string
    summary: string
    imageIndex: number
    description: string
    onClose: () => void
    onSave: () => void  // 触发生成图片
}

export function LocationEditModal({
    locationId,
    locationName,
    summary,
    imageIndex,
    description,
    onClose,
    onSave
}: LocationEditModalProps) {
    // 🔥 使用 React Query
    const onRefresh = useRefreshGlobalAssets()
    const updateName = useUpdateLocationName()
    const modifyDescription = useAiModifyLocationDescription()
    const updateSummary = useUpdateLocationSummary()
    const t = useTranslations('assets')

    const [editingName, setEditingName] = useState(locationName)
    const [editingDescription, setEditingDescription] = useState(description || summary || '')
    const [aiModifyInstruction, setAiModifyInstruction] = useState('')
    const [isAiModifying, setIsAiModifying] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const aiModifyingState = isAiModifying
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'modify',
            resource: 'image',
            hasOutput: true,
        })
        : null
    const savingState = isSaving
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'modify',
            resource: 'image',
            hasOutput: false,
        })
        : null

    // AI 修改描述
    const handleAiModify = async () => {
        if (!aiModifyInstruction.trim()) return

        try {
            setIsAiModifying(true)
            const data = await modifyDescription.mutateAsync({
                locationId,
                imageIndex,
                currentDescription: editingDescription,
                modifyInstruction: aiModifyInstruction,
            })
            setEditingDescription(data.modifiedDescription ?? '')
            setAiModifyInstruction('')
        } catch (error: unknown) {
            if (shouldShowError(error)) {
                const message = error instanceof Error ? error.message : String(error)
                alert(t('modal.modifyFailed') + ': ' + message)
            }
        } finally {
            setIsAiModifying(false)
        }
    }

    // 保存名字
    const handleSaveName = () => {
        if (!editingName.trim() || editingName === locationName) return

        updateName.mutate(
            { locationId, name: editingName.trim() },
            {
                onError: (error) => {
                    if (shouldShowError(error)) {
                        alert(t('modal.saveName') + t('errors.failed'))
                    }
                }
            }
        )
    }

    // 仅保存（不生成图片）
    const handleSaveOnly = async () => {
        try {
            setIsSaving(true)

            // 如果名字变了，先保存名字和 summary
            if (editingName.trim() !== locationName) {
                await updateName.mutateAsync({ locationId, name: editingName.trim() })
                await updateSummary.mutateAsync({ locationId, summary: editingDescription })
            } else {
                // 只保存 summary
                await updateSummary.mutateAsync({ locationId, summary: editingDescription })
            }

            onRefresh()
            onClose()
        } catch (error: unknown) {
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
                    // 保存名字和描述
                    if (nameToSave !== locationName) {
                        await updateName.mutateAsync({ locationId, name: nameToSave })
                    }
                    await updateSummary.mutateAsync({ locationId, summary: descToSave })

                    // 触发生成
                    onSave()
                    onRefresh()
                } catch (error: unknown) {
                    _ulogError('保存并生成失败:', error)
                    if (shouldShowError(error)) {
                        alert(t('errors.saveFailed'))
                    }
                }
            })()
    }

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
            <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-lg">
                        {t('modal.editLocation')} - {locationName}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* 场景名字编辑 */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-foreground">
                            {t('location.name')}
                        </label>
                        <div className="flex gap-2">
                            <Input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="flex-1"
                                placeholder={t('modal.namePlaceholder')}
                            />
                            {editingName !== locationName && (
                                <Button
                                    type="button"
                                    onClick={handleSaveName}
                                    disabled={updateName.isPending || !editingName.trim()}
                                    variant="secondary"
                                    className="whitespace-nowrap"
                                >
                                    {updateName.isPending ? t('smartImport.preview.saving') : t('modal.saveName')}
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* AI 修改区域 */}
                    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
                        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <AppIcon name="bolt" className="h-4 w-4" />
                            {t('modal.smartModify')}
                        </label>
                        <div className="flex gap-2">
                            <Input
                                type="text"
                                value={aiModifyInstruction}
                                onChange={(e) => setAiModifyInstruction(e.target.value)}
                                placeholder={t('modal.modifyPlaceholder')}
                                className="flex-1"
                                disabled={isAiModifying}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        handleAiModify()
                                    }
                                }}
                            />
                            <Button
                                type="button"
                                onClick={handleAiModify}
                                disabled={isAiModifying || !aiModifyInstruction.trim()}
                                className="gap-2 whitespace-nowrap"
                            >
                                {isAiModifying ? (
                                    <TaskStatusInline state={aiModifyingState} className="text-primary-foreground [&>span]:text-primary-foreground [&_svg]:text-primary-foreground" />
                                ) : (
                                    <>
                                        <AppIcon name="bolt" className="h-4 w-4" />
                                        {t('modal.smartModify')}
                                    </>
                                )}
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t('modal.aiLocationTip')}
                        </p>
                    </div>

                    {/* 描述编辑 */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-foreground">
                            {t('location.description')}
                        </label>
                        <Textarea
                            value={editingDescription}
                            onChange={(e) => setEditingDescription(e.target.value)}
                            className="h-48 w-full resize-none"
                            placeholder={t('modal.descPlaceholder')}
                            disabled={isAiModifying}
                        />
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex justify-end gap-3">
                        <Button
                            type="button"
                            onClick={onClose}
                            variant="outline"
                            disabled={isSaving}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="button"
                            onClick={handleSaveOnly}
                            disabled={isSaving || !editingDescription.trim()}
                            variant="secondary"
                            className="gap-2"
                        >
                            {isSaving ? (
                                <TaskStatusInline state={savingState} className="text-secondary-foreground [&>span]:text-secondary-foreground [&_svg]:text-secondary-foreground" />
                            ) : (
                                t('modal.saveOnly')
                            )}
                        </Button>
                        <Button
                            type="button"
                            onClick={handleSaveAndGenerate}
                            disabled={isSaving || !editingDescription.trim()}
                            className="gap-2"
                        >
                            {t('modal.saveAndGenerate')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default LocationEditModal
