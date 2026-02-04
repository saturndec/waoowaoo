'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Provider, CustomModel, getProviderTutorial } from './types'

interface ProviderCardProps {
    provider: Provider
    models: CustomModel[]
    defaultModels: {
        analysisModel?: string
        characterModel?: string
        locationModel?: string
        storyboardModel?: string
        editModel?: string
        videoModel?: string
    }
    onToggleModel: (modelId: string) => void
    onUpdateApiKey: (providerId: string, type: Provider['type'], apiKey: string) => void
    onUpdateBaseUrl?: (providerId: string, type: Provider['type'], baseUrl: string) => void
    onDeleteModel: (modelId: string) => void
    onUpdateModelResolution?: (modelId: string, resolution: '2K' | '4K') => void
    onAddModel: (model: Omit<CustomModel, 'enabled'>) => void
}

// 根据类型获取对应图标
const TypeIcon = ({ type, className = 'w-3 h-3' }: { type: 'llm' | 'image' | 'video', className?: string }) => {
    switch (type) {
        case 'llm':
            return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>
        case 'image':
            return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        case 'video':
            return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
    }
}

const TypeLabel = (type: 'llm' | 'image' | 'video') => {
    switch (type) {
        case 'llm': return '文本'
        case 'image': return '图像'
        case 'video': return '视频'
    }
}

