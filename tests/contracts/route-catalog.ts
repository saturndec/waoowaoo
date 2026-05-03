export type RouteCategory =
  | 'assets'
  | 'asset-hub'
  | 'projects'
  | 'tasks'
  | 'user'
  | 'auth'
  | 'infra'
  | 'system'

export type RouteContractGroup =
  | 'llm-observe-routes'
  | 'direct-submit-routes'
  | 'crud-assets-routes'
  | 'crud-asset-hub-routes'
  | 'task-infra-routes'
  | 'user-project-routes'
  | 'auth-routes'
  | 'infra-routes'

export type RouteCatalogEntry = {
  routeFile: string
  category: RouteCategory
  contractGroup: RouteContractGroup
}

const ROUTE_FILES = [
  'src/app/api/admin/download-logs/route.ts',
  'src/app/api/asset-hub/ai-design-character/route.ts',
  'src/app/api/asset-hub/ai-design-location/route.ts',
  'src/app/api/asset-hub/ai-modify-character/route.ts',
  'src/app/api/asset-hub/ai-modify-location/route.ts',
  'src/app/api/asset-hub/ai-modify-prop/route.ts',
  'src/app/api/asset-hub/appearances/route.ts',
  'src/app/api/asset-hub/character-voice/route.ts',
  'src/app/api/asset-hub/characters/[characterId]/appearances/[appearanceIndex]/route.ts',
  'src/app/api/asset-hub/characters/[characterId]/route.ts',
  'src/app/api/asset-hub/characters/route.ts',
  'src/app/api/asset-hub/folders/[folderId]/route.ts',
  'src/app/api/asset-hub/folders/route.ts',
  'src/app/api/asset-hub/locations/[locationId]/route.ts',
  'src/app/api/asset-hub/locations/route.ts',
  'src/app/api/asset-hub/picker/route.ts',
  'src/app/api/asset-hub/reference-to-character/route.ts',
  'src/app/api/asset-hub/upload-image/route.ts',
  'src/app/api/asset-hub/upload-temp/route.ts',
  'src/app/api/asset-hub/voice-design/route.ts',
  'src/app/api/asset-hub/voices/[id]/route.ts',
  'src/app/api/asset-hub/voices/route.ts',
  'src/app/api/asset-hub/voices/upload/route.ts',
  'src/app/api/assets/[assetId]/copy/route.ts',
  'src/app/api/assets/[assetId]/generate/route.ts',
  'src/app/api/assets/[assetId]/modify-render/route.ts',
  'src/app/api/assets/[assetId]/revert-render/route.ts',
  'src/app/api/assets/[assetId]/route.ts',
  'src/app/api/assets/[assetId]/select-render/route.ts',
  'src/app/api/assets/[assetId]/variants/[variantId]/route.ts',
  'src/app/api/assets/route.ts',
  'src/app/api/auth/[...nextauth]/route.ts',
  'src/app/api/auth/register/route.ts',
  'src/app/api/cos/image/route.ts',
  'src/app/api/files/[...path]/route.ts',
  'src/app/api/mutation-batches/[batchId]/revert/route.ts',
  'src/app/api/storage/sign/route.ts',
  'src/app/api/projects/[projectId]/ai-create-character/route.ts',
  'src/app/api/projects/[projectId]/ai-create-location/route.ts',
  'src/app/api/projects/[projectId]/ai-modify-appearance/route.ts',
  'src/app/api/projects/[projectId]/ai-modify-location/route.ts',
  'src/app/api/projects/[projectId]/ai-modify-prop/route.ts',
  'src/app/api/projects/[projectId]/ai-modify-shot-prompt/route.ts',
  'src/app/api/projects/[projectId]/analyze-global/route.ts',
  'src/app/api/projects/[projectId]/analyze-shot-variants/route.ts',
  'src/app/api/projects/[projectId]/analyze/route.ts',
  'src/app/api/projects/[projectId]/assets/route.ts',
  'src/app/api/projects/[projectId]/canvas-layout/route.ts',
  'src/app/api/projects/[projectId]/character-voice/route.ts',
  'src/app/api/projects/[projectId]/character/appearance/route.ts',
  'src/app/api/projects/[projectId]/character/confirm-selection/route.ts',
  'src/app/api/projects/[projectId]/character/route.ts',
  'src/app/api/projects/[projectId]/cleanup-unselected-images/route.ts',
  'src/app/api/projects/[projectId]/clips/[clipId]/route.ts',
  'src/app/api/projects/[projectId]/clips/route.ts',
  'src/app/api/projects/[projectId]/copy-from-global/route.ts',
  'src/app/api/projects/[projectId]/download-images/route.ts',
  'src/app/api/projects/[projectId]/download-videos/route.ts',
  'src/app/api/projects/[projectId]/download-voices/route.ts',
  'src/app/api/projects/[projectId]/editor/route.ts',
  'src/app/api/projects/[projectId]/episodes/[episodeId]/route.ts',
  'src/app/api/projects/[projectId]/episodes/batch/route.ts',
  'src/app/api/projects/[projectId]/episodes/route.ts',
  'src/app/api/projects/[projectId]/episodes/split-by-markers/route.ts',
  'src/app/api/projects/[projectId]/episodes/split/route.ts',
  'src/app/api/projects/[projectId]/generate-character-image/route.ts',
  'src/app/api/projects/[projectId]/generate-image/route.ts',
  'src/app/api/projects/[projectId]/generate-music/route.ts',
  'src/app/api/projects/[projectId]/generate-video/route.ts',
  'src/app/api/projects/[projectId]/insert-panel/route.ts',
  'src/app/api/projects/[projectId]/lip-sync/route.ts',
  'src/app/api/projects/[projectId]/location/confirm-selection/route.ts',
  'src/app/api/projects/[projectId]/location/route.ts',
  'src/app/api/projects/[projectId]/modify-asset-image/route.ts',
  'src/app/api/projects/[projectId]/modify-storyboard-image/route.ts',
  'src/app/api/projects/[projectId]/panel-link/route.ts',
  'src/app/api/projects/[projectId]/panel-variant/route.ts',
  'src/app/api/projects/[projectId]/panel/copy/route.ts',
  'src/app/api/projects/[projectId]/panel/route.ts',
  'src/app/api/projects/[projectId]/panel/revert-image/route.ts',
  'src/app/api/projects/[projectId]/panel/select-candidate/route.ts',
  'src/app/api/projects/[projectId]/photography-plan/route.ts',
  'src/app/api/projects/[projectId]/reference-to-character/route.ts',
  'src/app/api/projects/[projectId]/regenerate-group/route.ts',
  'src/app/api/projects/[projectId]/regenerate-panel-image/route.ts',
  'src/app/api/projects/[projectId]/regenerate-single-image/route.ts',
  'src/app/api/projects/[projectId]/regenerate-storyboard-text/route.ts',
  'src/app/api/projects/[projectId]/config/route.ts',
  'src/app/api/projects/[projectId]/screenplay-conversion/route.ts',
  'src/app/api/projects/[projectId]/select-character-image/route.ts',
  'src/app/api/projects/[projectId]/select-location-image/route.ts',
  'src/app/api/projects/[projectId]/speaker-voice/route.ts',
  'src/app/api/projects/[projectId]/storyboard-group/copy/route.ts',
  'src/app/api/projects/[projectId]/storyboard-group/route.ts',
  'src/app/api/projects/[projectId]/storyboards/route.ts',
  'src/app/api/projects/[projectId]/undo-regenerate/route.ts',
  'src/app/api/projects/[projectId]/update-appearance/route.ts',
  'src/app/api/projects/[projectId]/update-location/route.ts',
  'src/app/api/projects/[projectId]/update-prompt/route.ts',
  'src/app/api/projects/[projectId]/upload-asset-image/route.ts',
  'src/app/api/projects/[projectId]/video-proxy/route.ts',
  'src/app/api/projects/[projectId]/video-urls/route.ts',
  'src/app/api/projects/[projectId]/voice-analyze/route.ts',
  'src/app/api/projects/[projectId]/voice-design/route.ts',
  'src/app/api/projects/[projectId]/voice-generate/route.ts',
  'src/app/api/projects/[projectId]/voice-lines/route.ts',
  'src/app/api/projects/[projectId]/assets/route.ts',
  'src/app/api/projects/[projectId]/assistant/chat/route.ts',
  'src/app/api/projects/[projectId]/assistant/chat/log/route.ts',
  'src/app/api/projects/[projectId]/assistant/confirm-operation/route.ts',
  'src/app/api/projects/[projectId]/commands/[commandId]/route.ts',
  'src/app/api/projects/[projectId]/commands/route.ts',
  'src/app/api/projects/[projectId]/context/route.ts',
  'src/app/api/projects/[projectId]/costs/route.ts',
  'src/app/api/projects/[projectId]/data/route.ts',
  'src/app/api/projects/[projectId]/plans/[planId]/approve/route.ts',
  'src/app/api/projects/[projectId]/plans/[planId]/reject/route.ts',
  'src/app/api/projects/[projectId]/route.ts',
  'src/app/api/projects/route.ts',
  'src/app/api/plan-runs/[planRunId]/cancel/route.ts',
  'src/app/api/plan-runs/[planRunId]/events/route.ts',
  'src/app/api/plan-runs/[planRunId]/route.ts',
  'src/app/api/plan-runs/[planRunId]/steps/[stepKey]/retry/route.ts',
  'src/app/api/plan-runs/route.ts',
  'src/app/api/sse/route.ts',
  'src/app/api/system/boot-id/route.ts',
  'src/app/api/task-target-states/route.ts',
  'src/app/api/tasks/[taskId]/route.ts',
  'src/app/api/tasks/dismiss/route.ts',
  'src/app/api/tasks/route.ts',
  'src/app/api/user-preference/route.ts',
  'src/app/api/user/api-config/route.ts',
  'src/app/api/user/api-config/probe-model-llm-protocol/route.ts',
  'src/app/api/user/api-config/test-connection/route.ts',
  'src/app/api/user/api-config/test-provider/route.ts',
  'src/app/api/user/balance/route.ts',
  'src/app/api/user/costs/details/route.ts',
  'src/app/api/user/costs/route.ts',
  'src/app/api/user/ai-story-expand/route.ts',
  'src/app/api/user/models/route.ts',
  'src/app/api/user/style-presets/[presetId]/route.ts',
  'src/app/api/user/style-presets/design/route.ts',
  'src/app/api/user/style-presets/route.ts',
  'src/app/api/user/transactions/route.ts',
] as const

