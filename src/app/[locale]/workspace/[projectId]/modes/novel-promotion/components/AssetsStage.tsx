'use client'

import { useTranslations } from 'next-intl'
/**
 * 资产确认阶段 - 小说推文模式专用
 * 包含TTS生成和资产分析
 * 
 * 重构说明 v2:
 * - 角色和场景操作函数已提取到 hooks/useCharacterActions 和 hooks/useLocationActions
 * - 批量生成逻辑已提取到 hooks/useBatchGeneration
 * - TTS/音色逻辑已提取到 hooks/useTTSGeneration
 * - 弹窗状态已提取到 hooks/useAssetModals
 * - 档案管理已提取到 hooks/useProfileManagement
 * - UI已拆分为 CharacterSection, LocationSection, AssetToolbar, AssetModals 组件
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
// 移除了 useRouter 导入，因为不再需要在组件中操作 URL
import { Character, Location, CharacterAppearance } from '@/types/project'
import { parseProfileData } from '@/types/character-profile'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import { parseSRT } from '@/lib/srt'
import { TTS_VOICES } from '@/lib/constants'
import { isAbortError } from '@/lib/error-utils'
import { useProjectAssets, useRefreshProjectAssets, useModifyProjectCharacterImage, useModifyProjectLocationImage, useGenerateProjectCharacterImage, useGenerateProjectLocationImage } from '@/lib/query/hooks'

// Hooks
import { useCharacterActions } from './assets/hooks/useCharacterActions'
import { useLocationActions } from './assets/hooks/useLocationActions'
import { useBatchGeneration } from './assets/hooks/useBatchGeneration'
import { useTTSGeneration } from './assets/hooks/useTTSGeneration'
import { useAssetModals } from './assets/hooks/useAssetModals'
import { useProfileManagement } from './assets/hooks/useProfileManagement'

// Components
import CharacterSection from './assets/CharacterSection'
import LocationSection from './assets/LocationSection'
import AssetToolbar from './assets/AssetToolbar'
import ImageEditModal from './assets/ImageEditModal'
import VoiceDesignDialog from './voice/VoiceDesignDialog'
import { CharacterCreationModal, LocationCreationModal, CharacterEditModal, LocationEditModal } from '@/components/shared/assets'
import GlobalAssetPicker from '@/components/shared/assets/GlobalAssetPicker'
import CharacterProfileCard from './assets/CharacterProfileCard'
import CharacterProfileDialog from './assets/CharacterProfileDialog'

interface AssetsStageProps {
  projectId: string
  workflowMode: 'srt' | 'agent'
  globalAssetText: string | null
  novelText: string | null
  audioUrl: string | null
  srtContent: string | null
  ttsVoice: string
  onTtsVoiceChange: (voice: string) => void
  onGenerateTTS: () => void
  onAnalyzeAssets: () => void
  isGeneratingTTS: boolean
  isAnalyzingAssets: boolean
  // 🔥 V6.5 重构：删除 characters, locations, onCharactersUpdate, onLocationsUpdate - 改为直接订阅 useProjectAssets
  // 🔥 V6.6 重构：删除 onGenerateImage - 改为内部使用 mutation hooks
  onConfirm: () => void
  isConfirming?: boolean
  // 🔥 通过 props 触发全局分析（避免 URL 参数竞态条件）
  triggerGlobalAnalyze?: boolean
  onGlobalAnalyzeComplete?: () => void
}

export default function AssetsStage({
  projectId,
  workflowMode,
  globalAssetText,
  novelText,
  audioUrl,
  srtContent,
  ttsVoice,
  onTtsVoiceChange,
  onGenerateTTS,
  onAnalyzeAssets,
  isGeneratingTTS,
  isAnalyzingAssets,
  // 🔥 V6.5 删除：characters, locations, onCharactersUpdate, onLocationsUpdate
  // 🔥 V6.6 删除：onGenerateImage - 改用内部 mutation hooks
  onConfirm,
  isConfirming = false,
  triggerGlobalAnalyze = false,
  onGlobalAnalyzeComplete
}: AssetsStageProps) {
  // 🔥 V6.5 重构：直接订阅缓存，消除 props drilling
  const { data: assets } = useProjectAssets(projectId)
  // 🔧 使用 useMemo 稳定引用，防止 useCallback/useEffect 依赖问题
  const characters = useMemo(() => assets?.characters ?? [], [assets?.characters])
  const locations = useMemo(() => assets?.locations ?? [], [assets?.locations])
  // 🔥 使用 React Query 刷新，替代 onRefresh prop
  const refreshAssets = useRefreshProjectAssets(projectId)
  const onRefresh = useCallback(() => { refreshAssets() }, [refreshAssets])

  // 🔥 V6.6 重构：使用 mutation hooks 替代 onGenerateImage prop
  const generateCharacterImage = useGenerateProjectCharacterImage(projectId)
  const generateLocationImage = useGenerateProjectLocationImage(projectId)

  // 🔥 内部图片生成函数 - 使用 mutation hooks 实现乐观更新
  const handleGenerateImage = useCallback(async (type: 'character' | 'location', id: string, appearanceId?: string) => {
    if (type === 'character' && appearanceId) {
      await generateCharacterImage.mutateAsync({ characterId: id, appearanceId })
    } else if (type === 'location') {
      // 场景生成默认使用 imageIndex: 0
      await generateLocationImage.mutateAsync({ locationId: id, imageIndex: 0 })
    }
  }, [generateCharacterImage, generateLocationImage])

  const t = useTranslations('assets')
  // 计算资产总数
  const totalAppearances = characters.reduce((sum, char) => sum + (char.appearances?.length || 0), 0)
  const totalLocations = locations.length
  const totalAssets = totalAppearances + totalLocations

  // 本地 UI 状态
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null)
  // 注意：editingItems 已移除，生成/编辑状态现在直接由数据源的 generating 字段提供
  const [isGlobalAnalyzing, setIsGlobalAnalyzing] = useState(false)
  const hasTriggeredGeneration = useRef(false)
  const hasTriggeredGlobalAnalyze = useRef(false)  // 防止重复触发

  // 移除了 URL 参数监听，改用 props 触发全局分析

  // 🆕 从资产中心复制的状态
  const [copyFromGlobalTarget, setCopyFromGlobalTarget] = useState<{ type: 'character' | 'location' | 'voice'; targetId: string } | null>(null)
  const [isCopyingFromGlobal, setIsCopyingFromGlobal] = useState(false)

  // 辅助：获取角色形象
  const getAppearances = (character: Character): CharacterAppearance[] => {
    return character.appearances || []
  }

  // 显示提示
  const showToast = (message: string, type: 'success' | 'warning' | 'error' = 'success', duration = 3000) => {
    setToast({ message, type })
    setTimeout(() => setToast(null), duration)
  }

  // 全局资产分析
  const handleGlobalAnalyze = async () => {
    if (isGlobalAnalyzing) return

    try {
      setIsGlobalAnalyzing(true)
      showToast(t("toolbar.globalAnalyzing"), 'warning', 60000)

      const res = await fetch(`/api/novel-promotion/${projectId}/analyze-global`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || t("toolbar.globalAnalyzeFailed"))
      }

      // 刷新资产列表
      await onRefresh()

      showToast(
        t("toolbar.globalAnalyzeSuccess", {
          characters: data.stats.newCharacters,
          locations: data.stats.newLocations
        }),
        'success',
        5000
      )
    } catch (error: any) {
      console.error('Global analyze error:', error)
      showToast(`${t("toolbar.globalAnalyzeFailed")}: ${error.message}`, 'error', 5000)
    } finally {
      setIsGlobalAnalyzing(false)
    }
  }

  // 🔥 通过 props 触发全局分析（替代之前的 URL 参数监听）
  useEffect(() => {
    // 通过 props 触发全局分析，避免 URL 参数竞态条件
    if (triggerGlobalAnalyze && !hasTriggeredGlobalAnalyze.current && !isGlobalAnalyzing) {
      hasTriggeredGlobalAnalyze.current = true
      console.log('[AssetsStage] 通过 props 触发全局分析')

      // 延迟触发，确保组件已完全加载
      setTimeout(async () => {
        await handleGlobalAnalyze()
        // 分析完成后通知父组件
        onGlobalAnalyzeComplete?.()
      }, 500)
    }
  }, [triggerGlobalAnalyze, isGlobalAnalyzing])

  // === 使用提取的 Hooks ===

  // 🔥 V6.5 重构：hooks 现在内部订阅 useProjectAssets，不再需要传 characters/locations

  // 批量生成
  const {
    isGeneratingAll,
    generatingProgress,
    regeneratingItems,
    setRegeneratingItems,
    clearRegeneratingItem,
    handleGenerateAllImages,
    handleRegenerateAllImages
  } = useBatchGeneration({
    projectId,
    handleGenerateImage
  })

  // 角色操作
  const {
    handleDeleteCharacter,
    handleDeleteAppearance,
    handleSelectCharacterImage,
    handleConfirmSelection,
    handleRegenerateSingleCharacter,
    handleRegenerateCharacterGroup
  } = useCharacterActions({
    projectId,
    setRegeneratingItems,
    showToast
  })

  // 场景操作
  const {
    handleDeleteLocation,
    handleSelectLocationImage,
    handleConfirmLocationSelection,
    handleRegenerateSingleLocation,
    handleRegenerateLocationGroup
  } = useLocationActions({
    projectId,
    setRegeneratingItems,
    showToast
  })

  // TTS/音色
  const {
    azureVoices,
    voiceDesignCharacter,
    handleVoiceChange,
    handleOpenVoiceDesign,
    handleVoiceDesignSave,
    handleCloseVoiceDesign
  } = useTTSGeneration({
    projectId
  })

  // 弹窗状态
  const {
    editingAppearance,
    editingLocation,
    showAddCharacter,
    showAddLocation,
    imageEditModal,
    characterImageEditModal,
    showAssetSettingModal,
    setEditingAppearance,
    setEditingLocation,
    setShowAddCharacter,
    setShowAddLocation,
    setImageEditModal,
    setCharacterImageEditModal,
    setShowAssetSettingModal,
    handleEditCharacterDescription,
    handleEditLocationDescription,
    handleEditAppearance,
    handleEditLocation,
    handleOpenLocationImageEdit,
    handleOpenCharacterImageEdit,
    closeEditingAppearance,
    closeEditingLocation,
    closeAddCharacter,
    closeAddLocation,
    closeImageEditModal,
    closeCharacterImageEditModal
  } = useAssetModals({
    projectId
  })

  // 🔥 图片修改 mutations（带乐观更新，立即显示生成中状态）
  const modifyCharacterImage = useModifyProjectCharacterImage(projectId)
  const modifyLocationImage = useModifyProjectLocationImage(projectId)

  // 档案管理
  const {
    unconfirmedCharacters,
    isConfirmingCharacter,
    deletingCharacterId,
    batchConfirming,
    editingProfile,
    handleEditProfile,
    handleConfirmProfile,
    handleBatchConfirm,
    handleDeleteProfile,
    setEditingProfile
  } = useProfileManagement({
    projectId,
    showToast
  })

  // 撤回角色形象到上一版本
  const handleUndoCharacter = async (characterId: string, appearanceId: string) => {
    if (!confirm(t('image.undoConfirm'))) return
    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/undo-regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'character', id: characterId, appearanceId })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || t('image.undoFailed'))
      }
      showToast(t('image.undoSuccess'), 'success')
      onRefresh()
    } catch (error: any) {
      if (isAbortError(error)) {
        onRefresh()
        return
      }
      showToast(t('image.undoFailed') + ': ' + error.message, 'error')
    }
  }

  // 撤回场景到上一版本
  const handleUndoLocation = async (locationId: string) => {
    if (!confirm(t('image.undoConfirm'))) return
    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/undo-regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'location', id: locationId })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || t('image.undoFailed'))
      }
      showToast(t('image.undoSuccess'), 'success')
      onRefresh()
    } catch (error: any) {
      if (isAbortError(error)) {
        onRefresh()
        return
      }
      showToast(t('image.undoFailed') + ': ' + error.message, 'error')
    }
  }

  const handleLocationImageEdit = async (modifyPrompt: string, extraImageUrls?: string[]) => {
    if (!imageEditModal) return
    const { locationId, imageIndex, locationName } = imageEditModal

    closeImageEditModal()

    console.log(`[场景编辑] 开始编辑 ${locationName}, locationId=${locationId}, imageIndex=${imageIndex}`)

    // 🔥 使用 mutation hook
    modifyLocationImage.mutate(
      { locationId, imageIndex, modifyPrompt, extraImageUrls },
      {
        onSuccess: (data) => {
          console.log(`[场景编辑] ✅ 完成: ${locationName}`)
          const descNote = data.descriptionUpdated ? t('stage.updateSuccess') : ''
          showToast(`✓ ${locationName} ${t('image.editSuccess')}${descNote}`, 'success')
        },
        onError: (error: any) => {
          console.log(`[场景编辑] ❌ 失败: ${locationName}`, error)
          if (isAbortError(error)) return
          showToast(t('image.editFailed') + ': ' + error.message, 'error')
        }
      }
    )
    // 🔥 V6.5: mutation.onMutate 已立即更新缓存，无需手动刷新
  }

  const handleCharacterImageEdit = async (modifyPrompt: string, extraImageUrls?: string[]) => {
    if (!characterImageEditModal) return
    const { characterId, appearanceId, imageIndex, characterName } = characterImageEditModal

    closeCharacterImageEditModal()

    console.log(`[角色编辑] 开始编辑 ${characterName}, characterId=${characterId}, appearanceId=${appearanceId}, imageIndex=${imageIndex}`)

    // 🔥 使用 mutation hook
    modifyCharacterImage.mutate(
      { characterId, appearanceId, imageIndex, modifyPrompt, extraImageUrls },
      {
        onSuccess: (data) => {
          console.log(`[角色编辑] ✅ 完成: ${characterName}`)
          const descNote = data.descriptionUpdated ? t('stage.updateSuccess') : ''
          showToast(`✓ ${characterName} ${t('image.editSuccess')}${descNote}`, 'success')
        },
        onError: (error: any) => {
          console.log(`[角色编辑] ❌ 失败: ${characterName}`, error)
          if (isAbortError(error)) return
          showToast(t('image.editFailed') + ': ' + error.message, 'error')
        }
      }
    )
    // 🔥 V6.5: mutation.onMutate 已立即更新缓存，无需手动刷新
  }

  // 更新角色描述
  const handleUpdateAppearanceDescription = async (newDescription: string) => {
    if (!editingAppearance) return
    const { characterId, appearanceId, descriptionIndex } = editingAppearance
    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/character/appearance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, appearanceId, description: newDescription, descriptionIndex })
      })
      if (!res.ok) throw new Error(t("common.submitFailed"))
      closeEditingAppearance()
      onRefresh()
    } catch (error: any) {
      if (!isAbortError(error)) alert(t('character.updateFailed') + ': ' + error.message)
    }
  }

  // 更新场景描述
  const handleUpdateLocationDescription = async (newDescription: string) => {
    if (!editingLocation) return
    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/location/${editingLocation.locationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: newDescription })
      })
      if (!res.ok) throw new Error(t("common.submitFailed"))
      closeEditingLocation()
      onRefresh()
    } catch (error: any) {
      if (!isAbortError(error)) alert(t('location.updateFailed') + ': ' + error.message)
    }
  }

  // 新增角色
  const handleAddCharacter = async (name: string, description: string) => {
    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/character`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      })
      if (!res.ok) throw new Error(t('common.submitFailed'))
      closeAddCharacter()
      onRefresh()
    } catch (error: any) {
      if (!isAbortError(error)) alert(t('character.addFailed') + ': ' + error.message)
    }
  }

  // 新增场景
  const handleAddLocation = async (name: string, description: string) => {
    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      })
      if (!res.ok) throw new Error(t('common.submitFailed'))
      closeAddLocation()
      onRefresh()
    } catch (error: any) {
      if (!isAbortError(error)) alert(t('location.addFailed') + ': ' + error.message)
    }
  }

  // 🆕 从资产中心复制角色形象
  const handleCopyFromGlobal = (characterId: string) => {
    setCopyFromGlobalTarget({ type: 'character', targetId: characterId })
  }

  // 🆕 从资产中心复制场景图片
  const handleCopyLocationFromGlobal = (locationId: string) => {
    setCopyFromGlobalTarget({ type: 'location', targetId: locationId })
  }

  // 🆕 从资产中心选择音色
  const handleVoiceSelectFromHub = (characterId: string) => {
    setCopyFromGlobalTarget({ type: 'voice', targetId: characterId })
  }

  const handleConfirmCopyFromGlobal = async (globalAssetId: string) => {
    if (!copyFromGlobalTarget) return

    setIsCopyingFromGlobal(true)
    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/copy-from-global`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: copyFromGlobalTarget.type,
          targetId: copyFromGlobalTarget.targetId,
          globalAssetId: globalAssetId
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '复制失败')
      }

      const successMsg = copyFromGlobalTarget.type === 'character'
        ? '✓ 角色形象复制成功'
        : copyFromGlobalTarget.type === 'location'
          ? '✓ 场景图片复制成功'
          : '✓ 音色复制成功'
      showToast(successMsg, 'success')
      setCopyFromGlobalTarget(null)
      await onRefresh()
    } catch (error: any) {
      if (!isAbortError(error)) {
        showToast('复制失败: ' + error.message, 'error')
      }
    } finally {
      setIsCopyingFromGlobal(false)
    }
  }

  // 组件挂载时自动触发TTS
  useEffect(() => {
    if (hasTriggeredGeneration.current) return
    hasTriggeredGeneration.current = true
    if (workflowMode === 'agent') return
    if (novelText && !audioUrl && !isGeneratingTTS) {
      onGenerateTTS()
    }
  }, [])

  return (
    <div className="space-y-4">
      {/* Toast 通知 */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg ${toast.type === 'success' ? 'bg-green-500 text-white' :
            toast.type === 'warning' ? 'bg-yellow-500 text-white' :
              'bg-red-500 text-white'
            }`}>
            <span className="text-sm font-medium">{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 hover:opacity-80">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* 全局分析中 - 中心遮罩效果 */}
      {isGlobalAnalyzing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md mx-4 animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center">
              {/* 动画图标 */}
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center">
                  <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                {/* 旋转光环 */}
                <div className="absolute inset-0 w-20 h-20 rounded-full border-4 border-transparent border-t-purple-400 border-r-blue-400 animate-spin" />
                <div className="absolute -inset-2 w-24 h-24 rounded-full border-2 border-transparent border-t-purple-300/50 border-r-blue-300/50 animate-spin" style={{ animationDuration: '3s', animationDirection: 'reverse' }} />
              </div>

              {/* 文字 */}
              <h3 className="text-xl font-bold text-gray-900 mb-2">{t("toolbar.globalAnalyzing")}</h3>
              <p className="text-gray-500 text-sm mb-4">{t("toolbar.globalAnalyzingHint")}</p>

              {/* 进度条 */}
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
              <p className="text-xs text-gray-400 mt-2">{t("toolbar.globalAnalyzingTip")}</p>
            </div>
          </div>
        </div>
      )}

      {/* 资产工具栏 */}
      <AssetToolbar
        projectId={projectId}
        totalAssets={totalAssets}
        totalAppearances={totalAppearances}
        totalLocations={totalLocations}
        isGeneratingAll={isGeneratingAll}
        isAnalyzingAssets={isAnalyzingAssets}
        isGlobalAnalyzing={isGlobalAnalyzing}
        generatingProgress={generatingProgress}
        onGenerateAll={handleGenerateAllImages}
        onRegenerateAll={handleRegenerateAllImages}
        onGlobalAnalyze={handleGlobalAnalyze}
      />

      {/* 未确认档案区块 */}
      {unconfirmedCharacters.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{t("stage.confirmProfiles")}</h3>
              <p className="text-sm text-gray-600">{t("stage.confirmHint")}</p>
            </div>
            <button
              onClick={handleBatchConfirm}
              disabled={batchConfirming}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {batchConfirming ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>{t("video.panelCard.generating")}</span>
                </>
              ) : (
                t("stage.confirmAll", { count: unconfirmedCharacters.length })
              )}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {unconfirmedCharacters.map(char => {
              const profileData = parseProfileData(char.profileData!)
              if (!profileData) return null
              return (
                <CharacterProfileCard
                  key={char.id}
                  characterId={char.id}
                  name={char.name}
                  profileData={profileData}
                  onEdit={() => handleEditProfile(char.id, char.name)}
                  onConfirm={() => handleConfirmProfile(char.id)}
                  onUseExisting={() => handleCopyFromGlobal(char.id)}
                  onDelete={() => handleDeleteProfile(char.id)}
                  isConfirming={isConfirmingCharacter(char.id)}
                  isDeleting={deletingCharacterId === char.id}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* 角色资产区块 */}
      <CharacterSection
        projectId={projectId}
        regeneratingItems={regeneratingItems}
        onClearRegenerating={clearRegeneratingItem}
        isAnalyzingAssets={isAnalyzingAssets}
        onAddCharacter={() => setShowAddCharacter(true)}
        onDeleteCharacter={handleDeleteCharacter}
        onDeleteAppearance={handleDeleteAppearance}
        onEditAppearance={handleEditAppearance}
        onEditCharacterDescription={handleEditCharacterDescription}
        handleGenerateImage={handleGenerateImage}
        onSelectImage={handleSelectCharacterImage}
        onConfirmSelection={handleConfirmSelection}
        onRegenerateSingle={handleRegenerateSingleCharacter}
        onRegenerateGroup={handleRegenerateCharacterGroup}
        onUndo={handleUndoCharacter}
        onImageClick={setPreviewImage}
        onImageEdit={(charId, appIdx, imgIdx, name) => handleOpenCharacterImageEdit(charId, appIdx, imgIdx, name)}
        onVoiceChange={(characterId, customVoiceUrl) => handleVoiceChange(characterId, 'custom', characterId, customVoiceUrl)}
        onVoiceDesign={handleOpenVoiceDesign}
        onVoiceSelectFromHub={handleVoiceSelectFromHub}
        onCopyFromGlobal={handleCopyFromGlobal}
        getAppearances={getAppearances}
      />

      {/* 场景资产区块 */}
      <LocationSection
        projectId={projectId}
        regeneratingItems={regeneratingItems}
        onClearRegenerating={clearRegeneratingItem}
        onAddLocation={() => setShowAddLocation(true)}
        onDeleteLocation={handleDeleteLocation}
        onEditLocation={handleEditLocation}
        onEditLocationDescription={handleEditLocationDescription}
        handleGenerateImage={handleGenerateImage}
        onSelectImage={handleSelectLocationImage}
        onConfirmSelection={handleConfirmLocationSelection}
        onRegenerateSingle={handleRegenerateSingleLocation}
        onRegenerateGroup={handleRegenerateLocationGroup}
        onUndo={handleUndoLocation}
        onImageClick={setPreviewImage}
        onImageEdit={(locId, imgIdx, name) => handleOpenLocationImageEdit(locId, imgIdx)}
        onCopyFromGlobal={handleCopyLocationFromGlobal}
      />

      {/* 图片预览弹窗 */}
      {previewImage && (
        <ImagePreviewModal
          imageUrl={previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}

      {/* 场景图片编辑弹窗 */}
      {imageEditModal && (
        <ImageEditModal
          type="location"
          name={imageEditModal.locationName}
          onClose={closeImageEditModal}
          onConfirm={handleLocationImageEdit}
        />
      )}

      {/* 人物图片编辑弹窗 */}
      {characterImageEditModal && (
        <ImageEditModal
          type="character"
          name={characterImageEditModal.characterName}
          onClose={closeCharacterImageEditModal}
          onConfirm={handleCharacterImageEdit}
        />
      )}

      {/* 角色编辑弹窗 */}
      {editingAppearance && (
        <CharacterEditModal
          mode="project"
          characterId={editingAppearance.characterId}
          characterName={editingAppearance.characterName}
          appearanceId={editingAppearance.appearanceId}
          description={editingAppearance.description}
          descriptionIndex={editingAppearance.descriptionIndex}
          introduction={editingAppearance.introduction}
          projectId={projectId}
          onClose={closeEditingAppearance}
          onSave={(characterId, appearanceId) => handleGenerateImage('character', characterId, appearanceId)}
          onUpdate={handleUpdateAppearanceDescription}
        />
      )}

      {/* 场景编辑弹窗 */}
      {editingLocation && (
        <LocationEditModal
          mode="project"
          locationId={editingLocation.locationId}
          locationName={editingLocation.locationName}
          description={editingLocation.description}
          projectId={projectId}
          onClose={closeEditingLocation}
          onSave={(locationId) => handleGenerateImage('location', locationId)}
          onUpdate={handleUpdateLocationDescription}
        />
      )}

      {/* 新建角色弹窗 */}
      {showAddCharacter && (
        <CharacterCreationModal
          mode="project"
          projectId={projectId}
          onClose={closeAddCharacter}
          onSuccess={() => { closeAddCharacter(); onRefresh() }}
        />
      )}

      {/* 新建场景弹窗 */}
      {showAddLocation && (
        <LocationCreationModal
          mode="project"
          projectId={projectId}
          onClose={closeAddLocation}
          onSuccess={() => { closeAddLocation(); onRefresh() }}
        />
      )}

      {/* AI 声音设计对话框 */}
      {voiceDesignCharacter && (
        <VoiceDesignDialog
          isOpen={!!voiceDesignCharacter}
          speaker={voiceDesignCharacter.name}
          hasExistingVoice={voiceDesignCharacter.hasExistingVoice}
          projectId={projectId}
          onClose={handleCloseVoiceDesign}
          onSave={handleVoiceDesignSave}
        />
      )}

      {/* 角色档案编辑对话框 */}
      {editingProfile && (
        <CharacterProfileDialog
          isOpen={!!editingProfile}
          characterName={editingProfile.characterName}
          profileData={editingProfile.profileData}
          onClose={() => setEditingProfile(null)}
          onSave={(profileData) => handleConfirmProfile(editingProfile.characterId, profileData)}
          isSaving={isConfirmingCharacter(editingProfile.characterId)}
        />
      )}

      {/* 🆕 从资产中心复制对话框 */}
      {copyFromGlobalTarget && (
        <GlobalAssetPicker
          isOpen={!!copyFromGlobalTarget}
          onClose={() => setCopyFromGlobalTarget(null)}
          onSelect={handleConfirmCopyFromGlobal}
          type={copyFromGlobalTarget.type}
          loading={isCopyingFromGlobal}
        />
      )}
    </div>
  )
}
