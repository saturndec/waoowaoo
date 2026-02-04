import { useState, useCallback } from 'react'
import { Project } from '@/types/project'

/**
 * 刷新范围
 * - all: 刷新项目数据 + 资产数据
 * - project: 只刷新项目数据
 * - assets: 只刷新资产数据
 */
export type RefreshScope = 'all' | 'project' | 'assets'

/**
 * 刷新模式
 * - full: 显示 loading 状态
 * - silent: 静默刷新，不显示 loading
 */
export type RefreshMode = 'full' | 'silent'

/**
 * 刷新选项
 */
export interface RefreshOptions {
  scope?: RefreshScope    // 默认 'all'
  mode?: RefreshMode      // 默认 'silent'
}

/**
 * 通用项目数据管理Hook
 * 
 * 🔥 V2: 统一刷新架构
 * - 单一 refresh(options) 函数，替代原有的 loadProject/loadAssets/silentRefresh/silentRefreshAssets
 * - 通过 scope 和 mode 参数控制刷新行为
 * - 消除刷新行为不一致问题
 */
export function useProject(projectId: string) {
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assetsLoaded, setAssetsLoaded] = useState(false)
  const [assetsLoading, setAssetsLoading] = useState(false)

  /**
   * 🔥 统一刷新函数
   * 
   * @param options.scope - 刷新范围：'all' | 'project' | 'assets'，默认 'all'
   * @param options.mode - 刷新模式：'full' | 'silent'，默认 'silent'
   * 
   * 调用示例：
   * - refresh()                        → 静默刷新全部（最常用）
   * - refresh({ scope: 'assets' })     → 只刷新资产
   * - refresh({ scope: 'project' })    → 只刷新项目（不刷资产）
   * - refresh({ mode: 'full' })        → 完整刷新带 loading
   */
  const refresh = useCallback(async (options: RefreshOptions = {}) => {
    const { scope = 'all', mode = 'silent' } = options

    // 完整刷新模式：显示 loading
    if (mode === 'full') {
      setLoading(true)
      setError(null)
    }

    // 资产刷新时显示 assetsLoading
    if (scope === 'assets') {
      setAssetsLoading(true)
    }

    try {
      // 刷新项目数据
      if (scope === 'all' || scope === 'project') {
        const res = await fetch(`/api/projects/${projectId}/data`)
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.error || 'Failed to load project')
        }
        const data = await res.json()
        setProject(data.project)

        // 完整刷新时重置资产加载状态
        if (mode === 'full') {
          setAssetsLoaded(false)
        }
      }

      // 刷新资产数据
      if (scope === 'all' || scope === 'assets') {
        const res = await fetch(`/api/projects/${projectId}/assets`)
        if (res.ok) {
          const assets = await res.json()
          setProject(prev => {
            if (!prev?.novelPromotionData) return prev
            return {
              ...prev,
              novelPromotionData: {
                ...prev.novelPromotionData,
                characters: assets.characters || [],
                locations: assets.locations || []
              }
            }
          })
          setAssetsLoaded(true)
        }
      }
    } catch (err: any) {
      console.error('Refresh error:', err)
      if (mode === 'full') {
        setError(err.message)
      }
      // 静默刷新不设置错误状态，避免干扰用户
    } finally {
      if (mode === 'full') {
        setLoading(false)
      }
      if (scope === 'assets') {
        setAssetsLoading(false)
      }
    }
  }, [projectId])

  /**
   * 更新项目数据（乐观更新）
   */
  const updateProject = useCallback((updates: Partial<Project>) => {
    setProject(prev => prev ? { ...prev, ...updates } : null)
  }, [])

  return {
    // 状态
    project,
    loading,
    error,
    assetsLoaded,
    assetsLoading,

    // 🔥 统一刷新函数
    refresh,

    // 乐观更新
    updateProject
  }
}
