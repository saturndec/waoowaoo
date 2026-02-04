'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Provider, CustomModel, PRESET_PROVIDERS, PRESET_MODELS } from './types'

interface DefaultModels {
    analysisModel?: string
    characterModel?: string
    locationModel?: string
    storyboardModel?: string
    editModel?: string
    imageResolution?: string
    videoModel?: string
}

interface UseProvidersReturn {
    providers: Provider[]
    models: CustomModel[]
    defaultModels: DefaultModels
    loading: boolean
    saveStatus: 'idle' | 'saving' | 'saved' | 'error'
    updateProviderApiKey: (providerId: string, type: Provider['type'], apiKey: string) => void
    updateProviderBaseUrl: (providerId: string, type: Provider['type'], baseUrl: string) => void
    addProvider: (provider: Omit<Provider, 'hasApiKey'>) => void
    deleteProvider: (providerId: string, type: Provider['type']) => void
    updateProviderInfo: (providerId: string, type: Provider['type'], name: string, baseUrl?: string) => void
    toggleModel: (modelId: string) => void
    updateModelPrice: (modelId: string, price: number) => void
    updateModelResolution: (modelId: string, resolution: '2K' | '4K') => void
    addModel: (model: Omit<CustomModel, 'enabled'>) => void
    deleteModel: (modelId: string) => void
    updateDefaultModel: (field: string, modelId: string) => void
    getProvidersByType: (type: Provider['type']) => Provider[]
    getModelsByType: (type: CustomModel['type']) => CustomModel[]
}

