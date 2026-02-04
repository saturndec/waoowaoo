'use client'

import React, { useState } from 'react'

// --- Types & Mack Data ---

type ModelType = 'llm' | 'image' | 'video'

interface Model {
    id: string
    name: string
    modelId: string
    type: ModelType
    price: number
    unit: string
    enabled: boolean
}

interface Provider {
    id: string
    name: string
    hasKey: boolean
    supportedTypes: ModelType[]
    models: Model[]
}

const MOCK_PROVIDERS: Provider[] = [
    {
        id: 'openrouter',
        name: 'OpenRouter',
        hasKey: true,
        supportedTypes: ['llm'],
        models: [
            { id: 'l1', name: 'Claude 3.5 Sonnet', modelId: 'anthropic/claude-3.5-sonnet', type: 'llm', price: 15, unit: '/M', enabled: true },
            { id: 'l2', name: 'Gemini 1.5 Pro', modelId: 'google/gemini-pro-1.5', type: 'llm', price: 10, unit: '/M', enabled: true },
            { id: 'l3', name: 'Llama 3 70B', modelId: 'meta-llama/llama-3-70b', type: 'llm', price: 0.8, unit: '/M', enabled: false },
        ]
    },
    {
        id: 'ark',
        name: '火山引擎 (Volcengine)',
        hasKey: true,
        supportedTypes: ['image', 'video'],
        models: [
            { id: 'i1', name: 'Seedream 4.5', modelId: 'doubao-seedream-4.5', type: 'image', price: 0.25, unit: '/张', enabled: true },
            { id: 'v1', name: 'Seedance Pro', modelId: 'doubao-seedance-pro', type: 'video', price: 1.5, unit: '/条', enabled: true },
            { id: 'v2', name: 'Seedance 1.0', modelId: 'doubao-seedance-1.0', type: 'video', price: 0.8, unit: '/条', enabled: false },
        ]
    },
    {
        id: 'fal',
        name: 'FAL AI',
        hasKey: false,
        supportedTypes: ['image', 'video'],
        models: [
            { id: 'i2', name: 'Flux Pro', modelId: 'fal-ai/flux-pro', type: 'image', price: 0.35, unit: '/张', enabled: true },
            { id: 'v3', name: 'Kling 1.0', modelId: 'kling-v1', type: 'video', price: 1.0, unit: '/条', enabled: false },
        ]
    },
    {
        id: 'google',
        name: 'Google AI Studio',
        hasKey: false,
        supportedTypes: ['llm', 'image'],
        models: [
            { id: 'i3', name: 'Imagen 3', modelId: 'imagen-3.0', type: 'image', price: 0.4, unit: '/张', enabled: false },
            { id: 'l4', name: 'Gemini 1.5 Flash', modelId: 'google/gemini-flash-1.5', type: 'llm', price: 0.5, unit: '/M', enabled: true },
        ]
    }
]

// --- Components ---

const Icons = {
    llm: () => (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
        </svg>
    ),
    image: () => (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
    ),
    video: () => (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
    ),
    check: () => (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
    ),
    plus: () => (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
    ),
    settings: () => (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
    ),
    chevronDown: () => (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
    )
}

const TypeLabel = ({ type }: { type: ModelType }) => {
    switch (type) {
        case 'llm': return '文本'
        case 'image': return '图像'
        case 'video': return '视频'
    }
}

