'use client'

import { useTranslations } from 'next-intl'
import PanelEditFormV2 from '@/components/ui/patterns/PanelEditFormV2'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Character, Location } from '@/types/project'
import { useProjectAssets } from '@/lib/query/hooks/useProjectAssets'
import { AppIcon } from '@/components/ui/icons'

interface CharacterAppearance {
  id?: string
  appearanceIndex?: string | number
  changeReason?: string | null
}

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
  photographyRules?: string | null
  actingNotes?: string | null
  sourceText?: string | null
}

interface PanelEditFormProps {
  panelData: PanelEditData
  isSaving?: boolean
  saveStatus?: 'idle' | 'saving' | 'error'
  saveErrorMessage?: string | null
  onRetrySave?: () => void
  onUpdate: (updates: Partial<PanelEditData>) => void
  onOpenCharacterPicker: () => void
  onOpenLocationPicker: () => void
  onRemoveCharacter: (index: number) => void
  onRemoveLocation: () => void
}

export default function PanelEditForm({
  panelData,
  isSaving = false,
  saveStatus = 'idle',
  saveErrorMessage = null,
  onRetrySave,
  onUpdate,
  onOpenCharacterPicker,
  onOpenLocationPicker,
  onRemoveCharacter,
  onRemoveLocation
}: PanelEditFormProps) {
  return (
    <PanelEditFormV2
      panelData={panelData}
      isSaving={isSaving}
      saveStatus={saveStatus}
      saveErrorMessage={saveErrorMessage}
      onRetrySave={onRetrySave}
      onUpdate={onUpdate}
      onOpenCharacterPicker={onOpenCharacterPicker}
      onOpenLocationPicker={onOpenLocationPicker}
      onRemoveCharacter={onRemoveCharacter}
      onRemoveLocation={onRemoveLocation}
      uiMode="flow"
    />
  )
}

interface CharacterPickerModalProps {
  projectId: string
  currentCharacters: { name: string; appearance: string }[]
  onSelect: (charName: string, appearance: string) => void
  onClose: () => void
}

export function CharacterPickerModal({
  projectId,
  currentCharacters,
  onSelect,
  onClose
}: CharacterPickerModalProps) {
  const ts = useTranslations('storyboard')
  const { data: assets } = useProjectAssets(projectId)
  const characters: Character[] = assets?.characters ?? []

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ts('panel.selectCharacter')}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {characters.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">{ts('panel.noCharacterAssets')}</p>
          ) : (
            characters.map(char => {
              const appearances = char.appearances || []
              return (
                <Card key={char.id} className="space-y-2 p-3">
                  <h5 className="text-sm font-medium text-foreground">{char.name}</h5>
                  <div className="flex flex-wrap gap-2">
                    {appearances.map((app: CharacterAppearance) => {
                      const appearanceName = app.changeReason || ts('panel.defaultAppearance')
                      const isSelected = currentCharacters.some(
                        c => c.name === char.name && c.appearance === appearanceName
                      )
                      return (
                        <Button
                          key={app.id || app.appearanceIndex}
                          size="sm"
                          variant={isSelected ? 'secondary' : 'ghost'}
                          disabled={isSelected}
                          onClick={() => {
                            if (!isSelected) onSelect(char.name, appearanceName)
                          }}
                        >
                          {appearanceName}
                          {isSelected && (
                            <AppIcon name="checkTiny" className="h-3 w-3" />
                          )}
                        </Button>
                      )
                    })}
                  </div>
                </Card>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface LocationPickerModalProps {
  projectId: string
  currentLocation: string | null
  onSelect: (locationName: string) => void
  onClose: () => void
}

export function LocationPickerModal({
  projectId,
  currentLocation,
  onSelect,
  onClose
}: LocationPickerModalProps) {
  const ts = useTranslations('storyboard')
  const { data: assets } = useProjectAssets(projectId)
  const locations: Location[] = assets?.locations ?? []

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ts('panel.selectLocation')}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {locations.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">{ts('panel.noLocationAssets')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {locations.map(loc => {
                const isSelected = currentLocation === loc.name
                return (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => onSelect(loc.name)}
                    className={`rounded-md border px-3 py-3 text-left transition-colors ${
                      isSelected
                        ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                        : 'border-border bg-muted/60 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <AppIcon name="imageAlt" className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{loc.name}</span>
                    </div>
                    {isSelected ? (
                      <span className="text-xs text-emerald-700">{ts('panel.selected')}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
