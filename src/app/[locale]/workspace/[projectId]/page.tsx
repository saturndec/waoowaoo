'use client'
import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import Navbar from '@/components/Navbar'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { useProjectData, useEpisodeData } from '@/lib/query/hooks'
import { queryKeys } from '@/lib/query/keys'
import NovelPromotionWorkspace from './modes/novel-promotion/NovelPromotionWorkspace'
import SmartImportWizard, { SplitEpisode } from './modes/novel-promotion/components/SmartImportWizard'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { resolveSelectedEpisodeId } from './episode-selection'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

// 有效的stage值
const VALID_STAGES = ['config', 'script', 'assets', 'text-storyboard', 'storyboard', 'videos', 'voice', 'editor'] as const
type Stage = typeof VALID_STAGES[number]

interface Episode {
  id: string
  episodeNumber: number
  name: string
  description?: string | null
  novelText?: string | null
  audioUrl?: string | null
  srtContent?: string | null
  createdAt: string
}

type NovelPromotionData = {
  episodes?: Episode[]
  importStatus?: string
}

/**
 * 项目详情页 - 带侧边栏的剧集管理
 */
export default function ProjectDetailPage() {
  const params = useParams<{ projectId?: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  if (!params?.projectId) {
    throw new Error('ProjectDetailPage requires projectId route param')
  }
  if (!searchParams) {
    throw new Error('ProjectDetailPage requires searchParams')
  }
  const projectId = params.projectId
  const t = useTranslations('workspaceDetail')
  const tc = useTranslations('common')

  // 从URL读取参数
  const urlStage = searchParams.get('stage') as Stage | null
  const urlEpisodeId = searchParams.get('episode') ?? null
  const currentUrlStage = urlStage && VALID_STAGES.includes(urlStage) ? urlStage : null

  // 🔥 React Query 数据获取
  const queryClient = useQueryClient()
  const { data: project, isLoading: loading, error: projectError } = useProjectData(projectId)
  const error = projectError?.message || null

  // 视图状态（仅 UI）
  const [isGlobalAssetsView, setIsGlobalAssetsView] = useState(false)

  // 更新URL参数（stage 和/或 episode）
  const updateUrlParams = useCallback((updates: { stage?: string; episode?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString())
    if (updates.stage !== undefined) {
      params.set('stage', updates.stage)
    }
    if (updates.episode !== undefined) {
      if (updates.episode) {
        params.set('episode', updates.episode)
      } else {
        params.delete('episode')
      }
    }
    router.replace(`/workspace/${projectId}?${params.toString()}`, { scroll: false })
  }, [router, projectId, searchParams])

  // 更新URL中的stage参数（保持向后兼容）
  const updateUrlStage = useCallback((stage: string) => {
    updateUrlParams({ stage })
  }, [updateUrlParams])

  // Stage 状态完全由 URL 控制，不再从数据库同步
  // 如果 URL 没有 stage 参数，默认使用 'config'
  // 🚧 剪辑阶段 (editor) 暂时禁用，自动重定向到成片阶段 (videos)
  const effectiveStage = currentUrlStage === 'editor' ? 'videos' : (currentUrlStage || 'config')

  // 获取剧集列表
  const novelPromotionData = project?.novelPromotionData as NovelPromotionData | undefined
  const episodes = useMemo<Episode[]>(() => {
    const getNum = (name: string) => { const m = name.match(/\d+/); return m ? parseInt(m[0], 10) : Infinity }
    return [...(novelPromotionData?.episodes ?? [])].sort((a, b) => {
      const diff = getNum(a.name) - getNum(b.name)
      return diff !== 0 ? diff : a.name.localeCompare(b.name, 'zh')
    })
  }, [novelPromotionData?.episodes])

  // 剧集导航状态单源：URL（无本地副本）
  const selectedEpisodeId = useMemo(
    () => resolveSelectedEpisodeId(episodes, urlEpisodeId),
    [episodes, urlEpisodeId],
  )

  // 🔥 使用 React Query 获取剧集数据
  const { data: currentEpisode } = useEpisodeData(
    projectId,
    !isGlobalAssetsView ? selectedEpisodeId : null
  )

  // 获取导入状态
  const importStatus = novelPromotionData?.importStatus

  // 检测是否需要显示导入向导：无剧集或导入中
  const isZeroState = episodes.length === 0
  const shouldShowImportWizard = isZeroState || importStatus === 'pending'

  // 初始化 URL：无效/缺失 episode 时，统一回写默认 episode
  useEffect(() => {
    if (!project || isGlobalAssetsView || episodes.length === 0) return
    if (urlEpisodeId && episodes.some((episode) => episode.id === urlEpisodeId)) return
    if (selectedEpisodeId) {
      updateUrlParams({ episode: selectedEpisodeId })
    }
  }, [episodes, isGlobalAssetsView, project, selectedEpisodeId, updateUrlParams, urlEpisodeId])

  // 创建剧集
  const handleCreateEpisode = async (name: string, description?: string) => {
    const res = await fetch(`/api/novel-promotion/${projectId}/episodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    })

    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || t('createFailed'))
    }

    const data = await res.json()
    // 🔥 刷新项目数据获取新的剧集列表
    queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) })
    // 自动切换到新创建的剧集
    setIsGlobalAssetsView(false)
    // 同步到URL
    updateUrlParams({ episode: data.episode.id })
  }

  // 智能导入 - 完成后刷新数据（数据已由 SmartImportWizard 保存）
  const handleSmartImportComplete = async (splitEpisodes: SplitEpisode[], triggerGlobalAnalysis?: boolean) => {
    _ulogInfo('[Page] handleSmartImportComplete 被调用，triggerGlobalAnalysis:', triggerGlobalAnalysis)

    try {
      // 🔥 刷新项目数据
      queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) })

      // 刷新后重新获取最新的剧集列表
      const res = await fetch(`/api/projects/${projectId}/data`)
      const data = await res.json()
      // API 返回结构是 { project: { novelPromotionData: { episodes: [...] } } }
      const newEpisodes = data?.project?.novelPromotionData?.episodes || []
      _ulogInfo('[Page] 获取到新剧集:', newEpisodes.length, '个')

      // 如果有剧集，进入第一个
      if (newEpisodes.length > 0) {
        // 如果需要触发全局分析，切换到 assets 阶段并带上参数
        if (triggerGlobalAnalysis) {
          _ulogInfo('[Page] 触发全局分析，跳转到 assets 阶段，带 globalAnalyze=1 参数')
          // 使用相对路径更新，保留 locale
          const params = new URLSearchParams()
          params.set('stage', 'assets')
          params.set('episode', newEpisodes[0].id)
          params.set('globalAnalyze', '1')
          const newUrl = `?${params.toString()}`
          _ulogInfo('[Page] 跳转到:', newUrl)
          router.replace(newUrl, { scroll: false })
        } else {
          _ulogInfo('[Page] 不触发全局分析，只更新 episode 参数')
          updateUrlParams({ episode: newEpisodes[0].id })
        }
      }
    } catch (err: unknown) {
      _ulogError('刷新失败:', err)
    }
  }

  // 重命名剧集
  const handleRenameEpisode = async (episodeId: string, newName: string) => {
    const res = await fetch(`/api/novel-promotion/${projectId}/episodes/${episodeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    })

    if (!res.ok) {
      throw new Error(t('renameFailed'))
    }

    // 🔥 刷新项目数据
    queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) })
    // 剧集详情也刷新
    if (selectedEpisodeId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, selectedEpisodeId) })
    }
  }

  // 删除剧集
  const handleDeleteEpisode = async (episodeId: string) => {
    const res = await fetch(`/api/novel-promotion/${projectId}/episodes/${episodeId}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      throw new Error(t('deleteFailed'))
    }
    // 刷新项目数据
    queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) })
    // 如果删除的是当前正在查看的剧集，切换到其他剧集
    if (episodeId === selectedEpisodeId) {
      const remaining = episodes.filter(ep => ep.id !== episodeId)
      if (remaining.length > 0) {
        updateUrlParams({ episode: remaining[0].id })
      } else {
        updateUrlParams({ episode: null })
      }
    }
  }

  // 选择剧集
  const handleEpisodeSelect = (episodeId: string) => {
    setIsGlobalAssetsView(false)
    // 同步到URL
    updateUrlParams({ episode: episodeId })
  }

  // Loading状态：等待项目数据和剧集数据都准备好
  // 条件：正在加载 或 (有剧集但episode数据未准备好)
  // 排除：如果要显示导入向导，则不需要等待剧集数据
  const isInitializing = loading ||
    (!shouldShowImportWizard && !isGlobalAssetsView && episodes.length > 0 && (!selectedEpisodeId || !currentEpisode)) ||
    (project && !project.novelPromotionData)
  const initLoadingState = resolveTaskPresentationState({
    phase: 'processing',
    intent: 'generate',
    resource: 'text',
    hasOutput: false,
  })

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="text-muted-foreground">{tc('loading')}</div>
        </main>
      </div>
    )
  }

  // Error状态
  if (error || !project) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="w-full px-4 py-8">
          <Card className="p-6 text-center">
            <CardContent className="space-y-4 p-0">
              <p className="text-destructive">{error || t('projectNotFound')}</p>
              <Button
                onClick={() => router.push('/workspace')}
              >
                {t('backToWorkspace')}
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      {/* V3 UI: 浮动导航替代了旧的 Sidebar */}

      {/* 主内容区 - 占满全部宽度 */}
      <main className="flex-1 overflow-y-auto">
        <div className="w-full px-4 py-8 sm:px-6 xl:px-8">
          {isGlobalAssetsView && project.novelPromotionData ? (
            // 全局资产视图（确保数据准备好）
            <div>
              <h1 className="mb-6 text-2xl font-bold text-foreground">{t('globalAssets')}</h1>
              <NovelPromotionWorkspace
                project={project}
                projectId={projectId}
                viewMode="global-assets"
                urlStage={effectiveStage}
                onStageChange={updateUrlStage}
              />
            </div>
          ) : shouldShowImportWizard && !isGlobalAssetsView ? (
            // 零状态或导入中：显示智能导入向导
            <SmartImportWizard
              projectId={projectId}
              onManualCreate={() => handleCreateEpisode(`${t('episode')} 1`)}
              onImportComplete={handleSmartImportComplete}
              importStatus={importStatus}
            />
          ) : selectedEpisodeId && currentEpisode ? (
            // 剧集工作区（确保所有数据都准备好）
            <NovelPromotionWorkspace
              project={project}
              projectId={projectId}
              episodeId={selectedEpisodeId}
              episode={currentEpisode}
              viewMode="episode"
              urlStage={effectiveStage}
              onStageChange={updateUrlStage}
              episodes={episodes}
              onEpisodeSelect={handleEpisodeSelect}
              onEpisodeCreate={() => handleCreateEpisode(`${t('episode')} ${episodes.length + 1}`)}
              onEpisodeRename={handleRenameEpisode}
              onEpisodeDelete={handleDeleteEpisode}
            />
          ) : (
            // 加载中
            <Card className="p-8 text-center">
              <CardContent className="p-0">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <TaskStatusInline state={initLoadingState} className="[&>span]:sr-only" />
                </div>
                <h2 className="mb-2 text-xl font-semibold text-muted-foreground">{tc('loading')}</h2>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
