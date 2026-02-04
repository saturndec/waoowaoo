'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { CustomModel } from './types'
import { BANANA_RESOLUTION_OPTIONS, BANANA_MODELS } from '@/lib/constants'

interface DefaultModelSectionProps {
    type: 'llm' | 'image' | 'video'
    models: CustomModel[]
    defaultModels: {
        analysisModel?: string
        imageModel?: string
        imageResolution?: string
        videoModel?: string
    }
    onUpdateDefault: (field: string, modelId: string) => void
}

export function DefaultModelSection({
    type,
    models,
    defaultModels,
    onUpdateDefault
}: DefaultModelSectionProps) {
    const t = useTranslations('apiConfig')

    // 只显示已启用的模型
    const enabledModels = models.filter(m => m.enabled)

    if (enabledModels.length === 0) {
        return null
    }

    // 根据类型确定要显示的选择器
    const selectors = type === 'llm'
        ? [{ field: 'analysisModel', label: t('defaultModel.analysis') }]
        : type === 'image'
            ? [{ field: 'imageModel', label: t('defaultModel.image') }]
            : [{ field: 'videoModel', label: t('defaultModel.video') }]

    // 检查当前图像模型是否支持分辨率选择
    const selectedImageModel = defaultModels.imageModel || ''
    const showResolutionSelector = type === 'image' && BANANA_MODELS.some(m => selectedImageModel.includes(m) || selectedImageModel.includes('gemini-3-pro-image'))

    return (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100/80 p-5">
            <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                <h3 className="text-sm font-semibold text-gray-900">{t('defaultModel.title')}</h3>
            </div>

            <p className="text-xs text-gray-500 mb-4">{t('defaultModel.hint')}</p>

            <div className="grid gap-3">
                {selectors.map(({ field, label }) => (
                    <div key={field} className="flex items-center gap-3">
                        <label className="text-sm text-gray-700 w-24 shrink-0">{label}</label>
                        <select
                            value={defaultModels[field as keyof typeof defaultModels] || ''}
                            onChange={(e) => onUpdateDefault(field, e.target.value)}
                            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="">{t('defaultModel.notSelected')}</option>
                            {enabledModels.map((model, index) => (
                                <option key={`${model.modelId}-${index}`} value={model.modelId}>
                                    {model.name}
                                </option>
                            ))}
                        </select>
                    </div>
                ))}

                {/* 图像分辨率选择器（仅 Banana/Gemini Pro 模型显示） */}
                {showResolutionSelector && (
                    <div className="flex items-center gap-3">
                        <label className="text-sm text-gray-700 w-24 shrink-0">{t('defaultModel.resolution')}</label>
                        <select
                            value={defaultModels.imageResolution || '2K'}
                            onChange={(e) => onUpdateDefault('imageResolution', e.target.value)}
                            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            {BANANA_RESOLUTION_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>
        </div>
    )
}

