'use client'

/**
 * 智能导入向导组件（合并版）
 * 包含单页首页、分析中、预览三个阶段
 * 
 * 设计系统：SaaS Analytics Dashboard 风格
 * - 配色：Trust Blue (#2563EB) + CTA Orange (#F97316)
 * - 玻璃态推荐卡片
 * - 200ms transitions
 */


import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import mammoth from 'mammoth'
import { detectEpisodeMarkers, type EpisodeMarkerResult } from '@/lib/episode-marker-detector'
import { countWords } from '@/lib/word-count'

// 分集数据类型
export interface SplitEpisode {
    number: number
    title: string
    summary: string
    content: string
    wordCount: number
}

interface SmartImportWizardProps {
    onManualCreate: () => void
    onImportComplete: (episodes: SplitEpisode[], triggerGlobalAnalysis?: boolean) => void
    onCancel?: () => void
    projectId: string
    importStatus?: string | null  // 从父组件传入的导入状态
}

type WizardStage = 'select' | 'analyzing' | 'preview'

export default function SmartImportWizard({
    onManualCreate,
    onImportComplete,
    onCancel,
    projectId,
    importStatus
}: SmartImportWizardProps) {
    // 根据 importStatus 决定初始阶段
    const initialStage: WizardStage = importStatus === 'pending' ? 'preview' : 'select'
    const [stage, setStage] = useState<WizardStage>(initialStage)
    const [rawContent, setRawContent] = useState('')
    const [episodes, setEpisodes] = useState<SplitEpisode[]>([])
    const [selectedEpisode, setSelectedEpisode] = useState(0)
    const [error, setError] = useState<string | null>(null)
    const [analyzing, setAnalyzing] = useState(false)
    const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number; content: string } | null>(null)
    const [previewExpanded, setPreviewExpanded] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; index: number; title: string }>({ show: false, index: -1, title: '' })
    const fileInputRef = useRef<HTMLInputElement>(null)
    const t = useTranslations('smartImport')
    const tc = useTranslations('common')

    // 智能标记检测状态
    const [markerResult, setMarkerResult] = useState<EpisodeMarkerResult | null>(null)
    const [showMarkerConfirm, setShowMarkerConfirm] = useState(false)

    // 如果 importStatus 是 pending，尝试从数据库加载已保存的剧集
    useEffect(() => {
        if (importStatus === 'pending' && episodes.length === 0) {
            loadSavedEpisodes()
        }
    }, [importStatus])

    const loadSavedEpisodes = async () => {
        try {
            const res = await fetch(`/api/novel-promotion/${projectId}/episodes`)
            if (res.ok) {
                const data = await res.json()
                if (data.episodes && data.episodes.length > 0) {
                    // 转换为 SplitEpisode 格式
                    const loadedEpisodes: SplitEpisode[] = data.episodes.map((ep: any, idx: number) => ({
                        number: ep.episodeNumber || idx + 1,
                        title: ep.name || t('episode', { num: idx + 1 }),
                        summary: ep.description || '',
                        content: ep.novelText || '',
                        wordCount: countWords(ep.novelText || '')
                    }))
                    setEpisodes(loadedEpisodes)
                    setStage('preview')
                }
            }
        } catch (err) {
            console.error('[SmartImport] 加载已保存剧集失败:', err)
        }
    }

    // 处理文件上传（保留用于未来扩展）
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (file.size > 10 * 1024 * 1024) {
            setError(t('errors.fileTooLarge'))
            return
        }

        try {
            let text = ''
            const fileName = file.name.toLowerCase()

            if (fileName.endsWith('.docx')) {
                const arrayBuffer = await file.arrayBuffer()
                const result = await mammoth.extractRawText({ arrayBuffer })
                text = result.value
            } else if (fileName.endsWith('.doc')) {
                setError(t('errors.docNotSupported'))
                return
            } else {
                text = await file.text()
            }

            if (!text.trim()) {
                setError(t('errors.fileEmpty'))
                return
            }

            setUploadedFile({
                name: file.name,
                size: file.size,
                content: text
            })
            setRawContent(text)
            setError(null)
        } catch (err) {
            console.error('File read error:', err)
            setError(t('errors.fileReadError'))
        }
    }

    // 清除上传的文件
    const clearUploadedFile = () => {
        setUploadedFile(null)
        setRawContent('')
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const handleAnalyze = async () => {
        console.log('[SmartImport] handleAnalyze 被调用')
        console.log('[SmartImport] rawContent 长度:', rawContent.length)
        console.log('[SmartImport] projectId:', projectId)

        if (!rawContent.trim()) {
            setError(t('errors.uploadFirst'))
            return
        }

        // 默认检测标记，检测到就弹窗让用户选择
        const detection = detectEpisodeMarkers(rawContent)
        console.log('[SmartImport] 标记检测结果:', {
            hasMarkers: detection.hasMarkers,
            markerType: detection.markerType,
            confidence: detection.confidence,
            matchCount: detection.matches.length,
            previewSplitsCount: detection.previewSplits.length
        })

        // 检测到标记就显示确认弹窗，让用户决定
        if (detection.hasMarkers) {
            setMarkerResult(detection)
            setShowMarkerConfirm(true)
            return
        }

        // 未检测到标记，直接进入 AI 分析
        console.log('[SmartImport] 未检测到标记，将使用 AI 分析')
        await performAISplit()
    }

    // 执行 AI 分割
    const performAISplit = async () => {
        setShowMarkerConfirm(false)
        setAnalyzing(true)
        setStage('analyzing')
        setError(null)

        try {
            console.log('[SmartImport] 开始调用 split API...')
            const res = await fetch(`/api/novel-promotion/${projectId}/episodes/split`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: rawContent })
            })
            console.log('[SmartImport] API 响应状态:', res.status)

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || t('errors.analyzeFailed'))
            }

            const data = await res.json()
            setEpisodes(data.episodes)

            // 自动保存到数据库并设置 importStatus = 'pending'
            const saveRes = await fetch(`/api/novel-promotion/${projectId}/episodes/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    episodes: data.episodes.map((ep: SplitEpisode) => ({
                        name: ep.title,
                        description: ep.summary,
                        novelText: ep.content
                    })),
                    clearExisting: true,
                    importStatus: 'pending'
                })
            })

            if (!saveRes.ok) {
                console.warn('[SmartImport] 自动保存失败，继续显示预览')
            } else {
                console.log('[SmartImport] 剧集已自动保存到数据库，状态：pending')
            }

            setStage('preview')
        } catch (err: any) {
            setError(err.message || t('errors.analyzeFailed'))
            setStage('select')
        } finally {
            setAnalyzing(false)
        }
    }

    // 使用标记分割
    const handleMarkerSplit = async () => {
        if (!markerResult) return

        setShowMarkerConfirm(false)
        setAnalyzing(true)
        setStage('analyzing')
        setError(null)

        try {
            const res = await fetch(`/api/novel-promotion/${projectId}/episodes/split-by-markers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: rawContent })
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || t('errors.analyzeFailed'))
            }

            const data = await res.json()
            setEpisodes(data.episodes)

            // 自动保存到数据库
            const saveRes = await fetch(`/api/novel-promotion/${projectId}/episodes/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    episodes: data.episodes.map((ep: SplitEpisode) => ({
                        name: ep.title,
                        description: ep.summary,
                        novelText: ep.content
                    })),
                    clearExisting: true,
                    importStatus: 'pending'
                })
            })

            if (!saveRes.ok) {
                console.warn('[SmartImport] 标记分割保存失败，继续显示预览')
            } else {
                console.log('[SmartImport] 标记分割剧集已保存')
            }

            setStage('preview')
        } catch (err: any) {
            setError(err.message || t('errors.analyzeFailed'))
            setStage('select')
        } finally {
            setAnalyzing(false)
        }
    }

    // 更新剧集标题
    const updateEpisodeTitle = (index: number, title: string) => {
        setEpisodes(prev => prev.map((ep, i) =>
            i === index ? { ...ep, title } : ep
        ))
    }

    // 更新剧集简介
    const updateEpisodeSummary = (index: number, summary: string) => {
        setEpisodes(prev => prev.map((ep, i) =>
            i === index ? { ...ep, summary } : ep
        ))
    }

    // 更新剧集内容
    const updateEpisodeContent = (index: number, content: string) => {
        setEpisodes(prev => prev.map((ep, i) =>
            i === index ? { ...ep, content, wordCount: countWords(content) } : ep
        ))
    }

    // 删除剧集
    const deleteEpisode = (index: number) => {
        if (episodes.length <= 1) return
        setEpisodes(prev => prev.filter((_, i) => i !== index))
        if (selectedEpisode >= episodes.length - 1) {
            setSelectedEpisode(Math.max(0, episodes.length - 2))
        }
    }

    // 确认完成 - 保存最新更改并退出向导
    const [saving, setSaving] = useState(false)

    const handleConfirm = async (triggerGlobalAnalysis: boolean = false) => {
        setSaving(true)
        setError(null)

        try {
            const res = await fetch(`/api/novel-promotion/${projectId}/episodes/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    episodes: episodes.map(ep => ({
                        name: ep.title,
                        description: ep.summary,
                        novelText: ep.content
                    })),
                    clearExisting: true,
                    importStatus: 'completed',
                    triggerGlobalAnalysis  // 传递给后端或父组件
                })
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || t('errors.saveFailed'))
            }

            console.log('[SmartImport] 剧集已保存到数据库，状态：completed, 触发全局分析:', triggerGlobalAnalysis)

            // 将 triggerGlobalAnalysis 传递给父组件
            onImportComplete(episodes, triggerGlobalAnalysis)
        } catch (err: any) {
            console.error('[SmartImport] 保存失败:', err)
            setError(err.message || t('errors.saveFailed'))
        } finally {
            setSaving(false)
        }
    }

    // 取消 - 删除已保存的数据
    const handleCancel = async () => {
        if (!confirm(t('cancelConfirm'))) {
            return
        }

        try {
            await fetch(`/api/novel-promotion/${projectId}/episodes/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    episodes: [],
                    clearExisting: true
                })
            })
            console.log('[SmartImport] 已清空剧集')
        } catch (err) {
            console.error('[SmartImport] 清空失败:', err)
        }

        setStage('select')
        setEpisodes([])
        setRawContent('')
        setUploadedFile(null)
        if (onCancel) {
            onCancel()
        }
    }

    // ============ 首页（合并 select + upload） ============
    if (stage === 'select') {
        return (
            <div className="min-h-[calc(100vh-200px)] flex items-center justify-center p-8">
                {/* 标记检测确认弹窗 */}
                {showMarkerConfirm && markerResult && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowMarkerConfirm(false)}>
                        <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                            <div className="text-center mb-6">
                                <div className="w-14 h-14 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-2">{t('markerDetected.title')}</h3>
                                <p className="text-slate-600">
                                    {t('markerDetected.description', {
                                        count: markerResult.matches.length,
                                        type: t(`markerDetected.markerTypes.${markerResult.markerTypeKey}` as any)
                                    })}
                                </p>
                            </div>

                            <div className="mb-6">
                                <p className="text-sm font-medium text-slate-500 mb-3">{t('markerDetected.preview')}</p>
                                <div className="bg-slate-50 rounded-xl p-4 max-h-64 overflow-y-auto space-y-2">
                                    {markerResult.previewSplits.map((split, idx) => (
                                        <div key={idx} className="flex items-start gap-3 text-sm">
                                            <span className="flex-shrink-0 w-16 font-medium text-blue-600">
                                                {t('episode', { num: split.number })}
                                            </span>
                                            <span className="text-slate-600 truncate flex-1">
                                                {split.preview || split.title}
                                            </span>
                                            <span className="flex-shrink-0 text-slate-400 text-xs">
                                                ~{split.wordCount.toLocaleString()}{t('upload.words')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <button
                                    onClick={handleMarkerSplit}
                                    className="py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg shadow-blue-600/25 flex flex-col items-center gap-1"
                                >
                                    <span>{t('markerDetected.useMarker')}</span>
                                    <span className="text-xs font-normal opacity-80">{t('markerDetected.useMarkerDesc')}</span>
                                </button>
                                <button
                                    onClick={() => { setShowMarkerConfirm(false); setMarkerResult(null); performAISplit(); }}
                                    className="py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-xl font-bold hover:border-blue-500 hover:bg-blue-50 transition-all flex flex-col items-center gap-1"
                                >
                                    <span>{t('markerDetected.useAI')}</span>
                                    <span className="text-xs font-normal text-slate-500">{t('markerDetected.useAIDesc')}</span>
                                </button>
                            </div>

                            <button
                                onClick={() => setShowMarkerConfirm(false)}
                                className="w-full py-2.5 text-slate-500 hover:text-slate-700 font-medium transition-colors"
                            >
                                {t('markerDetected.cancel')}
                            </button>
                        </div>
                    </div>
                )}

                <div className="max-w-5xl w-full">
                    {/* 标题区域 */}
                    <div className="text-center mb-12 relative">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl -z-10"></div>
                        <div className="inline-block relative">
                            <h1 className="text-5xl md:text-6xl font-extrabold mb-6 tracking-tight">
                                <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 animate-gradient-x">
                                    {t('title')}
                                </span>
                            </h1>
                            <div className="absolute -top-6 -right-8 text-4xl animate-bounce delay-700">✨</div>
                        </div>
                        <p className="text-slate-500 text-xl font-medium max-w-2xl mx-auto leading-relaxed">
                            {t('subtitle')}
                        </p>
                    </div>

                    {/* 两栏布局 */}
                    <div className="grid md:grid-cols-2 gap-8 items-stretch">
                        {/* 左侧：手动创作 */}
                        <button
                            onClick={onManualCreate}
                            className="group bg-white border-2 border-slate-200 hover:border-blue-600 rounded-2xl p-8 text-left transition-all duration-200 hover:shadow-xl cursor-pointer flex flex-col justify-center"
                        >
                            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-blue-50 transition-colors duration-200">
                                <svg className="w-8 h-8 text-slate-600 group-hover:text-blue-600 transition-colors duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-bold mb-3 text-slate-900">{t('manualCreate.title')}</h3>
                            <p className="text-slate-500 mb-6 leading-relaxed">{t('manualCreate.description')}</p>
                            <div className="flex items-center text-blue-600 font-bold">
                                <span>{t('manualCreate.button')}</span>
                                <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                        </button>

                        {/* 右侧：智能文本分集 */}
                        <div className="relative rounded-2xl border-2 border-slate-200 bg-white p-6 flex flex-col">

                            {/* 标题 */}
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl flex items-center justify-center">
                                    <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-slate-900">{t('smartImport.title')}</h3>
                                    <p className="text-sm text-slate-500">{t('smartImport.description')}</p>
                                </div>
                            </div>

                            {/* 输入框 */}
                            <div className="flex-grow flex flex-col">
                                <textarea
                                    value={rawContent}
                                    onChange={(e) => setRawContent(e.target.value)}
                                    className="flex-grow w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all resize-none leading-relaxed min-h-[180px]"
                                    placeholder={t('upload.placeholder')}
                                />

                                {/* 底部：左侧字数，右侧按钮 */}
                                <div className="mt-4 flex items-center justify-between gap-6">
                                    {/* 左侧：字数 + 限制 */}
                                    <span className="text-sm text-slate-400 whitespace-nowrap">
                                        {countWords(rawContent).toLocaleString()} {t('upload.words')} / 30,000
                                    </span>
                                    {/* 右侧：按钮 */}
                                    <button
                                        onClick={handleAnalyze}
                                        disabled={!rawContent.trim() || rawContent.length < 100}
                                        className="px-5 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold shadow-lg shadow-blue-600/25 hover:from-blue-700 hover:to-purple-700 hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2 whitespace-nowrap"
                                    >
                                        <span>{t('upload.startAnalysis')}</span>
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* 错误提示 */}
                            {error && (
                                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                                    {error}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // ============ 分析中 ============
    if (stage === 'analyzing') {
        return (
            <div className="min-h-[calc(100vh-200px)] flex items-center justify-center p-8">
                <div className="text-center">
                    {/* 流动波浪条动画 */}
                    <div className="flex gap-1.5 justify-center mb-8">
                        {[0, 1, 2, 3, 4].map((i) => (
                            <div
                                key={i}
                                className="w-3 h-12 bg-gradient-to-t from-blue-600 to-cyan-400 rounded-full"
                                style={{
                                    animation: `wave 1s ease-in-out infinite`,
                                    animationDelay: `${i * 0.1}s`
                                }}
                            />
                        ))}
                    </div>
                    <h2 className="text-xl font-semibold text-slate-900 mb-2">{t('analyzing.title')}</h2>
                    <p className="text-slate-600">{t('analyzing.description')}</p>
                    <p className="text-sm text-slate-400 mt-2">{t('analyzing.autoSave')}</p>

                    {/* 波浪动画样式 */}
                    <style jsx>{`
                        @keyframes wave {
                            0%, 100% { transform: scaleY(0.4); }
                            50% { transform: scaleY(1); }
                        }
                    `}</style>
                </div>
            </div>
        )
    }

    // ============ 预览编辑页 ============
    return (
        <div className="p-6">
            {/* 删除确认弹窗 */}
            {deleteConfirm.show && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirm({ show: false, index: -1, title: '' })}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="text-center mb-6">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 mb-2">{t('preview.deleteConfirm.title')}</h3>
                            <p className="text-slate-600">{t('preview.deleteConfirm.message', { title: deleteConfirm.title })}</p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm({ show: false, index: -1, title: '' })}
                                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                            >
                                {t('preview.deleteConfirm.cancel')}
                            </button>
                            <button
                                onClick={() => {
                                    deleteEpisode(deleteConfirm.index)
                                    setDeleteConfirm({ show: false, index: -1, title: '' })
                                }}
                                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                            >
                                {t('preview.deleteConfirm.confirm')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 顶部栏 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-semibold mb-2">{t('preview.title')}</h2>
                        <p className="text-slate-600">
                            {t('preview.episodeCount', { count: episodes.length })}，
                            {t('preview.totalWords', { count: episodes.reduce((sum, ep) => sum + ep.wordCount, 0).toLocaleString() })}
                            <span className="text-green-600 ml-2">{t('preview.autoSaved')}</span>
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setStage('select')}
                            className="px-5 py-2.5 border border-slate-300 rounded-lg font-medium hover:bg-slate-50 transition-colors duration-200"
                        >
                            {t('preview.reanalyze')}
                        </button>
                        <button
                            onClick={() => handleConfirm()}
                            disabled={saving}
                            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                            {saving ? t('preview.saving') : t('preview.confirm')}
                        </button>
                        {/* 多集时显示「确认并开启全局分析」按钮 */}
                        {episodes.length > 1 && (
                            <button
                                onClick={() => handleConfirm(true)}
                                disabled={saving}
                                className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg font-semibold hover:from-purple-600 hover:to-blue-600 transition-all duration-200 shadow-lg shadow-purple-300/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                                🌐 {t('globalAnalysis.confirmAndAnalyze')}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* 左侧：剧集列表 */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 sticky top-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-lg">{t('preview.episodeList')}</h3>
                            <span className="text-sm text-slate-500">{episodes.length} {t('preview.episodeList')}</span>
                        </div>

                        <div className="space-y-3 max-h-[400px] overflow-y-auto">
                            {episodes.map((ep, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => setSelectedEpisode(idx)}
                                    className={`p-4 rounded-xl transition-all duration-200 cursor-pointer relative group ${selectedEpisode === idx
                                        ? 'bg-blue-50 border-2 border-blue-600'
                                        : 'bg-white border border-slate-200 hover:border-blue-600'
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        {/* 完全可编辑的剧集名称 */}
                                        <input
                                            type="text"
                                            value={t('episode', { num: ep.number })}
                                            onChange={(e) => {
                                                // 尝试从输入中提取数字，否则保持原样
                                                const match = e.target.value.match(/\d+/)
                                                const newNumber = match ? parseInt(match[0]) : ep.number
                                                setEpisodes(prev => prev.map((episode, i) =>
                                                    i === idx ? { ...episode, number: newNumber } : episode
                                                ))
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            className={`font-semibold bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none w-24 ${selectedEpisode === idx ? 'text-blue-600' : 'text-slate-700'}`}
                                        />
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${selectedEpisode === idx ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                {ep.wordCount.toLocaleString()} {t('upload.words')}
                                            </span>
                                            {/* 删除按钮 */}
                                            {episodes.length > 1 && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setDeleteConfirm({
                                                            show: true,
                                                            index: idx,
                                                            title: t('episode', { num: ep.number })
                                                        })
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 rounded transition-all"
                                                    title={t('preview.deleteEpisode')}
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {/* 可编辑的标题 */}
                                    <input
                                        type="text"
                                        value={ep.title}
                                        onChange={(e) => updateEpisodeTitle(idx, e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        placeholder={t('preview.episodePlaceholder')}
                                        className="text-sm text-slate-700 font-medium w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none"
                                    />
                                    {/* 可编辑的简介 */}
                                    <input
                                        type="text"
                                        value={ep.summary}
                                        onChange={(e) => updateEpisodeSummary(idx, e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        placeholder={t('preview.summaryPlaceholder')}
                                        className="text-xs text-slate-500 w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none mt-1"
                                    />
                                </div>
                            ))}
                        </div>

                        {/* 添加剧集按钮 */}
                        <button
                            onClick={() => {
                                const newEpisode: SplitEpisode = {
                                    number: episodes.length + 1,
                                    title: `${t('preview.newEpisode')} ${episodes.length + 1}`,
                                    summary: '',
                                    content: '',
                                    wordCount: 0
                                }
                                setEpisodes(prev => [...prev, newEpisode])
                                setSelectedEpisode(episodes.length)
                            }}
                            className="w-full mt-4 py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all duration-200 flex items-center justify-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            {t('preview.addEpisode')}
                        </button>

                        {/* 统计 */}
                        <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-600">{t('preview.averageWords')}</span>
                                <span className="font-semibold">
                                    {episodes.length > 0 ? Math.round(episodes.reduce((sum, ep) => sum + ep.wordCount, 0) / episodes.length).toLocaleString() : 0} {t('upload.words')}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 右侧：内容编辑 */}
                <div className="lg:col-span-2">
                    {episodes[selectedEpisode] && (
                        <div className="bg-white rounded-2xl border border-slate-200 p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <input
                                        type="text"
                                        value={episodes[selectedEpisode].title}
                                        onChange={(e) => updateEpisodeTitle(selectedEpisode, e.target.value)}
                                        className="text-2xl font-semibold border-b-2 border-transparent hover:border-slate-200 focus:border-blue-600 focus:outline-none transition-colors duration-200 px-2"
                                    />
                                    <span className="text-sm text-slate-500">{t('episode', { num: episodes[selectedEpisode].number })}</span>
                                </div>
                                <span className="text-sm text-slate-400">{episodes[selectedEpisode].wordCount.toLocaleString()} {t('upload.words')}</span>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <label className="text-sm font-semibold text-slate-700">{t('preview.episodeContent')}</label>
                                    <span className="text-sm text-slate-500">{episodes[selectedEpisode].wordCount.toLocaleString()} {t('upload.words')}</span>
                                </div>
                                <textarea
                                    rows={16}
                                    value={episodes[selectedEpisode].content}
                                    onChange={(e) => updateEpisodeContent(selectedEpisode, e.target.value)}
                                    className="w-full border border-slate-300 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent resize-none font-mono text-sm leading-relaxed"
                                />
                            </div>

                            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                                <div className="flex items-start gap-3">
                                    <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <div className="flex-1">
                                        <p className="font-medium text-blue-900 mb-1">{t('plotSummary')}</p>
                                        <p className="text-sm text-blue-800">
                                            {episodes[selectedEpisode].summary || t('preview.summaryPlaceholder')}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
