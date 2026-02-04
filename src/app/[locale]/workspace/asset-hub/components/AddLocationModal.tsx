'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ART_STYLES } from '@/lib/constants'

interface AddLocationModalProps {
    folderId: string | null
    onClose: () => void
    onSuccess: () => void
}

// 内联 SVG 图标
const XMarkIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
)

const SparklesIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
)

export function AddLocationModal({ folderId, onClose, onSuccess }: AddLocationModalProps) {
    const t = useTranslations('assetHub')

    // 表单字段
    const [name, setName] = useState('')
    const [summary, setSummary] = useState('')
    const [aiInstruction, setAiInstruction] = useState('')
    const [artStyle, setArtStyle] = useState('american-comic')

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isAiDesigning, setIsAiDesigning] = useState(false)

    // AI 设计描述
    const handleAiDesign = async () => {
        if (!aiInstruction.trim()) return

        try {
            setIsAiDesigning(true)
            const res = await fetch('/api/asset-hub/ai-design-location', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instruction: aiInstruction
                })
            })

            if (res.ok) {
                const data = await res.json()
                setSummary(data.prompt || '')
                setAiInstruction('')
            } else {
                const error = await res.json()
                alert(error.error || 'AI 设计失败')
            }
        } catch (error) {
            console.error('AI设计失败:', error)
        } finally {
            setIsAiDesigning(false)
        }
    }

    // 提交
    const handleSubmit = async () => {
        if (!name.trim() || !summary.trim()) return

        try {
            setIsSubmitting(true)
            const res = await fetch('/api/asset-hub/locations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    summary: summary.trim(),
                    folderId,
                    artStyle
                })
            })

            if (res.ok) {
                onSuccess()
            } else {
                const error = await res.json()
                alert(error.error || '创建失败')
            }
        } catch (error) {
            console.error('创建场景失败:', error)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
                <div className="p-6">
                    {/* 标题 */}
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-gray-900">
                            {t('modal.newLocation')}
                        </h3>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="space-y-5">
                        {/* AI 设计区域 */}
                        <div className="bg-blue-50 rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-blue-900">
                                <SparklesIcon className="w-4 h-4" />
                                <span>{t('modal.aiDesign')}</span>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={aiInstruction}
                                    onChange={(e) => setAiInstruction(e.target.value)}
                                    placeholder={t('modal.aiDesignLocationPlaceholder')}
                                    className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm whitespace-nowrap"
                                >
                                    {isAiDesigning ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            <span>{t('modal.generating')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <SparklesIcon className="w-4 h-4" />
                                            <span>{t('modal.generate')}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                            <p className="text-xs text-blue-700">
                                💡 {t('modal.aiDesignLocationTip')}
                            </p>
                        </div>

                        {/* 场景名称 */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">
                                {t('modal.locationNameLabel')}
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('modal.locationNamePlaceholder')}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        {/* 风格选择 */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">
                                画面风格
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {ART_STYLES.map((style) => (
                                    <button
                                        key={style.value}
                                        type="button"
                                        onClick={() => setArtStyle(style.value)}
                                        className={`px-3 py-2 rounded-lg text-sm border transition-all flex items-center gap-2 ${artStyle === style.value
                                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                                            : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                            }`}
                                    >
                                        <span>{style.preview}</span>
                                        <span>{style.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 场景描述 */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">
                                {t('modal.locationSummaryLabel')}
                            </label>
                            <textarea
                                value={summary}
                                onChange={(e) => setSummary(e.target.value)}
                                placeholder={t('modal.locationSummaryPlaceholder')}
                                className="w-full h-40 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                            />
                        </div>
                    </div>

                    {/* 按钮区 */}
                    <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                            disabled={isSubmitting}
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !name.trim() || !summary.trim()}
                            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span>{t('modal.adding')}</span>
                                </>
                            ) : (
                                <span>{t('modal.addLocation')}</span>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
