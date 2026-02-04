'use client'
import { useTranslations } from 'next-intl'

import { useState, useEffect } from 'react'

interface PhotographyCharacter {
    name: string
    screen_position: string
    posture: string
    facing: string
}

interface PhotographyRules {
    panel_number?: number
    scene_summary: string
    lighting: {
        direction: string
        quality: string
    }
    characters: PhotographyCharacter[]
    depth_of_field: string  // 新格式为字符串
    color_tone: string
}

// 演技指导数据结构
interface ActingCharacter {
    name: string
    acting: string
}

interface ActingNotes {
    panel_number?: number
    characters: ActingCharacter[]
}

interface AIDataModalProps {
    isOpen: boolean
    onClose: () => void
    panelNumber: number
    shotType: string | null
    cameraMove: string | null
    description: string | null
    location: string | null
    characters: string[]
    videoPrompt: string | null
    photographyRules: PhotographyRules | null
    actingNotes: ActingNotes | ActingCharacter[] | null  // 演技指导数据（支持两种格式）
    videoRatio: string
    onSave: (data: {
        shotType: string | null
        cameraMove: string | null
        description: string | null
        videoPrompt: string | null
        photographyRules: PhotographyRules | null
        actingNotes: ActingCharacter[] | null  // 保存演技指导
    }) => void
}

