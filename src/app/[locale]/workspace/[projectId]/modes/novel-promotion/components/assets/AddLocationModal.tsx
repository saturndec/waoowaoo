'use client'
import { logError as _ulogError } from '@/lib/logging/core'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ART_STYLES } from '@/lib/constants'
import { shouldShowError } from '@/lib/error-utils'
import { useAiCreateProjectLocation, useCreateProjectLocation } from '@/lib/query/hooks'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'

interface AddLocationModalProps {
  projectId: string
  onClose: () => void
  onSuccess: () => void
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return fallback
}

function getErrorStatus(error: unknown): number | null {
  if (typeof error === 'object' && error !== null) {
    const status = (error as { status?: unknown }).status
    if (typeof status === 'number') return status
  }
  return null
}

// 内联 SVG 图标
const XMarkIcon = ({ className }: { className?: string }) => (
  <AppIcon name="close" className={className} />
)

const SparklesIcon = ({ className }: { className?: string }) => (
  <AppIcon name="sparklesAlt" className={className} />
)

export default function AddLocationModal({
  projectId,
  onClose,
  onSuccess
}: AddLocationModalProps) {
  const t = useTranslations('assets')
  const tc = useTranslations('common')
  const aiCreateLocationMutation = useAiCreateProjectLocation(projectId)
  const createLocationMutation = useCreateProjectLocation(projectId)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [aiInstruction, setAiInstruction] = useState('')
  const [artStyle, setArtStyle] = useState('american-comic')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAiDesigning, setIsAiDesigning] = useState(false)
  const aiDesigningState = isAiDesigning
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'generate',
      resource: 'image',
      hasOutput: false,
    })
    : null
  const submitState = isSubmitting
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'build',
      resource: 'image',
      hasOutput: false,
    })
    : null

  // AI 设计描述
  const handleAiDesign = async () => {
    if (!aiInstruction.trim()) return

    try {
      setIsAiDesigning(true)
      const data = await aiCreateLocationMutation.mutateAsync({
        userInstruction: aiInstruction,
      })
      setDescription(data.prompt || '')
      setAiInstruction('')
    } catch (error: unknown) {
      if (getErrorStatus(error) === 402) {
        alert(getErrorMessage(error, tc('insufficientBalanceDetail')))
      } else {
        _ulogError('AI设计失败:', error)
        if (shouldShowError(error)) {
          alert(getErrorMessage(error, t('errors.aiDesignFailed')))
        }
      }
    } finally {
      setIsAiDesigning(false)
    }
  }

  // 提交创建
  const handleSubmit = async () => {
    if (!name.trim() || !description.trim()) return

    try {
      setIsSubmitting(true)
      await createLocationMutation.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        artStyle,
      })
      onSuccess()
      onClose()
    } catch (error: unknown) {
      if (getErrorStatus(error) === 402) {
        alert(getErrorMessage(error, tc('insufficientBalanceDetail')))
      } else if (shouldShowError(error)) {
        alert(getErrorMessage(error, t('errors.createFailed')))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
        <div className="p-6">
          {/* 标题 */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-foreground">
              {t('modal.addLocation')}
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-muted-foreground transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-5">
            {/* 场景名称 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-muted-foreground">
                {t('location.name')} <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('modal.namePlaceholder')}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary/40"
              />
            </div>

            {/* 风格选择 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-muted-foreground">
                {t('modal.artStyle')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {ART_STYLES.map((style) => (
                  <button
                    key={style.value}
                    type="button"
                    onClick={() => setArtStyle(style.value)}
                    className={`px-3 py-2 rounded-lg text-sm border transition-all flex items-center gap-2 ${artStyle === style.value
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border hover:border-border text-muted-foreground'
                      }`}
                  >
                    <span>{style.preview}</span>
                    <span>{style.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* AI 设计区域 */}
            <div className="bg-primary/10 rounded-xl p-4 space-y-3 border border-primary/40">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <SparklesIcon className="w-4 h-4" />
                <span>{t('modal.aiDesign')}{tc('optional')}</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  placeholder={t('modal.aiDesignPlaceholderLocation')}
                  className="flex-1 px-3 py-2 bg-card border border-primary/40 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary/40"
                  disabled={isAiDesigning}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleAiDesign()
                    }
                  }}
                />
                <button
                  onClick={handleAiDesign}
                  disabled={isAiDesigning || !aiInstruction.trim()}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm whitespace-nowrap"
                >
                  {isAiDesigning ? (
                    <TaskStatusInline state={aiDesigningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                  ) : (
                    <>
                      <SparklesIcon className="w-4 h-4" />
                      <span>{t('modal.generate')}</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-primary">
                {t('modal.aiDesignTip')}
              </p>
            </div>

            {/* 场景描述 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-muted-foreground">
                {t('location.description')} <span className="text-destructive">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('modal.descPlaceholder')}
                className="w-full h-36 px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary/40 resize-none"
                disabled={isAiDesigning}
              />
            </div>
          </div>

          {/* 按钮区 */}
          <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-border">
            <button
              onClick={onClose}
              className="px-4 py-2 text-muted-foreground bg-muted rounded-lg hover:bg-muted transition-colors text-sm"
              disabled={isSubmitting}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !name.trim() || !description.trim()}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
            >
              {isSubmitting ? (
                <TaskStatusInline state={submitState} className="text-white [&>span]:text-white [&_svg]:text-white" />
              ) : (
                <span>{t('location.add')}</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
