'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'

type LocationCardHeaderProps =
  | {
    mode: 'selection'
    locationName: string
    summary?: string | null
    selectedIndex: number | null
    actions: ReactNode
  }
  | {
    mode: 'compact'
    locationName: string
    summary?: string | null
    actions: ReactNode
  }

export default function LocationCardHeader(props: LocationCardHeaderProps) {
  const t = useTranslations('assets')

  if (props.mode === 'selection') {
    return (
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-foreground">{props.locationName}</span>
          </div>
          {props.summary && (
            <div className="text-xs text-muted-foreground mb-1" title={props.summary}>
              {props.summary}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            {props.selectedIndex !== null
              ? t('image.optionSelected', { number: props.selectedIndex + 1 })
              : t('image.selectFirst')}
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2">{props.actions}</div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-1">
        <div className="text-xs font-semibold text-foreground truncate" title={props.locationName}>
          {props.locationName}
        </div>
        <div className="flex items-center gap-1">{props.actions}</div>
      </div>
      {props.summary && (
        <div className="text-xs text-muted-foreground truncate" title={props.summary}>
          {props.summary}
        </div>
      )}
    </div>
  )
}
