'use client'

import { useTranslations } from 'next-intl'
/**
 * 角色形象编辑弹窗 - 有声书模式专用
 */

import { useState, useEffect } from 'react'
import { shouldShowError } from '@/lib/error-utils'
import { useRefreshProjectAssets } from '@/lib/query/hooks'

interface CharacterEditModalProps {
  characterId: string
  characterName: string
  appearanceId: number
  description: string
  introduction?: string | null  // 角色介绍（叙述视角、称呼映射等）
  descriptionIndex?: number  // 多图模式下的描述索引
  projectId: string
  onClose: () => void
  onSave: (characterId: string, appearanceId: number) => void
  onUpdate: (newDescription: string) => void
  onIntroductionUpdate?: (newIntroduction: string) => void  // 更新介绍回调
  onNameUpdate?: (newName: string) => void  // 更新名字回调
  isGenerating?: boolean  // 当前是否正在生成
}

export default function CharacterEditModal({
  characterId,
  characterName,
  appearanceId,
  description,
  introduction,
  descriptionIndex,
  projectId,
  onClose,
  onSave,
  onUpdate,
  onIntroductionUpdate,
  onNameUpdate,
  isGenerating = false
}: CharacterEditModalProps) {
  // 🔥 使用 React Query 刷新
  const onRefresh = useRefreshProjectAssets(projectId)

  const t = useTranslations('assets')

  const [editingName, setEditingName] = useState(characterName)
  const [editingDescription, setEditingDescription] = useState(description)
  const [editingIntroduction, setEditingIntroduction] = useState(introduction || '')
  const [aiModifyInstruction, setAiModifyInstruction] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isNameUpdating, setIsNameUpdating] = useState(false)
  const [isIntroductionSaving, setIsIntroductionSaving] = useState(false)
  const [isWaitingForGeneration, setIsWaitingForGeneration] = useState(false)
  const [wasGenerating, setWasGenerating] = useState(false)

  // 监听生成状态，当生成完成时关闭弹窗
  useEffect(() => {
    if (isWaitingForGeneration && wasGenerating && !isGenerating) {
      // 生成完成，关闭弹窗
      setIsWaitingForGeneration(false)
      setWasGenerating(false)
      onRefresh?.()
      onClose()
    } else if (isGenerating) {
      setWasGenerating(true)
    }
  }, [isGenerating, isWaitingForGeneration, wasGenerating, onRefresh, onClose])

  // 🔥 定时刷新已移至页面级 useTaskPolling hook
  // 模态框通过 isGenerating prop 被动接收状态变化

  // AI修改提示词（立即关闭弹窗，后台执行AI修改+保存+生成）
  const handleAiModify = () => {
    if (!aiModifyInstruction.trim()) return

    const instruction = aiModifyInstruction
    const currentDesc = editingDescription

    // 立即关闭弹窗
    onClose()

      // 后台执行AI修改+保存+生成
      ; (async () => {
        try {
          // 1. 调用AI修改
          const modifyResponse = await fetch(`/api/novel-promotion/${projectId}/ai-modify-appearance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              characterId,
              appearanceId,
              currentDescription: currentDesc,
              modifyInstruction: instruction
            })
          })

          if (!modifyResponse.ok) {
            const error = await modifyResponse.json()
            throw new Error(error.error || t('modal.modifyFailed'))
          }

          const modifyData = await modifyResponse.json()
          const newDescription = modifyData.modifiedDescription

          // 2. 自动保存到数据库
          const updateResponse = await fetch(`/api/novel-promotion/${projectId}/update-appearance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              characterId,
              appearanceId,
              newDescription: newDescription,
              descriptionIndex  // 传递描述索引
            })
          })

          if (!updateResponse.ok) {
            throw new Error(t("errors.saveFailed"))
          }

          // 3. 更新本地状态
          onUpdate(newDescription)

          // 4. 触发生成图片
          onSave(characterId, appearanceId)
        } catch (error: any) {
          console.error('AI modify failed:', error)
          if (shouldShowError(error)) {
            alert(error.message || t('modal.modifyFailed'))
          }
        }
      })()
  }

  // 仅保存（不生成图片）
  const handleSaveOnly = async () => {
    try {
      setIsSaving(true)

      // 更新提示词
      const response = await fetch(`/api/novel-promotion/${projectId}/update-appearance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          appearanceId,
          newDescription: editingDescription,
          descriptionIndex
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update appearance')
      }

      // 更新本地状态
      onUpdate(editingDescription)

      // 刷新数据
      onRefresh?.()

      // 关闭弹窗
      onClose()
    } catch (error) {
      console.error('Failed to save:', error)
      if (shouldShowError(error)) {
        alert(t('errors.saveFailed'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  // 保存角色名字
  const handleSaveName = async () => {
    if (!editingName.trim() || editingName === characterName) return

    try {
      setIsNameUpdating(true)

      // 1. 更新角色名字
      const response = await fetch(`/api/novel-promotion/${projectId}/character`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          name: editingName.trim()
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update character name')
      }

      // 2. 更新图片上的标签（后台执行，不阻塞UI）
      fetch(`/api/novel-promotion/${projectId}/update-asset-label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'character',
          id: characterId,
          newName: editingName.trim()
        })
      }).then(() => {
        console.log('图片标签更新完成')
        onRefresh?.() // 刷新数据以显示更新后的图片
      }).catch(e => {
        console.error('更新图片标签失败:', e)
      })

      // 通知父组件更新名字
      onNameUpdate?.(editingName.trim())
      onRefresh?.()
    } catch (error) {
      console.error('Failed to save name:', error)
      if (shouldShowError(error)) {
        alert(t('modal.saveName') + t('errors.failed'))
      }
    } finally {
      setIsNameUpdating(false)
    }
  }

  // 保存角色介绍
  const handleSaveIntroduction = async () => {
    if (editingIntroduction === (introduction || '')) return

    try {
      setIsIntroductionSaving(true)

      const response = await fetch(`/api/novel-promotion/${projectId}/character`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          introduction: editingIntroduction.trim()
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update character introduction')
      }

      onIntroductionUpdate?.(editingIntroduction.trim())
      onRefresh?.()
    } catch (error) {
      console.error('Failed to save introduction:', error)
      if (shouldShowError(error)) {
        alert(t('errors.saveFailed'))
      }
    } finally {
      setIsIntroductionSaving(false)
    }
  }

  // 保存编辑并生成图片（立即关闭弹窗，后台执行）
  const handleSaveAndGenerate = async () => {
    const descToSave = editingDescription
    const nameToSave = editingName.trim()

    // 立即关闭弹窗
    onClose()

      // 后台执行保存和生成
      ; (async () => {
        try {
          // 如果名字有变化，先保存名字
          if (nameToSave && nameToSave !== characterName) {
            const nameResponse = await fetch(`/api/novel-promotion/${projectId}/character`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                characterId,
                name: nameToSave
              })
            })

            if (!nameResponse.ok) {
              throw new Error('Failed to update character name')
            }

            onNameUpdate?.(nameToSave)
          }

          // 更新提示词
          const response = await fetch(`/api/novel-promotion/${projectId}/update-appearance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              characterId,
              appearanceId,
              newDescription: descToSave,
              descriptionIndex
            })
          })

          if (!response.ok) {
            throw new Error('Failed to update appearance')
          }

          // 更新本地状态
          onUpdate(descToSave)

          // 触发生成
          onSave(characterId, appearanceId)

          // 刷新数据
          onRefresh?.()
        } catch (error: any) {
          console.error('Failed to save and generate:', error)
          if (shouldShowError(error)) {
            alert(t('errors.saveFailed'))
          }
        }
      })()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {t('modal.editCharacter')} - {characterName}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 角色名字编辑 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              {t('character.name')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t('modal.namePlaceholder')}
              />
              {editingName !== characterName && (
                <button
                  onClick={handleSaveName}
                  disabled={isNameUpdating || !editingName.trim()}
                  className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
                >
                  {isNameUpdating ? t('smartImport.preview.saving') : t('modal.saveName')}
                </button>
              )}
            </div>
          </div>

          {/* 角色介绍编辑 */}
          <div className="space-y-2 bg-purple-50 p-4 rounded-lg border border-purple-200">
            <label className="block text-sm font-medium text-purple-900 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('modal.introduction')}
            </label>
            <textarea
              value={editingIntroduction}
              onChange={(e) => setEditingIntroduction(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-sm"
              placeholder={t('modal.introductionPlaceholder')}
            />
            {editingIntroduction !== (introduction || '') && (
              <button
                onClick={handleSaveIntroduction}
                disabled={isIntroductionSaving}
                className="px-3 py-1.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {isIntroductionSaving ? t('smartImport.preview.saving') : t('modal.saveIntroduction')}
              </button>
            )}
            <p className="text-xs text-purple-700">
              💡 {t('modal.introductionTip')}
            </p>
          </div>
          <div className="space-y-2 bg-blue-50 p-4 rounded-lg border border-blue-200">
            <label className="block text-sm font-medium text-blue-900 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {t('modal.smartModify')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={aiModifyInstruction}
                onChange={(e) => setAiModifyInstruction(e.target.value)}
                placeholder={t('modal.modifyPlaceholderCharacter')}
                className="flex-1 px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleAiModify()
                  }
                }}
              />
              <button
                onClick={handleAiModify}
                disabled={!aiModifyInstruction.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {t('modal.smartModify')}
              </button>
            </div>
            <p className="text-xs text-blue-700">
              💡 {t('modal.aiTipSub')}
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              {t('modal.appearancePrompt')}
            </label>
            <textarea
              value={editingDescription}
              onChange={(e) => setEditingDescription(e.target.value)}
              className="w-full h-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder={t('modal.descPlaceholder')}
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              disabled={isUpdating || isSaving || isWaitingForGeneration}
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleSaveOnly}
              disabled={isSaving || isUpdating || isWaitingForGeneration || !editingDescription.trim()}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {t("smartImport.preview.saving")}
                </>
              ) : (
                t('modal.saveOnly')
              )}
            </button>
            <button
              onClick={handleSaveAndGenerate}
              disabled={isUpdating || isSaving || isWaitingForGeneration || !editingDescription.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {(isUpdating || isWaitingForGeneration) ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {isWaitingForGeneration ? t("storyboard.group.generating") : t("smartImport.preview.saving")}
                </>
              ) : (
                t('modal.saveAndGenerate')
              )}
            </button>
          </div>
          {isWaitingForGeneration && (
            <div className="text-sm text-blue-600 flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-lg">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {t('modal.generatingAutoClose')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

