'use client'
import { useTranslations } from 'next-intl'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { AppIcon } from '@/components/ui/icons'

/**
 * InsertPanelModal - 插入分镜模态框
 * 使用 Portal 渲染到 document.body，确保在用户屏幕中央显示
 */

interface PanelInfo {
    id: string
    panelNumber: number | null
    description: string | null
    imageUrl: string | null
}

interface InsertPanelModalProps {
    isOpen: boolean
    onClose: () => void
    prevPanel: PanelInfo
    nextPanel: PanelInfo | null
    onInsert: (userInput: string) => Promise<void>
    isInserting: boolean
}

export default function InsertPanelModal({
    isOpen,
    onClose,
    prevPanel,
    nextPanel,
    onInsert,
    isInserting
}: InsertPanelModalProps) {
    const t = useTranslations('storyboard')
    const [userInput, setUserInput] = useState('')
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const analyzingState = isInserting
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'analyze',
            resource: 'text',
            hasOutput: true,
        })
        : null
    const insertingState = isInserting
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'build',
            resource: 'text',
            hasOutput: true,
        })
        : null

    if (!isOpen || !mounted) return null

    const handleInsert = async () => {
        await onInsert(userInput)
        setUserInput('')
    }

    const handleAutoAnalyze = async () => {
        await onInsert('')
        setUserInput('')
    }

    const handleClose = () => {
        if (!isInserting) {
            setUserInput('')
            onClose()
        }
    }

    const modalContent = (
        <div
            className="fixed inset-0 bg-black/45 flex items-center justify-center p-4"
            style={{ zIndex: 9999 }}
            onClick={handleClose}
        >
            <div
                className="rounded-xl border border-border bg-card shadow-lg w-full max-w-lg"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 标题 */}
                <div className="px-5 py-3 border-b border-border bg-muted/40 rounded-t-2xl">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary text-sm font-bold">+</span>
                            {t('insertModal.insertBetween', { before: prevPanel.panelNumber ?? 0, after: nextPanel?.panelNumber ?? '' })}
                        </h2>
                        <button
                            onClick={handleClose}
                            disabled={isInserting}
                            className="text-muted-foreground hover:text-muted-foreground disabled:opacity-50"
                        >
                            <AppIcon name="close" className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* 内容 */}
                <div className="p-5 space-y-4">
                    {/* 前后镜头预览 - 更紧凑 */}
                    <div className="flex gap-3 items-center">
                        {/* 前一个镜头 */}
                        <div className="flex-1 bg-muted rounded-lg p-2 text-center">
                            {prevPanel.imageUrl ? (
                                <MediaImageWithLoading
                                    src={prevPanel.imageUrl}
                                    alt={`${t('insertModal.panel')} ${prevPanel.panelNumber}`}
                                    containerClassName="w-full aspect-[9/16] rounded-md"
                                    className="w-full aspect-[9/16] object-cover rounded-md"
                                />
                            ) : (
                                <div className="w-full aspect-[9/16] bg-muted rounded-md flex items-center justify-center text-muted-foreground text-xs">
                                    {t('insertModal.noImage')}
                                </div>
                            )}
                            <div className="text-xs text-muted-foreground mt-1">#{prevPanel.panelNumber}</div>
                        </div>

                        {/* 插入指示 */}
                        <div className="flex flex-col items-center">
                            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-bold">
                                +
                            </div>
                        </div>

                        {/* 后一个镜头 */}
                        <div className="flex-1 bg-muted rounded-lg p-2 text-center">
                            {nextPanel ? (
                                <>
                                    {nextPanel.imageUrl ? (
                                        <MediaImageWithLoading
                                            src={nextPanel.imageUrl}
                                            alt={`${t('insertModal.panel')} ${nextPanel.panelNumber}`}
                                            containerClassName="w-full aspect-[9/16] rounded-md"
                                            className="w-full aspect-[9/16] object-cover rounded-md"
                                        />
                                    ) : (
                                        <div className="w-full aspect-[9/16] bg-muted rounded-md flex items-center justify-center text-muted-foreground text-xs">
                                            {t('insertModal.noImage')}
                                        </div>
                                    )}
                                    <div className="text-xs text-muted-foreground mt-1">#{nextPanel.panelNumber}</div>
                                </>
                            ) : (
                                <>
                                    <div className="w-full aspect-[9/16] bg-muted rounded-md flex items-center justify-center text-muted-foreground text-xs">
                                        {t('insertModal.insertAtEnd')}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">{t('insertModal.insert')}</div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* 用户输入 */}
                    <div>
                        <textarea
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            placeholder={t('insertModal.placeholder')}
                            className="w-full h-16 px-3 py-2 border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                            disabled={isInserting}
                        />
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex gap-3">
                        <button
                            onClick={handleAutoAnalyze}
                            disabled={isInserting}
                            className={`flex-1 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all
                                ${isInserting ? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground hover:bg-muted'}`}
                        >
                            {isInserting && !userInput ? (
                                <TaskStatusInline state={analyzingState} />
                            ) : (
                                <>{t('insertModal.aiAnalyze')}</>
                            )}
                        </button>

                        <button
                            onClick={handleInsert}
                            disabled={isInserting || !userInput.trim()}
                            className={`flex-1 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all
                                ${isInserting || !userInput.trim() ? 'bg-muted text-muted-foreground' : 'bg-primary text-white hover:bg-primary/90 shadow-md'}`}
                        >
                            {isInserting && userInput ? (
                                <TaskStatusInline state={insertingState} />
                            ) : (
                                <>{t('insertModal.insert')}</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )

    // 使用 Portal 渲染到 document.body
    return createPortal(modalContent, document.body)
}
