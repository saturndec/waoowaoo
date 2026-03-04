'use client'
import { useTranslations } from 'next-intl'
import { useRefreshProjectAssets } from '@/lib/query/hooks'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'

/**
 * AssetToolbar - 资产管理工具栏组件
 * 从 AssetsStage.tsx 提取，负责批量操作和刷新按钮
 */

interface AssetToolbarProps {
    projectId: string
    totalAssets: number
    totalAppearances: number
    totalLocations: number
    isBatchSubmitting: boolean
    isAnalyzingAssets: boolean
    isGlobalAnalyzing?: boolean
    batchProgress: { current: number; total: number }
    onGenerateAll: () => void
    onRegenerateAll: () => void
    onGlobalAnalyze?: () => void
}

export default function AssetToolbar({
    projectId,
    totalAssets,
    totalAppearances,
    totalLocations,
    isBatchSubmitting,
    isAnalyzingAssets,
    isGlobalAnalyzing = false,
    batchProgress,
    onGenerateAll,
    onRegenerateAll,
    onGlobalAnalyze
}: AssetToolbarProps) {
    // 🔥 使用 React Query 刷新
    const onRefresh = useRefreshProjectAssets(projectId)
    const t = useTranslations('assets')
    const assetTaskRunningState = isBatchSubmitting
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'generate',
            resource: 'image',
            hasOutput: true,
        })
        : null
    return (
        <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-muted-foreground inline-flex items-center gap-2">
                        <AppIcon name="diamond" className="w-4 h-4 text-primary" />
                        {t("toolbar.assetManagement")}
                    </span>
                    <span className="text-sm text-muted-foreground">
                        {t("toolbar.assetCount", { total: totalAssets, appearances: totalAppearances, locations: totalLocations })}
                    </span>
                    {/* 全局资产分析按钮 */}
                    {onGlobalAnalyze && (
                        <button
                            onClick={onGlobalAnalyze}
                            disabled={isGlobalAnalyzing || isBatchSubmitting || isAnalyzingAssets}
                            className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            title={t("toolbar.globalAnalyzeHint")}
                        >
                            <AppIcon name="idea" className="w-3.5 h-3.5" />
                            <span>{t("toolbar.globalAnalyze")}</span>
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onGenerateAll}
                        disabled={isBatchSubmitting || isAnalyzingAssets || isGlobalAnalyzing}
                        className="inline-flex items-center justify-center rounded-md bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-200 flex items-center gap-2 px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isBatchSubmitting ? (
                            <>
                                <TaskStatusInline state={assetTaskRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                                <span className="text-xs text-white/90">({batchProgress.current}/{batchProgress.total})</span>
                            </>
                        ) : (
                            <>
                                <AppIcon name="image" className="w-4 h-4" />
                                <span>{t("toolbar.generateAll")}</span>
                            </>
                        )}
                    </button>
                    <button
                        onClick={onRegenerateAll}
                        disabled={isBatchSubmitting || isAnalyzingAssets || isGlobalAnalyzing}
                        className="inline-flex items-center justify-center rounded-md bg-amber-100 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-200 flex items-center gap-2 px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t("toolbar.regenerateAllHint")}
                    >
                        <AppIcon name="refresh" className="w-4 h-4" />
                        <span>{t("toolbar.regenerateAll")}</span>
                    </button>
                    <button
                        onClick={() => onRefresh()}
                        className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border"
                    >
                        <AppIcon name="refresh" className="w-4 h-4" />
                        <span>{t("common.refresh")}</span>
                    </button>
                </div>
            </div>
        </div>
    )
}
