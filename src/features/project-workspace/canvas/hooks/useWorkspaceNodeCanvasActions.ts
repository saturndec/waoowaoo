'use client'

import { useCallback } from 'react'
import { useWorkspaceRuntime } from '../../WorkspaceRuntimeContext'
import type { WorkspaceCanvasNodeAction } from '../node-canvas-types'

export function useWorkspaceNodeCanvasActions() {
  const runtime = useWorkspaceRuntime()

  return useCallback((action: WorkspaceCanvasNodeAction) => {
    if (action.type === 'update_story') {
      void runtime.onNovelTextChange(action.value)
      return
    }

    if (action.type === 'update_clip') {
      void runtime.onClipUpdate(action.clipId, action.data)
      return
    }

    if (action.type === 'open_asset_library') {
      runtime.onOpenAssetLibraryForCharacter(action.characterId ?? null)
      return
    }

    if (action.type === 'generate_script') {
      void runtime.onRequestAssistantPlan()
      return
    }

    if (action.type === 'generate_storyboard') {
      void runtime.onRequestAssistantPlan()
      return
    }

    if (action.type === 'update_panel') {
      throw new Error('update_panel must be handled by the canvas detail command bridge')
    }

    if (action.type === 'delete_panel') {
      throw new Error('delete_panel must be handled by the canvas detail command bridge')
    }

    if (action.type === 'copy_panel') {
      throw new Error('copy_panel must be handled by the canvas detail command bridge')
    }

    if (action.type === 'insert_panel') {
      throw new Error('insert_panel must be handled by the canvas detail command bridge')
    }

    if (action.type === 'create_panel_variant') {
      throw new Error('create_panel_variant must be handled by the canvas detail command bridge')
    }

    if (action.type === 'generate_image') {
      void runtime.onGeneratePanelImage(action.panelId)
      return
    }

    if (action.type === 'select_candidate') {
      throw new Error('select_candidate must be handled by the canvas detail command bridge')
    }

    if (action.type === 'cancel_candidate') {
      throw new Error('cancel_candidate must be handled by the canvas detail command bridge')
    }

    if (action.type === 'modify_image') {
      throw new Error('modify_image must be handled by the canvas detail command bridge')
    }

    if (action.type === 'download_images') {
      throw new Error('download_images must be handled by the canvas detail command bridge')
    }

    if (action.type === 'generate_video') {
      void runtime.onGenerateVideo(
        action.storyboardId,
        action.panelIndex,
        action.videoModel,
        action.firstLastFrame,
        action.generationOptions,
        action.panelId,
      )
      return
    }

    if (action.type === 'update_video_prompt') {
      void runtime.onUpdateVideoPrompt(action.storyboardId, action.panelIndex, action.value, action.field)
      return
    }

    if (action.type === 'update_panel_video_model') {
      void runtime.onUpdatePanelVideoModel(action.storyboardId, action.panelIndex, action.model)
      return
    }

    if (action.type === 'toggle_panel_link') {
      throw new Error('toggle_panel_link must be handled by the canvas detail command bridge')
    }

    if (action.type === 'generate_all_videos') {
      void runtime.onGenerateAllVideos({
        videoModel: action.videoModel ?? '',
        generationOptions: action.generationOptions,
      })
      return
    }

    if (action.type === 'render_final_video') {
      void runtime.onRenderFinalVideo()
      return
    }

    if (action.type === 'generate_edit_assets') {
      void runtime.onGenerateEditAssets(action.editScriptId)
      return
    }

    if (action.type === 'generate_edit_asset') {
      void runtime.onGenerateEditAssets(action.editScriptId, action.requirementId)
      return
    }

    if (action.type === 'generate_edit_storyboard') {
      void runtime.onGenerateEditStoryboard(action.editScriptId)
    }
  }, [runtime])
}
