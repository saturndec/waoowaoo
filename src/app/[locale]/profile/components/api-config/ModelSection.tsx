'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CustomModel, Provider, PRESET_MODELS, getProviderDisplayName } from './types'

interface ModelSectionProps {
    type: 'llm' | 'image' | 'video'
    models: CustomModel[]
    providers: Provider[]
    onToggle: (modelId: string) => void
    onUpdatePrice: (modelId: string, price: number) => void
    onAdd: (model: Omit<CustomModel, 'enabled'>) => void
    onDelete: (modelId: string) => void
    onUpdateField: (modelId: string, field: keyof CustomModel, value: any) => void
}

// 按厂商分组的预设模型
const getPresetsByProvider = (type: 'llm' | 'image' | 'video') => {
    const presets = PRESET_MODELS.filter(m => m.type === type)
    const grouped: Record<string, typeof presets> = {}

    presets.forEach(model => {
        if (!grouped[model.provider]) {
            grouped[model.provider] = []
        }
        grouped[model.provider].push(model)
    })

    return grouped
}

export function ModelSection({
    type,
    models,
    providers,
    onToggle,
    onUpdatePrice,
    onAdd,
    onDelete,
    onUpdateField
}: ModelSectionProps) {
    const [editingId, setEditingId] = useState<string | null>(null)
    const [showAddForm, setShowAddForm] = useState(false)
    const [selectedPreset, setSelectedPreset] = useState<string>('custom')
    const [newModel, setNewModel] = useState({ name: '', modelId: '', provider: type === 'llm' ? 'openrouter' : 'fal', price: '', resolution: '4K' as '2K' | '4K' })
    const [batchMode, setBatchMode] = useState(false)
    const t = useTranslations('modelSection')

    const priceLabel = type === 'llm' ? t('pricePerMillion') : type === 'image' ? t('pricePerImage') : t('pricePerVideo')
    const priceUnit = type === 'llm' ? '/M' : type === 'image' ? '/张' : '/条'
    const title = type === 'llm' ? t('llmModels') : type === 'image' ? t('imageModels') : t('videoModels')

    const presetsByProvider = getPresetsByProvider(type)

    const getProviderName = (providerId: string) => {
        const p = providers.find(p => p.id === providerId)
        return p?.name || getProviderDisplayName(providerId)
    }

    // 检查厂商是否已配置 API Key
    const hasApiKey = (providerId: string) => {
        const p = providers.find(p => p.id === providerId)
        return !!p?.hasApiKey
    }

    // 当选择预设模型时自动填充
    const handlePresetChange = (presetId: string) => {
        setSelectedPreset(presetId)
        if (presetId === 'custom') {
            setNewModel({ name: '', modelId: '', provider: type === 'llm' ? 'openrouter' : 'fal', price: '', resolution: '4K' })
        } else {
            const preset = PRESET_MODELS.find(m => m.modelId === presetId)
            if (preset) {
                setNewModel({
                    name: preset.name,
                    modelId: preset.modelId,
                    provider: preset.provider,
                    price: preset.price.toString(),
                    resolution: (preset.resolution as '2K' | '4K') || '4K'
                })
            }
        }
    }

    const handleAdd = () => {
        if (!newModel.name || !newModel.modelId || !newModel.price) {
            alert(t('fillComplete'))
            return
        }
        // 如果是视频模型且开启了批量模式，自动添加 -batch 后缀
        const finalModelId = (type === 'video' && batchMode && newModel.provider === 'ark')
            ? `${newModel.modelId}-batch`
            : newModel.modelId
        const finalName = (type === 'video' && batchMode && newModel.provider === 'ark')
            ? `${newModel.name} (Batch)`
            : newModel.name
        const finalPrice = (type === 'video' && batchMode && newModel.provider === 'ark')
            ? (parseFloat(newModel.price) || 0) * 0.5
            : parseFloat(newModel.price) || 0
        onAdd({
            modelId: finalModelId,
            name: finalName,
            type,
            provider: newModel.provider,
            price: finalPrice,
            resolution: type === 'image' ? newModel.resolution : undefined
        })
        // 重置表单
        setNewModel({ name: '', modelId: '', provider: type === 'llm' ? 'openrouter' : 'fal', price: '', resolution: '4K' })
        setSelectedPreset('custom')
        setBatchMode(false)
        setShowAddForm(false)
    }

    const handleCancel = () => {
        setShowAddForm(false)
        setNewModel({ name: '', modelId: '', provider: type === 'llm' ? 'openrouter' : 'fal', price: '', resolution: '4K' })
        setSelectedPreset('custom')
        setBatchMode(false)
    }

    return (
        <div className="bg-white/60 rounded-2xl border border-gray-100/80">
            <div className="px-5 py-4 border-b border-gray-100/80 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{t('price')}: {priceLabel}</span>
                    {!showAddForm && (
                        <button
                            onClick={() => setShowAddForm(true)}
                            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer flex items-center gap-1"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            {t('addModel')}
                        </button>
                    )}
                </div>
            </div>

            <div className="divide-y divide-gray-50">
                {/* 添加新模型表单 - 紧凑布局 */}
                {showAddForm && (
                    <div className="p-4 bg-gray-50 border-b border-gray-200">
                        {/* 顶部：标题 + 预设选择 + 厂商 - 单行 */}
                        <div className="flex items-center gap-3 mb-3">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{t('addNewModel')}</span>
                            <div className="flex-1 flex items-center gap-2">
                                <select
                                    value={selectedPreset}
                                    onChange={e => handlePresetChange(e.target.value)}
                                    className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                >
                                    <option value="custom">{t('customModel')}</option>
                                    {Object.entries(presetsByProvider).map(([provider, presets]) => (
                                        <optgroup key={provider} label={getProviderDisplayName(provider)}>
                                            {presets.map(preset => (
                                                <option key={preset.modelId} value={preset.modelId}>{preset.name}</option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                                <select
                                    value={newModel.provider}
                                    onChange={e => setNewModel({ ...newModel, provider: e.target.value })}
                                    className="w-32 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                    disabled={selectedPreset !== 'custom'}
                                >
                                    {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <button
                                onClick={handleCancel}
                                className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer rounded hover:bg-gray-100"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* 中间：模型名称 + 模型ID + 价格 - 单行内联 */}
                        <div className="flex items-center gap-2 mb-3">
                            <input
                                type="text"
                                value={newModel.name}
                                onChange={e => setNewModel({ ...newModel, name: e.target.value })}
                                placeholder={t('modelName')}
                                className="w-36 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                readOnly={selectedPreset !== 'custom'}
                            />
                            <div className="flex-1 flex items-center">
                                <input
                                    type="text"
                                    value={newModel.modelId}
                                    onChange={e => setNewModel({ ...newModel, modelId: e.target.value })}
                                    placeholder={t('modelId')}
                                    className={`flex-1 px-2.5 py-1.5 text-sm border border-gray-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${type === 'video' && batchMode && newModel.provider === 'ark' ? 'rounded-l-lg border-r-0' : 'rounded-lg'}`}
                                    readOnly={selectedPreset !== 'custom'}
                                />
                                {type === 'video' && batchMode && newModel.provider === 'ark' && (
                                    <span className="px-2 py-1.5 text-sm font-mono bg-orange-100 text-orange-700 border border-orange-300 rounded-r-lg">-batch</span>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-400">¥</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={newModel.price}
                                    onChange={e => setNewModel({ ...newModel, price: e.target.value })}
                                    placeholder="0.00"
                                    className="w-20 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                />
                            </div>

                            {/* 图片分辨率选择 - 内联 */}
                            {type === 'image' && (
                                <div className="flex items-center gap-1 ml-2">
                                    {['2K', '4K'].map(res => (
                                        <button
                                            key={res}
                                            onClick={() => setNewModel({ ...newModel, resolution: res as '2K' | '4K' })}
                                            className={`px-2.5 py-1 text-xs rounded-md cursor-pointer transition-all ${newModel.resolution === res ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                                        >
                                            {res}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* 操作按钮 - 内联 */}
                            <button
                                onClick={handleAdd}
                                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer font-medium"
                            >
                                {t('confirmAdd')}
                            </button>
                        </div>

                        {/* 批量模式选项 - 如果需要 */}
                        {type === 'video' && newModel.provider === 'ark' && (
                            <div className="flex items-center gap-2 px-2 py-1.5 bg-orange-50 rounded-lg border border-orange-100">
                                <button
                                    onClick={() => setBatchMode(!batchMode)}
                                    className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-all ${batchMode ? 'bg-orange-500 border-orange-500' : 'border-gray-300 bg-white hover:border-orange-400'}`}
                                >
                                    {batchMode && (
                                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </button>
                                <span className="text-xs text-orange-700 font-medium">{t('batchMode')}</span>
                                <span className="text-[10px] text-orange-500">{t('batchModeTooltip')}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* 模型列表 */}
                {models.map((model, index) => {
                    const isEditing = editingId === model.modelId

                    if (isEditing) {
                        return (
                            <div key={`${model.modelId}-${index}`} className="px-5 py-3 flex items-center gap-3 bg-blue-50/50">
                                <input
                                    type="text"
                                    value={model.name}
                                    onChange={e => onUpdateField(model.modelId, 'name', e.target.value)}
                                    className="w-28 px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
                                />
                                <input
                                    type="text"
                                    value={model.modelId}
                                    onChange={e => onUpdateField(model.modelId, 'modelId', e.target.value)}
                                    className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg font-mono"
                                />
                                <select
                                    value={model.provider}
                                    onChange={e => onUpdateField(model.modelId, 'provider', e.target.value)}
                                    className="w-28 px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
                                >
                                    {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <div className="flex items-center gap-1 w-20">
                                    <span className="text-xs text-gray-400">¥</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={model.price}
                                        onChange={e => onUpdatePrice(model.modelId, parseFloat(e.target.value) || 0)}
                                        className="w-14 px-1 py-1.5 text-xs border border-gray-200 rounded-lg text-center"
                                    />
                                </div>
                                {type === 'image' && (
                                    <select
                                        value={model.resolution || '4K'}
                                        onChange={e => onUpdateField(model.modelId, 'resolution', e.target.value)}
                                        className="w-16 px-1 py-1.5 text-xs border border-gray-200 rounded-lg"
                                    >
                                        <option value="2K">2K</option>
                                        <option value="4K">4K</option>
                                    </select>
                                )}
                                <button onClick={() => setEditingId(null)} className="text-blue-600 hover:text-blue-700 text-xs font-medium cursor-pointer px-2">{t('done')}</button>
                            </div>
                        )
                    }

                    return (
                        <div key={`${model.modelId}-${index}`} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50/50 group">
                            <button
                                onClick={() => onToggle(model.modelId)}
                                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all ${model.enabled ? 'bg-blue-600 border-blue-600' : 'border-gray-300 hover:border-blue-400'}`}
                            >
                                {model.enabled && (
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </button>
                            <span className={`text-sm font-medium w-32 truncate ${model.enabled ? 'text-gray-900' : 'text-gray-400'}`}>{model.name}</span>
                            <span className="text-xs text-gray-400 font-mono flex-1 truncate">{model.modelId}</span>
                            <span className="text-xs text-gray-500 w-24 truncate">{getProviderName(model.provider)}</span>
                            {!hasApiKey(model.provider) && (
                                <span className="text-xs text-orange-500 bg-orange-50 px-2 py-0.5 rounded">⚠️ {t('noApiKey')}</span>
                            )}
                            {type === 'image' && (
                                <span className="text-xs text-blue-500 w-8">{model.resolution || '4K'}</span>
                            )}
                            <span className="text-xs text-gray-500 w-16 text-right">¥{model.price}{priceUnit}</span>
                            <div className="w-16 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setEditingId(model.modelId)} className="p-1 text-gray-400 hover:text-blue-500 cursor-pointer">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                </button>
                                <button onClick={() => onDelete(model.modelId)} className="p-1 text-gray-400 hover:text-red-500 cursor-pointer">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )
                })}

                {/* 空状态 */}
                {models.length === 0 && !showAddForm && (
                    <div className="px-5 py-8 text-center text-gray-400 text-sm">
                        {t('noModels')}
                    </div>
                )}
            </div>
        </div>
    )
}
