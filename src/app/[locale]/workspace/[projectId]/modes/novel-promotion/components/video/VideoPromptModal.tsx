'use client'

import { useTranslations } from 'next-intl'
import { VideoPanel } from './types'

interface VideoPromptModalProps {
  panel: VideoPanel | undefined
  panelIndex: number
  editValue: string
  onEditValueChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

export default function VideoPromptModal({
  panel,
  panelIndex,
  editValue,
  onEditValueChange,
  onSave,
  onCancel
}: VideoPromptModalProps) {
  const t = useTranslations('video')
  if (!panel) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{t('promptModal.title', { number: panelIndex + 1 })}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* 镜头信息 */}
          <div className="p-3 bg-gray-50 rounded-lg text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">{t('promptModal.shotType')}</span>
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">{panel.textPanel?.shot_type}</span>
              {panel.textPanel?.camera_move && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded">🎬{panel.textPanel.camera_move}</span>
              )}
              {panel.textPanel?.duration && (
                <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded">⏱️{panel.textPanel.duration}{t('promptModal.duration')}</span>
              )}
            </div>
            <div><span className="text-gray-500">{t('promptModal.location')}</span>{panel.textPanel?.location || t('promptModal.locationUnknown')}</div>
            <div><span className="text-gray-500">{t('promptModal.characters')}</span>{panel.textPanel?.characters?.join('、') || t('promptModal.charactersNone')}</div>
            <div><span className="text-gray-500">{t('promptModal.description')}</span>{panel.textPanel?.description}</div>
            {panel.textPanel?.text_segment && (
              <div className="border-t pt-2 mt-2">
                <span className="text-gray-500">{t('promptModal.text')}</span>
                <span className="text-gray-600 italic">"{panel.textPanel.text_segment}"</span>
              </div>
            )}
          </div>

          {/* 视频提示词编辑 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('promptModal.promptLabel')}
            </label>
            <textarea
              value={editValue}
              onChange={(e) => onEditValueChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={6}
              placeholder={t('promptModal.placeholder')}
            />
            <p className="text-xs text-gray-400 mt-1">
              {t('promptModal.tip')}
            </p>
          </div>

          {/* 按钮 */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick={onCancel}
              className="btn-base px-4 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              {t('promptModal.cancel')}
            </button>
            <button
              onClick={onSave}
              className="btn-base px-4 py-2 bg-blue-500 text-white hover:bg-blue-600"
            >
              {t('promptModal.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

