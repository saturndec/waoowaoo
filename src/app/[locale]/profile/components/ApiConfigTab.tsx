'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ProviderSection, ProviderCard, useProviders, CustomModel, Provider, getProviderDisplayName } from './api-config'

// --- Icons ---
const Icons = {
    settings: () => (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
    ),
    llm: () => (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>
    ),
    image: () => (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
    ),
    video: () => (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
    ),
    chevronDown: () => (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
    ),
    plus: () => (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
    )
}

// Modal removed - using inline editing in ProviderCard

// --- Main Component ---
export default function ApiConfigTab() {
    const {
        providers,
        models,
        defaultModels,
        loading,
        saveStatus,
        updateProviderApiKey,
        updateProviderBaseUrl,
        toggleModel,
        deleteModel,
        addModel,
        updateDefaultModel,
        updateModelResolution,
        getProvidersByType,
    } = useProviders()

    const t = useTranslations('apiConfig')
    const tc = useTranslations('common')



    if (loading) {
        return <div className="p-6 text-gray-400 flex items-center justify-center h-full">{tc('loading')}</div>
    }

    // 获取所有支持模型的唯一厂商
    const modelProviderIds = [...new Set(models.map(m => m.provider))]
    // 需要始终显示的厂商（需要配置 baseUrl 或支持自定义模型的厂商）
    const alwaysShowProviders = ['gemini-compatible']
    const modelProviders = providers.filter(p =>
        modelProviderIds.includes(p.id) || alwaysShowProviders.includes(p.id)
    )

    // 每个厂商对应的模型
    const getModelsForProvider = (providerId: string) => models.filter(m => m.provider === providerId)

    // 获取启用的模型用于默认模型选择
    const getEnabledModelsByType = (type: 'llm' | 'image' | 'video') => {
        return models.filter(m => m.type === type && m.enabled).map(m => ({
            ...m,
            providerName: providers.find(p => p.id === m.provider)?.name || m.provider
        }))
    }

    const audioProviders = getProvidersByType('audio')
    const lipsyncProviders = getProvidersByType('lipsync')

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100/80 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">{t('title')}</h2>
                <div className="flex items-center gap-2 text-sm">
                    {saveStatus === 'saving' && (
                        <span className="text-blue-500 flex items-center gap-1">
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {t('saving')}
                        </span>
                    )}
                    {saveStatus === 'saved' && (
                        <span className="text-green-500 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {t('saved')}
                        </span>
                    )}
                    {saveStatus === 'error' && (
                        <span className="text-red-500 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            {t('saveFailed')}
                        </span>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-6 max-w-4xl mx-auto space-y-6">

                    {/* Section 1: Default Models */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                            <Icons.settings />
                            <h2 className="text-sm font-bold text-gray-800">{t('defaultModels')}</h2>
                        </div>
                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {/* Analysis Model */}
                            {(() => {
                                const options = getEnabledModelsByType('llm')
                                const currentId = defaultModels.analysisModel
                                const current = options.find(o => o.modelId === currentId)
                                return (
                                    <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-blue-300 transition-colors shadow-sm">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="p-1 rounded flex items-center justify-center bg-blue-50 text-blue-600">
                                                <Icons.llm />
                                            </span>
                                            <span className="font-semibold text-xs text-gray-600">{t('textDefault')}</span>
                                        </div>
                                        <div className="relative">
                                            <select
                                                value={currentId || ''}
                                                onChange={e => updateDefaultModel('analysisModel', e.target.value)}
                                                className="w-full appearance-none pl-2 pr-6 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer"
                                            >
                                                <option value="">{t('selectDefault')}</option>
                                                {options.map((opt, index) => (
                                                    <option key={`${opt.modelId}-${index}`} value={opt.modelId}>{opt.name} ({getProviderDisplayName(opt.provider)})</option>
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
                            })()}

                            {/* Character Model */}
                            {(() => {
                                const options = getEnabledModelsByType('image')
                                const currentId = defaultModels.characterModel
                                const current = options.find(o => o.modelId === currentId)
                                return (
                                    <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-purple-300 transition-colors shadow-sm">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="p-1 rounded flex items-center justify-center bg-purple-50 text-purple-600">
                                                <Icons.image />
                                            </span>
                                            <span className="font-semibold text-xs text-gray-600">角色模型</span>
                                        </div>
                                        <div className="relative">
                                            <select
                                                value={currentId || ''}
                                                onChange={e => updateDefaultModel('characterModel', e.target.value)}
                                                className="w-full appearance-none pl-2 pr-6 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-900 focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-none cursor-pointer"
                                            >
                                                <option value="">{t('selectDefault')}</option>
                                                {options.map((opt, index) => (
                                                    <option key={`${opt.modelId}-${index}`} value={opt.modelId}>{opt.name} ({getProviderDisplayName(opt.provider)})</option>
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
                            })()}

                            {/* Location Model */}
                            {(() => {
                                const options = getEnabledModelsByType('image')
                                const currentId = defaultModels.locationModel
                                const current = options.find(o => o.modelId === currentId)
                                return (
                                    <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-green-300 transition-colors shadow-sm">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="p-1 rounded flex items-center justify-center bg-green-50 text-green-600">
                                                <Icons.image />
                                            </span>
                                            <span className="font-semibold text-xs text-gray-600">场景模型</span>
                                        </div>
                                        <div className="relative">
                                            <select
                                                value={currentId || ''}
                                                onChange={e => updateDefaultModel('locationModel', e.target.value)}
                                                className="w-full appearance-none pl-2 pr-6 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-900 focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none cursor-pointer"
                                            >
                                                <option value="">{t('selectDefault')}</option>
                                                {options.map((opt, index) => (
                                                    <option key={`${opt.modelId}-${index}`} value={opt.modelId}>{opt.name} ({getProviderDisplayName(opt.provider)})</option>
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
                            })()}

                            {/* Storyboard Model */}
                            {(() => {
                                const options = getEnabledModelsByType('image')
                                const currentId = defaultModels.storyboardModel
                                const current = options.find(o => o.modelId === currentId)
                                return (
                                    <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-yellow-300 transition-colors shadow-sm">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="p-1 rounded flex items-center justify-center bg-yellow-50 text-yellow-600">
                                                <Icons.image />
                                            </span>
                                            <span className="font-semibold text-xs text-gray-600">分镜模型</span>
                                        </div>
                                        <div className="relative">
                                            <select
                                                value={currentId || ''}
                                                onChange={e => updateDefaultModel('storyboardModel', e.target.value)}
                                                className="w-full appearance-none pl-2 pr-6 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-900 focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500 outline-none cursor-pointer"
                                            >
                                                <option value="">{t('selectDefault')}</option>
                                                {options.map((opt, index) => (
                                                    <option key={`${opt.modelId}-${index}`} value={opt.modelId}>{opt.name} ({getProviderDisplayName(opt.provider)})</option>
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
                            })()}

                            {/* Edit Model */}
                            {(() => {
                                const options = getEnabledModelsByType('image')
                                const currentId = defaultModels.editModel
                                const current = options.find(o => o.modelId === currentId)
                                return (
                                    <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-pink-300 transition-colors shadow-sm">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="p-1 rounded flex items-center justify-center bg-pink-50 text-pink-600">
                                                <Icons.image />
                                            </span>
                                            <span className="font-semibold text-xs text-gray-600">修图模型</span>
                                        </div>
                                        <div className="relative">
                                            <select
                                                value={currentId || ''}
                                                onChange={e => updateDefaultModel('editModel', e.target.value)}
                                                className="w-full appearance-none pl-2 pr-6 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-900 focus:ring-1 focus:ring-pink-500 focus:border-pink-500 outline-none cursor-pointer"
                                            >
                                                <option value="">{t('selectDefault')}</option>
                                                {options.map((opt, index) => (
                                                    <option key={`${opt.modelId}-${index}`} value={opt.modelId}>{opt.name} ({getProviderDisplayName(opt.provider)})</option>
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
                            })()}

                            {/* Video Model */}
                            {(() => {
                                const options = getEnabledModelsByType('video')
                                const currentId = defaultModels.videoModel
                                const current = options.find(o => o.modelId === currentId)
                                return (
                                    <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-orange-300 transition-colors shadow-sm">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="p-1 rounded flex items-center justify-center bg-orange-50 text-orange-600">
                                                <Icons.video />
                                            </span>
                                            <span className="font-semibold text-xs text-gray-600">{t('videoDefault')}</span>
                                        </div>
                                        <div className="relative">
                                            <select
                                                value={currentId || ''}
                                                onChange={e => updateDefaultModel('videoModel', e.target.value)}
                                                className="w-full appearance-none pl-2 pr-6 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-900 focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none cursor-pointer"
                                            >
                                                <option value="">{t('selectDefault')}</option>
                                                {options.map((opt, index) => (
                                                    <option key={`${opt.modelId}-${index}`} value={opt.modelId}>{opt.name} ({getProviderDisplayName(opt.provider)})</option>
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
                            })()}
                        </div>
                    </div>

                    {/* Section 2: Provider Cards */}
                    <div className="space-y-4">
                        <h2 className="font-bold text-gray-800 text-sm px-1">{t('providerPool')}</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {modelProviders.map(provider => (
                                <ProviderCard
                                    key={provider.id}
                                    provider={provider}
                                    models={getModelsForProvider(provider.id)}
                                    defaultModels={defaultModels}
                                    onToggleModel={toggleModel}
                                    onUpdateApiKey={updateProviderApiKey}
                                    onUpdateBaseUrl={updateProviderBaseUrl}
                                    onDeleteModel={deleteModel}
                                    onUpdateModelResolution={updateModelResolution}
                                    onAddModel={addModel}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Section 3: Other Providers */}
                    <div className="border-t border-gray-100 pt-4">
                        <h2 className="font-bold text-gray-800 text-sm px-1 mb-4">
                            {t('otherProviders')}
                            <span className="text-xs text-gray-400 font-normal ml-2">({t('audioAndLipsync')})</span>
                        </h2>
                        <div className="space-y-4">
                            <ProviderSection
                                title={t('sections.audioApiKey')}
                                icon={<svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" /></svg>}
                                type="audio"
                                providers={audioProviders}
                                onUpdateApiKey={updateProviderApiKey}
                            />
                            <ProviderSection
                                title={t('sections.lipsyncApiKey')}
                                icon={<svg className="w-4 h-4 text-pink-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5.5-6c.83 0 1.5-.67 1.5-1.5S7.33 11 6.5 11 5 11.67 5 12.5 5.67 14 6.5 14zm11 0c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5 1.5.67 1.5 1.5 1.5zm-5.5 4c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" /></svg>}
                                type="lipsync"
                                providers={lipsyncProviders}
                                onUpdateApiKey={updateProviderApiKey}
                            />
                        </div>
                    </div>
                </div>
            </div>


        </div>
    )
}
