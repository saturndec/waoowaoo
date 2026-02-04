'use client'
import { useTranslations } from 'next-intl'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

/**
 * PanelVariantModal - 镜头变体选择模态框
 * 
 * 功能：
 * 1. 显示原镜头图片
 * 2. 调用 AI 分析获取推荐变体
 * 3. 用户选择变体或自定义输入
 * 4. 触发变体生成
 */

interface ShotVariantSuggestion {
    id: number
    title: string
    description: string
    shot_type: string
    camera_move: string
    video_prompt: string
    creative_score: number
}

interface PanelInfo {
    id: string
    panelNumber: number | null
    description: string | null
    imageUrl: string | null
    storyboardId: string
}

interface PanelVariantModalProps {
    isOpen: boolean
    onClose: () => void
    panel: PanelInfo
    projectId: string
    onVariant: (variant: Omit<ShotVariantSuggestion, 'id' | 'creative_score'>, options: { includeCharacterAssets: boolean; includeLocationAsset: boolean }) => Promise<void>
    isGenerating: boolean
}

export default function PanelVariantModal({
    isOpen,
    onClose,
    panel,
    projectId,
    onVariant,
    isGenerating
}: PanelVariantModalProps) {
    const t = useTranslations('storyboard')
    const [mounted, setMounted] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [suggestions, setSuggestions] = useState<ShotVariantSuggestion[]>([])
    const [error, setError] = useState<string | null>(null)
    const [customInput, setCustomInput] = useState('')
    const [includeCharacterAssets, setIncludeCharacterAssets] = useState(true)
    const [includeLocationAsset, setIncludeLocationAsset] = useState(true)
    const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null)

    useEffect(() => {
        setMounted(true)
    }, [])

    // 当模态框打开时，自动触发分析
    useEffect(() => {
        if (isOpen && panel.imageUrl) {
            analyzeShotVariants()
        }
    }, [isOpen, panel.id])

    const analyzeShotVariants = useCallback(async () => {
        setIsAnalyzing(true)
        setError(null)
        setSuggestions([])

        try {
            const res = await fetch(`/api/novel-promotion/${projectId}/analyze-shot-variants`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ panelId: panel.id })
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || t("smartImport.errors.analyzeFailed"))
            }

            setSuggestions(data.suggestions || [])
        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsAnalyzing(false)
        }
    }, [projectId, panel.id])

    const handleSelectVariant = async (suggestion: ShotVariantSuggestion) => {
        setSelectedVariantId(suggestion.id)
        await onVariant({
            title: suggestion.title,
            description: suggestion.description,
            shot_type: suggestion.shot_type,
            camera_move: suggestion.camera_move,
            video_prompt: suggestion.video_prompt
        }, {
            includeCharacterAssets,
            includeLocationAsset
        })
    }

    const handleCustomVariant = async () => {
        if (!customInput.trim()) return

        await onVariant({
            title: t('variant.customVariant'),
            description: customInput,
            shot_type: t('variant.defaultShotType'),
            camera_move: t('variant.defaultCameraMove'),
            video_prompt: customInput
        }, {
            includeCharacterAssets,
            includeLocationAsset
        })
    }

    const handleClose = () => {
        if (!isGenerating && !isAnalyzing) {
            setSuggestions([])
            setError(null)
            setCustomInput('')
            setSelectedVariantId(null)
            onClose()
        }
    }

    const renderStars = (score: number) => {
        return '⭐'.repeat(score)
    }

    if (!isOpen || !mounted) return null

    const modalContent = (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            style={{ zIndex: 9999 }}
            onClick={handleClose}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 标题 */}
                <div className="px-5 py-3 border-b bg-gradient-to-r from-purple-50 to-indigo-50 flex items-center justify-between">
                    <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <span className="text-purple-500">🎥</span>
                        {t('variant.shotTitle', { number: panel.panelNumber ?? '' })}
                    </h2>
                    <button
                        onClick={handleClose}
                        disabled={isGenerating || isAnalyzing}
                        className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 内容 */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* 原镜头预览 */}
                    <div className="flex gap-4 items-start">
                        <div className="w-32 flex-shrink-0">
                            {panel.imageUrl ? (
                                <img
                                    src={panel.imageUrl}
                                    alt={t('variant.shotNum', { number: panel.panelNumber ?? '' })}
                                    className="w-full aspect-[9/16] object-cover rounded-lg shadow"
                                />
                            ) : (
                                <div className="w-full aspect-[9/16] bg-slate-200 rounded-lg flex items-center justify-center text-slate-400 text-xs">
                                    {t('variant.noImage')}
                                </div>
                            )}
                            <div className="text-xs text-slate-500 mt-1 text-center">#{panel.panelNumber}</div>
                        </div>
                        <div className="flex-1">
                            <h3 className="text-sm font-medium text-slate-700 mb-1">{t('variant.originalDescription')}</h3>
                            <p className="text-sm text-slate-600">{panel.description || t('variant.noDescription')}</p>
                        </div>
                    </div>

                    <hr />

                    {/* AI 推荐变体 */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                {t('variant.aiRecommend')}
                                {isAnalyzing && (
                                    <span className="text-xs text-purple-500 flex items-center gap-1">
                                        <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                        </svg>
                                        {t("assets.stage.analyzing")}
                                    </span>
                                )}
                            </h3>
                            {!isAnalyzing && suggestions.length > 0 && (
                                <button
                                    onClick={analyzeShotVariants}
                                    className="text-xs text-purple-500 hover:text-purple-700 flex items-center gap-1"
                                >
                                    {t('variant.reanalyze')}
                                </button>
                            )}
                        </div>

                        {error && (
                            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg mb-3">
                                {error}
                            </div>
                        )}

                        {/* 推荐列表 */}
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {suggestions.map((s) => (
                                <div
                                    key={s.id}
                                    className={`p-3 border rounded-lg hover:border-purple-300 hover:bg-purple-50/50 transition-colors cursor-pointer ${selectedVariantId === s.id ? 'border-purple-400 bg-purple-50' : 'border-slate-200'
                                        }`}
                                    onClick={() => !isGenerating && handleSelectVariant(s)}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-amber-500">{renderStars(s.creative_score)}</span>
                                                <h4 className="text-sm font-medium text-slate-800">{s.title}</h4>
                                            </div>
                                            <p className="text-xs text-slate-600 mt-1">{s.description}</p>
                                            <div className="flex gap-2 mt-1">
                                                <span className="text-xs text-slate-400">{t('variant.shotType')} {s.shot_type}</span>
                                                <span className="text-xs text-slate-400">{t('variant.cameraMove')} {s.camera_move}</span>
                                            </div>
                                        </div>
                                        <button
                                            disabled={isGenerating}
                                            className={`px-3 py-1 text-xs rounded-lg transition-colors ${isGenerating && selectedVariantId === s.id
                                                ? 'bg-purple-300 text-white'
                                                : 'bg-purple-500 text-white hover:bg-purple-600'
                                                }`}
                                        >
                                            {isGenerating && selectedVariantId === s.id ? (
                                                <span className="flex items-center gap-1">
                                                    <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                                    </svg>
                                                    {t('variant.generating')}
                                                </span>
                                            ) : t("candidate.select")}
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {!isAnalyzing && suggestions.length === 0 && !error && (
                                <div className="text-center py-8 text-slate-400 text-sm">
                                    {t('variant.clickToAnalyze')}
                                </div>
                            )}
                        </div>
                    </div>

                    <hr />

                    {/* 自定义输入 */}
                    <div>
                        <h3 className="text-sm font-medium text-slate-700 mb-2">{t('variant.customInstruction')}</h3>
                        <textarea
                            value={customInput}
                            onChange={(e) => setCustomInput(e.target.value)}
                            placeholder={t('variant.customPlaceholder')}
                            className="w-full h-16 px-3 py-2 border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            disabled={isGenerating}
                        />
                    </div>

                    {/* 资产引用选项 */}
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={includeCharacterAssets}
                                onChange={(e) => setIncludeCharacterAssets(e.target.checked)}
                                className="w-4 h-4 text-purple-500 rounded"
                            />
                            {t('variant.includeCharacter')}
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={includeLocationAsset}
                                onChange={(e) => setIncludeLocationAsset(e.target.checked)}
                                className="w-4 h-4 text-purple-500 rounded"
                            />
                            {t('variant.includeLocation')}
                        </label>
                    </div>
                </div>

                {/* 底部按钮 */}
                <div className="px-5 py-3 border-t bg-slate-50 flex justify-end gap-3">
                    <button
                        onClick={handleClose}
                        disabled={isGenerating || isAnalyzing}
                        className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 disabled:opacity-50"
                    >
                        {t("candidate.cancel")}
                    </button>
                    <button
                        onClick={handleCustomVariant}
                        disabled={isGenerating || !customInput.trim()}
                        className={`px-4 py-2 text-sm rounded-lg transition-colors ${isGenerating || !customInput.trim()
                            ? 'bg-purple-200 text-white cursor-not-allowed'
                            : 'bg-purple-500 text-white hover:bg-purple-600'
                            }`}
                    >
                        {isGenerating ? t("group.generating") : t('variant.useCustomGenerate')}
                    </button>
                </div>
            </div>
        </div>
    )

    return createPortal(modalContent, document.body)
}
