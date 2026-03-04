'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface Folder {
    id: string
    name: string
}

interface FolderModalProps {
    folder: Folder | null
    onClose: () => void
    onSave: (name: string) => void
}

export function FolderModal({ folder, onClose, onSave }: FolderModalProps) {
    const t = useTranslations('assetHub')
    const [name, setName] = useState(folder?.name || '')

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (name.trim()) {
            onSave(name.trim())
        }
    }

    return (
        <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>{folder ? t('editFolder') : t('newFolder')}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-foreground">
                            {t('folderName')}
                        </label>
                        <Input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t('folderNamePlaceholder')}
                            autoFocus
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                        >
                            {t('cancel')}
                        </Button>
                        <Button
                            type="submit"
                            disabled={!name.trim()}
                        >
                            {folder ? t('save') : t('create')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
