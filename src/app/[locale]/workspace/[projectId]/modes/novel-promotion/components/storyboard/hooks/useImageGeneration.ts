'use client'

import { useState, useCallback, useEffect } from 'react'
import { NovelPromotionStoryboard, Character, Location } from '@/types/project'
import { checkApiResponse } from '@/lib/error-handler'
import { usePanelCandidates } from './usePanelCandidates'
import { useRefreshProjectAssets } from '@/lib/query/hooks'

// 检查是否是请求中断错误
function isAbortError(err: any): boolean {
  return err?.name === 'AbortError' || err?.message === 'Failed to fetch'
}

// 候选图片数据类型
interface CandidateData {
  originalImageUrl: string | null
  candidates: string[]
  selectedIndex: number
}

// 选中资产类型
export interface SelectedAsset {
  id: string
  name: string
  type: 'character' | 'location'
  imageUrl: string | null
  appearanceId?: number
  appearanceName?: string
}

interface UseImageGenerationProps {
  projectId: string
  episodeId?: string
  localStoryboards: NovelPromotionStoryboard[]
  setLocalStoryboards: React.Dispatch<React.SetStateAction<NovelPromotionStoryboard[]>>
}

export function useImageGeneration({
  projectId,
  episodeId,
  localStoryboards,
  setLocalStoryboards
}: UseImageGenerationProps) {
  // 🔥 使用 React Query 刷新
  const onSilentRefresh = useRefreshProjectAssets(projectId)
  // 记录哪些片段正在重新生成 - 从数据库状态初始化
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(() => {
    const generatingSet = new Set<string>()
    localStoryboards.forEach(sb => {
      if (sb.generating) {
        generatingSet.add(sb.id)
      }
    })
    return generatingSet
  })

  // 单镜头重新生成状态 - 🔥 从generatingImage和candidateImages初始化
  const [regeneratingPanelIds, setRegeneratingPanelIds] = useState<Set<string>>(() => {
    const generatingSet = new Set<string>()
    localStoryboards.forEach(sb => {
      const panels = (sb as any).panels || []
      panels.forEach((p: any) => {
        // 检查generatingImage或candidateImages中有PENDING任务
        let hasPending = false
        if (p.candidateImages) {
          try {
            const candidates = JSON.parse(p.candidateImages)
            hasPending = candidates.some((c: string) => c.startsWith('PENDING:'))
          } catch { }
        }
        if (p.generatingImage || hasPending) {
          generatingSet.add(p.id)
        }
      })
    })
    return generatingSet
  })

  // 正在选择候选图片的 storyboard IDs
  const [selectingCandidateIds, setSelectingCandidateIds] = useState<Set<string>>(new Set())

  // 🔥 单镜头候选图片管理 - 使用提取的 hook
  const {
    panelCandidateIndex,
    setPanelCandidateIndex,
    getPanelCandidates,
    ensurePanelCandidatesInitialized, // 🔥 用于 useEffect 初始化
    selectPanelCandidateIndex,
    confirmPanelCandidate,
    cancelPanelCandidate: cancelPanelCandidateFromHook,
    hasPanelCandidates
  } = usePanelCandidates({
    projectId,
    episodeId,
    onConfirmed: (panelId, confirmedImageUrl) => {
      setLocalStoryboards(prev => prev.map(sb => {
        const panels = (sb as any).panels || []
        let changed = false
        const updatedPanels = panels.map((p: any) => {
          if (p.id !== panelId) return p
          changed = true
          return {
            ...p,
            imageUrl: confirmedImageUrl ?? p.imageUrl,
            candidateImages: null,
            generatingImage: false
          }
        })
        return changed ? { ...sb, panels: updatedPanels } : sb
      }))
    }
  })

  // 🔥 在 useEffect 中初始化候选图片状态，避免渲染时 setState
  useEffect(() => {
    localStoryboards.forEach(sb => {
      const panels = (sb as any).panels || []
      panels.forEach((panel: any) => {
        // 尝试初始化候选状态（如果有 candidateImages）
        ensurePanelCandidatesInitialized(panel)
      })
    })
  }, [localStoryboards, ensurePanelCandidatesInitialized])

  // 生成失败状态
  const [failedStoryboards, setFailedStoryboards] = useState<Map<string, string>>(new Map())
  const [failedPanels, setFailedPanels] = useState<Map<string, string>>(new Map())



  // 记录每个 storyboard 开始生成的时间（用于超时检测）
  const [generationStartTimes, setGenerationStartTimes] = useState<Map<string, number>>(() => {
    const startTimes = new Map<string, number>()
    const now = Date.now()
    localStoryboards.forEach(sb => {
      if (sb.generating) {
        startTimes.set(sb.id, now)
      }
    })
    return startTimes
  })

  // 图片编辑状态
  const [editingPanel, setEditingPanel] = useState<{ storyboardId: string; panelIndex: number } | null>(null)
  const [modifyingPanels, setModifyingPanels] = useState<Set<string>>(new Set())

  // 重新生成数量选择状态
  const [showCountDropdown, setShowCountDropdown] = useState<string | null>(null)

  // 下载状态
  const [isDownloadingImages, setIsDownloadingImages] = useState(false)

  // 大图预览状态
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  // 生成超时时间（10分钟）
  const GENERATION_TIMEOUT = 10 * 60 * 1000


  // 🔥 轮询已移至页面级 useTaskPolling hook 统一处理
  // Panel 和 Storyboard 状态更新通过 onSilentRefresh 回调获取


  // 重新生成单个镜头图片（支持自定义候选数量）
  // force: 强制重新生成，即使当前正在生成中（用于卡住时的强制重试）
  const regeneratePanelImage = useCallback(async (panelId: string, count: number = 1, force: boolean = false) => {
    console.log('[regeneratePanelImage] 🔥 函数被调用')
    console.log('[regeneratePanelImage] panelId:', panelId)
    console.log('[regeneratePanelImage] count:', count)
    console.log('[regeneratePanelImage] force:', force)
    console.log('[regeneratePanelImage] 当前 regeneratingPanelIds:', Array.from(regeneratingPanelIds))
    console.log('[regeneratePanelImage] panelId 是否在 regeneratingPanelIds 中:', regeneratingPanelIds.has(panelId))

    // 🔥 force=true 时跳过检查，允许强制重新生成
    if (!force && regeneratingPanelIds.has(panelId)) {
      console.log(`[regeneratePanelImage] ⚠️ panelId ${panelId} 已在生成中，跳过（使用 force=true 强制生成）`)
      return
    }

    console.log('[regeneratePanelImage] ✅ 通过检查，开始生成...')
    setRegeneratingPanelIds(prev => new Set(prev).add(panelId))
    setFailedPanels(prev => {
      const next = new Map(prev)
      next.delete(panelId)
      return next
    })

    try {
      console.log('[regeneratePanelImage] 📤 发送 API 请求...')
      const res = await fetch(`/api/novel-promotion/${projectId}/regenerate-panel-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ panelId, count })
      })

      console.log('[regeneratePanelImage] 📥 API 响应状态:', res.status)

      if (!res.ok) {
        const error = await res.json()
        console.error('[regeneratePanelImage] ❌ API 错误:', error)

        // 💰 余额不足特殊处理 - 直接显示在 panel 上
        if (res.status === 402) {
          throw new Error('💰 余额不足，请充值后继续使用')
        }

        // ⚠️ 敏感内容特殊处理
        if (res.status === 400 && error.error?.includes('敏感')) {
          throw new Error('⚠️ ' + (error.error || '提示词包含敏感内容'))
        }

        // ⏱️ 限流/配额超限特殊处理（429 或 code === RATE_LIMIT）
        if (res.status === 429 || error.code === 'RATE_LIMIT') {
          const retryAfter = error.retryAfter || 60
          throw new Error(`⏱️ API 配额超限，请等待 ${retryAfter} 秒后重试`)
        }

        // 其他错误
        const errorMsg = error.error || error.message || '重新生成失败'
        throw new Error(errorMsg)
      }

      const data = await res.json()
      console.log('[regeneratePanelImage] 📥 API 返回数据:', data)

      // 🔥 检测异步响应 - 保持生成状态，前端轮询会自动检测完成
      if (data.async) {
        console.log(`[regeneratePanelImage] 🔄 Panel ${panelId} 异步任务已提交，等待完成...`)
        // 刷新数据以获取最新的generatingImage状态
        if (onSilentRefresh) {
          await onSilentRefresh()
        }
        // 不移除 regeneratingPanelIds，由轮询机制检测完成后移除
        return
      }

      if (onSilentRefresh) {
        await onSilentRefresh()
      }

      selectPanelCandidateIndex(panelId, 0)

      // 同步任务完成，移除生成状态
      setRegeneratingPanelIds(prev => {
        const next = new Set(prev)
        next.delete(panelId)
        return next
      })
    } catch (err: any) {
      if (isAbortError(err)) return
      setFailedPanels(prev => {
        const next = new Map(prev)
        next.set(panelId, err.message || '重新生成失败')
        return next
      })
      // 出错时移除生成状态
      setRegeneratingPanelIds(prev => {
        const next = new Set(prev)
        next.delete(panelId)
        return next
      })
    }
  }, [projectId, onSilentRefresh, regeneratingPanelIds])

  // 逐个生成一个分镜组的所有镜头图片（使用单镜头API）- 只生成没有图片的
  const regenerateAllPanelsIndividually = useCallback(async (storyboardId: string) => {
    // 找到这个storyboard
    const storyboard = localStoryboards.find(sb => sb.id === storyboardId)
    if (!storyboard) return

    const panels = (storyboard as any).panels || []
    if (panels.length === 0) return

    // 过滤出没有图片且没有正在生成的镜头
    const panelsToGenerate = panels.filter((p: any) =>
      !p.imageUrl && !regeneratingPanelIds.has(p.id)
    )
    if (panelsToGenerate.length === 0) return

    // 并行生成所有镜头（每个调用单镜头API，生成候选图）
    await Promise.all(
      panelsToGenerate.map((panel: any) => regeneratePanelImage(panel.id))
    )
  }, [localStoryboards, regeneratingPanelIds, regeneratePanelImage])

  // 选择候选图片（镜头级）- 使用 hook 提供的 confirmPanelCandidate
  const selectPanelCandidate = confirmPanelCandidate

  // 取消候选选择（镜头级）- 使用 hook 提供的 cancelPanelCandidate
  const cancelPanelCandidate = cancelPanelCandidateFromHook

  // getPanelCandidates 由 hook 提供

  // 编辑/修图单个分镜
  const modifyPanelImage = useCallback(async (
    storyboardId: string,
    panelIndex: number,
    prompt: string,
    images: string[],
    assets: SelectedAsset[]
  ) => {
    // 从 storyboard 中获取 panelId，保持与 regeneratingPanelIds 一致的 key 策略
    const storyboard = localStoryboards.find(sb => sb.id === storyboardId)
    const panels = (storyboard as any)?.panels || []
    const panel = panels[panelIndex]
    const panelId = panel?.id

    if (!panelId) {
      console.error('[modifyPanelImage] Panel not found:', { storyboardId, panelIndex })
      alert('未找到镜头信息')
      return
    }

    setModifyingPanels(prev => new Set(prev).add(panelId))

    let isAsync = false  // 🔥 跟踪是否是异步任务

    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/modify-storyboard-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyboardId,
          panelIndex,
          modifyPrompt: prompt,
          extraImageUrls: images,
          selectedAssets: assets
        })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '修改失败')
      }
      const data = await res.json()

      // 🔥 检测异步响应 - 如果是异步任务，保持modifying状态，让轮询接管
      if (data.async) {
        console.log(`[Modify Panel] 异步任务已提交: ${panelId}`)
        isAsync = true  // 标记为异步
        return
      }

      if (data.imageUrl) {
        setLocalStoryboards(prev => prev.map(sb => {
          if (sb.id !== storyboardId) return sb
          const panels = (sb as any).panels || []
          const updatedPanels = panels.map((p: any, idx: number) =>
            idx === panelIndex ? { ...p, imageUrl: data.imageUrl } : p
          )
          return { ...sb, panels: updatedPanels }
        }))
      }
    } catch (err: any) {
      if (isAbortError(err)) {
        console.log('请求被中断（可能是页面刷新），后端仍在执行')
        return
      }
      alert('修改失败: ' + err.message)
    } finally {
      // 🔥 只在非异步情况下移除状态
      if (!isAsync) {
        setModifyingPanels(prev => {
          const next = new Set(prev)
          next.delete(panelId)
          return next
        })
      }
    }
  }, [projectId, localStoryboards, setLocalStoryboards])

  // 下载所有图片
  const downloadAllImages = useCallback(async () => {
    const episodeId = localStoryboards[0]?.episodeId
    if (!episodeId) {
      alert('没有找到剧集信息')
      return
    }

    setIsDownloadingImages(true)
    try {
      const response = await fetch(`/api/novel-promotion/${projectId}/download-images?episodeId=${episodeId}`)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '下载失败')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'images.zip'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error: any) {
      alert('下载失败: ' + error.message)
    } finally {
      setIsDownloadingImages(false)
    }
  }, [projectId, localStoryboards])

  // 清除错误状态
  const clearStoryboardError = useCallback(async (storyboardId: string) => {
    setFailedStoryboards(prev => {
      const next = new Map(prev)
      next.delete(storyboardId)
      return next
    })
    setLocalStoryboards(prev => prev.map(sb =>
      sb.id === storyboardId ? { ...sb, lastError: null } as any : sb
    ))
    try {
      await fetch(`/api/novel-promotion/${projectId}/storyboard`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyboardId, clearError: true })
      })
    } catch (e) {
      console.error('Failed to clear error:', e)
    }
  }, [projectId, setLocalStoryboards])

  const clearPanelError = useCallback(async (panelId: string) => {
    setFailedPanels(prev => {
      const next = new Map(prev)
      next.delete(panelId)
      return next
    })
    // 🔥 同时清除数据库中的 imageErrorMessage
    try {
      await fetch(`/api/novel-promotion/${projectId}/panel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ panelId, imageErrorMessage: null })
      })
    } catch (e) {
      console.error('[clearPanelError] 清除错误失败:', e)
    }
  }, [projectId])


  return {
    // 状态
    regeneratingIds,
    regeneratingPanelIds,
    selectingCandidateIds,
    panelCandidateIndex,
    setPanelCandidateIndex,
    failedStoryboards,
    failedPanels,
    editingPanel,
    setEditingPanel,
    modifyingPanels,
    showCountDropdown,
    setShowCountDropdown,
    isDownloadingImages,
    previewImage,
    setPreviewImage,
    // 操作
    regeneratePanelImage,
    regenerateAllPanelsIndividually,
    selectPanelCandidate,
    selectPanelCandidateIndex,  // 🆕 本地选择候选索引
    cancelPanelCandidate,
    getPanelCandidates,
    modifyPanelImage,
    downloadAllImages,
    clearStoryboardError,
    clearPanelError
  }
}




