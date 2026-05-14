'use client'
import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { apiFetch } from '@/lib/api-fetch'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import Navbar from '@/components/Navbar'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { useProjectData, useEpisodeData, useUserModels } from '@/lib/query/hooks'
import { queryKeys } from '@/lib/query/keys'
import ProjectWorkspace from '@/features/project-workspace/ProjectWorkspace'
import SmartImportWizard, { SplitEpisode } from '@/features/project-workspace/components/SmartImportWizard'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { resolveSelectedEpisodeId } from './episode-selection'
import { ModelCapabilityDropdown } from '@/components/ui/config-modals/ModelCapabilityDropdown'
import { AppIcon } from '@/components/ui/icons'
import { readConfiguredAnalysisModel, shouldGuideToModelSetup } from '@/lib/workspace/model-setup'
import { useRouter } from '@/i18n/navigation'
import { readApiErrorMessage } from '@/lib/api/read-error-message'
import {
  HOME_ASSISTANT_AUTOSTART_QUERY,
  HOME_ASSISTANT_AUTOSTART_VALUE,
  readHomeAssistantAutoStartMessage,
  removeHomeAssistantAutoStartMessage,
} from '@/lib/home/create-project-launch'

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
  const urlEpisodeId = searchParams.get('episode') ?? null
  const shouldAutoStartAssistant = searchParams.get(HOME_ASSISTANT_AUTOSTART_QUERY) === HOME_ASSISTANT_AUTOSTART_VALUE

  // 🔥 React Query 数据获取
  const queryClient = useQueryClient()
  const { data: project, isLoading: loading, error: projectError } = useProjectData(projectId)
  const error = projectError?.message || null

  // 视图状态（仅 UI）
  const [isGlobalAssetsView, setIsGlobalAssetsView] = useState(false)
  const [isCheckingModelSetup, setIsCheckingModelSetup] = useState(true)
  const [needsModelSetup, setNeedsModelSetup] = useState(false)
  const [analysisModelDraft, setAnalysisModelDraft] = useState('')
  const [isModelSetupModalOpen, setIsModelSetupModalOpen] = useState(false)
  const [modelSetupSaving, setModelSetupSaving] = useState(false)

  const userModelsQuery = useUserModels()
  const llmModelOptions = userModelsQuery.data?.llm || []

  const updateUrlParams = useCallback((updates: {
    episode?: string | null
    assistantAutoStart?: string | null
  }) => {
    const params = new URLSearchParams(searchParams.toString())
    if (updates.episode !== undefined) {
      if (updates.episode) {
        params.set('episode', updates.episode)
      } else {
        params.delete('episode')
      }
    }
    if (updates.assistantAutoStart !== undefined) {
      if (updates.assistantAutoStart) {
        params.set(HOME_ASSISTANT_AUTOSTART_QUERY, updates.assistantAutoStart)
      } else {
        params.delete(HOME_ASSISTANT_AUTOSTART_QUERY)
      }
    }
    const query = Object.fromEntries(params.entries())
    router.replace(
      {
        pathname: `/workspace/${projectId}`,
        query,
      },
      { scroll: false },
    )
  }, [router, projectId, searchParams])

  // 获取剧集列表
  const episodes = useMemo<Episode[]>(() => {
    const getNum = (name: string) => { const m = name.match(/\d+/); return m ? parseInt(m[0], 10) : Infinity }
    return (project?.episodes ?? []).map((episode) => ({
      ...episode,
      createdAt: typeof episode.createdAt === 'string' ? episode.createdAt : episode.createdAt.toISOString(),
    })).sort((a, b) => {
      const diff = getNum(a.name) - getNum(b.name)
      return diff !== 0 ? diff : a.name.localeCompare(b.name, 'zh')
    })
  }, [project?.episodes])

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
  const assistantAutoStartMessage = useMemo(() => (
    shouldAutoStartAssistant && selectedEpisodeId
      ? readHomeAssistantAutoStartMessage(projectId, selectedEpisodeId)
      : null
  ), [projectId, selectedEpisodeId, shouldAutoStartAssistant])
  const assistantAutoStartKey = shouldAutoStartAssistant && selectedEpisodeId
    ? `${projectId}:${selectedEpisodeId}:home-input`
    : null
  const clearAssistantAutoStart = useCallback(() => {
    if (selectedEpisodeId) {
      removeHomeAssistantAutoStartMessage(projectId, selectedEpisodeId)
    }
    updateUrlParams({ assistantAutoStart: null })
  }, [projectId, selectedEpisodeId, updateUrlParams])

  useEffect(() => {
    if (!shouldAutoStartAssistant || !selectedEpisodeId || assistantAutoStartMessage) return
    clearAssistantAutoStart()
  }, [assistantAutoStartMessage, clearAssistantAutoStart, selectedEpisodeId, shouldAutoStartAssistant])

  // 获取导入状态
  const importStatus = project?.importStatus

  // 零状态：无剧集且非导入中 → 自动创建第一集
  const isZeroState = episodes.length === 0
  const shouldShowImportWizard = importStatus === 'pending' // 仅分集预览中才显示 wizard
  const shouldAutoCreateEpisode = isZeroState && importStatus !== 'pending'
  const autoCreateTriggered = useRef(false)

  useEffect(() => {
    if (!shouldAutoCreateEpisode || autoCreateTriggered.current || loading) return
    autoCreateTriggered.current = true
    void handleCreateEpisode(`${t('episode')} 1`)
  }, [shouldAutoCreateEpisode, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const shouldGateImportWizardByModel = shouldShowImportWizard && !isGlobalAssetsView

  useEffect(() => {
    if (!shouldGateImportWizardByModel) return

    let canceled = false
    const checkDefaultModelSetup = async () => {
      setIsCheckingModelSetup(true)
      try {
        const response = await apiFetch('/api/user-preference')
        if (!response.ok) {
          _ulogError('[ProjectDetail] 获取用户默认模型失败:', { status: response.status })
          if (!canceled) {
            setNeedsModelSetup(true)
            setAnalysisModelDraft('')
          }
          return
        }

        const payload: unknown = await response.json()
        const configuredModel = readConfiguredAnalysisModel(payload)
        if (!canceled) {
          setAnalysisModelDraft(configuredModel || '')
          setNeedsModelSetup(shouldGuideToModelSetup(payload))
        }
      } catch (err) {
        _ulogError('[ProjectDetail] 检查默认模型失败:', err)
        if (!canceled) {
          setNeedsModelSetup(true)
          setAnalysisModelDraft('')
        }
      } finally {
        if (!canceled) {
          setIsCheckingModelSetup(false)
        }
      }
    }

    void checkDefaultModelSetup()
    return () => {
      canceled = true
    }
  }, [shouldGateImportWizardByModel])

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
    const res = await apiFetch(`/api/projects/${projectId}/episodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    })

    if (!res.ok) {
      throw new Error(await readApiErrorMessage(res, t('createFailed')))
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
      const res = await apiFetch(`/api/projects/${projectId}/data`)
      const data = await res.json()
      const newEpisodes = data?.project?.episodes || []
      _ulogInfo('[Page] 获取到新剧集:', newEpisodes.length, '个')

      // 如果有剧集，进入第一个
      if (newEpisodes.length > 0) {
        // 如果需要触发全局分析，切换到 assets 阶段并带上参数
        if (triggerGlobalAnalysis) {
          _ulogInfo('[Page] 触发全局分析，保留唯一画布入口并带 globalAnalyze=1 参数')
          // 使用相对路径更新，保留 locale
          const params = new URLSearchParams()
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
    const res = await apiFetch(`/api/projects/${projectId}/episodes/${episodeId}`, {
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
    const res = await apiFetch(`/api/projects/${projectId}/episodes/${episodeId}`, {
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

  const handleSaveDefaultAnalysisModel = async () => {
    const modelKey = analysisModelDraft.trim()
    if (!modelKey) {
      alert(t('modelSetup.selectModelFirst'))
      return
    }

    setModelSetupSaving(true)
    try {
      const response = await apiFetch('/api/user-preference', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisModel: modelKey }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      setNeedsModelSetup(false)
      setIsModelSetupModalOpen(false)
    } catch (err) {
      _ulogError('[ProjectDetail] 保存默认分析模型失败:', err)
      alert(t('modelSetup.saveFailed'))
    } finally {
      setModelSetupSaving(false)
    }
  }

  // Loading状态：等待项目数据和剧集数据都准备好
  // 条件：正在加载 或 (有剧集但episode数据未准备好)
  // 排除：如果要显示导入向导，则不需要等待剧集数据
  const isInitializing = loading ||
    (!shouldShowImportWizard && !isGlobalAssetsView && episodes.length > 0 && (!selectedEpisodeId || !currentEpisode))
  const isEpisodeWorkspaceReady = !isGlobalAssetsView && !shouldShowImportWizard && Boolean(selectedEpisodeId && currentEpisode)
  const initLoadingState = resolveTaskPresentationState({
    phase: 'processing',
    intent: 'generate',
    resource: 'text',
    hasOutput: false,
  })

  if (isInitializing) {
    return (
      <div className="glass-page min-h-screen">
        <Navbar />
        <main className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="text-[var(--glass-text-secondary)]">{tc('loading')}</div>
        </main>
      </div>
    )
  }

  // Error状态
  if (error || !project) {
    return (
      <div className="glass-page min-h-screen">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="glass-surface p-6 text-center">
            <p className="text-[var(--glass-tone-danger-fg)] mb-4">{error || t('projectNotFound')}</p>
            <button
              onClick={() => router.push({ pathname: '/workspace' })}
              className="glass-btn-base glass-btn-primary px-6 py-2"
            >
              {t('backToWorkspace')}
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className={isEpisodeWorkspaceReady ? 'glass-page flex h-[100dvh] flex-col overflow-hidden' : 'glass-page min-h-screen flex flex-col'}>
      <Navbar reserveLayoutSpace={!isEpisodeWorkspaceReady} />

      {/* V3 UI: 浮动导航替代了旧的 Sidebar */}

      {/* 主内容区 - 占满全部宽度 */}
      <main className={isEpisodeWorkspaceReady ? 'min-h-0 flex-1 overflow-hidden' : 'flex-1 overflow-y-auto'}>
        <div className={isEpisodeWorkspaceReady ? 'h-full w-full overflow-hidden' : 'w-full px-4 py-8'}>
          {isGlobalAssetsView ? (
            // 全局资产视图（确保数据准备好）
            <div>
              <h1 className="text-2xl font-bold text-[var(--glass-text-primary)] mb-6">{t('globalAssets')}</h1>
              <ProjectWorkspace
                project={project}
                projectId={projectId}
                viewMode="global-assets"
              />
            </div>
          ) : shouldShowImportWizard && !isGlobalAssetsView ? (
            isCheckingModelSetup ? (
              <div className="glass-surface p-8 text-center">
                <div className="mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center bg-[var(--glass-bg-muted)] text-[var(--glass-text-tertiary)]">
                  <TaskStatusInline state={initLoadingState} className="[&>span]:sr-only" />
                </div>
                <h2 className="text-xl font-semibold text-[var(--glass-text-secondary)] mb-2">{tc('loading')}</h2>
              </div>
            ) : needsModelSetup ? (
              <div className="glass-surface p-8 max-w-2xl mx-auto">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)] flex items-center justify-center shrink-0">
                    <AppIcon name="alert" className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-[var(--glass-text-primary)] mb-2">
                      {t('modelSetup.title')}
                    </h2>
                    <p className="text-[var(--glass-text-secondary)] mb-5">
                      {t('modelSetup.description')}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => setIsModelSetupModalOpen(true)}
                        className="glass-btn-base glass-btn-primary px-4 py-2"
                      >
                        {t('modelSetup.configureNow')}
                      </button>
                      <button
                        onClick={() => router.push({ pathname: '/profile' })}
                        className="glass-btn-base glass-btn-secondary px-4 py-2"
                      >
                        {t('modelSetup.goProfile')}
                      </button>
                    </div>
                  </div>
                </div>

                {isModelSetupModalOpen && (
                  <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="glass-surface-modal p-6 w-full max-w-xl mx-4">
                      <h3 className="text-xl font-bold text-[var(--glass-text-primary)] mb-2">
                        {t('modelSetup.modalTitle')}
                      </h3>
                      <p className="text-sm text-[var(--glass-text-secondary)] mb-5">
                        {t('modelSetup.modalDescription')}
                      </p>

                      <div className="mb-6">
                        <label className="glass-field-label block mb-2">{t('modelSetup.selectModelLabel')}</label>
                        {userModelsQuery.isLoading ? (
                          <div className="text-sm text-[var(--glass-text-tertiary)]">{tc('loading')}</div>
                        ) : llmModelOptions.length === 0 ? (
                          <div className="text-sm text-[var(--glass-tone-warning-fg)]">
                            {t('modelSetup.noModelOptions')}
                          </div>
                        ) : (
                          <ModelCapabilityDropdown
                            models={llmModelOptions}
                            value={analysisModelDraft || undefined}
                            onModelChange={setAnalysisModelDraft}
                            capabilityFields={[]}
                            capabilityOverrides={{}}
                            onCapabilityChange={(field, rawValue, sample) => {
                              void field
                              void rawValue
                              void sample
                            }}
                            placeholder={t('modelSetup.selectModelPlaceholder')}
                          />
                        )}
                      </div>

                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setIsModelSetupModalOpen(false)}
                          className="glass-btn-base glass-btn-secondary px-4 py-2"
                          disabled={modelSetupSaving}
                        >
                          {tc('cancel')}
                        </button>
                        <button
                          type="button"
                          onClick={() => { void handleSaveDefaultAnalysisModel() }}
                          className="glass-btn-base glass-btn-primary px-4 py-2 disabled:opacity-50"
                          disabled={modelSetupSaving || llmModelOptions.length === 0 || !analysisModelDraft.trim()}
                        >
                          {modelSetupSaving ? tc('loading') : tc('save')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // 导入中（pending）：显示分集预览向导
              <SmartImportWizard
                projectId={projectId}
                onManualCreate={() => handleCreateEpisode(`${t('episode')} 1`)}
                onImportComplete={handleSmartImportComplete}
                importStatus={importStatus}
              />
            )
          ) : selectedEpisodeId && currentEpisode ? (
            // 剧集工作区（确保所有数据都准备好）
            <ProjectWorkspace
              project={project}
              projectId={projectId}
              episodeId={selectedEpisodeId}
              episode={currentEpisode}
              viewMode="episode"
              episodes={episodes}
              assistantAutoStartMessage={assistantAutoStartMessage}
              assistantAutoStartKey={assistantAutoStartKey}
              onAssistantAutoStartConsumed={clearAssistantAutoStart}
              onEpisodeSelect={handleEpisodeSelect}
              onEpisodeCreate={() => handleCreateEpisode(`${t('episode')} ${episodes.length + 1}`)}
              onEpisodeRename={handleRenameEpisode}
              onEpisodeDelete={handleDeleteEpisode}
            />
          ) : (
            // 加载中
            <div className="glass-surface p-8 text-center">
              <div className="mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center bg-[var(--glass-bg-muted)] text-[var(--glass-text-tertiary)]">
                <TaskStatusInline state={initLoadingState} className="[&>span]:sr-only" />
              </div>
              <h2 className="text-xl font-semibold text-[var(--glass-text-secondary)] mb-2">{tc('loading')}</h2>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
