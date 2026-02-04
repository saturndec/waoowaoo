'use client'

import { useState, useCallback, useRef } from 'react'
import { PanelEditData } from '../../PanelEditForm'
import { StoryboardPanel } from './useStoryboardState'
import { useRefreshProjectAssets } from '@/lib/query/hooks'

// 检查是否是请求中断错误（页面刷新/离开导致）
function isAbortError(err: any): boolean {
  return err?.name === 'AbortError' || err?.message === 'Failed to fetch'
}

interface UsePanelOperationsProps {
  projectId: string
  episodeId: string
  panelEditsRef: React.MutableRefObject<Record<string, PanelEditData>>
}

export function usePanelOperations({
  projectId,
  episodeId,
  panelEditsRef
}: UsePanelOperationsProps) {
  // 🔥 使用 React Query 刷新
  const onRefresh = useRefreshProjectAssets(projectId)

  // 保存状态
  const [savingPanels, setSavingPanels] = useState<Set<string>>(new Set())

  // 删除镜头状态
  const [deletingPanelIds, setDeletingPanelIds] = useState<Set<string>>(new Set())

  // 重新生成文字分镜状态
  const [regeneratingStoryboards, setRegeneratingStoryboards] = useState<Set<string>>(new Set())

  // 添加分镜组状态
  const [addingStoryboardGroup, setAddingStoryboardGroup] = useState(false)

  // 移动分镜组状态
  const [movingClipId, setMovingClipId] = useState<string | null>(null)

  // 插入分镜状态
  const [insertingAfterPanelId, setInsertingAfterPanelId] = useState<string | null>(null)

  // 防抖保存 timers
  const saveTimeouts = useRef<Record<string, NodeJS.Timeout>>({})

  // 统一的 Panel 保存函数
  // 支持两种调用方式:
  // 1. savePanel(storyboardId, panelId) - 从 panelEditsRef 获取数据
  // 2. savePanel(storyboardId, editData) - 直接使用传入的数据（用于避免ref同步问题）
  const savePanel = useCallback(async (storyboardId: string, panelIdOrData: string | PanelEditData) => {
    // 统一获取 editData
    const editData = typeof panelIdOrData === 'string'
      ? panelEditsRef.current[panelIdOrData]
      : panelIdOrData

    if (!editData || !editData.id) return

    const panelId = editData.id
    setSavingPanels(prev => new Set(prev).add(panelId))

    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/panel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyboardId,
          panelIndex: editData.panelIndex,
          id: editData.id,
          panelNumber: editData.panelNumber,
          shotType: editData.shotType,
          cameraMove: editData.cameraMove,
          description: editData.description,
          location: editData.location,
          characters: JSON.stringify(editData.characters),
          srtStart: editData.srtStart,
          srtEnd: editData.srtEnd,
          duration: editData.duration,
          videoPrompt: editData.videoPrompt
        })
      })

      if (!res.ok) {
        const error = await res.json()
        console.error('保存失败:', error)
      }
    } catch (err: any) {
      console.error('保存失败:', err)
    } finally {
      setSavingPanels(prev => {
        const next = new Set(prev)
        next.delete(panelId)
        return next
      })
    }
  }, [projectId, panelEditsRef])

  // 保持向后兼容的别名（将逐步废弃）
  const savePanelWithData = savePanel

  // 防抖保存 - 输入后 500ms 自动保存
  const debouncedSave = useCallback((panelId: string, storyboardId: string) => {
    if (saveTimeouts.current[panelId]) {
      clearTimeout(saveTimeouts.current[panelId])
    }
    saveTimeouts.current[panelId] = setTimeout(() => {
      savePanel(storyboardId, panelId)  // 注意：新参数顺序
    }, 500)
  }, [savePanel])

  // 新增分镜（镜头）
  const addPanel = useCallback(async (storyboardId: string) => {
    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/panel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyboardId,
          shotType: '中景',
          cameraMove: '固定',
          description: '新镜头描述',
          videoPrompt: '',
          characters: '[]'
        })
      })

      if (!res.ok) throw new Error('添加失败')
      await onRefresh()
    } catch (error: any) {
      console.error('添加分镜失败:', error)
      alert('添加分镜失败: ' + error.message)
    }
  }, [projectId, onRefresh])

  // 删除单个镜头
  const deletePanel = useCallback(async (panelId: string, storyboardId: string, setLocalStoryboards: any) => {
    if (!confirm('确定要删除这个镜头吗？删除后无法恢复。')) {
      return
    }

    setDeletingPanelIds(prev => new Set(prev).add(panelId))

    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/panel?panelId=${panelId}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '删除失败')
      }

      // 更新本地状态 - 移除已删除的panel
      setLocalStoryboards((prev: any[]) => prev.map(sb => {
        if (sb.id !== storyboardId) return sb
        const panels = (sb as any).panels || []
        const updatedPanels = panels.filter((p: any) => p.id !== panelId)
        return { ...sb, panels: updatedPanels }
      }))

    } catch (err: any) {
      if (isAbortError(err)) {
        console.log('请求被中断（可能是页面刷新），后端仍在执行')
        return
      }
      alert('删除失败: ' + err.message)
    } finally {
      setDeletingPanelIds(prev => {
        const next = new Set(prev)
        next.delete(panelId)
        return next
      })
    }
  }, [projectId])

  // 删除整组分镜
  const deleteStoryboard = useCallback(async (storyboardId: string, panelCount: number) => {
    if (!confirm(`确定要删除这整组分镜吗？\n\n这将删除该片段下的所有 ${panelCount} 个镜头，此操作不可撤销！`)) {
      return
    }

    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/storyboard-group?storyboardId=${storyboardId}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '删除失败')
      }

      await onRefresh()
    } catch (error: any) {
      console.error('删除分镜组失败:', error)
      alert('删除分镜组失败: ' + error.message)
    }
  }, [projectId, onRefresh])

  // 重新生成单个片段的文字分镜（异步模式）
  const regenerateStoryboardText = useCallback(async (storyboardId: string) => {
    if (regeneratingStoryboards.has(storyboardId)) return

    setRegeneratingStoryboards(prev => new Set(prev).add(storyboardId))

    try {
      // 提交异步任务
      const res = await fetch(`/api/novel-promotion/${projectId}/regenerate-storyboard-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyboardId, async: true })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || error.details || '提交任务失败')
      }

      const taskData = await res.json()
      if (!taskData.async || !taskData.taskId) {
        throw new Error('未能获取异步任务ID')
      }

      // 轮询等待完成（无时间限制）
      while (true) {
        await new Promise(resolve => setTimeout(resolve, 2000)) // 每2秒轮询

        const pollRes = await fetch(`/api/novel-promotion/${projectId}/poll-task?taskId=${taskData.taskId}`)
        if (!pollRes.ok) continue

        const pollData = await pollRes.json()

        if (pollData.status === 'completed') {
          console.log('[重新生成分镜] 任务完成')
          break
        } else if (pollData.status === 'failed') {
          throw new Error(pollData.error || '重新生成分镜失败')
        }
      }

      await onRefresh()
    } catch (error: any) {
      if (isAbortError(error)) {
        console.log('请求被中断（可能是页面刷新），后端仍在执行')
        return
      }
      console.error('重新生成分镜失败:', error)
      alert('重新生成分镜失败: ' + error.message)
    } finally {
      setRegeneratingStoryboards(prev => {
        const next = new Set(prev)
        next.delete(storyboardId)
        return next
      })
    }
  }, [projectId, onRefresh, regeneratingStoryboards])

  // 添加新分镜组
  const addStoryboardGroup = useCallback(async (insertIndex: number) => {
    if (addingStoryboardGroup) return

    setAddingStoryboardGroup(true)
    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/storyboard-group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId, insertIndex })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '添加失败')
      }

      await onRefresh()
    } catch (error: any) {
      console.error('添加分镜组失败:', error)
      alert('添加分镜组失败: ' + error.message)
    } finally {
      setAddingStoryboardGroup(false)
    }
  }, [projectId, episodeId, onRefresh, addingStoryboardGroup])

  // 移动分镜组（上移/下移）
  const moveStoryboardGroup = useCallback(async (clipId: string, direction: 'up' | 'down') => {
    if (movingClipId) return

    setMovingClipId(clipId)
    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/storyboard-group`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId, clipId, direction })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '移动失败')
      }

      await onRefresh()
    } catch (error: any) {
      console.error('移动分镜组失败:', error)
      alert('移动分镜组失败: ' + error.message)
    } finally {
      setMovingClipId(null)
    }
  }, [projectId, episodeId, onRefresh, movingClipId])

  // 添加角色到panel
  const addCharacterToPanel = useCallback((
    panel: StoryboardPanel,
    charName: string,
    appearance: string,
    storyboardId: string,
    getPanelEditData: (panel: StoryboardPanel) => PanelEditData,
    updatePanelEdit: (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => void
  ) => {
    const currentData = getPanelEditData(panel)

    const exists = currentData.characters.some(c => c.name === charName && c.appearance === appearance)
    if (exists) return

    const newCharacters = [...currentData.characters, { name: charName, appearance }]
    updatePanelEdit(panel.id, panel, { characters: newCharacters })
    debouncedSave(panel.id, storyboardId)
  }, [debouncedSave])

  // 移除角色
  const removeCharacterFromPanel = useCallback((
    panel: StoryboardPanel,
    index: number,
    storyboardId: string,
    getPanelEditData: (panel: StoryboardPanel) => PanelEditData,
    updatePanelEdit: (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => void
  ) => {
    const currentData = getPanelEditData(panel)

    const newCharacters = currentData.characters.filter((_, i) => i !== index)
    updatePanelEdit(panel.id, panel, { characters: newCharacters })
    debouncedSave(panel.id, storyboardId)
  }, [debouncedSave])

  // 设置场景
  const setPanelLocation = useCallback((
    panel: StoryboardPanel,
    locationName: string | null,
    storyboardId: string,
    updatePanelEdit: (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => void
  ) => {
    updatePanelEdit(panel.id, panel, { location: locationName })
    debouncedSave(panel.id, storyboardId)
  }, [debouncedSave])

  // 插入分镜（AI 生成 - 异步任务，乐观更新）
  const insertPanel = useCallback(async (storyboardId: string, insertAfterPanelId: string, userInput: string) => {
    if (insertingAfterPanelId) return

    setInsertingAfterPanelId(insertAfterPanelId)
    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/insert-panel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyboardId, insertAfterPanelId, userInput })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || error.details || '插入分镜失败')
      }

      const data = await res.json()

      // 乐观更新：立即关闭弹窗，后台继续执行
      // 占位panel已创建，立即刷新显示
      if (data.async && data.taskId) {
        console.log(`[Insert Panel] 占位分镜已创建: #${data.panelNumber}，后台生成内容...`)

        // 立即关闭弹窗
        setInsertingAfterPanelId(null)

        // 立即刷新数据（用户看到占位分镜）
        await onRefresh()

          // 后台轮询，等待AI内容填充完成后再刷新
          ; (async () => {
            const pollInterval = 3000
            const maxAttempts = 40
            let attempts = 0

            while (attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, pollInterval))
              attempts++

              try {
                const statusRes = await fetch(`/api/novel-promotion/${projectId}/poll-tasks?taskIds=${data.taskId}`)
                if (!statusRes.ok) continue

                const statusData = await statusRes.json()
                const task = statusData.tasks?.find((t: any) => t.id === data.taskId)

                if (!task) continue

                if (task.status === 'completed') {
                  console.log(`[Insert Panel] AI内容+图片生成完成，刷新数据`)
                  await onRefresh()
                  return
                } else if (task.status === 'failed') {
                  console.error(`[Insert Panel] 任务失败: ${task.error}`)
                  await onRefresh()  // 刷新显示失败状态
                  return
                }
              } catch {
                // 网络错误，继续重试
              }
            }

            // 超时后也刷新一次
            await onRefresh()
          })()

        return // 不再阻塞
      }

      // 同步模式（兼容旧逻辑）
      await onRefresh()
    } catch (error: any) {
      if (isAbortError(error)) {
        console.log('请求被中断（可能是页面刷新）')
        return
      }
      console.error('插入分镜失败:', error)
      alert('插入分镜失败: ' + error.message)
      setInsertingAfterPanelId(null)
    }
  }, [projectId, onRefresh, insertingAfterPanelId])

  return {
    // 状态
    savingPanels,
    deletingPanelIds,
    regeneratingStoryboards,
    addingStoryboardGroup,
    movingClipId,
    insertingAfterPanelId,
    // 操作
    savePanel,
    savePanelWithData,
    debouncedSave,
    addPanel,
    deletePanel,
    deleteStoryboard,
    regenerateStoryboardText,
    addStoryboardGroup,
    moveStoryboardGroup,
    addCharacterToPanel,
    removeCharacterFromPanel,
    setPanelLocation,
    insertPanel
  }
}






