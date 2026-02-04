'use client'
import { useTranslations } from 'next-intl'

import { Character, Location } from '@/types/project'
import { useProjectAssets } from '@/lib/query/hooks/useProjectAssets'

// Panel 编辑数据结构
export interface PanelEditData {
  id: string
  panelIndex: number
  panelNumber: number | null
  shotType: string | null
  cameraMove: string | null
  description: string | null
  location: string | null
  characters: { name: string; appearance: string }[]
  srtStart: number | null
  srtEnd: number | null
  duration: number | null
  videoPrompt: string | null
  sourceText?: string | null
}

interface PanelEditFormProps {
  panelData: PanelEditData
  isSaving?: boolean
  // 更新回调
  onUpdate: (updates: Partial<PanelEditData>) => void
  // 资产操作回调
  onOpenCharacterPicker: () => void
  onOpenLocationPicker: () => void
  onRemoveCharacter: (index: number) => void
  onRemoveLocation: () => void
}

export default function PanelEditForm({
  panelData,
  isSaving = false,
  onUpdate,
  onOpenCharacterPicker,
  onOpenLocationPicker,
  onRemoveCharacter,
  onRemoveLocation
}: PanelEditFormProps) {
  const t = useTranslations('smartImport')
  const ts = useTranslations('storyboard')
  return (
    <div className="space-y-2.5">
      {/* 保存状态指示 */}
      {isSaving && (
        <div className="flex items-center gap-1 text-xs text-blue-500">
          <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>{t("preview.saving")}</span>
        </div>
      )}

      {/* 镜头参数 - 两列布局 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{ts("panel.shotTypeLabel")}</label>
          <input
            type="text"
            value={panelData.shotType || ''}
            onChange={(e) => onUpdate({ shotType: e.target.value || null })}
            className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
            placeholder={ts("panel.shotTypePlaceholder")}
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{ts("panel.cameraMove")}</label>
          <input
            type="text"
            value={panelData.cameraMove || ''}
            onChange={(e) => onUpdate({ cameraMove: e.target.value || null })}
            className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
            placeholder={ts("panel.cameraMovePlaceholder")}
          />
        </div>
      </div>

      {/* 原文片段（只读） */}
      {panelData.sourceText && (
        <div>
          <label className="block text-[10px] font-medium text-gray-400 mb-0.5">{ts("panel.sourceText")}</label>
          <p className="text-[10px] text-gray-600 bg-blue-50 border border-blue-100 px-1.5 py-1 rounded italic line-clamp-2">
            "{panelData.sourceText}"
          </p>
        </div>
      )}

      {/* 画面描述 */}
      <div>
        <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{ts("panel.sceneDescription")}</label>
        <textarea
          value={panelData.description || ''}
          onChange={(e) => onUpdate({ description: e.target.value })}
          rows={3}
          className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs resize-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
          placeholder={ts("insert.placeholder.description")}
        />
      </div>

      {/* 视频提示词 */}
      <div>
        <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{ts("panel.videoPrompt")}</label>
        <textarea
          value={panelData.videoPrompt || ''}
          onChange={(e) => onUpdate({ videoPrompt: e.target.value })}
          rows={2}
          className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs resize-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 bg-amber-50"
          placeholder={ts("panel.videoPromptPlaceholder")}
        />
      </div>

      {/* 场景选择 */}
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <label className="text-[10px] font-medium text-gray-500">{ts("panel.locationLabel")}</label>
          <button
            type="button"
            onClick={onOpenLocationPicker}
            className="text-[10px] text-blue-600 hover:text-blue-700"
          >
            {ts("panel.select")}
          </button>
        </div>
        {panelData.location ? (
          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px]">
            <span>{panelData.location}</span>
            <button
              onClick={onRemoveLocation}
              className="text-green-600 hover:text-green-800"
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <p className="text-[10px] text-gray-400">
            {ts("panel.noLocation")}
          </p>
        )}
      </div>

      {/* 角色列表 */}
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <label className="text-[10px] font-medium text-gray-500">
            {ts("panel.characterLabel")} ({panelData.characters.length})
          </label>
          <button
            type="button"
            onClick={onOpenCharacterPicker}
            className="text-[10px] text-blue-600 hover:text-blue-700"
          >
            {ts("panel.add")}
          </button>
        </div>
        <div className="flex flex-wrap gap-1 min-h-[20px]">
          {panelData.characters.length === 0 ? (
            <span className="text-[10px] text-gray-400">
              {ts("panel.noCharacters")}
            </span>
          ) : (
            panelData.characters.map((char, idx) => (
              <div
                key={idx}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]"
              >
                <span>{char.name}</span>
                <span className="text-blue-500 text-[8px]">({char.appearance})</span>
                <button
                  onClick={() => onRemoveCharacter(idx)}
                  className="text-blue-600 hover:text-red-600"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// 资产选择弹窗组件 - 角色
// 🔥 V6.5 重构：删除 characters prop，内部直接订阅
interface CharacterPickerModalProps {
  projectId: string  // 🔥 V6.5 新增：用于订阅 useProjectAssets
  // 🔥 V6.5 删除：characters - 现在内部直接订阅
  currentCharacters: { name: string; appearance: string }[]
  onSelect: (charName: string, appearance: string) => void
  onClose: () => void
}

export function CharacterPickerModal({
  projectId,
  // 🔥 V6.5 删除：characters - 现在内部直接订阅
  currentCharacters,
  onSelect,
  onClose
}: CharacterPickerModalProps) {
  const ts = useTranslations('storyboard')

  // 🔥 V6.5 重构：直接订阅缓存，消除 props drilling
  const { data: assets } = useProjectAssets(projectId)
  const characters: Character[] = assets?.characters ?? []
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h4 className="font-bold text-gray-900">{ts("panel.selectCharacter")}</h4>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {characters.length === 0 ? (
            <p className="text-gray-500 text-center py-8">{ts("panel.noCharacterAssets")}</p>
          ) : (
            <div className="space-y-4">
              {characters.map(char => {
                const appearances = char.appearances || []
                return (
                  <div key={char.id} className="border rounded-lg p-3">
                    <h5 className="font-medium text-gray-900 mb-2">{char.name}</h5>
                    <div className="flex flex-wrap gap-2">
                      {appearances.map((app: any) => {
                        const appearanceName = app.changeReason || ts("panel.defaultAppearance")
                        const isSelected = currentCharacters.some(
                          c => c.name === char.name && c.appearance === appearanceName
                        )
                        return (
                          <button
                            key={app.id || app.appearanceIndex}
                            onClick={() => {
                              if (!isSelected) {
                                onSelect(char.name, appearanceName)
                              }
                            }}
                            disabled={isSelected}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${isSelected
                              ? 'bg-blue-100 text-blue-600 cursor-not-allowed'
                              : 'bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                              }`}
                          >
                            {appearanceName}
                            {isSelected && ' ✓'}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// 资产选择弹窗组件 - 场景
// 🔥 V6.5 重构：删除 locations prop，内部直接订阅
interface LocationPickerModalProps {
  projectId: string  // 🔥 V6.5 新增：用于订阅 useProjectAssets
  // 🔥 V6.5 删除：locations - 现在内部直接订阅
  currentLocation: string | null
  onSelect: (locationName: string) => void
  onClose: () => void
}

export function LocationPickerModal({
  projectId,
  // 🔥 V6.5 删除：locations - 现在内部直接订阅
  currentLocation,
  onSelect,
  onClose
}: LocationPickerModalProps) {
  const ts = useTranslations('storyboard')

  // 🔥 V6.5 重构：直接订阅缓存，消除 props drilling
  const { data: assets } = useProjectAssets(projectId)
  const locations: Location[] = assets?.locations ?? []
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h4 className="font-bold text-gray-900">{ts("panel.selectLocation")}</h4>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {locations.length === 0 ? (
            <p className="text-gray-500 text-center py-8">{ts("panel.noLocationAssets")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {locations.map(loc => {
                const isSelected = currentLocation === loc.name
                return (
                  <button
                    key={loc.id}
                    onClick={() => onSelect(loc.name)}
                    className={`p-3 rounded-lg text-left transition-colors border-2 ${isSelected
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-green-300 hover:bg-green-50'
                      }`}
                  >
                    <div className="font-medium text-gray-900">📍 {loc.name}</div>
                    {isSelected && <span className="text-xs text-green-600">{ts("panel.selected")}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


