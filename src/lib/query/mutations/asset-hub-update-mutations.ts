import { useMutation, useQueryClient } from '@tanstack/react-query'
import { resolveTaskResponse } from '@/lib/task/client'
import {
  getPageLocale,
  requestJsonWithError,
  requestTaskResponseWithError,
} from './mutation-shared'
import {
  invalidateGlobalCharacters,
  invalidateGlobalLocations,
} from './asset-hub-mutations-shared'

export function useUpdateCharacterName() {
  const queryClient = useQueryClient()
  const invalidateCharacters = () => invalidateGlobalCharacters(queryClient)

  return useMutation({
    mutationFn: async ({ characterId, name }: { characterId: string; name: string }) => {
      const res = await requestJsonWithError(`/api/asset-hub/characters/${characterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }, 'Failed to update character name')

      // 等待图片标签更新完成，确保 onSuccess invalidate 后前端能立即看到新标签
      try {
        await fetch('/api/asset-hub/update-asset-label', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-App-Locale': getPageLocale() },
          body: JSON.stringify({ type: 'character', id: characterId, newName: name }),
        })
      } catch (e) {
        console.error('更新图片标签失败:', e)
      }

      return res
    },
    onSuccess: invalidateCharacters,
  })
}

export function useUpdateLocationName() {
  const queryClient = useQueryClient()
  const invalidateLocations = () => invalidateGlobalLocations(queryClient)

  return useMutation({
    mutationFn: async ({ locationId, name }: { locationId: string; name: string }) => {
      const res = await requestJsonWithError(`/api/asset-hub/locations/${locationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }, 'Failed to update location name')

      // 等待图片标签更新完成，确保 onSuccess invalidate 后前端能立即看到新标签
      try {
        await fetch('/api/asset-hub/update-asset-label', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-App-Locale': getPageLocale() },
          body: JSON.stringify({ type: 'location', id: locationId, newName: name }),
        })
      } catch (e) {
        console.error('更新图片标签失败:', e)
      }

      return res
    },
    onSuccess: invalidateLocations,
  })
}

export function useUpdateCharacterAppearanceDescription() {
  const queryClient = useQueryClient()
  const invalidateCharacters = () => invalidateGlobalCharacters(queryClient)

  return useMutation({
    mutationFn: async ({
      characterId,
      appearanceIndex,
      description,
    }: {
      characterId: string
      appearanceIndex: number
      description: string
    }) => {
      return await requestJsonWithError('/api/asset-hub/appearances', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, appearanceIndex, description }),
      }, 'Failed to update appearance description')
    },
    onSuccess: invalidateCharacters,
  })
}

export function useUpdateLocationSummary() {
  const queryClient = useQueryClient()
  const invalidateLocations = () => invalidateGlobalLocations(queryClient)

  return useMutation({
    mutationFn: async ({
      locationId,
      summary,
    }: {
      locationId: string
      summary: string
    }) => {
      return await requestJsonWithError(`/api/asset-hub/locations/${locationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
      }, 'Failed to update location summary')
    },
    onSuccess: invalidateLocations,
  })
}

export function useAiModifyCharacterDescription() {
  return useMutation({
    mutationFn: async ({
      characterId,
      appearanceIndex,
      currentDescription,
      modifyInstruction,
    }: {
      characterId: string
      appearanceIndex: number
      currentDescription: string
      modifyInstruction: string
    }) => {
      const response = await requestTaskResponseWithError(
        '/api/asset-hub/ai-modify-character',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterId,
            appearanceIndex,
            currentDescription,
            modifyInstruction,
          }),
        },
        'Failed to modify character description',
      )
      return resolveTaskResponse<{ modifiedDescription?: string }>(response)
    },
  })
}

export function useAiModifyLocationDescription() {
  return useMutation({
    mutationFn: async ({
      locationId,
      imageIndex,
      currentDescription,
      modifyInstruction,
    }: {
      locationId: string
      imageIndex: number
      currentDescription: string
      modifyInstruction: string
    }) => {
      const response = await requestTaskResponseWithError(
        '/api/asset-hub/ai-modify-location',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locationId,
            imageIndex,
            currentDescription,
            modifyInstruction,
          }),
        },
        'Failed to modify location description',
      )
      return resolveTaskResponse<{ modifiedDescription?: string }>(response)
    },
  })
}
