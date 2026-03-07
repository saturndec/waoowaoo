'use client'

import type {
  ActingCharacter,
  PhotographyCharacter,
  PhotographyRules,
} from './AIDataModal.types'

interface AIDataModalFormPaneProps {
  t: (key: string) => string
  shotType: string
  cameraMove: string
  description: string
  location: string | null
  characters: string[]
  videoPrompt: string
  photographyRules: PhotographyRules | null
  actingNotes: ActingCharacter[]
  onShotTypeChange: (value: string) => void
  onCameraMoveChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onVideoPromptChange: (value: string) => void
  onPhotographyFieldChange: (path: string, value: string) => void
  onPhotographyCharacterChange: (index: number, field: keyof PhotographyCharacter, value: string) => void
  onActingCharacterChange: (index: number, field: keyof ActingCharacter, value: string) => void
}

export default function AIDataModalFormPane({
  t,
  shotType,
  cameraMove,
  description,
  location,
  characters,
  videoPrompt,
  photographyRules,
  actingNotes,
  onShotTypeChange,
  onCameraMoveChange,
  onDescriptionChange,
  onVideoPromptChange,
  onPhotographyFieldChange,
  onPhotographyCharacterChange,
  onActingCharacterChange,
}: AIDataModalFormPaneProps) {
  return (
    <div className="w-full lg:w-1/2 lg:border-r border-[var(--glass-stroke-base)] overflow-y-auto p-4 sm:p-6 space-y-5">
      <div className="text-sm font-medium text-[var(--glass-text-secondary)] mb-3">{t('aiData.basicData')}</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">{t('aiData.shotType')}</label>
          <input
            type="text"
            value={shotType}
            onChange={(event) => onShotTypeChange(event.target.value)}
            className="w-full px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--glass-tone-info-fg)] focus:border-[var(--glass-stroke-focus)]"
            placeholder={t('aiData.shotTypePlaceholder')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">{t('aiData.cameraMove')}</label>
          <input
            type="text"
            value={cameraMove}
            onChange={(event) => onCameraMoveChange(event.target.value)}
            className="w-full px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--glass-tone-info-fg)] focus:border-[var(--glass-stroke-focus)]"
            placeholder={t('aiData.cameraMovePlaceholder')}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">{t('aiData.scene')}</label>
          <div className="px-3 py-2 bg-[var(--glass-bg-muted)] border border-[var(--glass-stroke-base)] rounded-lg text-sm text-[var(--glass-text-secondary)]">
            {location || t('aiData.notSelected')}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">{t('aiData.characters')}</label>
          <div className="px-3 py-2 bg-[var(--glass-bg-muted)] border border-[var(--glass-stroke-base)] rounded-lg text-sm text-[var(--glass-text-secondary)]">
            {characters.length > 0 ? characters.join(t('common.listSeparator')) : t('common.none')}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">{t('aiData.visualDescription')}</label>
        <textarea
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-[var(--glass-tone-info-fg)] focus:border-[var(--glass-stroke-focus)]"
          placeholder={t('insert.placeholder.description')}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">{t('aiData.videoPrompt')}</label>
        <textarea
          value={videoPrompt}
          onChange={(event) => onVideoPromptChange(event.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-[var(--glass-tone-info-fg)] focus:border-[var(--glass-stroke-focus)] bg-[var(--glass-tone-warning-bg)]"
          placeholder={t('panel.videoPromptPlaceholder')}
        />
      </div>

      {photographyRules && (
        <>
          <div className="border-t border-[var(--glass-stroke-base)] pt-4 mt-4">
            <div className="text-sm font-medium text-[var(--glass-text-secondary)] mb-3">{t('aiData.photographyRules')}</div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">{t('aiData.summary')}</label>
            <input
              type="text"
              value={photographyRules.scene_summary || ''}
              onChange={(event) => onPhotographyFieldChange('scene_summary', event.target.value)}
              className="w-full px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--glass-tone-info-fg)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">{t('aiData.lightingDirection')}</label>
              <input
                type="text"
                value={photographyRules.lighting?.direction || ''}
                onChange={(event) => onPhotographyFieldChange('lighting.direction', event.target.value)}
                className="w-full px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--glass-tone-info-fg)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">{t('aiData.lightingQuality')}</label>
              <input
                type="text"
                value={photographyRules.lighting?.quality || ''}
                onChange={(event) => onPhotographyFieldChange('lighting.quality', event.target.value)}
                className="w-full px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--glass-tone-info-fg)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">{t('aiData.depthOfField')}</label>
            <input
              type="text"
              value={photographyRules.depth_of_field || ''}
              onChange={(event) => onPhotographyFieldChange('depth_of_field', event.target.value)}
              className="w-full px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--glass-tone-info-fg)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-1">{t('aiData.colorTone')}</label>
            <input
              type="text"
              value={photographyRules.color_tone || ''}
              onChange={(event) => onPhotographyFieldChange('color_tone', event.target.value)}
              className="w-full px-3 py-2 border border-[var(--glass-stroke-strong)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--glass-tone-info-fg)]"
            />
          </div>

          {photographyRules.characters && photographyRules.characters.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[var(--glass-text-secondary)] mb-2">{t('aiData.characterPosition')}</label>
              <div className="space-y-3">
                {photographyRules.characters.map((character, index) => (
                  <div key={index} className="p-3 bg-[var(--glass-bg-muted)] rounded-lg border border-[var(--glass-stroke-base)]">
                    <div className="text-xs font-medium text-[var(--glass-tone-info-fg)] mb-2">{character.name}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] text-[var(--glass-text-tertiary)] mb-0.5">{t('aiData.position')}</label>
                        <input
                          type="text"
                          value={character.screen_position || ''}
                          onChange={(event) => onPhotographyCharacterChange(index, 'screen_position', event.target.value)}
                          className="w-full px-2 py-1 border border-[var(--glass-stroke-base)] rounded text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[var(--glass-text-tertiary)] mb-0.5">{t('aiData.posture')}</label>
                        <input
                          type="text"
                          value={character.posture || ''}
                          onChange={(event) => onPhotographyCharacterChange(index, 'posture', event.target.value)}
                          className="w-full px-2 py-1 border border-[var(--glass-stroke-base)] rounded text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[var(--glass-text-tertiary)] mb-0.5">{t('aiData.facing')}</label>
                        <input
                          type="text"
                          value={character.facing || ''}
                          onChange={(event) => onPhotographyCharacterChange(index, 'facing', event.target.value)}
                          className="w-full px-2 py-1 border border-[var(--glass-stroke-base)] rounded text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {actingNotes.length > 0 && (
        <>
          <div className="border-t border-[var(--glass-stroke-base)] pt-4 mt-4">
            <div className="text-sm font-medium text-[var(--glass-text-secondary)] mb-3">{t('aiData.actingNotes')}</div>
          </div>

          <div className="space-y-3">
            {actingNotes.map((character, index) => (
              <div key={index} className="p-3 bg-[var(--glass-tone-info-bg)] rounded-lg border border-[var(--glass-stroke-focus)]">
                <div className="text-xs font-medium text-[var(--glass-tone-info-fg)] mb-2">{character.name}</div>
                <div>
                  <label className="block text-[10px] text-[var(--glass-text-tertiary)] mb-0.5">{t('aiData.actingDescription')}</label>
                  <textarea
                    value={character.acting || ''}
                    onChange={(event) => onActingCharacterChange(index, 'acting', event.target.value)}
                    rows={2}
                    className="w-full px-2 py-1 border border-[var(--glass-stroke-focus)] rounded text-xs resize-none focus:ring-2 focus:ring-[var(--glass-tone-info-fg)] focus:border-[var(--glass-stroke-focus)]"
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
