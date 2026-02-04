'use client'
import { useTranslations } from 'next-intl'

/**
 * CharacterSection - 角色资产区块组件
 * 从 AssetsStage.tsx 提取，负责角色列表的展示和操作
 * 
 * 🔥 V6.5 重构：内部直接订阅 useProjectAssets，消除 props drilling
 */

import { Character, CharacterAppearance } from '@/types/project'
import { useProjectAssets } from '@/lib/query/hooks/useProjectAssets'
import CharacterCard from './CharacterCard'

interface CharacterSectionProps {
    // 🔥 V6.5 删除：characters prop - 现在内部直接订阅
    projectId: string
    regeneratingItems: Set<string>
    onClearRegenerating: (key: string) => void  // 🆕 清除本地生成状态
    isAnalyzingAssets: boolean
    // 回调函数
    onAddCharacter: () => void
    onDeleteCharacter: (characterId: string) => void
    onDeleteAppearance: (characterId: string, appearanceId: string) => void
    onEditAppearance: (characterId: string, characterName: string, appearance: CharacterAppearance, introduction?: string | null) => void
    onEditCharacterDescription: (characterId: string, appearanceIndex: number, descriptionIndex: number) => void
    // 🔥 V6.6 重构：重命名为 handleGenerateImage
    handleGenerateImage: (type: 'character' | 'location', id: string, appearanceId?: string) => void
    onSelectImage: (characterId: string, appearanceId: string, imageIndex: number | null) => void
    onConfirmSelection: (characterId: string, appearanceId: string) => void
    onRegenerateSingle: (characterId: string, appearanceId: string, imageIndex: number) => void
    onRegenerateGroup: (characterId: string, appearanceId: string) => void
    onUndo: (characterId: string, appearanceId: string) => void
    onImageClick: (imageUrl: string) => void
    onImageEdit: (characterId: string, appearanceId: string, imageIndex: number, characterName: string) => void
    onVoiceChange: (characterId: string, customVoiceUrl: string) => void
    onVoiceDesign: (characterId: string, characterName: string) => void
    onVoiceSelectFromHub: (characterId: string) => void  // 🆕 从资产中心选择音色
    onCopyFromGlobal: (characterId: string) => void  // 🆕 从资产中心复制
    // 辅助函数
    getAppearances: (character: Character) => CharacterAppearance[]
}

