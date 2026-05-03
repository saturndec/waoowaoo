import { createReadOperations } from './domains/project/read-ops'
import { createAgentSkillOperations } from './domains/agent-skill/agent-skill-ops'
import { createGovernanceOperations } from './domains/governance/governance-ops'
import { createEditOperations } from './domains/storyboard/edit-ops'
import { createStoryboardPanelEditOperations } from './domains/storyboard/panel-edit-ops'
import { createStoryboardPanelImageOperations } from './domains/storyboard/panel-image-ops'
import { createGuiOperations } from './domains/gui/gui-ops'
import { createExtraOperations } from './domains/extra/extra-ops'
import { createLlmTaskOperations } from './domains/llm/llm-task-ops'
import { createMediaOperations } from './domains/media/media-ops'
import { createVideoOperations } from './domains/media/video-ops'
import { createVideoGenerationOperations } from './domains/media/video-generation-ops'
import { createMusicGenerationOperations } from './domains/media/music-generation-ops'
import { createLipSyncOperations } from './domains/media/lipsync-ops'
import { createDownloadOperations } from './domains/media/download-ops'
import { createConfigOperations } from './domains/config/config-ops'
import { createProjectDataOperations } from './domains/project/project-data-ops'
import { createProjectCrudOperations } from './domains/project/project-crud-ops'
import { createSystemProjectOperations } from './domains/project/system-project-ops'
import { createRunOperations } from './domains/run/run-ops'
import { createTaskOperations } from './domains/task/task-ops'
import { createSseOperations } from './domains/debug/sse-ops'
import { createHomeLlmOperations } from './domains/llm/home-llm-ops'
import { createAssetHubLlmOperations } from './domains/asset-hub/asset-hub-llm-ops'
import { createAssetHubVoiceOperations } from './domains/asset-hub/asset-hub-voice-ops'
import { createAssetHubFolderOperations } from './domains/asset-hub/asset-hub-folder-ops'
import { createAssetHubVoiceLibraryOperations } from './domains/asset-hub/asset-hub-voice-library-ops'
import { createAssetHubVoiceUploadOperations } from './domains/asset-hub/asset-hub-voice-upload-ops'
import { createAssetHubCharacterLibraryOperations } from './domains/asset-hub/asset-hub-character-library-ops'
import { createAssetHubCharacterAppearanceOperations } from './domains/asset-hub/asset-hub-character-appearance-ops'
import { createAssetHubLocationLibraryOperations } from './domains/asset-hub/asset-hub-location-library-ops'
import { createAssetHubPickerOperations } from './domains/asset-hub/asset-hub-picker-ops'
import { createUserPreferenceOperations } from './domains/config/user-preference-ops'
import { createUserModelsOperations } from './domains/config/user-models-ops'
import { createUserBillingOperations } from './domains/billing/user-billing-ops'
import { createUserApiConfigOperations } from './domains/config/user-api-config-ops'
import { createAuthOperations } from './domains/auth/auth-ops'
import { createAlwaysOnOperations } from './domains/ui/always-on-ops'
import { createAssetImageOperations } from './domains/asset/asset-image-ops'
import { createVoiceOperations } from './domains/voice/voice-ops'
import { withOperationPack } from './pack'
import type { ProjectAgentOperationRegistry } from './types'

export function createProjectAgentOperationRegistry(): ProjectAgentOperationRegistry {
  const CONFIRM_NONE = { required: false, summary: null, budget: null } as const
  const CHANNELS_TOOL_API = { tool: true, api: true } as const
  const CHANNELS_API_ONLY = { tool: false, api: true } as const
  const CHANNELS_TOOL_ONLY = { tool: true, api: false } as const
  const PREREQ_EPISODE_OPTIONAL = { episodeId: 'optional' } as const

  return {
    ...withOperationPack(createAlwaysOnOperations(), {
      groupPath: ['ui'],
      channels: CHANNELS_TOOL_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createSystemProjectOperations(), {
      groupPath: ['project', 'system'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createRunOperations(), {
      groupPath: ['run'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createTaskOperations(), {
      groupPath: ['task'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createSseOperations(), {
      groupPath: ['debug', 'sse'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createHomeLlmOperations(), {
      groupPath: ['llm'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAuthOperations(), {
      groupPath: ['auth'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createUserPreferenceOperations(), {
      groupPath: ['config', 'preference'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createUserModelsOperations(), {
      groupPath: ['config', 'models'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createUserBillingOperations(), {
      groupPath: ['billing'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createUserApiConfigOperations(), {
      groupPath: ['config', 'api'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetHubLlmOperations(), {
      groupPath: ['asset-hub', 'ai'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetHubVoiceOperations(), {
      groupPath: ['asset-hub', 'voice'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetHubFolderOperations(), {
      groupPath: ['asset-hub', 'folder'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetHubVoiceLibraryOperations(), {
      groupPath: ['asset-hub', 'voice-library'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetHubVoiceUploadOperations(), {
      groupPath: ['asset-hub', 'voice-upload'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetHubCharacterLibraryOperations(), {
      groupPath: ['asset-hub', 'character-library'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetHubCharacterAppearanceOperations(), {
      groupPath: ['asset-hub', 'character-appearance'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetHubLocationLibraryOperations(), {
      groupPath: ['asset-hub', 'location-library'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetHubPickerOperations(), {
      groupPath: ['asset-hub', 'picker'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createReadOperations(), {
      groupPath: ['project', 'read'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAgentSkillOperations(), {
      groupPath: ['skill'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createProjectCrudOperations(), {
      groupPath: ['project', 'crud'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createVideoOperations(), {
      groupPath: ['media', 'video'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createVideoGenerationOperations(), {
      groupPath: ['media', 'video'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createMusicGenerationOperations(), {
      groupPath: ['media', 'music'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createLipSyncOperations(), {
      groupPath: ['media', 'lipsync'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createDownloadOperations(), {
      groupPath: ['media', 'download'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createGovernanceOperations(), {
      groupPath: ['governance'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack({
      ...createEditOperations(),
      ...createStoryboardPanelEditOperations(),
      ...createStoryboardPanelImageOperations(),
    }, {
      groupPath: ['storyboard', 'edit'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createConfigOperations(), {
      groupPath: ['config'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createProjectDataOperations(), {
      groupPath: ['project', 'data'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createGuiOperations(), {
      groupPath: ['gui'],
      channels: CHANNELS_API_ONLY,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createExtraOperations(), {
      groupPath: ['extra'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createLlmTaskOperations(), {
      groupPath: ['llm', 'task'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createMediaOperations(), {
      groupPath: ['media'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createAssetImageOperations(), {
      groupPath: ['asset'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
    ...withOperationPack(createVoiceOperations(), {
      groupPath: ['voice'],
      channels: CHANNELS_TOOL_API,
      prerequisites: PREREQ_EPISODE_OPTIONAL,
      confirmation: CONFIRM_NONE,
    }),
  }
}
