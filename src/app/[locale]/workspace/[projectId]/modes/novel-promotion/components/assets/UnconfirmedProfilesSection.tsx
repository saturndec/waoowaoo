'use client'

import TaskStatusInline from '@/components/task/TaskStatusInline'
import CharacterProfileCard from './CharacterProfileCard'
import { parseProfileData } from '@/types/character-profile'
import type { Character } from '@/types/project'
import type { TaskPresentationState } from '@/lib/task/presentation'

interface UnconfirmedProfilesSectionProps {
  unconfirmedCharacters: Character[]
  confirmTitle: string
  confirmHint: string
  confirmAllLabel: string
  batchConfirming: boolean
  batchConfirmingState: TaskPresentationState | null
  deletingCharacterId: string | null
  isConfirmingCharacter: (characterId: string) => boolean
  onBatchConfirm: () => void
  onEditProfile: (characterId: string, characterName: string) => void
  onConfirmProfile: (characterId: string) => void
  onUseExistingProfile: (characterId: string) => void
  onDeleteProfile: (characterId: string) => void
}

export default function UnconfirmedProfilesSection({
  unconfirmedCharacters,
  confirmTitle,
  confirmHint,
  confirmAllLabel,
  batchConfirming,
  batchConfirmingState,
  deletingCharacterId,
  isConfirmingCharacter,
  onBatchConfirm,
  onEditProfile,
  onConfirmProfile,
  onUseExistingProfile,
  onDeleteProfile,
}: UnconfirmedProfilesSectionProps) {
  if (unconfirmedCharacters.length === 0) {
    return null
  }

  return (
    <div className="bg-amber-100 border border-amber-300 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{confirmTitle}</h3>
          <p className="text-sm text-muted-foreground">{confirmHint}</p>
        </div>
        <button
          onClick={onBatchConfirm}
          disabled={batchConfirming}
          className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 px-4 py-2 disabled:opacity-50 flex items-center gap-2"
        >
          {batchConfirming ? (
            <TaskStatusInline state={batchConfirmingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
          ) : (
            confirmAllLabel
          )}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {unconfirmedCharacters.map((character) => {
          const profileData = parseProfileData(character.profileData!)
          if (!profileData) return null
          return (
            <CharacterProfileCard
              key={character.id}
              characterId={character.id}
              name={character.name}
              profileData={profileData}
              onEdit={() => onEditProfile(character.id, character.name)}
              onConfirm={() => onConfirmProfile(character.id)}
              onUseExisting={() => onUseExistingProfile(character.id)}
              onDelete={() => onDeleteProfile(character.id)}
              isConfirming={isConfirmingCharacter(character.id)}
              isDeleting={deletingCharacterId === character.id}
            />
          )
        })}
      </div>
    </div>
  )
}