export default function ApiDesignDemo() {
    const [providers, setProviders] = useState(MOCK_PROVIDERS)
    const [defaults, setDefaults] = useState({
        llm: 'l1',
        image: 'i1',
        video: 'v1'
    })

    const toggleModel = (providerId: string, modelId: string) => {
        setProviders(prev => prev.map(p => {
            if (p.id !== providerId) return p
            return {
                ...p,
                models: p.models.map(m => m.id === modelId ? { ...m, enabled: !m.enabled } : m)
            }
        }))
    }

    // Helper to get all enabled models of a certain type across all providers
    const getEnabledModelsByType = (type: ModelType) => {
        return providers.flatMap(p => p.models.filter(m => m.type === type && m.enabled).map(m => ({ ...m, providerName: p.name })))
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 font-sans text-gray-900">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Section 1: Global Summary (Defaults) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                        <Icons.settings />
                        <h2 className="text-sm font-bold text-gray-800">默认模型配置</h2>
                    </div>
                    <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                        {(['llm', 'image', 'video'] as const).map(type => {
                            const options = getEnabledModelsByType(type)
                            const current = options.find(o => o.id === defaults[type])
                            return (
                                <div key={type} className="bg-white rounded-lg p-3 border border-gray-200 hover:border-blue-300 transition-colors shadow-sm">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={`p-1 rounded flex items-center justify-center ${type === 'llm' ? 'bg-blue-50 text-blue-600' :
                                                type === 'image' ? 'bg-purple-50 text-purple-600' :
                                                    'bg-orange-50 text-orange-600'
                                            }`}>
                                            {type === 'llm' ? <Icons.llm /> : type === 'image' ? <Icons.image /> : <Icons.video />}
                                        </span>
                                        <span className="font-semibold text-xs text-gray-600">{TypeLabel(type)}默认</span>
                                    </div>
                                    <div className="relative">
                                        <select
                                            value={defaults[type]}
                                            onChange={e => setDefaults({ ...defaults, [type]: e.target.value })}
                                            className="w-full appearance-none pl-2 pr-6 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer"
                                        >
                                            {options.map(opt => (
                                                <option key={opt.id} value={opt.id}>{opt.name}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-2 top-2 pointer-events-none text-gray-400">
                                            <Icons.chevronDown />
                                        </div>
                                    </div>
                                    {current && (
                                        <div className="mt-1.5 flex items-center justify-between px-0.5">
                                            <span className="text-[10px] text-gray-400">{current.providerName}</span>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Section 2: Providers List (Unified View) */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <h2 className="font-bold text-gray-800 text-sm">厂商资源池</h2>
                        <button className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-white border border-blue-100 px-3 py-1.5 rounded-md shadow-sm transition-colors hover:bg-blue-50">
                            <Icons.plus /> 添加新厂商
                        </button>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {providers.map(provider => {
                            // Group models by type
                            const groupedModels: Partial<Record<ModelType, Model[]>> = {}
                            provider.models.forEach(m => {
                                if (!groupedModels[m.type]) groupedModels[m.type] = []
                                groupedModels[m.type]!.push(m)
                            })

                            return (
                                <div key={provider.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                    {/* Provider Header */}
                                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center font-bold text-gray-700 text-sm shadow-sm">
                                                {provider.name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-sm font-bold text-gray-800">{provider.name}</h3>
                                                    {provider.hasKey ? (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 border border-green-200">已连接</span>
                                                    ) : (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200">未配置 Key</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <button className={`px-3 py-1 rounded text-xs transition-colors border font-medium ${provider.hasKey
                                                ? 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                                : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-sm'
                                            }`}>
                                            {provider.hasKey ? '配置' : '连接'}
                                        </button>
                                    </div>

                                    {/* Unified Model List */}
                                    <div className="p-4 space-y-5">
                                        {(['llm', 'image', 'video'] as const).map(type => {
                                            const modelsOfType = groupedModels[type]
                                            if (!modelsOfType || modelsOfType.length === 0) return null

                                            return (
                                                <div key={type} className="relative">
                                                    {/* Type Header - Only show if provider has multiple types or to differentiate */}
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <div className={`text-xs font-semibold flex items-center gap-1.5 px-2 py-0.5 rounded-full ${type === 'llm' ? 'bg-blue-50 text-blue-700' :
                                                                type === 'image' ? 'bg-purple-50 text-purple-700' :
                                                                    'bg-orange-50 text-orange-700'
                                                            }`}>
                                                            {type === 'llm' ? <Icons.llm /> : type === 'image' ? <Icons.image /> : <Icons.video />}
                                                            {TypeLabel(type)}能力
                                                        </div>
                                                        <div className="h-px bg-gray-100 flex-1"></div>
                                                    </div>

                                                    {/* Models Grid/List */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-2">
                                                        {modelsOfType.map(model => (
                                                            <div
                                                                key={model.id}
                                                                className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${model.enabled
                                                                        ? 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm'
                                                                        : 'bg-gray-50 border-gray-100 opacity-60 hover:opacity-100'
                                                                    }`}
                                                            >
                                                                <div className="flex-1 min-w-0 pr-3">
                                                                    <div className="flex items-center gap-2 mb-0.5">
                                                                        <span className="text-xs font-bold text-gray-900 truncate">{model.name}</span>
                                                                        {Object.values(defaults).includes(model.id) && model.enabled && (
                                                                            <span className="px-1 py-0.5 bg-gray-800 text-white text-[10px] rounded leading-none">默认</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-3 text-[10px] text-gray-500">
                                                                        <span className="font-mono bg-gray-100 px-1 rounded">{model.modelId}</span>
                                                                        <span>¥{model.price}{model.unit}</span>
                                                                    </div>
                                                                </div>

                                                                <button
                                                                    onClick={() => toggleModel(provider.id, model.id)}
                                                                    className={`w-8 h-5 rounded-full flex items-center transition-all px-0.5 ${model.enabled
                                                                            ? 'bg-blue-600 justify-end'
                                                                            : 'bg-gray-300 justify-start'
                                                                        }`}
                                                                >
                                                                    <div className="w-4 h-4 bg-white rounded-full shadow-sm"></div>
                                                                </button>
                                                            </div>
                                                        ))}
                                                        {/* Add Button for this type */}
                                                        <button className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg border border-dashed border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/50 transition-all text-xs font-medium h-full min-h-[52px]">
                                                            <Icons.plus /> 添加{TypeLabel(type)}
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        })}

                                        {/* Fallback if no models */}
                                        {Object.keys(groupedModels).length === 0 && (
                                            <div className="text-center py-4 text-xs text-gray-400">
                                                该厂商暂无配置模型
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}
