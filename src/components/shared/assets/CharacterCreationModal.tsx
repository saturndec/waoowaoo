'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { ART_STYLES } from '@/lib/constants'
import { shouldShowError } from '@/lib/error-utils'

export interface CharacterCreationModalProps {
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
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
)

const SparklesIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
)

const PhotoIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
)

export function CharacterCreationModal({
    mode,
    folderId,
    projectId,
    onClose,
    onSuccess
}: CharacterCreationModalProps) {
    const t = useTranslations('assetModal')

    // 根据模式确定 API 路径
    const apiBase = mode === 'asset-hub'
        ? '/api/asset-hub'
        : `/api/novel-promotion/${projectId}`

    // 创建模式：'description' 描述模式，'reference' 参考图模式
    const [createMode, setCreateMode] = useState<'reference' | 'description'>('description')

    // 表单字段
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [aiInstruction, setAiInstruction] = useState('')
    const [artStyle, setArtStyle] = useState('american-comic')

    // 参考图上传相关状态（🔥 支持最多 5 张）
    const [referenceImagesBase64, setReferenceImagesBase64] = useState<string[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isAiDesigning, setIsAiDesigning] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // 🔥 参考图子模式：'direct' 直接图生图，'extract' 反推提示词后文生图
    const [referenceSubMode, setReferenceSubMode] = useState<'direct' | 'extract'>('direct')
    const [extractedDescription, setExtractedDescription] = useState('')
    const [isExtracting, setIsExtracting] = useState(false)

    // 🆕 子形象模式
    const [isSubAppearance, setIsSubAppearance] = useState(false)
    const [selectedCharacterId, setSelectedCharacterId] = useState('')
    const [changeReason, setChangeReason] = useState('')
    const [characters, setCharacters] = useState<Array<{ id: string; name: string; appearances?: Array<{ changeReason: string }> }>>([])

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

    // 🆕 项目模式:获取角色列表用于子形象选择
    useEffect(() => {
        if (mode === 'project' && projectId) {
            fetch(`/api/novel-promotion/${projectId}/assets`)
                .then(res => res.json())
                .then(data => {
                    if (data.characters) {
                        setCharacters(data.characters.map((c: any) => ({
                            id: c.id,
                            name: c.name,
                            appearances: c.appearances || []
                        })))
                    }
                })
                .catch(err => console.error('Failed to fetch characters:', err))
        }
    }, [mode, projectId])

    // 全局粘贴监听
    useEffect(() => {
        const handleGlobalPaste = (e: ClipboardEvent) => {
            if (createMode !== 'reference') return

            const target = e.target as HTMLElement
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                return
            }

            const items = e.clipboardData?.items
            if (!items) return

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                    const file = items[i].getAsFile()
                    if (file) {
                        e.preventDefault()
                        handleFileSelect([file])  // 🔥 传入数组
                        break
                    }
                }
            }
        }

        document.addEventListener('paste', handleGlobalPaste)
        return () => document.removeEventListener('paste', handleGlobalPaste)
    }, [createMode])

    // 处理图片选择（🔥 支持多张）
    const handleFileSelect = async (files: FileList | File[]) => {
        const fileArray = Array.from(files)
        const validFiles = fileArray.filter(f => f.type.startsWith('image/'))
        if (validFiles.length === 0) return

        // 最多 5 张
        const remaining = 5 - referenceImagesBase64.length
        const toAdd = validFiles.slice(0, remaining)

        for (const file of toAdd) {
            const reader = new FileReader()
            reader.onload = (e) => {
                const base64 = e.target?.result as string
                setReferenceImagesBase64(prev => {
                    if (prev.length >= 5) return prev
                    if (prev.includes(base64)) return prev  // 去重
                    return [...prev, base64]
                })
            }
            reader.readAsDataURL(file)
        }
    }

    // 处理拖放（🔥 支持多张）
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const files = e.dataTransfer.files
        if (files.length > 0) handleFileSelect(files)  // 🔥 传入所有文件
    }

    // 点击选择文件
    const handleClickUpload = () => {
        fileInputRef.current?.click()
    }

    // 清除参考图（🔥 支持单张或清空全部）
    const handleClearReference = (index?: number) => {
        if (index !== undefined) {
            setReferenceImagesBase64(prev => prev.filter((_, i) => i !== index))
        } else {
            setReferenceImagesBase64([])
        }
    }

    // 🔥 提取图片描述（反推提示词）
    const handleExtractDescription = async () => {
        if (referenceImagesBase64.length === 0) return

        try {
            setIsExtracting(true)

            // 上传所有参考图获取 URL 数组
            const uploadPromises = referenceImagesBase64.map(async (base64) => {
                const uploadRes = await fetch('/api/asset-hub/upload-temp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageBase64: base64 })
                })
                if (!uploadRes.ok) throw new Error('上传失败')
                const { url } = await uploadRes.json()
                return url
            })

            const referenceImageUrls = await Promise.all(uploadPromises)

            // 调用 API 提取描述
            const extractUrl = `${apiBase}/reference-to-character`
            const res = await fetch(extractUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    referenceImageUrls,
                    extractOnly: true  // 🔥 仅提取描述模式
                })
            })

            if (res.ok) {
                const data = await res.json()
                setExtractedDescription(data.description || '')
            } else {
                const error = await res.json()
                alert(error.error || '提取描述失败')
            }
        } catch (error: any) {
            if (shouldShowError(error)) {
                alert(error.message || '提取描述失败')
            }
        } finally {
            setIsExtracting(false)
        }
    }

    // 使用参考图创建角色（🔥 支持多张 + 支持文生图模式）
    const handleCreateWithReference = async () => {
        if (!name.trim() || referenceImagesBase64.length === 0) return

        try {
            setIsSubmitting(true)

            // 🔥 上传所有参考图获取 URL 数组
            const uploadPromises = referenceImagesBase64.map(async (base64) => {
                const uploadRes = await fetch('/api/asset-hub/upload-temp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageBase64: base64 })
                })
                if (!uploadRes.ok) throw new Error('上传失败')
                const { url } = await uploadRes.json()
                return url
            })

            const referenceImageUrls = await Promise.all(uploadPromises)

            // 🔥 反推提示词模式：先自动提取描述
            let finalCustomDescription: string | undefined = undefined
            if (referenceSubMode === 'extract') {
                const extractUrl = `${apiBase}/reference-to-character`
                const extractRes = await fetch(extractUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        referenceImageUrls,
                        extractOnly: true
                    })
                })
                if (extractRes.ok) {
                    const extractData = await extractRes.json()
                    finalCustomDescription = extractData.description
                } else {
                    const error = await extractRes.json()
                    throw new Error(error.error || '提取描述失败')
                }
            }

            // 根据模式调用不同的创建 API
            const createUrl = mode === 'asset-hub'
                ? '/api/asset-hub/characters'
                : `${apiBase}/character`

            const body: any = {
                name: name.trim(),
                description: finalCustomDescription || description.trim() || `${name.trim()} 的角色设定`,
                referenceImageUrls,
                generateFromReference: true,
                // 🔥 文生图模式：传递 customDescription 让后端使用描述而不是参考图
                customDescription: finalCustomDescription,
                // 🔥 传递风格
                artStyle
            }

            // Asset Hub 模式需要 folderId
            if (mode === 'asset-hub') {
                body.folderId = folderId
            }

            const res = await fetch(createUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })

            if (res.ok) {
                onSuccess()
                onClose()
            } else {
                const error = await res.json()
                if (res.status === 402) {
                    alert(error.error || '账户余额不足')
                } else {
                    alert(error.error || '创建失败')
                }
            }
        } catch (error: any) {
            if (shouldShowError(error)) {
                alert(error.message || '创建失败')
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    // AI 设计描述
    const handleAiDesign = async () => {
        if (!aiInstruction.trim()) return

        try {
            setIsAiDesigning(true)

            // 根据模式调用不同的 AI 设计 API
            const aiUrl = mode === 'asset-hub'
                ? '/api/asset-hub/ai-design-character'
                : `${apiBase}/ai-create-character`

            // 统一使用 userInstruction 字段
            const body = { userInstruction: aiInstruction }

            const res = await fetch(aiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })

            if (res.ok) {
                const data = await res.json()
                setDescription(data.prompt || '')
                setAiInstruction('')
            } else {
                const error = await res.json()
                if (res.status === 402) {
                    alert(error.error || '账户余额不足')
                } else {
                    alert(error.error || 'AI 设计失败')
                }
            }
        } catch (error) {
            console.error('AI设计失败:', error)
        } finally {
            setIsAiDesigning(false)
        }
    }

    // 统一提交函数(支持主形象和子形象)
    const handleSubmit = async () => {
        // 🆕 子形象模式
        if (isSubAppearance) {
            if (!selectedCharacterId.trim() || !changeReason.trim() || !description.trim()) return

            try {
                setIsSubmitting(true)

                const res = await fetch(`${apiBase}/character/appearance`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        characterId: selectedCharacterId,
                        changeReason: changeReason.trim(),
                        description: description.trim()
                    })
                })

                if (res.ok) {
                    onSuccess()
                    onClose()
                } else {
                    const error = await res.json()
                    if (res.status === 402) {
                        alert(error.error || '账户余额不足')
                    } else {
                        alert(error.error || '添加子形象失败')
                    }
                }
            } catch (error: any) {
                if (shouldShowError(error)) {
                    alert(error.message || '添加子形象失败')
                }
            } finally {
                setIsSubmitting(false)
            }
            return
        }

        // 主形象模式
        if (!name.trim() || !description.trim()) return

        try {
            setIsSubmitting(true)

            const createUrl = mode === 'asset-hub'
                ? '/api/asset-hub/characters'
                : `${apiBase}/character`

            const body: any = {
                name: name.trim(),
                description: description.trim(),
                artStyle
            }

            if (mode === 'asset-hub') {
                body.folderId = folderId
            }

            const res = await fetch(createUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })

            if (res.ok) {
                onSuccess()
                onClose()
            } else {
                const error = await res.json()
                if (res.status === 402) {
                    alert(error.error || '账户余额不足')
                } else {
                    alert(error.error || '创建失败')
                }
            }
        } catch (error: any) {
            if (shouldShowError(error)) {
                alert(error.message || '创建失败')
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
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={handleBackdropClick}
        >
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col">
                <div className="p-6 overflow-y-auto flex-1">
                    {/* 标题 */}
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">
                            {t('character.title')}
                        </h3>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>

                    {/* 模式切换滑块 */}
                    <div className="mb-5">
                        <div className="flex p-1 bg-gray-100 rounded-lg">
                            <button
                                onClick={() => setCreateMode('description')}
                                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${createMode === 'description'
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                <SparklesIcon className="w-4 h-4" />
                                <span>{t('character.modeDescription')}</span>
                            </button>
                            <button
                                onClick={() => setCreateMode('reference')}
                                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${createMode === 'reference'
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                <PhotoIcon className="w-4 h-4" />
                                <span>{t('character.modeReference')}</span>
                            </button>
                        </div>
                    </div>

                    <div className="space-y-5">
                        {/* 🆕 是否为子形象复选框 - 仅项目模式且有角色时显示 */}
                        {mode === 'project' && characters.length > 0 && (
                            <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                                <input
                                    type="checkbox"
                                    id="isSubAppearance"
                                    checked={isSubAppearance}
                                    onChange={(e) => setIsSubAppearance(e.target.checked)}
                                    className="mt-0.5 w-4 h-4 text-purple-600 border-purple-300 rounded focus:ring-purple-500"
                                />
                                <label htmlFor="isSubAppearance" className="flex-1 text-sm cursor-pointer">
                                    <span className="font-medium text-purple-900">这是一个子形象</span>
                                    <p className="text-xs text-purple-700 mt-0.5">为已有角色添加新的形象状态</p>
                                </label>
                            </div>
                        )}

                        {/* 🆕 子形象模式:选择主角色 */}
                        {isSubAppearance && (
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    选择主角色 <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={selectedCharacterId}
                                    onChange={(e) => setSelectedCharacterId(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="">请选择角色...</option>
                                    {characters.map((char) => (
                                        <option key={char.id} value={char.id}>
                                            {char.name} ({(char.appearances?.length || 0)} 个形象)
                                        </option>
                                    ))}
                                </select>
                                {selectedCharacterId && characters.find(c => c.id === selectedCharacterId)?.appearances && (
                                    <p className="text-xs text-gray-500">
                                        已有形象: {characters.find(c => c.id === selectedCharacterId)?.appearances?.map(a => a.changeReason).join(', ')}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* 🆕 子形象模式:变化原因 */}
                        {isSubAppearance && (
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    形象变化原因 <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={changeReason}
                                    onChange={(e) => setChangeReason(e.target.value)}
                                    placeholder="例如:战斗后受伤、穿上正装参加宴会..."
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <p className="text-xs text-gray-500">简要描述形象发生变化的情境或原因</p>
                            </div>
                        )}

                        {/* 角色名称 - 仅主形象模式显示 */}
                        {!isSubAppearance && (
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    {t('character.name')} <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder={t('character.namePlaceholder')}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>
                        )}

                        {/* 风格选择 - 仅主形象模式显示 */}
                        {!isSubAppearance && (
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    {t('artStyle.title')}
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
                        )}

                        {/* 参考图模式 */}
                        {createMode === 'reference' && (
                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 space-y-3 border border-blue-100/50">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                                        <PhotoIcon className="w-4 h-4" />
                                        <span>{t('character.uploadReference')}</span>
                                    </div>
                                    <span className="text-xs text-blue-400">{t('character.pasteHint')}</span>
                                </div>

                                {/* 🔥 子模式切换：直接生成 vs 反推提示词 */}
                                <div className="flex items-center gap-2 p-2 bg-white/60 rounded-lg">
                                    <span className="text-xs text-gray-500">{t('character.generationMode')}：</span>
                                    <div className="flex gap-1 flex-1">
                                        <button
                                            onClick={() => { setReferenceSubMode('direct'); setExtractedDescription('') }}
                                            className={`flex-1 px-3 py-1.5 text-xs rounded-md transition-all ${referenceSubMode === 'direct'
                                                ? 'bg-blue-500 text-white'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                        >
                                            📷 {t('character.directGenerate')}
                                        </button>
                                        <button
                                            onClick={() => setReferenceSubMode('extract')}
                                            className={`flex-1 px-3 py-1.5 text-xs rounded-md transition-all ${referenceSubMode === 'extract'
                                                ? 'bg-purple-500 text-white'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                        >
                                            ✨ {t('character.extractPrompt')}
                                        </button>
                                    </div>
                                </div>

                                {/* 模式说明 */}
                                <p className="text-xs text-gray-500 bg-white/40 rounded px-2 py-1">
                                    {referenceSubMode === 'direct'
                                        ? `📷 ${t('character.directGenerateDesc')}`
                                        : `✨ ${t('character.extractPromptDesc')}`}
                                </p>

                                {/* 上传区域 */}
                                <div
                                    className="border-2 border-dashed border-blue-200 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all relative min-h-[120px]"
                                    onDrop={handleDrop}
                                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                                    onClick={handleClickUpload}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
                                    />

                                    {referenceImagesBase64.length > 0 ? (
                                        <div className="w-full">
                                            <div className="grid grid-cols-3 gap-2 mb-2">
                                                {referenceImagesBase64.map((base64, index) => (
                                                    <div key={index} className="relative aspect-square">
                                                        <img
                                                            src={base64}
                                                            alt={`参考图 ${index + 1}`}
                                                            className="w-full h-full object-cover rounded"
                                                        />
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleClearReference(index) }}
                                                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow text-xs"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                ))}
                                                {referenceImagesBase64.length < 5 && (
                                                    <div className="aspect-square border-2 border-dashed border-blue-200 rounded flex items-center justify-center text-blue-400 hover:border-blue-400 transition-colors">
                                                        <span className="text-2xl">+</span>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-xs text-center text-blue-400">
                                                {t('character.selectedCount', { count: referenceImagesBase64.length })}
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            <PhotoIcon className="w-10 h-10 text-blue-300 mb-2" />
                                            <p className="text-sm text-blue-500">{t('character.dropOrClick')}</p>
                                            <p className="text-xs text-blue-400 mt-1">{t('character.maxReferenceImages')}</p>
                                        </>
                                    )}
                                </div>

                                {/* 名称必填提示 */}
                                {referenceImagesBase64.length > 0 && !name.trim() && (
                                    <p className="text-xs text-amber-600 text-center">
                                        ⚠️ {t('character.nameRequired')}
                                    </p>
                                )}

                                {/* 生成按钮 */}
                                <button
                                    onClick={handleCreateWithReference}
                                    disabled={
                                        isSubmitting ||
                                        !name.trim() ||
                                        referenceImagesBase64.length === 0
                                    }
                                    className={`w-full px-4 py-2.5 text-white rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow ${referenceSubMode === 'extract'
                                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
                                        : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600'
                                        }`}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            <span>{t('common.creating')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <SparklesIcon className="w-4 h-4" />
                                            <span>{referenceSubMode === 'extract' ? t('character.generateFromDescription') : t('character.convertToSheet')}</span>
                                        </>
                                    )}
                                </button>

                                <p className="text-xs text-blue-500 text-center">
                                    💡 {referenceSubMode === 'extract'
                                        ? t('character.textToImageTip')
                                        : t('character.referenceTip')}
                                </p>
                            </div>
                        )}

                        {/* 描述模式 */}
                        {createMode === 'description' && (
                            <>
                                {/* AI 设计 - 仅主形象模式显示 */}
                                {!isSubAppearance && (
                                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 space-y-3 border border-purple-100/50">
                                        <div className="flex items-center gap-2 text-sm font-medium text-purple-700">
                                            <SparklesIcon className="w-4 h-4" />
                                            <span>{t('aiDesign.title')}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={aiInstruction}
                                                onChange={(e) => setAiInstruction(e.target.value)}
                                                placeholder={t('aiDesign.placeholder')}
                                                className="flex-1 px-3 py-2 bg-white border border-purple-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                                                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm whitespace-nowrap"
                                            >
                                                {isAiDesigning ? (
                                                    <>
                                                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        <span>{t('aiDesign.generating')}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <SparklesIcon className="w-4 h-4" />
                                                        <span>{t('aiDesign.generate')}</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                        <p className="text-xs text-purple-600">
                                            {t('aiDesign.tip')}
                                        </p>
                                    </div>
                                )}

                                {/* 角色描述/修改描述 */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700">
                                        {isSubAppearance ? '修改描述' : t('character.description')} <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows={4}
                                        placeholder={isSubAppearance
                                            ? '描述要对主形象做什么修改,例如:换上正装、受伤后的状态、披上斗篷...'
                                            : t('character.descPlaceholder')
                                        }
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>

                                {/* 创建按钮 */}
                                <button
                                    onClick={handleSubmit}
                                    disabled={isSubmitting || (isSubAppearance ? !selectedCharacterId.trim() || !changeReason.trim() || !description.trim() : !name.trim() || !description.trim())}
                                    className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg hover:from-blue-600 hover:to-indigo-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            <span>{t('common.adding')}</span>
                                        </>
                                    ) : (
                                        <span>{t('common.add')}</span>
                                    )}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* 固定底部按钮区 */}
                <div className="flex justify-end p-4 border-t bg-gray-50 rounded-b-xl flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                        disabled={isSubmitting}
                    >
                        {t('common.cancel')}
                    </button>
                </div>
            </div>
        </div>
    )
}
