'use client'
import { logError as _ulogError } from '@/lib/logging/core'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import Navbar from '@/components/Navbar'
import ConfirmDialog from '@/components/ConfirmDialog'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon, IconGradientDefs } from '@/components/ui/icons'
import {
  mapEntryModeToJourneyType,
  type WorkspaceProjectEntryMode,
} from '@/lib/workspace/project-mode'
import {
  buildJourneyRuntimeEntryUrl,
  resolveJourneyEntryIntent,
  toJourneyProjectCreatePayload,
  type JourneySourceType,
} from '@/lib/workspace/journey-runtime-adapter'
import {
  trackWorkspaceJourneyEvent,
  trackWorkspaceMangaEvent,
} from '@/lib/workspace/manga-discovery-analytics'
import { isWorkspaceDualJourneyEnabled } from '@/lib/workspace/feature-flags'
import {
  buildStarterProjectName,
  getStarterTemplatesByMode,
  resolveEntryIntentFromTemplate,
  type WorkspaceStarterTemplate,
} from '@/lib/workspace/onboarding-templates'

interface ProjectStats {
  episodes: number
  images: number
  videos: number
  panels: number
  firstEpisodePreview: string | null
}

interface Project {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  totalCost?: number  // 项目总费用（CNY）
  stats?: ProjectStats
  onboardingContext?: {
    journeyType?: 'film_video' | 'manga_webtoon'
  } | null
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const PAGE_SIZE = 7 // 加上新建项目按钮正好8个，4列布局下2行
const DEFAULT_BILLING_CURRENCY = 'CNY'

function formatProjectCost(amount: number, currency = DEFAULT_BILLING_CURRENCY): string {
  if (currency === 'USD') return `$${amount.toFixed(2)}`
  return `¥${amount.toFixed(2)}`
}

export default function WorkspacePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    entryMode: 'story' as WorkspaceProjectEntryMode,
    starterTemplateId: '',
    sourceType: 'blank' as JourneySourceType,
    sourceContent: '',
  })
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editFormData, setEditFormData] = useState({
    name: '',
    description: ''
  })
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)

  // 分页和搜索状态
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 })
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const t = useTranslations('workspace')
  const tc = useTranslations('common')
  const locale = useLocale()
  const dualJourneyEnabled = isWorkspaceDualJourneyEnabled()

  const starterTemplates = useMemo(
    () => getStarterTemplatesByMode(formData.entryMode),
    [formData.entryMode],
  )

  const selectedStarterTemplate = useMemo<WorkspaceStarterTemplate | null>(() => {
    if (starterTemplates.length === 0) return null
    return starterTemplates.find((template) => template.id === formData.starterTemplateId) || starterTemplates[0]
  }, [formData.starterTemplateId, starterTemplates])

  const selectedJourneyTitle = formData.entryMode === 'manga'
    ? t('projectTypeMangaTitle')
    : t('projectTypeStoryTitle')

  const selectedJourneyDescription = formData.entryMode === 'manga'
    ? t('projectTypeMangaDesc')
    : t('projectTypeStoryDesc')

  const [createWizardStep, setCreateWizardStep] = useState<1 | 2 | 3>(1)
  const selectedTemplateId = selectedStarterTemplate?.id

  const trackWizardStepEvent = useCallback((
    event: 'workspace_wizard_step_view' | 'workspace_wizard_step_next' | 'workspace_wizard_step_back',
    extra: Record<string, unknown> = {},
  ) => {
    const journeyType = mapEntryModeToJourneyType(formData.entryMode)
    const templateId = selectedTemplateId || null
    const entryIntent = resolveJourneyEntryIntent({
      journeyType,
      entryMode: formData.entryMode,
      templateId: selectedTemplateId,
      sourceType: formData.sourceType,
    })

    trackWorkspaceJourneyEvent(event, {
      journeyType,
      entryIntent,
      projectMode: formData.entryMode,
      templateId,
      sourceType: formData.sourceType,
      hasSourceContent: formData.sourceContent.trim().length > 0,
      wizardStep: createWizardStep,
      locale,
      surface: 'create_project_modal',
      ...extra,
    })
  }, [createWizardStep, formData.entryMode, formData.sourceContent, formData.sourceType, locale, selectedTemplateId])

  const canContinueToTemplateStep = formData.name.trim().length > 0
  const canContinueToSourceStep = Boolean(selectedStarterTemplate)
  const requiresSourceContent = formData.sourceType !== 'blank'
  const hasValidSourceContent = !requiresSourceContent || formData.sourceContent.trim().length >= 20
  const canSubmitJourney = canContinueToTemplateStep && canContinueToSourceStep && hasValidSourceContent

  // 检查用户是否已登录
  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push('/auth/signin')
      return
    }
  }, [session, status, router])

  useEffect(() => {
    trackWorkspaceJourneyEvent('workspace_journey_card_view', {
      surface: 'workspace_card',
      locale,
      journeyType: 'film_video',
      lane: 'story',
    })

    if (dualJourneyEnabled) {
      trackWorkspaceMangaEvent('workspace_manga_cta_view', {
        surface: 'workspace_card',
        locale,
      })
    }
  }, [dualJourneyEnabled, locale])

  // 获取项目列表
  const fetchProjects = useCallback(async (page: number = 1, search: string = '') => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: PAGE_SIZE.toString()
      })
      if (search.trim()) {
        params.set('search', search.trim())
      }

      const response = await fetch(`/api/projects?${params}`)
      if (response.ok) {
        const data = await response.json()
        setProjects(data.projects)
        setPagination(data.pagination)
      }
    } catch (error) {
      _ulogError('获取项目失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // 初始加载和搜索/分页变化时重新获取
  useEffect(() => {
    if (session) {
      fetchProjects(pagination.page, searchQuery)
    }
  }, [session, pagination.page, searchQuery, fetchProjects])

  // 搜索处理
  const handleSearch = () => {
    setSearchQuery(searchInput)
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  // 分页处理
  const handlePageChange = (newPage: number) => {
    setPagination(prev => ({ ...prev, page: newPage }))
  }

  const resetCreateWizard = (entryMode: WorkspaceProjectEntryMode = 'story') => {
    const templates = getStarterTemplatesByMode(entryMode)
    setFormData({
      name: '',
      description: '',
      entryMode,
      starterTemplateId: templates[0]?.id || '',
      sourceType: 'blank',
      sourceContent: '',
    })
    setCreateWizardStep(1)
  }

  const handleOpenCreateModal = (entryMode: WorkspaceProjectEntryMode = 'story') => {
    if (!dualJourneyEnabled && entryMode === 'manga') {
      return
    }

    const journeyType = mapEntryModeToJourneyType(entryMode)
    trackWorkspaceJourneyEvent('workspace_journey_selected', {
      surface: 'workspace_card',
      locale,
      journeyType,
      lane: entryMode,
    })

    if (entryMode === 'manga') {
      trackWorkspaceMangaEvent('workspace_manga_cta_click', {
        surface: 'workspace_card',
        locale,
      })
    }

    resetCreateWizard(entryMode)
    setShowCreateModal(true)
  }

  const handleEntryModeChange = (entryMode: WorkspaceProjectEntryMode) => {
    const templates = getStarterTemplatesByMode(entryMode)
    const journeyType = mapEntryModeToJourneyType(entryMode)
    setFormData((prev) => ({
      ...prev,
      entryMode,
      starterTemplateId: templates[0]?.id || '',
      sourceType: 'blank',
      sourceContent: '',
    }))
    setCreateWizardStep(1)
    trackWorkspaceJourneyEvent('workspace_journey_selected', {
      journeyType,
      lane: entryMode,
      locale,
      surface: 'create_project_modal',
    })
    trackWorkspaceMangaEvent('workspace_project_mode_selected', {
      projectMode: entryMode,
      locale,
      surface: 'create_project_modal',
    })
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()

    const fallbackProjectName = selectedStarterTemplate
      ? buildStarterProjectName(t(selectedStarterTemplate.titleKey))
      : ''
    const normalizedName = formData.name.trim() || fallbackProjectName
    if (!normalizedName) return

    const journeyType = mapEntryModeToJourneyType(formData.entryMode)
    const entryIntent = resolveJourneyEntryIntent({
      journeyType,
      entryMode: formData.entryMode,
      templateId: selectedStarterTemplate?.id,
      sourceType: formData.sourceType,
    })

    setCreateLoading(true)
    try {
      trackWorkspaceJourneyEvent('workspace_create_started', {
        journeyType,
        entryIntent,
        projectMode: formData.entryMode,
        templateId: selectedStarterTemplate?.id || null,
        locale,
        surface: 'create_project_modal',
      })

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(toJourneyProjectCreatePayload({
          ...formData,
          name: normalizedName,
        }))
      })

      if (response.ok) {
        const data = await response.json()
        const createdProjectId = typeof data?.project?.id === 'string' ? data.project.id : ''

        // 创建成功后刷新第一页
        setSearchQuery('')
        setSearchInput('')
        setPagination(prev => ({ ...prev, page: 1 }))
        fetchProjects(1, '')
        setShowCreateModal(false)
        resetCreateWizard('story')

        trackWorkspaceJourneyEvent('workspace_project_created', {
          journeyType,
          entryIntent,
          projectMode: formData.entryMode,
          templateId: selectedStarterTemplate?.id || null,
          locale,
          surface: 'create_project_modal',
          projectId: createdProjectId || null,
        })
        trackWorkspaceMangaEvent('workspace_project_created', {
          projectMode: formData.entryMode,
          locale,
          surface: 'create_project_modal',
          projectId: createdProjectId || null,
          journeyType,
          entryIntent,
          templateId: selectedStarterTemplate?.id || null,
        })

        if (createdProjectId) {
          router.push(buildJourneyRuntimeEntryUrl({
            projectId: createdProjectId,
            journeyType,
          }))
        }
      } else {
        alert(t('createFailed'))
      }
    } catch (error) {
      _ulogError('创建项目失败:', error)
      alert(t('createFailed'))
    } finally {
      setCreateLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleEditProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProject || !editFormData.name.trim()) return

    setCreateLoading(true)
    try {
      const response = await fetch(`/api/projects/${editingProject.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editFormData)
      })

      if (response.ok) {
        const data = await response.json()
        setProjects(projects.map(p => p.id === editingProject.id ? data.project : p))
        setShowEditModal(false)
        setEditingProject(null)
        setEditFormData({ name: '', description: '' })
      } else {
        alert(t('updateFailed'))
      }
    } catch {
      alert(t('updateFailed'))
    } finally {
      setCreateLoading(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!projectToDelete) return

    setDeletingProjectId(projectToDelete.id)
    setShowDeleteConfirm(false)

    try {
      const response = await fetch(`/api/projects/${projectToDelete.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        // 删除成功后重新获取当前页
        fetchProjects(pagination.page, searchQuery)
      } else {
        alert(t('deleteFailed'))
      }
    } catch {
      alert(t('deleteFailed'))
    } finally {
      setDeletingProjectId(null)
      setProjectToDelete(null)
    }
  }

  const openDeleteConfirm = (project: Project, e: React.MouseEvent) => {
    e.preventDefault()  // 阻止 Link 导航
    e.stopPropagation()
    setProjectToDelete(project)
    setShowDeleteConfirm(true)
  }

  const cancelDelete = () => {
    setShowDeleteConfirm(false)
    setProjectToDelete(null)
  }

  const openEditModal = (project: Project, e: React.MouseEvent) => {
    e.preventDefault()  // 阻止 Link 导航
    e.stopPropagation()
    setEditingProject(project)
    setEditFormData({
      name: project.name,
      description: project.description || ''
    })
    setShowEditModal(true)
  }

  useEffect(() => {
    if (!showCreateModal) return

    trackWizardStepEvent('workspace_wizard_step_view')
  }, [createWizardStep, showCreateModal, trackWizardStepEvent])

  if (status === 'loading' || !session) {
    return (
      <div className="glass-page min-h-screen flex items-center justify-center">
        <div className="text-[var(--glass-text-secondary)]">{tc('loading')}</div>
      </div>
    )
  }

  return (
    <div className="glass-page min-h-screen">
      {/* Header - 统一导航栏 */}
      <Navbar />

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 py-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--glass-text-primary)] mb-2">{t('title')}</h1>
            <p className="text-[var(--glass-text-secondary)]">{t('subtitle')}</p>
          </div>

          {/* 搜索框 */}
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={t('searchPlaceholder')}
              className="glass-input-base w-full sm:w-64 px-3 py-2"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSearch}
                className="glass-btn-base glass-btn-primary px-4 py-2"
              >
                {t('searchButton')}
              </button>
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchInput('')
                    setSearchQuery('')
                    setPagination(prev => ({ ...prev, page: 1 }))
                  }}
                  className="glass-btn-base glass-btn-secondary px-4 py-2"
                >
                  {t('clearButton')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Projects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {/* Film/Video Journey Card */}
          <div
            onClick={() => handleOpenCreateModal('story')}
            className="glass-surface p-6 cursor-pointer group relative overflow-hidden bg-gradient-to-br from-blue-500/10 via-cyan-500/10 to-blue-600/10 hover:from-blue-500/15 hover:via-cyan-500/15 hover:to-blue-600/15 transition-all duration-300"
          >
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_45%)]" />
            <div className="relative z-10 flex h-full flex-col justify-between gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--glass-tone-info-fg)]">{t('journeyCardFilmLabel')}</div>
                  <h3 className="mt-2 text-lg font-bold text-[var(--glass-text-primary)]">{t('projectTypeStoryTitle')}</h3>
                  <p className="mt-2 text-sm text-[var(--glass-text-secondary)] leading-relaxed">{t('projectTypeStoryDesc')}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform duration-300">
                  <AppIcon name="plus" className="w-6 h-6 text-white" />
                </div>
              </div>
              <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--glass-tone-info-fg)]">
                <span>{t('createProject')}</span>
                <AppIcon name="arrowRight" className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Manga CTA Card */}
          {dualJourneyEnabled && (
            <div
              onClick={() => handleOpenCreateModal('manga')}
              className="glass-surface p-6 cursor-pointer group relative overflow-hidden bg-gradient-to-br from-fuchsia-500/10 via-pink-500/10 to-orange-400/10 hover:from-fuchsia-500/15 hover:via-pink-500/15 hover:to-orange-400/15 transition-all duration-300"
            >
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_45%)]" />
              <div className="relative z-10 flex h-full flex-col justify-between gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--glass-tone-info-fg)]">{t('journeyCardMangaLabel')}</div>
                    <h3 className="mt-2 text-lg font-bold text-[var(--glass-text-primary)]">{t('projectTypeMangaTitle')}</h3>
                    <p className="mt-2 text-sm text-[var(--glass-text-secondary)] leading-relaxed">{t('projectTypeMangaDesc')}</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-fuchsia-500 to-orange-400 flex items-center justify-center shadow-lg shadow-fuchsia-500/20 group-hover:scale-110 transition-transform duration-300">
                    <AppIcon name="sparkles" className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--glass-tone-info-fg)]">
                  <span>{t('createProject')}</span>
                  <AppIcon name="arrowRight" className="w-4 h-4" />
                </div>
              </div>
            </div>
          )}

          {/* Project Cards */}
          {loading ? (
            // Loading skeleton
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="glass-surface p-6 animate-pulse">
                <div className="h-4 bg-[var(--glass-bg-muted)] rounded mb-3"></div>
                <div className="h-3 bg-[var(--glass-bg-muted)] rounded mb-2"></div>
                <div className="h-3 bg-[var(--glass-bg-muted)] rounded w-2/3"></div>
              </div>
            ))
          ) : (
            projects.map((project) => (
              <Link
                key={project.id}
                href={`/workspace/${project.id}`}
                className="glass-surface cursor-pointer relative group block hover:border-[var(--glass-tone-info-fg)]/40 transition-all duration-300 overflow-hidden"
              >
                {/* 悬停光效 */}
                <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                <div className="p-5 relative z-10">
                  {/* 操作按钮 */}
                  <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <button
                      onClick={(e) => openEditModal(project, e)}
                      className="glass-btn-base glass-btn-secondary p-2 rounded-lg transition-colors"
                      title={t('editProject')}
                    >
                      <AppIcon name="editSquare" className="w-4 h-4 text-[var(--glass-tone-info-fg)]" />
                    </button>
                    <button
                      onClick={(e) => openDeleteConfirm(project, e)}
                      className="glass-btn-base glass-btn-secondary p-2 rounded-lg transition-colors"
                      title={t('deleteProject')}
                      disabled={deletingProjectId === project.id}
                    >
                      {deletingProjectId === project.id ? (
                        <TaskStatusInline
                          state={resolveTaskPresentationState({
                            phase: 'processing',
                            intent: 'process',
                            resource: 'text',
                            hasOutput: true,
                          })}
                          className="[&>span]:sr-only"
                        />
                      ) : (
                        <AppIcon name="trash" className="w-4 h-4 text-[var(--glass-tone-danger-fg)]" />
                      )}
                    </button>
                  </div>

                  {/* 标题 */}
                  <h3 className="text-lg font-bold text-[var(--glass-text-primary)] mb-2 line-clamp-2 pr-20 group-hover:text-[var(--glass-tone-info-fg)] transition-colors">
                    {project.name}
                  </h3>

                  <div className="mb-3">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase ${project.onboardingContext?.journeyType === 'manga_webtoon'
                      ? 'border-fuchsia-400/35 bg-fuchsia-500/12 text-fuchsia-200'
                      : 'border-cyan-400/35 bg-cyan-500/12 text-cyan-200'
                      }`}>
                      {project.onboardingContext?.journeyType === 'manga_webtoon'
                        ? t('journeyBadgeManga')
                        : t('journeyBadgeFilm')}
                    </span>
                  </div>

                  {/* 描述：优先用户描述，fallback 到第一集故事 */}
                  {(project.description || project.stats?.firstEpisodePreview) && (
                    <div className="flex items-start gap-2 mb-4">
                      <AppIcon name="fileText" className="w-4 h-4 text-[var(--glass-text-tertiary)] mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-[var(--glass-text-secondary)] line-clamp-2 leading-relaxed">
                        {project.description || project.stats?.firstEpisodePreview}
                      </p>
                    </div>
                  )}

                  {/* 统计信息 - 整行统一渐变 */}
                  {project.stats && (project.stats.episodes > 0 || project.stats.images > 0 || project.stats.videos > 0) ? (
                    <div className="flex items-center gap-2 mb-3">
                      {/* 共享渐变定义 */}
                      <IconGradientDefs className="w-0 h-0 absolute" aria-hidden="true" />
                      <AppIcon name="statsBarGradient" className="w-4 h-4 flex-shrink-0" />
                      <div className="flex items-center gap-3 text-sm font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
                        {project.stats.episodes > 0 && (
                          <span className="flex items-center gap-1" title={t('statsEpisodes')}>
                            <AppIcon name="statsEpisodeGradient" className="w-3.5 h-3.5" />
                            {project.stats.episodes}
                          </span>
                        )}
                        {project.stats.images > 0 && (
                          <span className="flex items-center gap-1" title={t('statsImages')}>
                            <AppIcon name="statsImageGradient" className="w-3.5 h-3.5" />
                            {project.stats.images}
                          </span>
                        )}
                        {project.stats.videos > 0 && (
                          <span className="flex items-center gap-1" title={t('statsVideos')}>
                            <AppIcon name="statsVideoGradient" className="w-3.5 h-3.5" />
                            {project.stats.videos}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 mb-3">
                      <AppIcon name="statsBar" className="w-4 h-4 text-[var(--glass-text-tertiary)] flex-shrink-0" />
                      <span className="text-xs text-[var(--glass-text-tertiary)]">{t('noContent')}</span>
                    </div>
                  )}

                  {/* 底部信息 */}
                  <div className="flex items-center justify-between text-[11px] text-[var(--glass-text-tertiary)]">
                    <div className="flex items-center gap-1">
                      <AppIcon name="clock" className="w-3 h-3" />
                      {formatDate(project.updatedAt)}
                    </div>
                    {project.totalCost !== undefined && project.totalCost > 0 && (
                      <span className="text-[11px] font-mono font-medium text-[var(--glass-text-secondary)]">
                        {formatProjectCost(project.totalCost)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>

        {/* Empty State */}
        {!loading && projects.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-[var(--glass-bg-muted)] rounded-xl flex items-center justify-center mx-auto mb-4">
              <AppIcon name="folderCards" className="w-8 h-8 text-[var(--glass-text-tertiary)]" />
            </div>
            <h3 className="text-lg font-medium text-[var(--glass-text-primary)] mb-2">
              {searchQuery ? t('noResults') : t('noProjects')}
            </h3>
            <p className="text-[var(--glass-text-secondary)] mb-6">
              {searchQuery ? t('noResultsDesc') : t('noProjectsDesc')}
            </p>
            {!searchQuery && (
              <button
                onClick={() => handleOpenCreateModal('story')}
                className="glass-btn-base glass-btn-primary px-6 py-3"
              >
                {t('newProject')}
              </button>
            )}
          </div>
        )}

        {/* 分页控件 */}
        {!loading && pagination.totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="glass-btn-base glass-btn-secondary px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <AppIcon name="chevronLeft" className="w-5 h-5" />
            </button>

            {/* 页码按钮 */}
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
              .filter(page => {
                // 显示第一页、最后一页、当前页及其前后两页
                return page === 1 ||
                  page === pagination.totalPages ||
                  Math.abs(page - pagination.page) <= 2
              })
              .map((page, index, array) => (
                <span key={page} className="flex items-center">
                  {/* 显示省略号 */}
                  {index > 0 && array[index - 1] !== page - 1 && (
                    <span className="px-2 text-[var(--glass-text-tertiary)]">...</span>
                  )}
                  <button
                    onClick={() => handlePageChange(page)}
                    className={`glass-btn-base px-4 py-2 ${page === pagination.page
                      ? 'glass-btn-primary'
                      : 'glass-btn-secondary'
                      }`}
                  >
                    {page}
                  </button>
                </span>
              ))}

            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="glass-btn-base glass-btn-secondary px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <AppIcon name="chevronRight" className="w-5 h-5" />
            </button>

            <span className="ml-4 text-sm text-[var(--glass-text-tertiary)]">
              {t('totalProjects', { count: pagination.total })}
            </span>
          </div>
        )}
      </main>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 backdrop-blur-sm p-3 sm:p-4 lg:p-6">
          <div className="glass-surface-modal w-full max-w-4xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 lg:p-7">
            <h2 className="text-2xl font-bold text-[var(--glass-text-primary)] mb-1">{t('createProject')}</h2>
            <p className="text-sm text-[var(--glass-text-tertiary)] mb-1">{t('wizard.modalIntro')}</p>
            <div className="mb-5 rounded-lg border border-[var(--glass-border)]/60 bg-[var(--glass-background-secondary)]/35 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--glass-text-tertiary)]">{t('journeyLaneLabel')}</p>
              <p className="mt-1 text-sm font-semibold text-[var(--glass-text-primary)]">{selectedJourneyTitle}</p>
              <p className="mt-1 text-xs text-[var(--glass-text-secondary)]">{selectedJourneyDescription}</p>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--glass-text-tertiary)]">
                <span className={`rounded-full px-2 py-1 ${createWizardStep === 1 ? 'bg-[var(--glass-primary)]/20 text-[var(--glass-text-primary)]' : 'bg-[var(--glass-bg-muted)]'}`}>1. {t('wizard.stepJourney')}</span>
                <span className={`rounded-full px-2 py-1 ${createWizardStep === 2 ? 'bg-[var(--glass-primary)]/20 text-[var(--glass-text-primary)]' : 'bg-[var(--glass-bg-muted)]'}`}>2. {t('wizard.stepTemplate')}</span>
                <span className={`rounded-full px-2 py-1 ${createWizardStep === 3 ? 'bg-[var(--glass-primary)]/20 text-[var(--glass-text-primary)]' : 'bg-[var(--glass-bg-muted)]'}`}>3. {t('wizard.stepSource')}</span>
              </div>

              {createWizardStep === 1 && (
                <section className="space-y-4">
                  <div>
                    <span className="glass-field-label block mb-2">{t('wizard.studioChoiceLabel')}</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => handleEntryModeChange('story')}
                        className={`glass-btn-base relative overflow-hidden px-4 py-3.5 text-left transition ${formData.entryMode === 'story'
                          ? 'glass-btn-primary ring-2 ring-[var(--glass-primary)]/35 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_10px_28px_rgba(76,166,255,0.18)]'
                          : 'glass-btn-secondary hover:ring-1 hover:ring-[var(--glass-border)]/80'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5">
                            <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--glass-background-secondary)]/80">
                              <AppIcon name="clapperboard" className="h-4 w-4" />
                            </span>
                            <div>
                              <div className="text-sm font-semibold">{t('projectTypeStoryTitle')}</div>
                              <div className="text-xs opacity-80 mt-1 leading-relaxed">{t('projectTypeStoryDesc')}</div>
                            </div>
                          </div>
                          {formData.entryMode === 'story' && <AppIcon name="check" className="h-4 w-4 opacity-90" />}
                        </div>
                      </button>
                      {dualJourneyEnabled && (
                        <button
                          type="button"
                          onClick={() => handleEntryModeChange('manga')}
                          className={`glass-btn-base relative overflow-hidden px-4 py-3.5 text-left transition ${formData.entryMode === 'manga'
                            ? 'glass-btn-primary ring-2 ring-[var(--glass-primary)]/35 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_10px_28px_rgba(76,166,255,0.18)]'
                            : 'glass-btn-secondary hover:ring-1 hover:ring-[var(--glass-border)]/80'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5">
                              <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--glass-background-secondary)]/80">
                                <AppIcon name="bookOpen" className="h-4 w-4" />
                              </span>
                              <div>
                                <div className="text-sm font-semibold">{t('projectTypeMangaTitle')}</div>
                                <div className="text-xs opacity-80 mt-1 leading-relaxed">{t('projectTypeMangaDesc')}</div>
                              </div>
                            </div>
                            {formData.entryMode === 'manga' && <AppIcon name="check" className="h-4 w-4 opacity-90" />}
                          </div>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-[var(--glass-border)]/50 bg-[var(--glass-background-secondary)]/25 px-3 py-3">
                    <div className="mb-2">
                      <p className="glass-field-label">{t('wizard.projectDetailsLabel')}</p>
                      <p className="text-xs text-[var(--glass-text-tertiary)] mt-1">{t('wizard.projectDetailsHint')}</p>
                    </div>

                    <div>
                      <label htmlFor="name" className="glass-field-label block mb-2">
                        {t('projectName')} *
                      </label>
                      <input
                        id="name"
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="glass-input-base w-full px-3 py-2.5"
                        placeholder={t('projectNamePlaceholder')}
                        maxLength={100}
                        required
                        autoFocus
                      />
                    </div>

                    <div className="mt-3">
                      <label htmlFor="description" className="glass-field-label block mb-2">
                        {t('projectDescription')}
                      </label>
                      <textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="glass-textarea-base w-full px-3 py-2.5"
                        placeholder={t('projectDescriptionPlaceholder')}
                        rows={2}
                        maxLength={500}
                      />
                    </div>
                  </div>
                </section>
              )}

              {createWizardStep === 2 && (
                <section className="space-y-3">
                  <span className="glass-field-label block">{t('starterTemplates.title')}</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {starterTemplates.map((template) => {
                      const isActive = selectedStarterTemplate?.id === template.id
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => {
                            const journeyType = mapEntryModeToJourneyType(formData.entryMode)
                            trackWorkspaceJourneyEvent('workspace_template_selected', {
                              journeyType,
                              entryIntent: resolveEntryIntentFromTemplate({
                                entryMode: formData.entryMode,
                                templateId: template.id,
                              }),
                              projectMode: formData.entryMode,
                              templateId: template.id,
                              locale,
                              surface: 'create_project_modal',
                            })
                            setFormData((prev) => ({
                              ...prev,
                              starterTemplateId: template.id,
                              name: prev.name.trim() ? prev.name : buildStarterProjectName(t(template.titleKey)),
                            }))
                          }}
                          className={`w-full glass-btn-base px-3 py-2.5 text-left ${isActive ? 'glass-btn-primary ring-2 ring-[var(--glass-primary)]/30' : 'glass-btn-secondary'}`}
                        >
                          <div className="text-sm font-semibold text-[var(--glass-text-primary)] truncate">{t(template.titleKey)}</div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              {createWizardStep === 3 && (
                <section className="space-y-4">
                  <div>
                    <span className="glass-field-label block mb-2">{t('wizard.sourceTypeLabel')}</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {(['blank', 'story_text', 'import_script'] as JourneySourceType[]).map((sourceType) => (
                        <button
                          key={sourceType}
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, sourceType }))}
                          className={`glass-btn-base px-3 py-2 text-left ${formData.sourceType === sourceType ? 'glass-btn-primary' : 'glass-btn-secondary'}`}
                        >
                          {t(`wizard.sourceType.${sourceType}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {formData.sourceType !== 'blank' && (
                    <div>
                      <label htmlFor="sourceContent" className="glass-field-label block mb-2">{t('wizard.sourceContentLabel')}</label>
                      <textarea
                        id="sourceContent"
                        value={formData.sourceContent}
                        onChange={(e) => setFormData((prev) => ({ ...prev, sourceContent: e.target.value }))}
                        className="glass-textarea-base w-full px-3 py-2.5"
                        placeholder={t('wizard.sourceContentPlaceholder')}
                        rows={5}
                        maxLength={4000}
                      />
                      {!hasValidSourceContent && (
                        <p className="mt-2 text-xs text-[var(--glass-tone-warning-fg)]">{t('wizard.sourceContentHint')}</p>
                      )}
                    </div>
                  )}

                  <div className="rounded-lg border border-[var(--glass-border)]/60 bg-[var(--glass-background-secondary)]/35 px-3 py-2 text-xs text-[var(--glass-text-secondary)]">
                    {t('wizard.readinessSummary', {
                      journey: selectedJourneyTitle,
                      template: selectedStarterTemplate ? t(selectedStarterTemplate.titleKey) : '-',
                      sourceType: t(`wizard.sourceType.${formData.sourceType}`),
                    })}
                  </div>
                </section>
              )}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 sm:gap-3 pt-3 border-t border-[var(--glass-border)]/40">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false)
                      resetCreateWizard('story')
                    }}
                    className="glass-btn-base glass-btn-secondary px-4 py-2.5"
                    disabled={createLoading}
                  >
                    {tc('cancel')}
                  </button>
                  {createWizardStep > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const nextStep = createWizardStep === 2 ? 1 : 2
                        trackWizardStepEvent('workspace_wizard_step_back', {
                          fromStep: createWizardStep,
                          toStep: nextStep,
                        })
                        setCreateWizardStep(nextStep as 1 | 2 | 3)
                      }}
                      className="glass-btn-base glass-btn-secondary px-4 py-2.5"
                      disabled={createLoading}
                    >
                      {t('wizard.back')}
                    </button>
                  )}
                </div>

                <div>
                  {createWizardStep < 3 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (createWizardStep === 1 && !canContinueToTemplateStep) return
                        if (createWizardStep === 2 && !canContinueToSourceStep) return
                        const nextStep = createWizardStep === 1 ? 2 : 3
                        trackWizardStepEvent('workspace_wizard_step_next', {
                          fromStep: createWizardStep,
                          toStep: nextStep,
                        })
                        setCreateWizardStep(nextStep as 1 | 2 | 3)
                      }}
                      className="glass-btn-base glass-btn-primary px-4 py-2.5 disabled:opacity-50"
                      disabled={createLoading || (createWizardStep === 1 ? !canContinueToTemplateStep : !canContinueToSourceStep)}
                    >
                      {createWizardStep === 1 ? t('wizard.nextToTemplate') : t('wizard.nextToSource')}
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="glass-btn-base glass-btn-primary px-4 py-2.5 disabled:opacity-50"
                      disabled={createLoading || !canSubmitJourney}
                    >
                      {createLoading ? t('creating') : t('wizard.startCreating')}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {showEditModal && editingProject && (
        <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 backdrop-blur-sm p-3 sm:p-4">
          <div className="glass-surface-modal p-5 sm:p-6 w-full max-w-md max-h-[85vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-[var(--glass-text-primary)] mb-4">{t('editProject')}</h2>
            <form onSubmit={handleEditProject}>
              <div className="mb-4">
                <label htmlFor="edit-name" className="glass-field-label block mb-2">
                  {t('projectName')} *
                </label>
                <input
                  id="edit-name"
                  type="text"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="glass-input-base w-full px-3 py-2"
                  placeholder={t('projectNamePlaceholder')}
                  maxLength={100}
                  required
                />
              </div>
              <div className="mb-6">
                <label htmlFor="edit-description" className="glass-field-label block mb-2">
                  {t('projectDescription')}
                </label>
                <textarea
                  id="edit-description"
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  className="glass-textarea-base w-full px-3 py-2"
                  placeholder={t('projectDescriptionPlaceholder')}
                  rows={3}
                  maxLength={500}
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false)
                    setEditingProject(null)
                    setEditFormData({ name: '', description: '' })
                  }}
                  className="glass-btn-base glass-btn-secondary px-4 py-2"
                  disabled={createLoading}
                >
                  {tc('cancel')}
                </button>
                <button
                  type="submit"
                  className="glass-btn-base glass-btn-primary px-4 py-2 disabled:opacity-50"
                  disabled={createLoading || !editFormData.name.trim()}
                >
                  {createLoading ? t('saving') : tc('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      <ConfirmDialog
        show={showDeleteConfirm}
        title={t('deleteProject')}
        message={t('deleteConfirm', { name: projectToDelete?.name || '' })}
        confirmText={tc('delete')}
        cancelText={tc('cancel')}
        type="danger"
        onConfirm={handleDeleteProject}
        onCancel={cancelDelete}
      />
    </div>
  )
}