export function ProviderCard({
    provider,
    models,
    defaultModels,
    onToggleModel,
    onUpdateApiKey,
    onUpdateBaseUrl,
    onDeleteModel,
    onUpdateModelResolution,
    onAddModel
}: ProviderCardProps) {
    const t = useTranslations('apiConfig')
    const [isEditing, setIsEditing] = useState(false)
    const [isEditingUrl, setIsEditingUrl] = useState(false)
    const [showKey, setShowKey] = useState(false)
    const [tempKey, setTempKey] = useState(provider.apiKey || '')
    const [tempUrl, setTempUrl] = useState(provider.baseUrl || '')
    const [showTutorial, setShowTutorial] = useState(false)

    // 新增模型相关状态
    const [showAddForm, setShowAddForm] = useState<'llm' | 'image' | 'video' | null>(null)
    const [newModel, setNewModel] = useState({ name: '', modelId: '', price: '', resolution: '4K' as '2K' | '4K' })
    const [batchMode, setBatchMode] = useState(false)

    // 检查是否需要显示 baseUrl 编辑（flow2api、gemini-compatible 等自建/兼容服务）
    const showBaseUrlEdit = ['flow2api', 'gemini-compatible'].includes(provider.id) && onUpdateBaseUrl

    // 获取该厂商的教程配置
    const tutorial = getProviderTutorial(provider.id)

    // 按类型分组模型
    const groupedModels: Partial<Record<'llm' | 'image' | 'video', CustomModel[]>> = {}
    models.forEach(m => {
        if (!groupedModels[m.type]) groupedModels[m.type] = []
        groupedModels[m.type]!.push(m)
    })

    // 获取模型是否为默认模型（图像模型匹配任意细分字段）
    const isDefaultModel = (model: CustomModel) => {
        if (model.type === 'llm' && defaultModels.analysisModel === model.modelId) return true
        if (model.type === 'image') {
            if (defaultModels.characterModel === model.modelId) return true
            if (defaultModels.locationModel === model.modelId) return true
            if (defaultModels.storyboardModel === model.modelId) return true
            if (defaultModels.editModel === model.modelId) return true
        }
        if (model.type === 'video' && defaultModels.videoModel === model.modelId) return true
        return false
    }

    // 检查模型是否支持分辨率选择（Banana/Gemini Pro 系列）
    const supportsResolution = (model: CustomModel) => {
        if (model.type !== 'image') return false
        return model.modelId.includes('gemini-3-pro-image') || model.modelId === 'banana'
    }

    const modelTypes = Object.keys(groupedModels) as ('llm' | 'image' | 'video')[]
    const hasModels = modelTypes.length > 0

    const handleSaveKey = () => {
        onUpdateApiKey(provider.id, provider.type, tempKey)
        setIsEditing(false)
    }

    const handleCancelEdit = () => {
        setTempKey(provider.apiKey || '')
        setIsEditing(false)
    }

    const handleSaveUrl = () => {
        onUpdateBaseUrl?.(provider.id, provider.type, tempUrl)
        setIsEditingUrl(false)
    }

    const handleCancelUrlEdit = () => {
        setTempUrl(provider.baseUrl || '')
        setIsEditingUrl(false)
    }

    // 新增模型相关函数
    const handleAddModel = (type: 'llm' | 'image' | 'video') => {
        if (!newModel.name || !newModel.modelId || !newModel.price) {
            alert(t('fillComplete'))
            return
        }

        // 如果是视频模型且开启了批量模式,自动添加 -batch 后缀
        const finalModelId = (type === 'video' && batchMode && provider.id === 'ark')
            ? `${newModel.modelId}-batch`
            : newModel.modelId
        const finalName = (type === 'video' && batchMode && provider.id === 'ark')
            ? `${newModel.name} (Batch)`
            : newModel.name
        const finalPrice = (type === 'video' && batchMode && provider.id === 'ark')
            ? (parseFloat(newModel.price) || 0) * 0.5
            : parseFloat(newModel.price) || 0

        onAddModel({
            modelId: finalModelId,
            name: finalName,
            type,
            provider: provider.id,
            price: finalPrice,
            resolution: type === 'image' ? newModel.resolution : undefined
        })

        // 重置表单
        setNewModel({ name: '', modelId: '', price: '', resolution: '4K' })
        setBatchMode(false)
        setShowAddForm(null)
    }

    const handleCancelAdd = () => {
        setShowAddForm(null)
        setNewModel({ name: '', modelId: '', price: '', resolution: '4K' })
        setBatchMode(false)
    }

    // 遮掩 API Key 显示 - 完全隐藏
    const maskedKey = provider.apiKey
        ? '•'.repeat(20)
        : ''

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {/* Provider Header - Compact */}
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-white border border-gray-200 flex items-center justify-center font-bold text-gray-700 text-xs">
                        {provider.name.charAt(0)}
                    </div>
                    <h3 className="text-xs font-bold text-gray-800">{provider.name}</h3>
                    {provider.hasApiKey ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" title={t('connected')}></span>
                    ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" title={t('notConfigured')}></span>
                    )}
                </div>
                {/* 开通教程按钮 */}
                {tutorial && (
                    <button
                        onClick={() => setShowTutorial(true)}
                        className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        {t('tutorial.button')}
                    </button>
                )}
            </div>

            {/* 教程模态框 */}
            {showTutorial && tutorial && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowTutorial(false)}>
                    <div
                        className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* 模态框头部 */}
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-900">{provider.name} {t('tutorial.title')}</h3>
                                    <p className="text-xs text-gray-500">{t('tutorial.subtitle')}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowTutorial(false)}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        {/* 模态框内容 */}
                        <div className="p-5 space-y-4">
                            {tutorial.steps.map((step, index) => (
                                <div key={index} className="flex gap-3">
                                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                                        {index + 1}
                                    </div>
                                    <div className="flex-1 pt-0.5">
                                        <p className="text-sm text-gray-700 leading-relaxed">
                                            {t(`tutorial.steps.${step.text}`)}
                                        </p>
                                        {step.url && (
                                            <a
                                                href={step.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                </svg>
                                                {t('tutorial.openLink')}
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* 模态框底部 */}
                        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex justify-end">
                            <button
                                onClick={() => setShowTutorial(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                {t('tutorial.close')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* API Key Section - Inline Edit */}
            <div className="px-3 py-2 bg-gray-50/30 border-b border-gray-100">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 font-medium w-12 shrink-0">API Key</span>
                    {isEditing ? (
                        <div className="flex-1 flex items-center gap-1.5">
                            <input
                                type="text"
                                value={tempKey}
                                onChange={e => setTempKey(e.target.value)}
                                placeholder={t('enterApiKey')}
                                className="flex-1 px-2 py-1 text-xs border border-blue-300 rounded bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                                autoFocus
                            />
                            <button onClick={handleSaveKey} className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors" title={t('save')}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </button>
                            <button onClick={handleCancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded transition-colors" title={t('cancel')}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center gap-1.5 min-w-0">
                            {provider.hasApiKey ? (
                                <>
                                    <span className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded truncate min-w-0 flex-1 max-w-[160px]">
                                        {showKey ? provider.apiKey : maskedKey}
                                    </span>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                        <button
                                            onClick={() => setShowKey(!showKey)}
                                            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                            title={showKey ? '隐藏' : '显示'}
                                        >
                                            {showKey ? (
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                            ) : (
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => { setTempKey(provider.apiKey || ''); setIsEditing(true) }}
                                            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                            title={t('configure')}
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    {t('connect')}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Base URL Section - 仅 flow2api 等自建服务显示 */}
            {showBaseUrlEdit && (
                <div className="px-3 py-2 bg-gray-50/30 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 font-medium w-12 shrink-0">地址</span>
                        {isEditingUrl ? (
                            <div className="flex-1 flex items-center gap-1.5">
                                <input
                                    type="text"
                                    value={tempUrl}
                                    onChange={e => setTempUrl(e.target.value)}
                                    placeholder={provider.id === 'gemini-compatible' ? 'https://your-api-domain.com' : 'http://localhost:8000'}
                                    className="flex-1 px-2 py-1 text-xs border border-blue-300 rounded bg-white focus:ring-1 focus:ring-blue-500 outline-none font-mono"
                                    autoFocus
                                />
                                <button onClick={handleSaveUrl} className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors" title={t('save')}>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                </button>
                                <button onClick={handleCancelUrlEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded transition-colors" title={t('cancel')}>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center gap-1.5 min-w-0">
                                {provider.baseUrl ? (
                                    <span className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded truncate min-w-0 flex-1">
                                        {provider.baseUrl}
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => setIsEditingUrl(true)}
                                        className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                        配置地址
                                    </button>
                                )}
                                {provider.baseUrl && (
                                    <button
                                        onClick={() => { setTempUrl(provider.baseUrl || ''); setIsEditingUrl(true) }}
                                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors shrink-0"
                                        title={t('configure')}
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Model List - Compact */}
            {hasModels ? (
                <div className="p-2 space-y-3">
                    {(['llm', 'image', 'video'] as const).map(type => {
                        const modelsOfType = groupedModels[type]
                        if (!modelsOfType || modelsOfType.length === 0) return null

                        return (
                            <div key={type}>
                                {/* Type Header - Minimal */}
                                <div className="flex items-center gap-1.5 mb-1.5 px-1">
                                    <div className={`text-[10px] font-semibold flex items-center gap-1 ${type === 'llm' ? 'text-blue-600' :
                                        type === 'image' ? 'text-purple-600' :
                                            'text-orange-600'
                                        }`}>
                                        <TypeIcon type={type} />
                                        {TypeLabel(type)}
                                    </div>
                                    <div className="h-px bg-gray-100 flex-1"></div>
                                    {/* 添加模型按钮 */}
                                    {showAddForm !== type && (
                                        <button
                                            onClick={() => setShowAddForm(type)}
                                            className="text-[10px] text-blue-600 hover:text-blue-700 flex items-center gap-0.5 px-1.5 py-0.5 hover:bg-blue-50 rounded transition-colors"
                                        >
                                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                            添加
                                        </button>
                                    )}
                                </div>

                                {/* 添加模型表单 */}
                                {showAddForm === type && (
                                    <div className="mb-2 p-2 bg-blue-50/50 rounded-lg border border-blue-100">
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            <input
                                                type="text"
                                                value={newModel.name}
                                                onChange={e => setNewModel({ ...newModel, name: e.target.value })}
                                                placeholder="模型名称"
                                                className="flex-1 px-2 py-1 text-[11px] border border-gray-200 rounded bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                                                autoFocus
                                            />
                                            <button
                                                onClick={handleCancelAdd}
                                                className="p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="text"
                                                value={newModel.modelId}
                                                onChange={e => setNewModel({ ...newModel, modelId: e.target.value })}
                                                placeholder="模型 ID"
                                                className={`flex-1 px-2 py-1 text-[11px] border border-gray-200 rounded font-mono bg-white focus:ring-1 focus:ring-blue-500 outline-none ${type === 'video' && batchMode && provider.id === 'ark' ? 'rounded-r-none border-r-0' : ''}`}
                                            />
                                            {type === 'video' && batchMode && provider.id === 'ark' && (
                                                <span className="px-1.5 py-1 text-[11px] font-mono bg-orange-100 text-orange-700 border border-orange-300 rounded-r">-batch</span>
                                            )}
                                            <div className="flex items-center gap-0.5">
                                                <span className="text-[10px] text-gray-400">¥</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={newModel.price}
                                                    onChange={e => setNewModel({ ...newModel, price: e.target.value })}
                                                    placeholder="0.00"
                                                    className="w-14 px-1.5 py-1 text-[11px] border border-gray-200 rounded text-center bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                                                />
                                            </div>
                                            {/* 图片分辨率选择 */}
                                            {type === 'image' && (
                                                <div className="flex items-center bg-gray-100 rounded overflow-hidden">
                                                    {['2K', '4K'].map(res => (
                                                        <button
                                                            key={res}
                                                            onClick={() => setNewModel({ ...newModel, resolution: res as '2K' | '4K' })}
                                                            className={`px-1.5 py-0.5 text-[9px] font-medium transition-all ${newModel.resolution === res
                                                                ? 'bg-purple-600 text-white'
                                                                : 'text-gray-500 hover:text-gray-700'
                                                                }`}
                                                        >
                                                            {res}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            <button
                                                onClick={() => handleAddModel(type)}
                                                className="px-2 py-1 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium whitespace-nowrap"
                                            >
                                                确认
                                            </button>
                                        </div>
                                        {/* 批量模式选项 */}
                                        {type === 'video' && provider.id === 'ark' && (
                                            <div className="flex items-center gap-1.5 mt-1.5 px-1.5 py-1 bg-orange-50 rounded border border-orange-100">
                                                <button
                                                    onClick={() => setBatchMode(!batchMode)}
                                                    className={`w-3 h-3 rounded border flex items-center justify-center transition-all ${batchMode ? 'bg-orange-500 border-orange-500' : 'border-gray-300 bg-white hover:border-orange-400'}`}
                                                >
                                                    {batchMode && (
                                                        <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </button>
                                                <span className="text-[9px] text-orange-700 font-medium">批量模式 (价格减半)</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Models - Compact List */}
                                <div className="space-y-1">
                                    {modelsOfType.map((model, index) => (
                                        <div
                                            key={`${model.modelId}-${index}`}
                                            className={`flex items-center justify-between px-2 py-1.5 rounded border transition-all group ${model.enabled
                                                ? 'bg-white border-gray-100 hover:border-blue-200'
                                                : 'bg-gray-50/50 border-transparent opacity-50 hover:opacity-100'
                                                }`}
                                        >
                                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`text-xs font-medium ${model.enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                                                        {model.name}
                                                    </span>
                                                    {isDefaultModel(model) && model.enabled && (
                                                        <span className="px-1 py-0.5 bg-gray-800 text-white text-[9px] rounded leading-none shrink-0">{t('default')}</span>
                                                    )}
                                                    <span className="text-[10px] text-gray-400 shrink-0">¥{model.price}</span>
                                                </div>
                                                <span className="text-[10px] text-gray-400 break-all">{model.modelId}</span>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => onDeleteModel(model.modelId)}
                                                    className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-all"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>

                                                {/* 分辨率切换开关（仅 Banana/Gemini Pro 系列显示） */}
                                                {supportsResolution(model) && model.enabled && onUpdateModelResolution && (
                                                    <div className="flex items-center bg-gray-100 rounded overflow-hidden">
                                                        <button
                                                            onClick={() => onUpdateModelResolution(model.modelId, '2K')}
                                                            className={`px-1.5 py-0.5 text-[9px] font-medium transition-all ${model.resolution === '2K'
                                                                ? 'bg-blue-600 text-white'
                                                                : 'text-gray-500 hover:text-gray-700'
                                                                }`}
                                                        >
                                                            2K
                                                        </button>
                                                        <button
                                                            onClick={() => onUpdateModelResolution(model.modelId, '4K')}
                                                            className={`px-1.5 py-0.5 text-[9px] font-medium transition-all ${model.resolution === '4K'
                                                                ? 'bg-purple-600 text-white'
                                                                : 'text-gray-500 hover:text-gray-700'
                                                                }`}
                                                        >
                                                            4K
                                                        </button>
                                                    </div>
                                                )}

                                                <button
                                                    onClick={() => onToggleModel(model.modelId)}
                                                    className={`w-7 h-4 rounded-full flex items-center transition-all px-0.5 ${model.enabled
                                                        ? 'bg-blue-600 justify-end'
                                                        : 'bg-gray-300 justify-start'
                                                        }`}
                                                >
                                                    <div className="w-3 h-3 bg-white rounded-full shadow-sm"></div>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="p-3">
                    {/* 添加模型按钮区域 */}
                    {showAddForm === null ? (
                        <div className="text-center">
                            <p className="text-[10px] text-gray-400 mb-2">{t('noModelsForProvider')}</p>
                            <button
                                onClick={() => setShowAddForm(provider.type === 'video' ? 'video' : 'image')}
                                className="text-[10px] text-blue-600 hover:text-blue-700 flex items-center gap-0.5 px-2 py-1 hover:bg-blue-50 rounded transition-colors mx-auto"
                            >
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                添加模型
                            </button>
                        </div>
                    ) : (
                        <div className="p-2 bg-blue-50/50 rounded-lg border border-blue-100">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <input
                                    type="text"
                                    value={newModel.name}
                                    onChange={e => setNewModel({ ...newModel, name: e.target.value })}
                                    placeholder="模型名称"
                                    className="flex-1 px-2 py-1 text-[11px] border border-gray-200 rounded bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                                    autoFocus
                                />
                                <button
                                    onClick={handleCancelAdd}
                                    className="p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="text"
                                    value={newModel.modelId}
                                    onChange={e => setNewModel({ ...newModel, modelId: e.target.value })}
                                    placeholder="模型 ID"
                                    className="flex-1 px-2 py-1 text-[11px] border border-gray-200 rounded font-mono bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                                <div className="flex items-center gap-0.5">
                                    <span className="text-[10px] text-gray-400">¥</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={newModel.price}
                                        onChange={e => setNewModel({ ...newModel, price: e.target.value })}
                                        placeholder="0.00"
                                        className="w-14 px-1.5 py-1 text-[11px] border border-gray-200 rounded text-center bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                {showAddForm === 'image' && (
                                    <div className="flex items-center bg-gray-100 rounded overflow-hidden">
                                        {['2K', '4K'].map(res => (
                                            <button
                                                key={res}
                                                onClick={() => setNewModel({ ...newModel, resolution: res as '2K' | '4K' })}
                                                className={`px-1.5 py-0.5 text-[9px] font-medium transition-all ${newModel.resolution === res
                                                    ? 'bg-purple-600 text-white'
                                                    : 'text-gray-500 hover:text-gray-700'
                                                    }`}
                                            >
                                                {res}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <button
                                    onClick={() => handleAddModel(showAddForm)}
                                    className="px-2 py-1 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium whitespace-nowrap"
                                >
                                    确认
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default ProviderCard
