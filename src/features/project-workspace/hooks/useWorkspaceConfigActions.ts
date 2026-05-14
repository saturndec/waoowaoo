'use client'

import { logError as _ulogError } from '@/lib/logging/core'
import { useCallback } from 'react'
import {
  useGetProjectStoryboardStats,
  useUpdateProjectConfig,
  useUpdateProjectEpisodeField,
} from '@/lib/query/hooks'

interface UseWorkspaceConfigActionsParams {
  projectId: string
  episodeId?: string
}

export function useWorkspaceConfigActions({
  projectId,
  episodeId,
}: UseWorkspaceConfigActionsParams) {
  const { mutateAsync: updateProjectConfig } = useUpdateProjectConfig(projectId)
  const { mutateAsync: updateProjectEpisode } = useUpdateProjectEpisodeField(projectId)
  const { mutateAsync: getProjectStoryboardStatsMutation } = useGetProjectStoryboardStats(projectId)

  const handleUpdateConfig = useCallback(async (key: string, value: unknown) => {
    try {
      await updateProjectConfig({ key, value })
    } catch (error: unknown) {
      _ulogError('Update config error:', error)
    }
  }, [updateProjectConfig])

  const handleUpdateEpisode = useCallback(async (key: string, value: unknown) => {
    if (!episodeId) {
      _ulogError('No episode selected')
      return
    }

    try {
      await updateProjectEpisode({ episodeId, key, value })
    } catch (error: unknown) {
      _ulogError('Update episode error:', error)
    }
  }, [episodeId, updateProjectEpisode])

  const getProjectStoryboardStats = useCallback(async (targetEpisodeId: string) => {
    return getProjectStoryboardStatsMutation({ episodeId: targetEpisodeId })
  }, [getProjectStoryboardStatsMutation])

  return {
    handleUpdateConfig,
    handleUpdateEpisode,
    getProjectStoryboardStats,
  }
}