function resolveCategory(routeFile: string): RouteCategory {
  if (routeFile.startsWith('src/app/api/assets/')) return 'assets'
  if (routeFile.startsWith('src/app/api/asset-hub/')) return 'asset-hub'
  if (routeFile.startsWith('src/app/api/projects/')) return 'projects'
  if (
    routeFile.startsWith('src/app/api/tasks/')
    || routeFile.startsWith('src/app/api/plan-runs/')
    || routeFile === 'src/app/api/task-target-states/route.ts'
  ) {
    return 'tasks'
  }
  if (routeFile.startsWith('src/app/api/user/') || routeFile === 'src/app/api/user-preference/route.ts') return 'user'
  if (routeFile.startsWith('src/app/api/auth/')) return 'auth'
  if (routeFile.startsWith('src/app/api/system/')) return 'system'
  return 'infra'
}

function resolveContractGroup(routeFile: string): RouteContractGroup {
  if (
    routeFile.includes('/ai-')
    || routeFile.includes('/analyze')
    || routeFile.includes('/screenplay-conversion/')
    || routeFile.includes('/reference-to-character/')
    || routeFile.endsWith('/clips/route.ts')
    || routeFile.endsWith('/episodes/split/route.ts')
    || routeFile.endsWith('/voice-analyze/route.ts')
  ) {
    return 'llm-observe-routes'
  }
  if (
    routeFile.endsWith('/generate-image/route.ts')
    || routeFile.endsWith('/generate-music/route.ts')
    || routeFile.endsWith('/generate-video/route.ts')
    || routeFile.endsWith('/generate/route.ts')
    || routeFile.endsWith('/modify-image/route.ts')
    || routeFile.endsWith('/modify-render/route.ts')
    || routeFile.endsWith('/voice-design/route.ts')
    || routeFile.endsWith('/insert-panel/route.ts')
    || routeFile.endsWith('/lip-sync/route.ts')
    || routeFile.endsWith('/modify-asset-image/route.ts')
    || routeFile.endsWith('/modify-storyboard-image/route.ts')
    || routeFile.endsWith('/panel-variant/route.ts')
    || routeFile.endsWith('/regenerate-group/route.ts')
    || routeFile.endsWith('/regenerate-panel-image/route.ts')
    || routeFile.endsWith('/regenerate-single-image/route.ts')
    || routeFile.endsWith('/regenerate-storyboard-text/route.ts')
    || routeFile.endsWith('/voice-generate/route.ts')
  ) {
    return 'direct-submit-routes'
  }
  if (routeFile.startsWith('src/app/api/assets/')) return 'crud-assets-routes'
  if (routeFile.startsWith('src/app/api/asset-hub/')) return 'crud-asset-hub-routes'
  if (
    routeFile.startsWith('src/app/api/tasks/')
    || routeFile.startsWith('src/app/api/plan-runs/')
    || routeFile === 'src/app/api/task-target-states/route.ts'
    || routeFile === 'src/app/api/sse/route.ts'
  ) {
    return 'task-infra-routes'
  }
  if (routeFile.startsWith('src/app/api/projects/') || routeFile.startsWith('src/app/api/user/')) {
    return 'user-project-routes'
  }
  if (routeFile.startsWith('src/app/api/auth/')) return 'auth-routes'
  return 'infra-routes'
}

export const ROUTE_CATALOG: ReadonlyArray<RouteCatalogEntry> = ROUTE_FILES.map((routeFile) => ({
  routeFile,
  category: resolveCategory(routeFile),
  contractGroup: resolveContractGroup(routeFile),
}))

export const ROUTE_COUNT = ROUTE_CATALOG.length
