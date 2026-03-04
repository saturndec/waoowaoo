'use client'
import { logError as _ulogError } from '@/lib/logging/core'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ART_STYLES } from '@/lib/constants'
import { useAiDesignLocation, useCreateAssetHubLocation } from '@/lib/query/hooks'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface AddLocationModalProps {
    folderId: string | null
    onClose: () => void
    onSuccess: () => void
}

const SparklesIcon = ({ className }: { className?: string }) => (
    <AppIcon name="sparklesAlt" className={className} />
)

export function AddLocationModal({ folderId, onClose, onSuccess }: AddLocationModalProps) {
    const t = useTranslations('assetHub')

    // 表单字段
    const [name, setName] = useState('')
    const [summary, setSummary] = useState('')
    const [aiInstruction, setAiInstruction] = useState('')
    const [artStyle, setArtStyle] = useState('american-comic')

    const aiDesignMutation = useAiDesignLocation()
    const createLocationMutation = useCreateAssetHubLocation()
    const isSubmitting = createLocationMutation.isPending
    const isAiDesigning = aiDesignMutation.isPending
    const aiDesigningState = isAiDesigning
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'generate',
            resource: 'image',
            hasOutput: false,
        })
        : null
    const submittingState = isSubmitting
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'generate',
            resource: 'image',
            hasOutput: false,
        })
        : null

    // AI 设计描述
    const handleAiDesign = async () => {
        if (!aiInstruction.trim()) return

        try {
            const data = await aiDesignMutation.mutateAsync(aiInstruction.trim())
            setSummary(data.prompt || '')
            setAiInstruction('')
        } catch (error) {
            _ulogError('AI设计失败:', error)
        }
    }

    // 提交
    const handleSubmit = async () => {
        if (!name.trim() || !summary.trim()) return

        try {
            await createLocationMutation.mutateAsync({
                name: name.trim(),
                summary: summary.trim(),
                folderId,
                artStyle
            })
            onSuccess()
        } catch (error) {
            _ulogError('创建场景失败:', error)
        }
    }

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
            <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-lg">
                        {t('modal.newLocation')}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5">
                    {/* AI 设计区域 */}
                    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <SparklesIcon className="h-4 w-4" />
                            <span>{t('modal.aiDesign')}</span>
                        </div>
                        <div className="flex gap-2">
                            <Input
                                type="text"
                                value={aiInstruction}
                                onChange={(e) => setAiInstruction(e.target.value)}
                                placeholder={t('modal.aiDesignLocationPlaceholder')}
                                className="flex-1 text-sm"
                                disabled={isAiDesigning}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        handleAiDesign()
                                    }
                                }}
                            />
                            <Button
                                type="button"
                                onClick={handleAiDesign}
                                disabled={isAiDesigning || !aiInstruction.trim()}
                                className="gap-2 text-sm"
                            >
                                {isAiDesigning ? (
                                    <TaskStatusInline state={aiDesigningState} className="text-primary-foreground [&>span]:text-primary-foreground [&_svg]:text-primary-foreground" />
                                ) : (
                                    <>
                                        <SparklesIcon className="h-4 w-4" />
                                        <span>{t('modal.generate')}</span>
                                    </>
                                )}
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t('modal.aiDesignLocationTip')}
                        </p>
                    </div>

                    {/* 场景名称 */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-foreground">
                            {t('modal.locationNameLabel')}
                        </label>
                        <Input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t('modal.locationNamePlaceholder')}
                            className="w-full text-sm"
                        />
                    </div>

                    {/* 风格选择 */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-foreground">
                            画面风格
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {ART_STYLES.map((style) => (
                                <Button
                                    key={style.value}
                                    type="button"
                                    onClick={() => setArtStyle(style.value)}
                                    variant={artStyle === style.value ? 'secondary' : 'outline'}
                                    className="h-auto justify-start gap-2 px-3 py-2 text-sm"
                                >
                                    <span>{style.preview}</span>
                                    <span>{style.label}</span>
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* 场景描述 */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-foreground">
                            {t('modal.locationSummaryLabel')}
                        </label>
                        <Textarea
                            value={summary}
                            onChange={(e) => setSummary(e.target.value)}
                            placeholder={t('modal.locationSummaryPlaceholder')}
                            className="h-40 w-full resize-none text-sm"
                        />
                    </div>
                </div>

                {/* 按钮区 */}
                <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
                    <Button
                        type="button"
                        onClick={onClose}
                        variant="outline"
                        disabled={isSubmitting}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting || !name.trim() || !summary.trim()}
                    >
                        {isSubmitting ? (
                            <TaskStatusInline state={submittingState} className="text-primary-foreground [&>span]:text-primary-foreground [&_svg]:text-primary-foreground" />
                        ) : (
                            <span>{t('modal.addLocation')}</span>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
