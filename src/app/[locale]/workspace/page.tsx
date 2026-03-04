'use client'
import { logError as _ulogError } from '@/lib/logging/core'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import ConfirmDialog from '@/components/ConfirmDialog'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon, IconGradientDefs } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

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
    description: ''
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

  // 检查用户是否已登录
  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push('/auth/signin')
      return
    }
  }, [session, status, router])

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

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return

    setCreateLoading(true)
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          mode: 'novel-promotion' // 固定为 novel-promotion
        })
      })

      if (response.ok) {
        // 创建成功后刷新第一页
        setSearchQuery('')
        setSearchInput('')
        setPagination(prev => ({ ...prev, page: 1 }))
        fetchProjects(1, '')
        setShowCreateModal(false)
        setFormData({ name: '', description: '' })
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
    // 转换为北京时间 (UTC+8)
    const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000)
    return beijingTime.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Shanghai'
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

  if (status === 'loading' || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">{tc('loading')}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header - 统一导航栏 */}
      <Navbar />

      {/* Main Content */}
      <main className="w-full px-4 py-8 sm:px-6 lg:px-10">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-foreground">{t('title')}</h1>
            <p className="text-muted-foreground">{t('subtitle')}</p>
          </div>

          {/* 搜索框 */}
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
            <Input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={t('searchPlaceholder')}
              className="w-full sm:w-64"
            />
            <Button
              onClick={handleSearch}
            >
              {t('searchButton')}
            </Button>
            {searchQuery && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchInput('')
                  setSearchQuery('')
                  setPagination(prev => ({ ...prev, page: 1 }))
                }}
              >
                {t('clearButton')}
              </Button>
            )}
          </div>
        </div>

        {/* Projects Grid */}
        <div className="grid justify-start gap-6 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),20rem))]">
          {/* New Project Card */}
          <Card
            onClick={() => setShowCreateModal(true)}
            className="group flex cursor-pointer items-center justify-center border-dashed bg-gradient-to-br from-blue-500/5 via-cyan-500/5 to-blue-600/5 p-6 transition-all duration-300 hover:border-primary/40 hover:from-blue-500/10 hover:via-cyan-500/10 hover:to-blue-600/10"
          >
            <CardContent className="flex flex-col items-center gap-3 p-0">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/20 transition-all duration-300 group-hover:scale-110 group-hover:shadow-blue-500/40">
                <AppIcon name="plus" className="h-6 w-6 text-white" />
              </div>
              <span className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">{t('newProject')}</span>
            </CardContent>
          </Card>

          {/* Project Cards */}
          {loading ? (
            // Loading skeleton
            Array.from({ length: 3 }).map((_, index) => (
              <Card key={index} className="animate-pulse p-6">
                <CardContent className="space-y-3 p-0">
                  <div className="h-4 rounded bg-muted"></div>
                  <div className="h-3 rounded bg-muted"></div>
                  <div className="h-3 w-2/3 rounded bg-muted"></div>
                </CardContent>
              </Card>
            ))
          ) : (
            projects.map((project) => (
              <Link
                key={project.id}
                href={`/workspace/${project.id}`}
                className="group relative block overflow-hidden rounded-xl border bg-card transition-all duration-300 hover:border-primary/40 hover:shadow-md"
              >
                {/* 悬停光效 */}
                <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                <div className="p-5 relative z-10">
                  {/* 操作按钮 */}
                  <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <Button
                      onClick={(e) => openEditModal(project, e)}
                      variant="secondary"
                      size="icon"
                      className="h-8 w-8"
                      title={t('editProject')}
                    >
                      <AppIcon name="editSquare" className="h-4 w-4 text-primary" />
                    </Button>
                    <Button
                      onClick={(e) => openDeleteConfirm(project, e)}
                      variant="secondary"
                      size="icon"
                      className="h-8 w-8"
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
                        <AppIcon name="trash" className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </div>

                  {/* 标题 */}
                  <h3 className="mb-2 line-clamp-2 pr-20 text-lg font-bold text-foreground transition-colors group-hover:text-primary">
                    {project.name}
                  </h3>

                  {/* 描述：优先用户描述，fallback 到第一集故事 */}
                  {(project.description || project.stats?.firstEpisodePreview) && (
                    <div className="flex items-start gap-2 mb-4">
                      <AppIcon name="fileText" className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
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
                      <AppIcon name="statsBar" className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{t('noContent')}</span>
                    </div>
                  )}

                  {/* 底部信息 */}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <AppIcon name="clock" className="h-3 w-3" />
                      {formatDate(project.updatedAt)}
                    </div>
                    {project.totalCost !== undefined && project.totalCost > 0 && (
                      <span className="text-[11px] font-mono font-medium text-foreground/80">
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
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-muted">
              <AppIcon name="folderCards" className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-medium text-foreground">
              {searchQuery ? t('noResults') : t('noProjects')}
            </h3>
            <p className="mb-6 text-muted-foreground">
              {searchQuery ? t('noResultsDesc') : t('noProjectsDesc')}
            </p>
            {!searchQuery && (
              <Button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-3"
              >
                {t('newProject')}
              </Button>
            )}
          </div>
        )}

        {/* 分页控件 */}
        {!loading && pagination.totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              <AppIcon name="chevronLeft" className="w-5 h-5" />
            </Button>

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
                    <span className="px-2 text-muted-foreground">...</span>
                  )}
                  <Button
                    onClick={() => handlePageChange(page)}
                    size="sm"
                    variant={page === pagination.page ? 'default' : 'outline'}
                    className={cn('px-4')}
                  >
                    {page}
                  </Button>
                </span>
              ))}

            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
            >
              <AppIcon name="chevronRight" className="w-5 h-5" />
            </Button>

            <span className="ml-4 text-sm text-muted-foreground">
              {t('totalProjects', { count: pagination.total })}
            </span>
          </div>
        )}
      </main>

      {/* Create Project Modal - 简化版，只有名称和描述 */}
      <Dialog
        open={showCreateModal}
        onOpenChange={(open) => {
          setShowCreateModal(open)
          if (!open) setFormData({ name: '', description: '' })
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('createProject')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateProject} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium text-foreground">
                {t('projectName')} *
              </label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('projectNamePlaceholder')}
                maxLength={100}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium text-foreground">
                {t('projectDescription')}
              </label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('projectDescriptionPlaceholder')}
                rows={3}
                maxLength={500}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreateModal(false)
                  setFormData({ name: '', description: '' })
                }}
                disabled={createLoading}
              >
                {tc('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={createLoading || !formData.name.trim()}
              >
                {createLoading ? t('creating') : t('createProject')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Project Modal */}
      <Dialog
        open={showEditModal && !!editingProject}
        onOpenChange={(open) => {
          setShowEditModal(open)
          if (!open) {
            setEditingProject(null)
            setEditFormData({ name: '', description: '' })
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('editProject')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditProject} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="edit-name" className="text-sm font-medium text-foreground">
                {t('projectName')} *
              </label>
              <Input
                id="edit-name"
                type="text"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                placeholder={t('projectNamePlaceholder')}
                maxLength={100}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="edit-description" className="text-sm font-medium text-foreground">
                {t('projectDescription')}
              </label>
              <Textarea
                id="edit-description"
                value={editFormData.description}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                placeholder={t('projectDescriptionPlaceholder')}
                rows={3}
                maxLength={500}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowEditModal(false)
                  setEditingProject(null)
                  setEditFormData({ name: '', description: '' })
                }}
                disabled={createLoading}
              >
                {tc('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={createLoading || !editFormData.name.trim()}
              >
                {createLoading ? t('saving') : tc('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
