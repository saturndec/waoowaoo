'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { CustomModel } from './types'
import { AppIcon } from '@/components/ui/icons'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface DefaultModelSectionProps {
  type: 'llm' | 'image' | 'video' | 'lipsync'
  models: CustomModel[]
  defaultModels: {
    analysisModel?: string
    imageModel?: string
    videoModel?: string
    lipSyncModel?: string
  }
  onUpdateDefault: (field: string, modelKey: string) => void
}

type DefaultFieldKey = 'analysisModel' | 'imageModel' | 'videoModel' | 'lipSyncModel'
const EMPTY_MODEL_VALUE = '__none__'

export function DefaultModelSection({
  type,
  models,
  defaultModels,
  onUpdateDefault,
}: DefaultModelSectionProps) {
  const t = useTranslations('apiConfig')

  // 只显示已启用的模型
  const enabledModels = models.filter((model) => model.enabled)

  if (enabledModels.length === 0) {
    return null
  }

  // 根据类型确定要显示的选择器
  const selectors: Array<{ field: DefaultFieldKey; label: string }> = type === 'llm'
    ? [{ field: 'analysisModel', label: t('defaultModel.analysis') }]
    : type === 'image'
      ? [{ field: 'imageModel', label: t('defaultModel.image') }]
      : type === 'video'
        ? [{ field: 'videoModel', label: t('defaultModel.video') }]
        : [{ field: 'lipSyncModel', label: t('lipsyncDefault') }]

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
            <AppIcon name="sparklesAlt" className="h-4 w-4" />
          </span>
          {t('defaultModel.title')}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t('defaultModel.hint')}</p>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {selectors.map(({ field, label }) => (
          <div key={field} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
            <label className="text-sm font-medium text-muted-foreground">{label}</label>
            <Select
              value={defaultModels[field] || EMPTY_MODEL_VALUE}
              onValueChange={(value) => onUpdateDefault(field, value === EMPTY_MODEL_VALUE ? '' : value)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={t('defaultModel.notSelected')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPTY_MODEL_VALUE}>{t('defaultModel.notSelected')}</SelectItem>
                {enabledModels.map((model) => (
                  <SelectItem key={model.modelKey} value={model.modelKey}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