export function useProviders(): UseProvidersReturn {
    const [providers, setProviders] = useState<Provider[]>([])
    const [models, setModels] = useState<CustomModel[]>([])
    const [defaultModels, setDefaultModels] = useState<DefaultModels>({})
    const [loading, setLoading] = useState(true)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const initializedRef = useRef(false) // 标记是否完成初始化

    // 加载配置
    useEffect(() => {
        fetchConfig()
    }, [])

    async function fetchConfig() {
        try {
            const res = await fetch('/api/user/api-config')
            if (res.ok) {
                const data = await res.json()

                // 合并预设和已保存的提供商
                const savedProviders: Provider[] = data.providers || []
                const allProviders = PRESET_PROVIDERS.map(preset => {
                    const saved = savedProviders.find(p => p.id === preset.id && p.type === preset.type)
                    return {
                        ...preset,
                        apiKey: saved?.apiKey || '',
                        hasApiKey: !!saved?.apiKey,
                        // 保留用户保存的 baseUrl（用于 flow2api 等自建服务）
                        baseUrl: saved?.baseUrl || preset.baseUrl
                    }
                })
                const customProviders = savedProviders.filter(p =>
                    !PRESET_PROVIDERS.find(preset => preset.id === p.id && preset.type === p.type)
                )
                setProviders([...allProviders, ...customProviders])

                // 合并预设和已保存的模型
                const savedModels = data.models || []
                const allModels = PRESET_MODELS.map(preset => {
                    const saved = savedModels.find((m: CustomModel) => m.modelId === preset.modelId)
                    return {
                        ...preset,
                        enabled: !!saved,
                        price: saved?.price ?? preset.price,
                        resolution: saved?.resolution ?? preset.resolution  // 保留已保存的分辨率
                    }
                })
                const customModels = savedModels.filter((m: CustomModel) =>
                    !PRESET_MODELS.find(p => p.modelId === m.modelId)
                ).map((m: CustomModel) => ({ ...m, enabled: true }))
                setModels([...allModels, ...customModels])

                // 加载默认模型配置
                if (data.defaultModels) {
                    setDefaultModels(data.defaultModels)
                }
            } else {
                setProviders(PRESET_PROVIDERS.map(p => ({ ...p, apiKey: '', hasApiKey: false })))
                setModels(PRESET_MODELS.map(m => ({ ...m, enabled: false })))
            }
        } catch (error) {
            console.error('获取配置失败:', error)
            setProviders(PRESET_PROVIDERS.map(p => ({ ...p, apiKey: '', hasApiKey: false })))
            setModels(PRESET_MODELS.map(m => ({ ...m, enabled: false })))
        } finally {
            setLoading(false)
            // 延迟设置 initialized，确保所有状态更新完成后才开始监听
            setTimeout(() => {
                initializedRef.current = true
            }, 100)
        }
    }

    // 自动保存（使用最新状态）
    const autoSave = useCallback(async () => {
        setSaveStatus('saving')
        try {
            const enabledModels = models.filter(m => m.enabled)
            const res = await fetch('/api/user/api-config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ models: enabledModels, providers, defaultModels })
            })

            if (res.ok) {
                setSaveStatus('saved')
                setTimeout(() => setSaveStatus('idle'), 3000)
            } else {
                setSaveStatus('error')
            }
        } catch (error) {
            console.error('保存失败:', error)
            setSaveStatus('error')
        }
    }, [models, providers, defaultModels])

    // 监听状态变化，触发自动保存
    useEffect(() => {
        if (loading) return // 首次加载时不保存
        if (!initializedRef.current) return // 未完成初始化时不保存

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
        }
        saveTimeoutRef.current = setTimeout(() => {
            autoSave()
        }, 1000)

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
            }
        }
    }, [models, providers, defaultModels, loading, autoSave])

    // 页面卸载时强制保存
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
                // 使用 sendBeacon 进行异步保存（即使页面关闭也能完成）
                const enabledModels = models.filter(m => m.enabled)
                const blob = new Blob([JSON.stringify({ models: enabledModels, providers, defaultModels })], {
                    type: 'application/json'
                })
                navigator.sendBeacon('/api/user/api-config', blob)
            }
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [models, providers, defaultModels])

    // 默认模型操作
    const updateDefaultModel = useCallback((field: string, modelId: string) => {
        setDefaultModels(prev => ({ ...prev, [field]: modelId }))
    }, [])

    // 提供商操作
    const updateProviderApiKey = useCallback((providerId: string, type: Provider['type'], apiKey: string) => {
        setProviders(prev => prev.map(p =>
            p.id === providerId && p.type === type ? { ...p, apiKey, hasApiKey: !!apiKey } : p
        ))
    }, [])

    const addProvider = useCallback((provider: Omit<Provider, 'hasApiKey'>) => {
        const newProvider: Provider = { ...provider, hasApiKey: !!provider.apiKey }
        setProviders(prev => [...prev, newProvider])
    }, [])

    const deleteProvider = useCallback((providerId: string, type: Provider['type']) => {
        if (PRESET_PROVIDERS.find(p => p.id === providerId && p.type === type)) {
            alert('预设提供商不能删除')
            return
        }
        if (confirm('确定删除这个提供商吗？')) {
            setProviders(prev => prev.filter(p => !(p.id === providerId && p.type === type)))
        }
    }, [])

    const updateProviderInfo = useCallback((providerId: string, type: Provider['type'], name: string, baseUrl?: string) => {
        setProviders(prev => prev.map(p =>
            p.id === providerId && p.type === type ? { ...p, name, baseUrl } : p
        ))
    }, [])

    const updateProviderBaseUrl = useCallback((providerId: string, type: Provider['type'], baseUrl: string) => {
        setProviders(prev => prev.map(p =>
            p.id === providerId && p.type === type ? { ...p, baseUrl } : p
        ))
    }, [])

    // 模型操作
    const toggleModel = useCallback((modelId: string) => {
        setModels(prev => prev.map(m => m.modelId === modelId ? { ...m, enabled: !m.enabled } : m))
    }, [])

    const updateModelPrice = useCallback((modelId: string, price: number) => {
        setModels(prev => prev.map(m => m.modelId === modelId ? { ...m, price } : m))
    }, [])

    const updateModelResolution = useCallback((modelId: string, resolution: '2K' | '4K') => {
        setModels(prev => prev.map(m => m.modelId === modelId ? { ...m, resolution } : m))
    }, [])

    const addModel = useCallback((model: Omit<CustomModel, 'enabled'>) => {
        setModels(prev => [...prev, { ...model, enabled: true }])
    }, [])

    const deleteModel = useCallback((modelId: string) => {
        if (PRESET_MODELS.find(m => m.modelId === modelId)) {
            alert('预设模型不能删除')
            return
        }
        if (confirm('确定删除这个模型吗？')) {
            setModels(prev => prev.filter(m => m.modelId !== modelId))
        }
    }, [])

    // 过滤器
    const getProvidersByType = useCallback((type: Provider['type']) => {
        return providers.filter(p => p.type === type)
    }, [providers])

    const getModelsByType = useCallback((type: CustomModel['type']) => {
        return models.filter(m => m.type === type)
    }, [models])

    return {
        providers,
        models,
        defaultModels,
        loading,
        saveStatus,
        updateProviderApiKey,
        updateProviderBaseUrl,
        addProvider,
        deleteProvider,
        updateProviderInfo,
        toggleModel,
        updateModelPrice,
        updateModelResolution,
        addModel,
        deleteModel,
        updateDefaultModel,
        getProvidersByType,
        getModelsByType
    }
}
