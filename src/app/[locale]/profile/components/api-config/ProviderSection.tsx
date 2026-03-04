'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Provider, PRESET_PROVIDERS } from './types'
import { AppIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface ProviderSectionProps {
  title: string
  icon: React.ReactNode
  type: 'audio' | 'lipsync'
  providers: Provider[]
  onUpdateApiKey: (providerId: string, apiKey: string) => void
  onUpdateInfo?: (providerId: string, name: string, baseUrl?: string) => void
  onDelete?: (providerId: string) => void
  onAdd?: (provider: Omit<Provider, 'hasApiKey'>) => void
  showBaseUrl?: boolean
  showAddButton?: boolean
}

export function ProviderSection({
  title,
  icon,
  providers,
  onUpdateApiKey,
  onUpdateInfo,
  onDelete,
  onAdd,
  showBaseUrl = false,
  showAddButton = false
}: ProviderSectionProps) {
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState({ name: '', baseUrl: '' })
  const [showAddForm, setShowAddForm] = useState(false)
  const [newProvider, setNewProvider] = useState({ name: '', baseUrl: '', apiKey: '' })
  const t = useTranslations('providerSection')
  const tc = useTranslations('common')

  const isPreset = (id: string) => PRESET_PROVIDERS.some(p => p.id === id)

  const handleSaveEdit = (provider: Provider) => {
    onUpdateInfo?.(provider.id, editData.name, editData.baseUrl || undefined)
    setEditingId(null)
  }

  const handleAdd = () => {
    if (!newProvider.name) {
      alert(t('fillRequired'))
      return
    }
    onAdd?.({
      id: `custom-${Date.now()}`,
      name: newProvider.name,
      baseUrl: newProvider.baseUrl || undefined,
      apiKey: newProvider.apiKey
    })
    setNewProvider({ name: '', baseUrl: '', apiKey: '' })
    setShowAddForm(false)
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            {icon}
            {title}
          </CardTitle>
          {showAddButton && (
            <Button
              onClick={() => setShowAddForm(!showAddForm)}
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-xs"
            >
              {t('addProvider')}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {showAddForm && (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-3">
            <Input
              type="text"
              value={newProvider.name}
              onChange={e => setNewProvider({ ...newProvider, name: e.target.value })}
              placeholder={t('name')}
              className="h-8 w-32 text-sm"
            />
            {showBaseUrl && (
              <Input
                type="text"
                value={newProvider.baseUrl}
                onChange={e => setNewProvider({ ...newProvider, baseUrl: e.target.value })}
                placeholder="Base URL"
                className="h-8 flex-1 font-mono text-sm"
              />
            )}
            <Input
              type="password"
              value={newProvider.apiKey}
              onChange={e => setNewProvider({ ...newProvider, apiKey: e.target.value })}
              placeholder="API Key"
              className="h-8 w-44 text-sm"
            />
            <Button onClick={handleAdd} size="sm" className="h-8 px-3 text-sm">
              {t('add')}
            </Button>
            <Button onClick={() => setShowAddForm(false)} variant="outline" size="sm" className="h-8 px-2 text-sm">
              {tc('cancel')}
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {providers.map(provider => {
            const isEditing = editingId === provider.id
            const isVisible = showApiKeys[provider.id]

            if (isEditing && showBaseUrl) {
              return (
                <div key={provider.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
                  <Input
                    type="text"
                    value={editData.name}
                    onChange={e => setEditData({ ...editData, name: e.target.value })}
                    className="h-8 w-28 text-sm"
                  />
                  <Input
                    type="text"
                    value={editData.baseUrl}
                    onChange={e => setEditData({ ...editData, baseUrl: e.target.value })}
                    className="h-8 flex-1 font-mono text-sm"
                  />
                  <Button onClick={() => handleSaveEdit(provider)} size="sm" className="h-8 px-3 text-sm">{t('save')}</Button>
                  <Button onClick={() => setEditingId(null)} variant="outline" size="sm" className="h-8 px-2 text-sm">{tc('cancel')}</Button>
                </div>
              )
            }

            return (
              <div key={provider.id} className="group flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                {showBaseUrl && (
                  <Button
                    onClick={() => {
                      setEditingId(provider.id)
                      setEditData({ name: provider.name, baseUrl: provider.baseUrl || '' })
                    }}
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                  >
                    <AppIcon name="edit" className="h-4 w-4" />
                  </Button>
                )}
                <span className="w-28 truncate text-sm font-medium text-foreground">{provider.name}</span>
                {showBaseUrl && (
                  <span className="w-64 truncate font-mono text-xs text-muted-foreground">{provider.baseUrl}</span>
                )}
                <div className="relative flex-1">
                  <Input
                    type={isVisible ? 'text' : 'password'}
                    value={provider.apiKey || ''}
                    onChange={e => onUpdateApiKey(provider.id, e.target.value)}
                    placeholder="API Key"
                    className="h-8 w-full pr-9 text-sm"
                  />
                  <Button
                    onClick={() => setShowApiKeys({ ...showApiKeys, [provider.id]: !isVisible })}
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
                  >
                    {isVisible ? (
                      <AppIcon name="eye" className="h-4 w-4" />
                    ) : (
                      <AppIcon name="eyeOff" className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {provider.apiKey && (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-100 text-emerald-700">
                    <AppIcon name="checkDot" className="h-3 w-3" />
                  </Badge>
                )}
                {!isPreset(provider.id) && onDelete && (
                  <Button
                    onClick={() => onDelete(provider.id)}
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  >
                    <AppIcon name="trash" className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
