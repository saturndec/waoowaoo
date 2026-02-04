'use client'
import { useTranslations } from 'next-intl'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

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
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            style={{ zIndex: 9999 }}
            onClick={handleClose}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 标题 */}
                <div className="px-5 py-3 border-b bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-2xl">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                            <span className="text-blue-500">📍</span>
                            {t('insertModal.insertBetween', { before: prevPanel.panelNumber ?? 0, after: nextPanel?.panelNumber ?? '' })}
                        </h2>
                        <button
                            onClick={handleClose}
                            disabled={isInserting}
                            className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* 内容 */}
                <div className="p-5 space-y-4">
                    {/* 前后镜头预览 - 更紧凑 */}
                    <div className="flex gap-3 items-center">
                        {/* 前一个镜头 */}
                        <div className="flex-1 bg-slate-50 rounded-lg p-2 text-center">
                            {prevPanel.imageUrl ? (
                                <img
                                    src={prevPanel.imageUrl}
                                    alt={`${t('insertModal.panel')} ${prevPanel.panelNumber}`}
                                    className="w-full aspect-[9/16] object-cover rounded-md"
                                />
                            ) : (
                                <div className="w-full aspect-[9/16] bg-slate-200 rounded-md flex items-center justify-center text-slate-400 text-xs">
                                    {t('insertModal.noImage')}
                                </div>
                            )}
                            <div className="text-xs text-slate-500 mt-1">#{prevPanel.panelNumber}</div>
                        </div>

                        {/* 插入指示 */}
                        <div className="flex flex-col items-center">
                            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
                                +
                            </div>
                        </div>

                        {/* 后一个镜头 */}
                        <div className="flex-1 bg-slate-50 rounded-lg p-2 text-center">
                            {nextPanel ? (
                                <>
                                    {nextPanel.imageUrl ? (
                                        <img
                                            src={nextPanel.imageUrl}
                                            alt={`${t('insertModal.panel')} ${nextPanel.panelNumber}`}
                                            className="w-full aspect-[9/16] object-cover rounded-md"
                                        />
                                    ) : (
                                        <div className="w-full aspect-[9/16] bg-slate-200 rounded-md flex items-center justify-center text-slate-400 text-xs">
                                            {t('insertModal.noImage')}
                                        </div>
                                    )}
                                    <div className="text-xs text-slate-500 mt-1">#{nextPanel.panelNumber}</div>
                                </>
                            ) : (
                                <>
                                    <div className="w-full aspect-[9/16] bg-slate-100 rounded-md flex items-center justify-center text-slate-300 text-xs">
                                        {t('insertModal.insertAtEnd')}
                                    </div>
                                    <div className="text-xs text-slate-400 mt-1">{t('insertModal.insert')}</div>
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
                            className="w-full h-16 px-3 py-2 border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            disabled={isInserting}
                        />
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex gap-3">
                        <button
                            onClick={handleAutoAnalyze}
                            disabled={isInserting}
                            className={`flex-1 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all
                                ${isInserting ? 'bg-slate-100 text-slate-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                            {isInserting && !userInput ? (
                                <>
                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                    </svg>
                                    <span>{t('insertModal.analyzing')}</span>
                                </>
                            ) : (
                                <>{t('insertModal.aiAnalyze')}</>
                            )}
                        </button>

                        <button
                            onClick={handleInsert}
                            disabled={isInserting || !userInput.trim()}
                            className={`flex-1 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all
                                ${isInserting || !userInput.trim() ? 'bg-blue-200 text-white' : 'bg-blue-500 text-white hover:bg-blue-600 shadow-lg shadow-blue-500/30'}`}
                        >
                            {isInserting && userInput ? (
                                <>
                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                    </svg>
                                    <span>{t("group.generating")}</span>
                                </>
                            ) : (
                                <>✍️ {t('insertModal.insert')}</>
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

