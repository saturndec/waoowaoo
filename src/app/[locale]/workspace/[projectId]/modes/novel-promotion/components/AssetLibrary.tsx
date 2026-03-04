'use client'

/**
 * 资产库 - 全局浮动按钮,打开后显示完整的资产管理界面
 * 复用AssetsStage组件,保持功能完全一致
 * 
 * 🔥 V6.5 重构：删除 characters/locations props，AssetsStage 现在内部直接订阅
 * 🔥 V6.6 重构：删除 onGenerateImage prop，AssetsStage 现在内部使用 mutation hooks
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import AssetsStage from './AssetsStage'
import { AppIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface AssetLibraryProps {
  projectId: string
  isAnalyzingAssets: boolean
}

export default function AssetLibrary({
  projectId,
  isAnalyzingAssets
}: AssetLibraryProps) {
  const [isOpen, setIsOpen] = useState(false)
  const t = useTranslations('assets')

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <Button
        type="button"
        onClick={() => setIsOpen(true)}
        variant="secondary"
        className="fixed right-4 top-20 z-40 h-11 gap-2 rounded-full px-5 font-medium"
      >
        <AppIcon name="folderCards" className="h-5 w-5" />
        {t('assetLibrary.button')}
      </Button>

      <DialogContent className="flex h-[90vh] max-h-[95vh] w-[95vw] max-w-[95vw] flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-8 py-5">
          <DialogTitle className="flex items-center gap-4 text-2xl font-bold">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <AppIcon name="folderCards" className="h-5 w-5" />
            </span>
            {t('assetLibrary.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-8">
          <AssetsStage
            projectId={projectId}
            isAnalyzingAssets={isAnalyzingAssets}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
