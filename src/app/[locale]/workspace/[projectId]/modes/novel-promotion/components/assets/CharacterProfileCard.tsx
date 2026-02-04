'use client'

import { useTranslations } from 'next-intl'
/**
 * 角色档案卡片组件
 * 展示角色档案摘要，点击可编辑
 */

import { CharacterProfileData } from '@/types/character-profile'

interface CharacterProfileCardProps {
    characterId: string
    name: string
    profileData: CharacterProfileData
    onEdit: () => void
    onConfirm: () => void
    onUseExisting?: () => void
    onDelete?: () => void
    isConfirming?: boolean
    isDeleting?: boolean
}

const ROLE_LEVEL_LABELS = {
    S: 'S级主角',
    A: 'A级核心配角',
    B: 'B级重要配角',
    C: 'C级次要角色',
    D: 'D级群众演员'
}

const ROLE_LEVEL_COLORS = {
    S: 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white',
    A: 'bg-gradient-to-r from-purple-400 to-pink-500 text-white',
    B: 'bg-gradient-to-r from-blue-400 to-cyan-500 text-white',
    C: 'bg-gray-300 text-gray-800',
    D: 'bg-gray-200 text-gray-600'
}

export default function CharacterProfileCard({
    characterId,
    name,
    profileData,
    onEdit,
    onConfirm,
    onUseExisting,
    onDelete,
    isConfirming = false,
    isDeleting = false
}: CharacterProfileCardProps) {
    const t = useTranslations('assets')
    const roleLevelLabel = ROLE_LEVEL_LABELS[profileData.role_level] || profileData.role_level
    const roleLevelColor = ROLE_LEVEL_COLORS[profileData.role_level] || 'bg-gray-300 text-gray-800'

    return (
        <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
            {/* 头部 */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">{name}</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${roleLevelColor}`}>
                            {roleLevelLabel}
                        </span>
                        <span className="text-xs text-gray-500">{profileData.archetype}</span>
                    </div>
                </div>
                {/* 删除按钮 */}
                {onDelete && (
                    <button
                        onClick={onDelete}
                        disabled={isConfirming || isDeleting}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title={t('characterProfile.delete')}
                    >
                        {isDeleting ? (
                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        )}
                    </button>
                )}
            </div>

            {/* 档案摘要 */}
            <div className="space-y-1.5 mb-3">
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500 w-16">性别:</span>
                    <span className="text-gray-900">{profileData.gender}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500 w-16">年龄:</span>
                    <span className="text-gray-900">{profileData.age_range}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500 w-16">时代:</span>
                    <span className="text-gray-900">{profileData.era_period}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500 w-16">阶层:</span>
                    <span className="text-gray-900">{profileData.social_class}</span>
                </div>
                {profileData.occupation && (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500 w-16">职业:</span>
                        <span className="text-gray-900">{profileData.occupation}</span>
                    </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500 w-16">性格:</span>
                    <div className="flex flex-wrap gap-1">
                        {profileData.personality_tags.map((tag, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500 w-16">服装:</span>
                    <span className="text-gray-900">
                        {'⭐'.repeat(profileData.costume_tier)}
                    </span>
                </div>
                {profileData.primary_identifier && (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500 w-16">标志:</span>
                        <span className="text-orange-600 font-medium">{profileData.primary_identifier}</span>
                    </div>
                )}
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2">
                <button
                    onClick={onEdit}
                    disabled={isConfirming}
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                    {t('characterProfile.editProfile')}
                </button>
                {onUseExisting && (
                    <button
                        onClick={onUseExisting}
                        disabled={isConfirming}
                        className="flex-1 px-3 py-1.5 text-sm border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                        🔗 {t('characterProfile.useExisting')}
                    </button>
                )}
                <button
                    onClick={onConfirm}
                    disabled={isConfirming}
                    className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                >
                    {isConfirming ? (
                        <>
                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span>{t("video.panelCard.generating")}</span>
                        </>
                    ) : (
                        t('characterProfile.confirmAndGenerate')
                    )}
                </button>
            </div>
        </div>
    )
}