export default function AIDataModal({
    isOpen,
    onClose,
    panelNumber,
    shotType: initialShotType,
    cameraMove: initialCameraMove,
    description: initialDescription,
    location,
    characters,
    videoPrompt: initialVideoPrompt,
    photographyRules: initialPhotographyRules,
    actingNotes: initialActingNotes,
    videoRatio,
    onSave
}: AIDataModalProps) {
    const t = useTranslations('storyboard')
    // 编辑状态
    const [shotType, setShotType] = useState(initialShotType || '')
    const [cameraMove, setCameraMove] = useState(initialCameraMove || '')
    const [description, setDescription] = useState(initialDescription || '')
    const [videoPrompt, setVideoPrompt] = useState(initialVideoPrompt || '')
    const [photographyRules, setPhotographyRules] = useState<PhotographyRules | null>(initialPhotographyRules)

    // 演技指导状态（统一转为数组格式）
    const [actingNotes, setActingNotes] = useState<ActingCharacter[]>(() => {
        if (Array.isArray(initialActingNotes)) return initialActingNotes
        return initialActingNotes?.characters || []
    })

    // 同步外部数据
    useEffect(() => {
        if (isOpen) {
            setShotType(initialShotType || '')
            setCameraMove(initialCameraMove || '')
            setDescription(initialDescription || '')
            setVideoPrompt(initialVideoPrompt || '')
            setPhotographyRules(initialPhotographyRules)
            // 同步演技指导
            if (Array.isArray(initialActingNotes)) {
                setActingNotes(initialActingNotes)
            } else {
                setActingNotes(initialActingNotes?.characters || [])
            }
        }
    }, [isOpen, initialShotType, initialCameraMove, initialDescription, initialVideoPrompt, initialPhotographyRules, initialActingNotes])

    // 处理摄影规则字段更新
    const updatePhotographyField = (path: string, value: string) => {
        if (!photographyRules) return

        const newRules = { ...photographyRules }
        const parts = path.split('.')

        if (parts.length === 1) {
            (newRules as any)[parts[0]] = value
        } else if (parts.length === 2) {
            (newRules as any)[parts[0]][parts[1]] = value
        }

        setPhotographyRules(newRules)
    }

    // 更新摄影规则中的角色
    const updatePhotographyCharacter = (index: number, field: keyof PhotographyCharacter, value: string) => {
        if (!photographyRules) return

        const newRules = { ...photographyRules }
        newRules.characters = [...newRules.characters]
        newRules.characters[index] = { ...newRules.characters[index], [field]: value }
        setPhotographyRules(newRules)
    }

    // 更新演技指导中的角色
    const updateActingCharacter = (index: number, field: keyof ActingCharacter, value: string) => {
        const newNotes = [...actingNotes]
        newNotes[index] = { ...newNotes[index], [field]: value }
        setActingNotes(newNotes)
    }

    // 处理保存
    const handleSave = () => {
        onSave({
            shotType: shotType || null,
            cameraMove: cameraMove || null,
            description: description || null,
            videoPrompt: videoPrompt || null,
            photographyRules,
            actingNotes: actingNotes.length > 0 ? actingNotes : null
        })
        onClose()
    }

    // 构建预览JSON（单镜头格式，不包含 grid_* 字段）
    const previewJson = {
        aspect_ratio: videoRatio,
        shot: {
            shot_type: shotType,
            camera_move: cameraMove,
            description: description,
            location: location,
            characters: characters,
            prompt_text: `A ${videoRatio} shot: ${description}. ${videoPrompt}`
        },
        ...(photographyRules ? { photography_rules: photographyRules } : {}),
        ...(actingNotes.length > 0 ? { acting_notes: actingNotes } : {})
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* 背景遮罩 */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* 模态框内容 */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-[90vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* 标题栏 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">📹</span>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800">{t('aiData.title')}</h2>
                            <p className="text-xs text-gray-500">{t('aiData.subtitle', { number: panelNumber })}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 内容区域 - 左右分栏 */}
                <div className="flex-1 overflow-hidden flex">
                    {/* 左侧：编辑表单 */}
                    <div className="w-1/2 border-r border-gray-200 overflow-y-auto p-6 space-y-5">
                        <div className="text-sm font-medium text-gray-700 mb-3">{t('aiData.basicData')}</div>

                        {/* 镜头类型和运动 */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">{t('aiData.shotType')}</label>
                                <input
                                    type="text"
                                    value={shotType}
                                    onChange={(e) => setShotType(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                                    placeholder={t('aiData.shotTypePlaceholder')}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">{t('aiData.cameraMove')}</label>
                                <input
                                    type="text"
                                    value={cameraMove}
                                    onChange={(e) => setCameraMove(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                                    placeholder={t('aiData.cameraMovePlaceholder')}
                                />
                            </div>
                        </div>

                        {/* 场景和角色（只读） */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">📍 {t('aiData.scene')}</label>
                                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                                    {location || t('aiData.notSelected')}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">👤 {t('aiData.characters')}</label>
                                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                                    {characters.length > 0 ? characters.join('、') : t("common.none")}
                                </div>
                            </div>
                        </div>

                        {/* 画面描述 */}
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">📝 {t('aiData.visualDescription')}</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                                placeholder={t("insert.placeholder.description")}
                            />
                        </div>

                        {/* 视频提示词 */}
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">🎬 {t('aiData.videoPrompt')}</label>
                            <textarea
                                value={videoPrompt}
                                onChange={(e) => setVideoPrompt(e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-amber-50"
                                placeholder={t('panel.videoPromptPlaceholder')}
                            />
                        </div>

                        {/* 摄影规则 */}
                        {photographyRules && (
                            <>
                                <div className="border-t border-gray-200 pt-4 mt-4">
                                    <div className="text-sm font-medium text-gray-700 mb-3">{t('aiData.photographyRules')}</div>
                                </div>

                                {/* 场景总结 */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('aiData.summary')}</label>
                                    <input
                                        type="text"
                                        value={photographyRules.scene_summary || ''}
                                        onChange={(e) => updatePhotographyField('scene_summary', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400"
                                    />
                                </div>

                                {/* 光照 */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('aiData.lightingDirection')}</label>
                                        <input
                                            type="text"
                                            value={photographyRules.lighting?.direction || ''}
                                            onChange={(e) => updatePhotographyField('lighting.direction', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('aiData.lightingQuality')}</label>
                                        <input
                                            type="text"
                                            value={photographyRules.lighting?.quality || ''}
                                            onChange={(e) => updatePhotographyField('lighting.quality', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400"
                                        />
                                    </div>
                                </div>

                                {/* 景深 */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('aiData.depthOfField')}</label>
                                    <input
                                        type="text"
                                        value={photographyRules.depth_of_field || ''}
                                        onChange={(e) => updatePhotographyField('depth_of_field', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400"
                                    />
                                </div>

                                {/* 色调 */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('aiData.colorTone')}</label>
                                    <input
                                        type="text"
                                        value={photographyRules.color_tone || ''}
                                        onChange={(e) => updatePhotographyField('color_tone', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400"
                                    />
                                </div>

                                {/* 角色位置规则 */}
                                {photographyRules.characters && photographyRules.characters.length > 0 && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-2">{t('aiData.characterPosition')}</label>
                                        <div className="space-y-3">
                                            {photographyRules.characters.map((char, index) => (
                                                <div key={index} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                                                    <div className="text-xs font-medium text-blue-600 mb-2">{char.name}</div>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div>
                                                            <label className="block text-[10px] text-gray-500 mb-0.5">{t('aiData.position')}</label>
                                                            <input
                                                                type="text"
                                                                value={char.screen_position || ''}
                                                                onChange={(e) => updatePhotographyCharacter(index, 'screen_position', e.target.value)}
                                                                className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] text-gray-500 mb-0.5">{t('aiData.posture')}</label>
                                                            <input
                                                                type="text"
                                                                value={char.posture || ''}
                                                                onChange={(e) => updatePhotographyCharacter(index, 'posture', e.target.value)}
                                                                className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] text-gray-500 mb-0.5">{t('aiData.facing')}</label>
                                                            <input
                                                                type="text"
                                                                value={char.facing || ''}
                                                                onChange={(e) => updatePhotographyCharacter(index, 'facing', e.target.value)}
                                                                className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {/* 演技指导 */}
                        {actingNotes.length > 0 && (
                            <>
                                <div className="border-t border-gray-200 pt-4 mt-4">
                                    <div className="text-sm font-medium text-gray-700 mb-3">{t('aiData.actingNotes')}</div>
                                </div>

                                {/* 角色演技指导 */}
                                <div className="space-y-3">
                                    {actingNotes.map((char, index) => (
                                        <div key={index} className="p-3 bg-pink-50 rounded-lg border border-pink-200">
                                            <div className="text-xs font-medium text-pink-600 mb-2">🎭 {char.name}</div>
                                            <div>
                                                <label className="block text-[10px] text-gray-500 mb-0.5">{t('aiData.actingDescription')}</label>
                                                <textarea
                                                    value={char.acting || ''}
                                                    onChange={(e) => updateActingCharacter(index, 'acting', e.target.value)}
                                                    rows={2}
                                                    className="w-full px-2 py-1 border border-pink-200 rounded text-xs resize-none focus:ring-2 focus:ring-pink-400 focus:border-pink-400"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* 右侧：JSON预览 */}
                    <div className="w-1/2 bg-gray-900 overflow-y-auto p-4">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs text-gray-400">📋 {t('aiData.jsonPreview')}</span>
                            <button
                                onClick={() => navigator.clipboard.writeText(JSON.stringify(previewJson, null, 2))}
                                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                {t("common.copy")}
                            </button>
                        </div>
                        <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all">
                            {JSON.stringify(previewJson, null, 2)}
                        </pre>
                    </div>
                </div>

                {/* 底部操作栏 */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                        {t("candidate.cancel")}
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {t('aiData.save')}
                    </button>
                </div>
            </div>
        </div>
    )
}
