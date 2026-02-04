'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/SharedComponents'
import {
    VIDEO_RATIOS,
    VIDEO_RESOLUTIONS,
    ART_STYLES
} from '@/lib/constants'
import { getProviderDisplayName } from '@/app/[locale]/profile/components/api-config/types'

// 用户模型选项接口
interface ModelOption {
    value: string
    label: string
    provider?: string
}

interface UserModels {
    llm: ModelOption[]
    image: ModelOption[]
    video: ModelOption[]
}

// 默认模型（用户未配置时的回退）
const DEFAULT_MODELS: UserModels = {
    llm: [{ value: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro' }],
    image: [{ value: 'banana-2k', label: 'Banana 2K' }],
    video: [{ value: 'doubao-seedance-1-0-pro-fast-251015', label: 'Seedance ProFast' }]
}

/**
 * RatioIcon - 比例预览图标组件
 */
function RatioIcon({ ratio, size = 24, selected = false }: { ratio: string; size?: number; selected?: boolean }) {
    const [w, h] = ratio.split(':').map(Number)
    const maxDim = size
    let width: number, height: number

    if (w >= h) {
        width = maxDim
        height = Math.round(maxDim * h / w)
    } else {
        height = maxDim
        width = Math.round(maxDim * w / h)
    }

    return (
        <div
            className={`border-2 rounded-[4px] ${selected ? 'border-blue-600 bg-blue-100' : 'border-slate-300 bg-white'}`}
            style={{ width, height, minWidth: width, minHeight: height }}
        />
    )
}

/**
 * RatioSelector - 比例选择下拉组件
 */
function RatioSelector({
    value,
    onChange,
    options
}: {
    value: string
    onChange: (value: string) => void
    options: { value: string; label: string }[]
}) {
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const selectedOption = options.find(o => o.value === value)

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-100 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <RatioIcon ratio={value} size={20} selected />
                    <span className="text-sm text-slate-800 font-medium">{selectedOption?.label || value}</span>
                </div>
                <svg className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg p-3 max-h-60 overflow-y-auto custom-scrollbar" style={{ minWidth: '280px' }}>
                    <div className="grid grid-cols-5 gap-2">
                        {options.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                    onChange(option.value)
                                    setIsOpen(false)
                                }}
                                className={`flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-slate-50 transition-colors ${value === option.value ? 'bg-blue-50 ring-2 ring-blue-500' : ''
                                    }`}
                            >
                                <RatioIcon ratio={option.value} size={28} selected={value === option.value} />
                                <span className={`text-xs ${value === option.value ? 'text-blue-600 font-medium' : 'text-slate-600'}`}>
                                    {option.label}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

/**
 * StyleSelector - 视觉风格选择抽屉组件
 */
function StyleSelector({
    value,
    onChange,
    options
}: {
    value: string
    onChange: (value: string) => void
    options: { value: string; label: string; preview: string }[]
}) {
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const selectedOption = options.find(o => o.value === value) || options[0]

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-100 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className="text-lg">{selectedOption.preview}</span>
                    <span className="text-sm text-slate-800 font-medium">{selectedOption.label}</span>
                </div>
                <svg className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg p-3">
                    <div className="grid grid-cols-2 gap-2">
                        {options.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                    onChange(option.value)
                                    setIsOpen(false)
                                }}
                                className={`flex items-center gap-2 p-3 rounded-lg text-left transition-all ${value === option.value
                                    ? 'bg-blue-50 ring-2 ring-blue-500 text-blue-700'
                                    : 'hover:bg-slate-50 text-slate-600'
                                    }`}
                            >
                                <span className="text-lg">{option.preview}</span>
                                <span className="font-medium text-sm">{option.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void
    // Current values
    artStyle?: string
    analysisModel?: string
    characterModel?: string
    locationModel?: string
    imageModel?: string
    editModel?: string

    videoModel?: string
    videoResolution?: string
    videoRatio?: string
    // Callbacks
    onArtStyleChange?: (value: string) => void
    onAnalysisModelChange?: (value: string) => void
    onCharacterModelChange?: (value: string) => void
    onLocationModelChange?: (value: string) => void
    onImageModelChange?: (value: string) => void
    onEditModelChange?: (value: string) => void

    onVideoModelChange?: (value: string) => void
    onVideoResolutionChange?: (value: string) => void
    onVideoRatioChange?: (value: string) => void
}

export function SettingsModal({
    isOpen,
    onClose,
    artStyle = 'american-comic',
    analysisModel,
    characterModel,
    locationModel,
    imageModel,
    editModel,

    videoModel,
    videoResolution = '720p',
    videoRatio = '9:16',
    onArtStyleChange,
    onAnalysisModelChange,
    onCharacterModelChange,
    onLocationModelChange,
    onImageModelChange,
    onEditModelChange,

    onVideoModelChange,
    onVideoResolutionChange,
    onVideoRatioChange
}: SettingsModalProps) {
    const t = useTranslations('configModal')
    const tc = useTranslations('common')
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle')
    const [userModels, setUserModels] = useState<UserModels>(DEFAULT_MODELS)
    const [modelsLoading, setModelsLoading] = useState(true)

    // 加载用户模型列表
    useEffect(() => {
        if (isOpen) {
            fetchUserModels()
        }
    }, [isOpen])

    async function fetchUserModels() {
        try {
            const res = await fetch('/api/user/models')
            if (res.ok) {
                const data = await res.json()
                // 只有有数据时才覆盖默认值
                setUserModels({
                    llm: data.llm?.length > 0 ? data.llm : DEFAULT_MODELS.llm,
                    image: data.image?.length > 0 ? data.image : DEFAULT_MODELS.image,
                    video: data.video?.length > 0 ? data.video : DEFAULT_MODELS.video
                })

                // 🔥 自动修复无效的模型配置
                // 当存储的模型ID不在可用选项列表中时，自动更新为第一个有效选项
                const imageOptions = data.image?.length > 0 ? data.image : DEFAULT_MODELS.image
                const llmOptions = data.llm?.length > 0 ? data.llm : DEFAULT_MODELS.llm
                const videoOptions = data.video?.length > 0 ? data.video : DEFAULT_MODELS.video

                // 验证并修复图片模型
                const validImageIds = imageOptions.map((m: any) => m.value)
                if (characterModel && !validImageIds.includes(characterModel)) {
                    console.log(`[ConfigModals] 修复无效的 characterModel: ${characterModel} -> ${imageOptions[0]?.value}`)
                    onCharacterModelChange?.(imageOptions[0]?.value)
                }
                if (locationModel && !validImageIds.includes(locationModel)) {
                    console.log(`[ConfigModals] 修复无效的 locationModel: ${locationModel} -> ${imageOptions[0]?.value}`)
                    onLocationModelChange?.(imageOptions[0]?.value)
                }
                if (imageModel && !validImageIds.includes(imageModel)) {
                    console.log(`[ConfigModals] 修复无效的 imageModel (storyboard): ${imageModel} -> ${imageOptions[0]?.value}`)
                    onImageModelChange?.(imageOptions[0]?.value)
                }
                if (editModel && !validImageIds.includes(editModel)) {
                    console.log(`[ConfigModals] 修复无效的 editModel: ${editModel} -> ${imageOptions[0]?.value}`)
                    onEditModelChange?.(imageOptions[0]?.value)
                }

                // 验证并修复 LLM 模型
                const validLlmIds = llmOptions.map((m: any) => m.value)
                if (analysisModel && !validLlmIds.includes(analysisModel)) {
                    console.log(`[ConfigModals] 修复无效的 analysisModel: ${analysisModel} -> ${llmOptions[0]?.value}`)
                    onAnalysisModelChange?.(llmOptions[0]?.value)
                }

                // 验证并修复视频模型
                const validVideoIds = videoOptions.map((m: any) => m.value)
                if (videoModel && !validVideoIds.includes(videoModel)) {
                    console.log(`[ConfigModals] 修复无效的 videoModel: ${videoModel} -> ${videoOptions[0]?.value}`)
                    onVideoModelChange?.(videoOptions[0]?.value)
                }
            }
        } catch (error) {
            console.error(t('fetchModelsFailed') + ':', error)
        } finally {
            setModelsLoading(false)
        }
    }

    // ESC 键关闭
    useEffect(() => {
        if (!isOpen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    const showSaved = () => {
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
    }

    const handleChange = (callback?: (value: string) => void) => (value: string) => {
        callback?.(value)
        showSaved()
    }

    if (!isOpen) return null



    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm animate-fadeIn"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 w-full max-w-3xl border border-white/50 transform transition-all scale-100 max-h-[90vh] overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                        <span className="text-3xl">⚙️</span>
                        {t('title')}
                    </h2>
                    <div className="flex items-center gap-3">
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${saveStatus === 'saved'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-500'
                            }`}>
                            {saveStatus === 'saved' ? (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    {t('saved')}
                                </>
                            ) : (
                                <>
                                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                                    {t('autoSave')}
                                </>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="space-y-8">
                    {/* Section 1: 视觉风格 */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">{t('visualStyle')}</h3>
                        <div className="max-w-xs">
                            <StyleSelector
                                value={artStyle}
                                onChange={(value) => handleChange(onArtStyleChange)(value)}
                                options={ART_STYLES}
                            />
                        </div>
                    </div>

                    {/* Section 2: 模型参数 */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">{t('modelParams')}</h3>
                        {modelsLoading ? (
                            <div className="text-sm text-slate-400">{t('loadingModels')}</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* 分析模型 */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">{t('analysisModel')}</label>
                                    <select
                                        value={analysisModel || ''}
                                        onChange={(e) => handleChange(onAnalysisModelChange)(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-100"
                                    >
                                        {!analysisModel && <option value="">{t('pleaseSelect')}</option>}
                                        {userModels.llm.map(m => (
                                            <option key={m.value} value={m.value}>{m.label} ({getProviderDisplayName(m.provider)})</option>
                                        ))}
                                    </select>
                                </div>

                                {/* 人物生成模型 */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">{t('characterModel')}</label>
                                    <select
                                        value={characterModel || ''}
                                        onChange={(e) => handleChange(onCharacterModelChange)(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-100"
                                    >
                                        {!characterModel && <option value="">{t('pleaseSelect')}</option>}
                                        {userModels.image.map(m => (
                                            <option key={m.value} value={m.value}>{m.label} ({getProviderDisplayName(m.provider)})</option>
                                        ))}
                                    </select>
                                </div>

                                {/* 场景生成模型 */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">{t('locationModel')}</label>
                                    <select
                                        value={locationModel || ''}
                                        onChange={(e) => handleChange(onLocationModelChange)(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-100"
                                    >
                                        {!locationModel && <option value="">{t('pleaseSelect')}</option>}
                                        {userModels.image.map(m => (
                                            <option key={m.value} value={m.value}>{m.label} ({getProviderDisplayName(m.provider)})</option>
                                        ))}
                                    </select>
                                </div>

                                {/* 分镜图像模型 */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">{t('storyboardModel')}</label>
                                    <select
                                        value={imageModel || ''}
                                        onChange={(e) => handleChange(onImageModelChange)(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-100"
                                    >
                                        {!imageModel && <option value="">{t('pleaseSelect')}</option>}
                                        {userModels.image.map(m => (
                                            <option key={m.value} value={m.value}>{m.label} ({getProviderDisplayName(m.provider)})</option>
                                        ))}
                                    </select>
                                </div>

                                {/* 修图/编辑模型 */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">{t('editModel')}</label>
                                    <select
                                        value={editModel || ''}
                                        onChange={(e) => handleChange(onEditModelChange)(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-100"
                                    >
                                        {!editModel && <option value="">{t('pleaseSelect')}</option>}
                                        {userModels.image.map(m => (
                                            <option key={m.value} value={m.value}>{m.label} ({getProviderDisplayName(m.provider)})</option>
                                        ))}
                                    </select>
                                </div>



                                {/* 视频模型 */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">{t('videoModel')}</label>
                                    <select
                                        value={videoModel || ''}
                                        onChange={(e) => handleChange(onVideoModelChange)(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-100"
                                    >
                                        {!videoModel && <option value="">{t('pleaseSelect')}</option>}
                                        {userModels.video.map(m => (
                                            <option key={m.value} value={m.value}>{m.label} ({getProviderDisplayName(m.provider)})</option>
                                        ))}
                                    </select>
                                </div>

                                {/* 🔥 视频分辨率 */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">{t('videoResolution')}</label>
                                    <select
                                        value={videoResolution}
                                        onChange={(e) => handleChange(onVideoResolutionChange)(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-100"
                                    >
                                        {VIDEO_RESOLUTIONS.map(r => (
                                            <option key={r.value} value={r.value}>{r.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Section 3: 画面比例 */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">{t('aspectRatio')}</h3>
                        <div className="max-w-xs">
                            <RatioSelector
                                value={videoRatio}
                                onChange={(value) => { handleChange(onVideoRatioChange)(value) }}
                                options={VIDEO_RATIOS}
                            />
                        </div>
                    </div>


                </div>
            </div>
        </div>
    )
}

/**
 * WorldContextModal - 世界观与人设弹窗
 */
interface WorldContextModalProps {
    isOpen: boolean
    onClose: () => void
    text: string
    onChange: (value: string) => void
}

export function WorldContextModal({
    isOpen,
    onClose,
    text,
    onChange
}: WorldContextModalProps) {
    const t = useTranslations('worldContextModal')
    const tc = useTranslations('common')
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle')
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const handleTextChange = (value: string) => {
        onChange(value)
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
        }
        saveTimeoutRef.current = setTimeout(() => {
            setSaveStatus('saved')
            setTimeout(() => setSaveStatus('idle'), 2000)
        }, 500)
    }

    useEffect(() => {
        if (!isOpen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
            }
        }
    }, [])

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm animate-fadeIn"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 w-full max-w-3xl border border-white/50 transform transition-all scale-100 h-[80vh] flex flex-col">
                <div className="flex justify-between items-center mb-6 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">🌍</span>
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800">{t('title')}</h2>
                            <p className="text-slate-500 text-sm">{t('description')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${saveStatus === 'saved'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-500'
                            }`}>
                            {saveStatus === 'saved' ? (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    {tc('saved')}
                                </>
                            ) : (
                                <>
                                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                                    {tc('autoSave')}
                                </>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="flex-1 bg-white/50 border border-slate-200 rounded-xl p-4 overflow-hidden flex flex-col">
                    <textarea
                        value={text}
                        onChange={e => handleTextChange(e.target.value)}
                        placeholder={t('placeholder')}
                        className="flex-1 bg-transparent text-base resize-none outline-none leading-relaxed placeholder:text-slate-400/70 custom-scrollbar"
                    />
                </div>

                <div className="mt-6 pt-0 flex justify-start items-center flex-shrink-0">
                    <span className="text-xs text-slate-400">{t('hint')}</span>
                </div>
            </div>
        </div>
    )
}
