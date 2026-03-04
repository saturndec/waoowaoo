'use client'

import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Folder {
    id: string
    name: string
}

interface FolderSidebarProps {
    folders: Folder[]
    selectedFolderId: string | null
    onSelectFolder: (folderId: string | null) => void
    onCreateFolder: () => void
    onEditFolder: (folder: Folder) => void
    onDeleteFolder: (folderId: string) => void
}

// 内联 SVG 图标
const FolderIcon = ({ className }: { className?: string }) => (
    <AppIcon name="folder" className={className} />
)

const PlusIcon = ({ className }: { className?: string }) => (
    <AppIcon name="plus" className={className} />
)

const PencilIcon = ({ className }: { className?: string }) => (
    <AppIcon name="edit" className={className} />
)

const TrashIcon = ({ className }: { className?: string }) => (
    <AppIcon name="trash" className={className} />
)

export function FolderSidebar({
    folders,
    selectedFolderId,
    onSelectFolder,
    onCreateFolder,
    onEditFolder,
    onDeleteFolder
}: FolderSidebarProps) {
    const t = useTranslations('assetHub')

    return (
        <Card className="h-fit xl:sticky xl:top-24">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{t('folders')}</CardTitle>
                    <Button
                        onClick={onCreateFolder}
                        size="icon"
                        className="h-7 w-7"
                        title={t('newFolder')}
                    >
                        <PlusIcon className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-1 pt-0">
                {/* 所有资产 */}
                <Button
                    onClick={() => onSelectFolder(null)}
                    variant={selectedFolderId === null ? 'secondary' : 'ghost'}
                    className="h-9 w-full justify-start gap-2 px-3 text-sm"
                >
                    <FolderIcon className="h-4 w-4" />
                    <span className="truncate">{t('allAssets')}</span>
                </Button>

                {/* 文件夹列表 */}
                {folders.map((folder) => {
                    const selected = selectedFolderId === folder.id
                    return (
                        <div
                            key={folder.id}
                            className={`group flex items-center gap-1 rounded-md pr-1 ${selected ? 'bg-secondary' : 'hover:bg-accent/60'}`}
                        >
                            <Button
                                onClick={() => onSelectFolder(folder.id)}
                                variant="ghost"
                                className="h-9 flex-1 justify-start gap-2 px-3 text-sm"
                            >
                                <FolderIcon className="h-4 w-4 shrink-0" />
                                <span className="truncate">{folder.name}</span>
                            </Button>
                            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <Button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onEditFolder(folder)
                                    }}
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    title={t('editFolder')}
                                >
                                    <PencilIcon className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onDeleteFolder(folder.id)
                                    }}
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-destructive hover:text-destructive"
                                    title={t('deleteFolder')}
                                >
                                    <TrashIcon className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    )
                })}

                {folders.length === 0 && (
                    <div className="py-4 text-center text-xs text-muted-foreground">
                        {t('noFolders')}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
