'use client'
import { logError as _ulogError } from '@/lib/logging/core'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { ART_STYLES } from '@/lib/constants'
import { shouldShowError } from '@/lib/error-utils'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import {
    useAiCreateProjectLocation,
    useAiDesignLocation,
    useCreateAssetHubLocation,
    useCreateProjectLocation,
} from '@/lib/query/hooks'

export interface LocationCreationModalProps {
    mode: 'asset-hub' | 'project'
    // Asset Hub 模式使用
    folderId?: string | null
    // 项目模式使用
    projectId?: string
    onClose: () => void
    onSuccess: () => void
}

// 内联 SVG 图标
const XMarkIcon = ({ className }: { className?: string }) => (
    <AppIcon name="close" className={className} />
)

const SparklesIcon = ({ className }: { className?: string }) => (
    <AppIcon name="sparklesAlt" className={className} />
)

export function LocationCreationModal({
    mode,
    folderId,
    projectId,
    onClose,
    onSuccess
}: LocationCreationModalProps) {
    const t = useTranslations('assetModal')
    const aiDesignAssetHubLocation = useAiDesignLocation()
    const createAssetHubLocation = useCreateAssetHubLocation()
    const aiCreateProjectLocation = useAiCreateProjectLocation(projectId || '')
    const createProjectLocation = useCreateProjectLocation(projectId || '')

    // 表单字段
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [aiInstruction, setAiInstruction] = useState('')
    const [artStyle, setArtStyle] = useState('american-comic')

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isAiDesigning, setIsAiDesigning] = useState(false)
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

    const getErrorMessage = (error: unknown, fallback: string) => {
        if (error instanceof Error && error.message) {
            return error.message
        }
        return fallback
    }

    const getErrorStatus = (error: unknown): number | null => {
        if (typeof error === 'object' && error !== null) {
            const status = (error as { status?: unknown }).status
            if (typeof status === 'number') return status
        }
        return null
    }

    // ESC 键关闭
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isSubmitting && !isAiDesigning) {
                onClose()
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose, isSubmitting, isAiDesigning])

    // AI 设计描述
    const handleAiDesign = async () => {
        if (!aiInstruction.trim()) return

        try {
            setIsAiDesigning(true)
            const data = mode === 'asset-hub'
                ? await aiDesignAssetHubLocation.mutateAsync(aiInstruction)
                : await aiCreateProjectLocation.mutateAsync({ userInstruction: aiInstruction })
            setDescription(data.prompt || '')
            setAiInstruction('')
        } catch (error: unknown) {
            if (getErrorStatus(error) === 402) {
                alert(getErrorMessage(error, t('errors.insufficientBalance')))
            } else {
                _ulogError('AI设计失败:', error)
                if (shouldShowError(error)) {
                    alert(getErrorMessage(error, t('errors.aiDesignFailed')))
                }
            }
        } finally {
            setIsAiDesigning(false)
        }
    }

    // 提交创建
    const handleSubmit = async () => {
        if (!name.trim() || !description.trim()) return

        try {
            setIsSubmitting(true)

            const body: {
                name: string
                description: string
                artStyle: string
                folderId?: string | null
            } = {
                name: name.trim(),
                description: description.trim(),
                artStyle
            }

            if (mode === 'asset-hub') {
                body.folderId = folderId
            }

            if (mode === 'asset-hub') {
                await createAssetHubLocation.mutateAsync({
                    name: body.name,
                    summary: body.description,
                    artStyle: body.artStyle,
                    folderId: body.folderId ?? null,
                })
            } else {
                await createProjectLocation.mutateAsync({
                    name: body.name,
                    description: body.description,
                    artStyle: body.artStyle,
                })
            }

            onSuccess()
            onClose()
        } catch (error: unknown) {
            if (getErrorStatus(error) === 402) {
                alert(getErrorMessage(error, t('errors.insufficientBalance')))
            } else if (shouldShowError(error)) {
                alert(getErrorMessage(error, t('errors.createFailed')))
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    // 处理点击遮罩层关闭
    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && !isSubmitting && !isAiDesigning) {
            onClose()
        }
    }

    return (
        <div
            className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4"
            onClick={handleBackdropClick}
        >
            <div className="rounded-xl border border-border bg-card shadow-lg max-w-2xl w-full max-h-[85vh] flex flex-col">
                <div className="p-6 overflow-y-auto flex-1">
                    {/* 标题 */}
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-foreground">
                            {t('location.title')}
                        </h3>
                        <button
                            onClick={onClose}
                            className="inline-flex items-center justify-center border border-border bg-muted/50 hover:bg-muted w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="space-y-5">
                        {/* 场景名称 */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-foreground block">
                                {t('location.name')} <span className="text-destructive">*</span>
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('location.namePlaceholder')}
                                className="w-full rounded-md border border-input bg-background w-full px-3 py-2 text-sm"
                            />
                        </div>

                        {/* 风格选择 */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-foreground block">
                                {t('artStyle.title')}
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {ART_STYLES.map((style) => (
                                    <button
                                        key={style.value}
                                        type="button"
                                        onClick={() => setArtStyle(style.value)}
                                        className={`inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm border transition-all justify-start ${artStyle === style.value
                                            ? 'bg-primary/10 text-primary hover:bg-primary/15 border-primary/40'
                                            : 'border border-border bg-muted/50 hover:bg-muted border-border text-muted-foreground'
                                            }`}
                                    >
                                        <span>{style.preview}</span>
                                        <span>{style.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* AI 设计区域 */}
                        <div className="rounded-xl border border-border bg-muted/30 rounded-xl p-4 space-y-3 border border-border">
                            <div className="flex items-center gap-2 text-sm font-medium text-primary">
                                <SparklesIcon className="w-4 h-4" />
                                <span>{t('aiDesign.title')} {t('common.optional')}</span>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={aiInstruction}
                                    onChange={(e) => setAiInstruction(e.target.value)}
                                    placeholder={t('aiDesign.placeholderLocation')}
                                    className="w-full rounded-md border border-input bg-background flex-1 px-3 py-2 text-sm"
                                    disabled={isAiDesigning}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault()
                                            handleAiDesign()
                                        }
                                    }}
                                />
                                <button
                                    onClick={handleAiDesign}
                                    disabled={isAiDesigning || !aiInstruction.trim()}
                                    className="inline-flex items-center justify-center bg-primary/10 text-primary hover:bg-primary/15 px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm whitespace-nowrap"
                                >
                                    {isAiDesigning ? (
                                        <TaskStatusInline state={aiDesigningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                                    ) : (
                                        <>
                                            <SparklesIcon className="w-4 h-4" />
                                            <span>{t('aiDesign.generate')}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {t('aiDesign.tip')}
                            </p>
                        </div>

                        {/* 场景描述 */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-foreground block">
                                {t('location.description')} <span className="text-destructive">*</span>
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder={t('location.descPlaceholder')}
                                className="w-full rounded-md border border-input bg-background w-full h-36 px-3 py-2 text-sm resize-none"
                                disabled={isAiDesigning}
                            />
                        </div>
                    </div>
                </div>

                {/* 固定底部按钮区 */}
                <div className="flex gap-3 justify-end p-4 border-t border-border bg-muted/40 rounded-b-xl flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="inline-flex items-center justify-center border border-input bg-background hover:bg-accent hover:text-accent-foreground px-4 py-2 rounded-lg text-sm"
                        disabled={isSubmitting}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !name.trim() || !description.trim()}
                        className="inline-flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <TaskStatusInline state={submittingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                        ) : (
                            <span>{t('common.add')}</span>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