export default function CharacterSection({
    // 🔥 V6.5 删除：characters prop - 现在内部直接订阅
    projectId,
    regeneratingItems,
    onClearRegenerating,
    isAnalyzingAssets,
    onAddCharacter,
    onDeleteCharacter,
    onDeleteAppearance,
    onEditAppearance,
    onEditCharacterDescription,
    handleGenerateImage,
    onSelectImage,
    onConfirmSelection,
    onRegenerateSingle,
    onRegenerateGroup,
    onUndo,
    onImageClick,
    onImageEdit,
    onVoiceChange,
    onVoiceDesign,
    onVoiceSelectFromHub,
    onCopyFromGlobal,
    getAppearances
}: CharacterSectionProps) {
    const t = useTranslations('assets')

    // 🔥 V6.5 重构：直接订阅缓存，消除 props drilling
    const { data: assets } = useProjectAssets(projectId)
    const characters: Character[] = assets?.characters ?? []

    const totalAppearances = characters.reduce((sum, char) => sum + (char.appearances?.length || 0), 0)

    return (
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">👤</span>
                    <h3 className="text-lg font-bold text-slate-800">{t("stage.characterAssets")}</h3>
                    {isAnalyzingAssets && (
                        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-lg flex items-center gap-1">
                            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            分析中
                            {t("stage.analyzing")}
                        </span>
                    )}
                    <span className="text-sm text-slate-500 bg-slate-100/50 px-2 py-1 rounded-lg">
                        {t("stage.counts", { characterCount: characters.length, appearanceCount: totalAppearances })}
                    </span>
                </div>
                <button
                    onClick={onAddCharacter}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl shadow-sm hover:shadow-md transition-all"
                >
                    + {t("character.add")}
                </button>
            </div>

            {/* 按角色分组显示 */}
            <div className="space-y-8">
                {characters.map(character => {
                    const appearances = getAppearances(character)
                    const sortedAppearances = [...appearances].sort((a, b) => a.appearanceIndex - b.appearanceIndex)
                    const primaryAppearance = sortedAppearances.find(a => a.appearanceIndex === 1) || sortedAppearances[0]

                    const primaryImageUrl = primaryAppearance?.selectedIndex !== null && primaryAppearance?.selectedIndex !== undefined
                        ? (primaryAppearance?.imageUrls?.[primaryAppearance.selectedIndex!] || primaryAppearance?.imageUrl)
                        : (primaryAppearance?.imageUrl || (primaryAppearance?.imageUrls && primaryAppearance.imageUrls.length > 0 ? primaryAppearance.imageUrls[0] : null))
                    const primarySelected = !!primaryImageUrl

                    return (
                        <div key={character.id} className="space-y-4">
                            {/* 角色标题 */}
                            <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-base font-semibold text-gray-900">{character.name}</h3>
                                    <span className="text-xs text-gray-500">
                                        {t("character.assetCount", { count: sortedAppearances.length })}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {/* 从资产中心复制按钮 */}
                                    <button
                                        onClick={() => onCopyFromGlobal(character.id)}
                                        className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        {t("character.copyFromGlobal")}
                                    </button>
                                    <button
                                        onClick={() => onDeleteCharacter(character.id)}
                                        className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        {t("character.delete")}
                                    </button>
                                </div>
                            </div>

                            {/* 形象网格 */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {sortedAppearances.map(appearance => {
                                    const isPrimary = appearance.appearanceIndex === (primaryAppearance?.appearanceIndex || 1)
                                    return (
                                        <CharacterCard
                                            key={`${character.id}-${appearance.appearanceIndex}`}
                                            character={character}
                                            appearance={appearance}
                                            onEdit={() => onEditAppearance(character.id, character.name, appearance, character.introduction)}
                                            onDelete={() => onDeleteCharacter(character.id)}
                                            onDeleteAppearance={() => appearance.id && onDeleteAppearance(character.id, appearance.id)}
                                            onRegenerate={() => {
                                                // 获取有效图片数量
                                                const imageUrls = appearance.imageUrls || []
                                                const validImageCount = imageUrls.filter(url => url !== null).length

                                                console.log('[CharacterSection] 重新生成判断:', {
                                                    characterName: character.name,
                                                    appearanceIndex: appearance.appearanceIndex,
                                                    imageUrls,
                                                    validImageCount,
                                                    selectedIndex: appearance.selectedIndex
                                                })

                                                // 单图：重新生成单张
                                                if (validImageCount === 1) {
                                                    const selectedIndex = appearance.selectedIndex ?? 0
                                                    console.log('[CharacterSection] 调用单张重新生成, imageIndex:', selectedIndex)
                                                    onRegenerateSingle(character.id, appearance.id, selectedIndex)
                                                }
                                                // 多图或无图：重新生成整组
                                                else {
                                                    console.log('[CharacterSection] 调用整组重新生成')
                                                    onRegenerateGroup(character.id, appearance.id)
                                                }
                                            }}
                                            onGenerate={() => handleGenerateImage('character', character.id, appearance.id)}
                                            onUndo={() => onUndo(character.id, appearance.id)}
                                            onImageClick={onImageClick}
                                            showDeleteButton={true}
                                            appearanceCount={sortedAppearances.length}
                                            onSelectImage={onSelectImage}
                                            onEditDescription={onEditCharacterDescription}
                                            onRegenerateSingle={onRegenerateSingle}
                                            regeneratingItems={regeneratingItems}
                                            onClearRegenerating={onClearRegenerating}
                                            onImageEdit={(charId, appIdx, imgIdx) => onImageEdit(charId, appearance.id, imgIdx, character.name)}
                                            isPrimaryAppearance={isPrimary}
                                            primaryAppearanceSelected={primarySelected}
                                            primaryAppearanceImageUrl={primaryImageUrl}
                                            projectId={projectId}
                                            onConfirmSelection={onConfirmSelection}
                                            onVoiceChange={(characterId: string, customVoiceUrl?: string) => customVoiceUrl && onVoiceChange(characterId, customVoiceUrl)}
                                            onVoiceDesign={onVoiceDesign}
                                            onVoiceSelectFromHub={onVoiceSelectFromHub}
                                        />
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
