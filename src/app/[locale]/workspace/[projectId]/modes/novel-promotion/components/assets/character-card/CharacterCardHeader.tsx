'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'

type CharacterCardHeaderProps =
  | {
    mode: 'selection'
    characterName: string
    changeReason: string
    isPrimaryAppearance: boolean
    selectedIndex: number | null
    actions: ReactNode
  }
  | {
    mode: 'compact'
    characterName: string
    changeReason: string
    actions: ReactNode
  }

export default function CharacterCardHeader(props: CharacterCardHeaderProps) {
  const t = useTranslations('assets')

  if (props.mode === 'selection') {
    return (
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-foreground">{props.characterName}</span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{props.changeReason}</span>
            {props.isPrimaryAppearance ? (
              <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">{t('character.primary')}</span>
            ) : (
              <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">{t('character.secondary')}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {props.selectedIndex !== null ? t('image.optionSelected', { number: props.selectedIndex + 1 }) : t('image.selectFirst')}
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2">{props.actions}</div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-1">
        <div className="text-xs font-semibold text-foreground truncate" title={props.characterName}>
          {props.characterName}
        </div>
        <div className="flex items-center gap-1">{props.actions}</div>
      </div>
      <div className="text-xs text-muted-foreground truncate" title={props.changeReason}>
        {props.changeReason}
      </div>
    </div>
  )
}
