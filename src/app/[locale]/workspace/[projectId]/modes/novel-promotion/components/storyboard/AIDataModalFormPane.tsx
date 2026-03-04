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
    <div className="w-1/2 border-r border-border overflow-y-auto p-6 space-y-5">
      <div className="text-sm font-medium text-muted-foreground mb-3">{t('aiData.basicData')}</div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">{t('aiData.shotType')}</label>
          <input
            type="text"
            value={shotType}
            onChange={(event) => onShotTypeChange(event.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary/40"
            placeholder={t('aiData.shotTypePlaceholder')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">{t('aiData.cameraMove')}</label>
          <input
            type="text"
            value={cameraMove}
            onChange={(event) => onCameraMoveChange(event.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary/40"
            placeholder={t('aiData.cameraMovePlaceholder')}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">{t('aiData.scene')}</label>
          <div className="px-3 py-2 bg-muted border border-border rounded-lg text-sm text-muted-foreground">
            {location || t('aiData.notSelected')}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">{t('aiData.characters')}</label>
          <div className="px-3 py-2 bg-muted border border-border rounded-lg text-sm text-muted-foreground">
            {characters.length > 0 ? characters.join('、') : t('common.none')}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">{t('aiData.visualDescription')}</label>
        <textarea
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary focus:border-primary/40"
          placeholder={t('insert.placeholder.description')}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">{t('aiData.videoPrompt')}</label>
        <textarea
          value={videoPrompt}
          onChange={(event) => onVideoPromptChange(event.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary focus:border-primary/40 bg-amber-100"
          placeholder={t('panel.videoPromptPlaceholder')}
        />
      </div>

      {photographyRules && (
        <>
          <div className="border-t border-border pt-4 mt-4">
            <div className="text-sm font-medium text-muted-foreground mb-3">{t('aiData.photographyRules')}</div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{t('aiData.summary')}</label>
            <input
              type="text"
              value={photographyRules.scene_summary || ''}
              onChange={(event) => onPhotographyFieldChange('scene_summary', event.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('aiData.lightingDirection')}</label>
              <input
                type="text"
                value={photographyRules.lighting?.direction || ''}
                onChange={(event) => onPhotographyFieldChange('lighting.direction', event.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('aiData.lightingQuality')}</label>
              <input
                type="text"
                value={photographyRules.lighting?.quality || ''}
                onChange={(event) => onPhotographyFieldChange('lighting.quality', event.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{t('aiData.depthOfField')}</label>
            <input
              type="text"
              value={photographyRules.depth_of_field || ''}
              onChange={(event) => onPhotographyFieldChange('depth_of_field', event.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{t('aiData.colorTone')}</label>
            <input
              type="text"
              value={photographyRules.color_tone || ''}
              onChange={(event) => onPhotographyFieldChange('color_tone', event.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary"
            />
          </div>

          {photographyRules.characters && photographyRules.characters.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">{t('aiData.characterPosition')}</label>
              <div className="space-y-3">
                {photographyRules.characters.map((character, index) => (
                  <div key={index} className="p-3 bg-muted rounded-lg border border-border">
                    <div className="text-xs font-medium text-primary mb-2">{character.name}</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] text-muted-foreground mb-0.5">{t('aiData.position')}</label>
                        <input
                          type="text"
                          value={character.screen_position || ''}
                          onChange={(event) => onPhotographyCharacterChange(index, 'screen_position', event.target.value)}
                          className="w-full px-2 py-1 border border-border rounded text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-muted-foreground mb-0.5">{t('aiData.posture')}</label>
                        <input
                          type="text"
                          value={character.posture || ''}
                          onChange={(event) => onPhotographyCharacterChange(index, 'posture', event.target.value)}
                          className="w-full px-2 py-1 border border-border rounded text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-muted-foreground mb-0.5">{t('aiData.facing')}</label>
                        <input
                          type="text"
                          value={character.facing || ''}
                          onChange={(event) => onPhotographyCharacterChange(index, 'facing', event.target.value)}
                          className="w-full px-2 py-1 border border-border rounded text-xs"
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
          <div className="border-t border-border pt-4 mt-4">
            <div className="text-sm font-medium text-muted-foreground mb-3">{t('aiData.actingNotes')}</div>
          </div>

          <div className="space-y-3">
            {actingNotes.map((character, index) => (
              <div key={index} className="p-3 bg-primary/10 rounded-lg border border-primary/40">
                <div className="text-xs font-medium text-primary mb-2">{character.name}</div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">{t('aiData.actingDescription')}</label>
                  <textarea
                    value={character.acting || ''}
                    onChange={(event) => onActingCharacterChange(index, 'acting', event.target.value)}
                    rows={2}
                    className="w-full px-2 py-1 border border-primary/40 rounded text-xs resize-none focus:ring-2 focus:ring-primary focus:border-primary/40"
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
