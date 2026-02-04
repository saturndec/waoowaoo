'use client'
import { useTranslations } from 'next-intl'

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'

interface VoiceDesignDialogProps {
    isOpen: boolean
    speaker: string
    hasExistingVoice?: boolean
    onClose: () => void
    onSave: (voiceId: string, audioBase64: string) => void
    projectId: string
}

interface GeneratedVoice {
    voiceId: string
    audioBase64: string
    audioUrl: string
}

// 声音风格预设键（翻译存储在 voice.json）
const VOICE_PRESET_KEYS = [
    'maleBroadcaster',
    'gentleFemale',
    'matureMale',
    'livelyFemale',
    'intellectualFemale',
    'narrator'
] as const

export default function VoiceDesignDialog({
    isOpen,
    speaker,
    hasExistingVoice = false,
    onClose,
    onSave,
    projectId
}: VoiceDesignDialogProps) {
    const t = useTranslations('common')
    const tv = useTranslations('voice.voiceDesign')
    const [voicePrompt, setVoicePrompt] = useState('')
    const [previewText, setPreviewText] = useState(tv('defaultPreviewText'))
    const [isGenerating, setIsGenerating] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [generatedVoices, setGeneratedVoices] = useState<GeneratedVoice[]>([])
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
    const [showConfirmDialog, setShowConfirmDialog] = useState(false)
    const [playingIndex, setPlayingIndex] = useState<number | null>(null)
    const audioRef = useRef<HTMLAudioElement | null>(null)

    const handleGenerate = async () => {
        if (!voicePrompt.trim()) {
            setError(tv('pleaseSelectStyle'))
            return
        }

        setIsGenerating(true)
        setError(null)
        setGeneratedVoices([])
        setSelectedIndex(null)

        try {
            const voices: GeneratedVoice[] = []

            for (let i = 0; i < 3; i++) {
                const safeName = `voice_${Date.now().toString(36)}_${i + 1}`.slice(0, 16)

                const response = await fetch(`/api/novel-promotion/${projectId}/voice-design`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        voicePrompt: voicePrompt.trim(),
                        previewText: previewText.trim(),
                        preferredName: safeName,
                        language: 'zh'
                    })
                })

                const data = await response.json()

                if (!response.ok) {
                    // 💰 余额不足特殊处理
                    if (response.status === 402) {
                        alert(t('insufficientBalance') + '\n\n' + (data.error || t('insufficientBalanceDetail')))
                        throw new Error('INSUFFICIENT_BALANCE')
                    }
                    throw new Error(data.error || tv('generateFailed', { n: i + 1 }))
                }

                if (data.audioBase64) {
                    voices.push({
                        voiceId: data.voiceId,
                        audioBase64: data.audioBase64,
                        audioUrl: `data:audio/wav;base64,${data.audioBase64}`
                    })
                }
            }

            if (voices.length === 0) {
                throw new Error(tv('noVoiceGenerated'))
            }

            setGeneratedVoices(voices)

        } catch (err: any) {
            setError(err.message || tv('generationError'))
        } finally {
            setIsGenerating(false)
        }
    }

    const handlePlayVoice = (index: number) => {
        if (audioRef.current) {
            audioRef.current.pause()
        }
        setPlayingIndex(index)
        const audio = new Audio(generatedVoices[index].audioUrl)
        audioRef.current = audio
        audio.onended = () => setPlayingIndex(null)
        audio.play()
    }

    const handleConfirmSelection = () => {
        if (selectedIndex !== null && generatedVoices[selectedIndex]) {
            if (hasExistingVoice) {
                setShowConfirmDialog(true)
            } else {
                doSave()
            }
        }
    }

    const doSave = () => {
        if (selectedIndex !== null && generatedVoices[selectedIndex]) {
            const voice = generatedVoices[selectedIndex]
            onSave(voice.voiceId, voice.audioBase64)
            handleClose()
        }
    }

    const handleClose = () => {
        setVoicePrompt('')
        setPreviewText(tv('defaultPreviewText'))
        setError(null)
        setGeneratedVoices([])
        setSelectedIndex(null)
        setShowConfirmDialog(false)
        setPlayingIndex(null)
        if (audioRef.current) {
            audioRef.current.pause()
        }
        onClose()
    }

    if (!isOpen) return null

    // 使用 Portal 渲染到 body，确保弹窗在真正的 viewport 正中间
    if (typeof document === 'undefined') return null

    const dialogContent = (
        <>
            {/* 背景遮罩 */}
            <div
                className="fixed inset-0 z-[9999] bg-black/30"
                onClick={handleClose}
            />
            {/* 对话框 - 始终在用户屏幕正中间 */}
            <div
                className="fixed z-[10000] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-white/50"
                onClick={e => e.stopPropagation()}
            >
                {/* 简洁头部 */}
                <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">🎤</span>
                        <h2 className="font-semibold text-gray-800">
                            {tv('designVoiceFor', { speaker })}
                        </h2>
                        {hasExistingVoice && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">{tv('hasExistingVoice')}</span>
                        )}
                    </div>
                    <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 p-1">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 内容区 */}
                <div className="p-5 space-y-4">
                    {/* 快速选择 - 紧凑型 */}
                    <div>
                        <div className="text-sm text-gray-600 mb-2">{tv('selectStyle')}</div>
                        <div className="flex flex-wrap gap-1.5">
                            {VOICE_PRESET_KEYS.map((presetKey, idx) => {
                                const prompt = tv(`presetsPrompts.${presetKey}` as any)
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => setVoicePrompt(prompt)}
                                        className={`px-2.5 py-1 text-xs rounded-md border transition-all ${voicePrompt === prompt
                                            ? 'bg-indigo-500 text-white border-indigo-500'
                                            : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                                            }`}
                                    >
                                        {tv(`presets.${presetKey}` as any)}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* 自定义描述 */}
                    <div>
                        <div className="text-sm text-gray-600 mb-1">{tv('orCustomDescription')}</div>
                        <textarea
                            value={voicePrompt}
                            onChange={(e) => setVoicePrompt(e.target.value)}
                            placeholder={tv('describePlaceholder')}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                            rows={2}
                        />
                    </div>

                    {/* 预览文本 - 可折叠 */}
                    <details className="text-sm">
                        <summary className="text-gray-500 cursor-pointer hover:text-gray-700">
                            {tv('editPreviewText')}
                        </summary>
                        <input
                            type="text"
                            value={previewText}
                            onChange={(e) => setPreviewText(e.target.value)}
                            className="w-full mt-2 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                    </details>

                    {/* 错误提示 */}
                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                            ⚠️ {error}
                        </div>
                    )}

                    {/* 生成按钮 */}
                    {generatedVoices.length === 0 && !isGenerating && (
                        <button
                            onClick={handleGenerate}
                            disabled={!voicePrompt.trim()}
                            className="w-full py-2.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                        >
                            {tv('generate3Schemes')}
                        </button>
                    )}

                    {/* 生成中 */}
                    {isGenerating && (
                        <div className="text-center py-6">
                            <svg className="animate-spin w-8 h-8 mx-auto text-indigo-500 mb-2" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <div className="text-sm text-gray-600">{tv('generating3Schemes')}</div>
                            <div className="text-xs text-gray-400 mt-1">{tv('estimatedTime')}</div>
                        </div>
                    )}

                    {/* 声音选项 - 紧凑型横向排列 */}
                    {generatedVoices.length > 0 && (
                        <div className="space-y-3">
                            <div className="text-sm text-gray-600">{tv('selectScheme')}</div>
                            <div className="grid grid-cols-3 gap-2">
                                {generatedVoices.map((voice, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => setSelectedIndex(idx)}
                                        className={`relative p-3 rounded-lg border-2 cursor-pointer transition-all text-center ${selectedIndex === idx
                                            ? 'border-indigo-500 bg-indigo-50'
                                            : 'border-gray-200 hover:border-indigo-300'
                                            }`}
                                    >
                                        {selectedIndex === idx && (
                                            <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
                                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                        )}
                                        <div className="text-sm font-medium text-gray-700 mb-2">{tv('schemeN', { n: idx + 1 })}</div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handlePlayVoice(idx)
                                            }}
                                            className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center transition-all ${playingIndex === idx
                                                ? 'bg-indigo-500 text-white animate-pulse'
                                                : 'bg-gray-100 text-gray-600 hover:bg-indigo-100'
                                                }`}
                                        >
                                            {playingIndex === idx ? (
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                    <rect x="6" y="5" width="4" height="14" rx="1" />
                                                    <rect x="14" y="5" width="4" height="14" rx="1" />
                                                </svg>
                                            ) : (
                                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M8 5v14l11-7z" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* 底部操作 */}
                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={handleGenerate}
                                    disabled={isGenerating}
                                    className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-sm"
                                >
                                    {tv('regenerate')}
                                </button>
                                <button
                                    onClick={handleConfirmSelection}
                                    disabled={selectedIndex === null}
                                    className="flex-1 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                >
                                    {tv('confirmUse')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 确认覆盖对话框 */}
            {showConfirmDialog && (
                <>
                    <div
                        className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/30"
                    >
                        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-sm p-5 text-center border border-white/50">
                            <div className="w-12 h-12 mx-auto bg-yellow-100 rounded-full flex items-center justify-center mb-3">
                                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h3 className="font-semibold text-gray-900 mb-1">{tv('confirmReplace')}</h3>
                            <p className="text-sm text-gray-500 mb-4">
                                {tv('replaceWarning')}<span className="font-medium text-gray-700">「{speaker}」</span>
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowConfirmDialog(false)}
                                    className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-sm"
                                >
                                    {t("cancel")}
                                </button>
                                <button
                                    onClick={doSave}
                                    className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm"
                                >
                                    {tv('confirmReplaceBtn')}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </>
    )

    // 使用 createPortal 渲染到 body
    return createPortal(dialogContent, document.body)
}
