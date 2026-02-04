'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Provider, PRESET_PROVIDERS } from './types'

interface ProviderSectionProps {
    title: string
    icon: React.ReactNode
    type: Provider['type']
    providers: Provider[]
    onUpdateApiKey: (providerId: string, type: Provider['type'], apiKey: string) => void
    onUpdateInfo?: (providerId: string, type: Provider['type'], name: string, baseUrl?: string) => void
    onDelete?: (providerId: string, type: Provider['type']) => void
    onAdd?: (provider: Omit<Provider, 'hasApiKey'>) => void
    showBaseUrl?: boolean
    showAddButton?: boolean
}

export function ProviderSection({
    title,
    icon,
    type,
    providers,
    onUpdateApiKey,
    onUpdateInfo,
    onDelete,
    onAdd,
    showBaseUrl = false,
    showAddButton = false
}: ProviderSectionProps) {
    const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({})
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editData, setEditData] = useState({ name: '', baseUrl: '' })
    const [showAddForm, setShowAddForm] = useState(false)
    const [newProvider, setNewProvider] = useState({ name: '', baseUrl: '', apiKey: '' })
    const t = useTranslations('providerSection')
    const tc = useTranslations('common')

    const isPreset = (id: string) => PRESET_PROVIDERS.some(p => p.id === id && p.type === type)

    const handleSaveEdit = (provider: Provider) => {
        onUpdateInfo?.(provider.id, type, editData.name, editData.baseUrl || undefined)
        setEditingId(null)
    }

    const handleAdd = () => {
        if (!newProvider.name || (type === 'llm' && !newProvider.baseUrl)) {
            alert(t('fillRequired'))
            return
        }
        onAdd?.({
            id: `custom-${Date.now()}`,
            name: newProvider.name,
            type,
            baseUrl: newProvider.baseUrl || undefined,
            apiKey: newProvider.apiKey
        })
        setNewProvider({ name: '', baseUrl: '', apiKey: '' })
        setShowAddForm(false)
    }

    return (
        <div className="bg-gradient-to-br from-slate-50/80 to-blue-50/50 rounded-2xl p-5 border border-gray-100/80 mb-5">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    {icon}
                    {title}
                </h3>
                {showAddButton && (
                    <button
                        onClick={() => setShowAddForm(!showAddForm)}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                    >
                        {t('addProvider')}
                    </button>
                )}
            </div>

            {/* 添加表单 */}
            {showAddForm && (
                <div className="mb-4 p-3 bg-blue-50/80 rounded-xl border border-blue-100 flex items-center gap-2">
                    <input
                        type="text"
                        value={newProvider.name}
                        onChange={e => setNewProvider({ ...newProvider, name: e.target.value })}
                        placeholder={t('name')}
                        className="w-24 px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
                    />
                    {type === 'llm' && (
                        <input
                            type="text"
                            value={newProvider.baseUrl}
                            onChange={e => setNewProvider({ ...newProvider, baseUrl: e.target.value })}
                            placeholder="Base URL"
                            className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg font-mono"
                        />
                    )}
                    <input
                        type="password"
                        value={newProvider.apiKey}
                        onChange={e => setNewProvider({ ...newProvider, apiKey: e.target.value })}
                        placeholder="API Key"
                        className="w-40 px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
                    />
                    <button onClick={handleAdd} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        {t('add')}
                    </button>
                    <button onClick={() => setShowAddForm(false)} className="px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700">
                        {tc('cancel')}
                    </button>
                </div>
            )}

            {/* 提供商列表 */}
            <div className="space-y-2">
                {providers.map(provider => {
                    const isEditing = editingId === provider.id
                    const isVisible = showApiKeys[provider.id]

                    if (isEditing && showBaseUrl) {
                        return (
                            <div key={provider.id} className="flex items-center gap-3 py-2.5 px-3 bg-blue-50/80 rounded-xl border border-blue-200">
                                <input
                                    type="text"
                                    value={editData.name}
                                    onChange={e => setEditData({ ...editData, name: e.target.value })}
                                    className="w-28 px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
                                />
                                <input
                                    type="text"
                                    value={editData.baseUrl}
                                    onChange={e => setEditData({ ...editData, baseUrl: e.target.value })}
                                    className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg font-mono"
                                />
                                <button onClick={() => handleSaveEdit(provider)} className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg">{t('save')}</button>
                                <button onClick={() => setEditingId(null)} className="px-2 py-1 text-sm text-gray-500">{tc('cancel')}</button>
                            </div>
                        )
                    }

                    return (
                        <div key={provider.id} className="flex items-center gap-3 py-2.5 px-3 bg-white/60 rounded-xl border border-white/60 group">
                            {showBaseUrl && (
                                <button
                                    onClick={() => {
                                        setEditingId(provider.id)
                                        setEditData({ name: provider.name, baseUrl: provider.baseUrl || '' })
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg cursor-pointer"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                </button>
                            )}
                            <span className="text-sm text-gray-900 w-28 font-medium truncate">{provider.name}</span>
                            {showBaseUrl && (
                                <span className="text-xs text-gray-400 font-mono w-64 truncate">{provider.baseUrl}</span>
                            )}
                            <div className="relative flex-1">
                                <input
                                    type={isVisible ? 'text' : 'password'}
                                    value={provider.apiKey || ''}
                                    onChange={e => onUpdateApiKey(provider.id, type, e.target.value)}
                                    placeholder="API Key"
                                    className="w-full px-3 py-1.5 pr-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80"
                                />
                                <button
                                    onClick={() => setShowApiKeys({ ...showApiKeys, [provider.id]: !isVisible })}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                                >
                                    {isVisible ? (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                    )}
                                </button>
                            </div>
                            {provider.apiKey && <span className="text-green-500 text-lg">✓</span>}
                            {!isPreset(provider.id) && onDelete && (
                                <button
                                    onClick={() => onDelete(provider.id, type)}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg cursor-pointer"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
