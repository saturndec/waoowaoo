import { TASK_EVENT_TYPE, TASK_TYPE } from './types'

const TASK_TYPE_LABELS: Record<string, string> = {
  [TASK_TYPE.IMAGE_PANEL]: 'progress.taskType.imagePanel',
  [TASK_TYPE.IMAGE_CHARACTER]: 'progress.taskType.imageCharacter',
  [TASK_TYPE.IMAGE_LOCATION]: 'progress.taskType.imageLocation',
  [TASK_TYPE.VIDEO_PANEL]: 'progress.taskType.videoPanel',
  [TASK_TYPE.LIP_SYNC]: 'progress.taskType.lipSync',
  [TASK_TYPE.VOICE_LINE]: 'progress.taskType.voiceLine',
  [TASK_TYPE.VOICE_DESIGN]: 'progress.taskType.voiceDesign',
  [TASK_TYPE.ASSET_HUB_VOICE_DESIGN]: 'progress.taskType.assetHubVoiceDesign',
  [TASK_TYPE.REGENERATE_STORYBOARD_TEXT]: 'progress.taskType.regenerateStoryboardText',
  [TASK_TYPE.INSERT_PANEL]: 'progress.taskType.insertPanel',
  [TASK_TYPE.PANEL_VARIANT]: 'progress.taskType.panelVariant',
  [TASK_TYPE.MODIFY_ASSET_IMAGE]: 'progress.taskType.modifyAssetImage',
  [TASK_TYPE.REGENERATE_GROUP]: 'progress.taskType.regenerateGroup',
  [TASK_TYPE.ASSET_HUB_IMAGE]: 'progress.taskType.assetHubImage',
  [TASK_TYPE.ASSET_HUB_MODIFY]: 'progress.taskType.assetHubModify',
  [TASK_TYPE.ANALYZE_NOVEL]: 'progress.taskType.analyzeNovel',
  [TASK_TYPE.STORY_TO_SCRIPT_RUN]: 'progress.taskType.storyToScriptRun',
  [TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN]: 'progress.taskType.scriptToStoryboardRun',
  [TASK_TYPE.CLIPS_BUILD]: 'progress.taskType.clipsBuild',
  [TASK_TYPE.SCREENPLAY_CONVERT]: 'progress.taskType.screenplayConvert',
  [TASK_TYPE.VOICE_ANALYZE]: 'progress.taskType.voiceAnalyze',
  [TASK_TYPE.ANALYZE_GLOBAL]: 'progress.taskType.analyzeGlobal',
  [TASK_TYPE.AI_MODIFY_APPEARANCE]: 'progress.taskType.aiModifyAppearance',
  [TASK_TYPE.AI_MODIFY_LOCATION]: 'progress.taskType.aiModifyLocation',
  [TASK_TYPE.AI_MODIFY_SHOT_PROMPT]: 'progress.taskType.aiModifyShotPrompt',
  [TASK_TYPE.ANALYZE_SHOT_VARIANTS]: 'progress.taskType.analyzeShotVariants',
  [TASK_TYPE.AI_CREATE_CHARACTER]: 'progress.taskType.aiCreateCharacter',
  [TASK_TYPE.AI_CREATE_LOCATION]: 'progress.taskType.aiCreateLocation',
  [TASK_TYPE.REFERENCE_TO_CHARACTER]: 'progress.taskType.referenceToCharacter',
  [TASK_TYPE.CHARACTER_PROFILE_CONFIRM]: 'progress.taskType.characterProfileConfirm',
  [TASK_TYPE.CHARACTER_PROFILE_BATCH_CONFIRM]: 'progress.taskType.characterProfileBatchConfirm',
  [TASK_TYPE.EPISODE_SPLIT_LLM]: 'progress.taskType.episodeSplitLlm',
  [TASK_TYPE.ASSET_HUB_AI_DESIGN_CHARACTER]: 'progress.taskType.assetHubAiDesignCharacter',
  [TASK_TYPE.ASSET_HUB_AI_DESIGN_LOCATION]: 'progress.taskType.assetHubAiDesignLocation',
  [TASK_TYPE.ASSET_HUB_AI_MODIFY_CHARACTER]: 'progress.taskType.assetHubAiModifyCharacter',
  [TASK_TYPE.ASSET_HUB_AI_MODIFY_LOCATION]: 'progress.taskType.assetHubAiModifyLocation',
  [TASK_TYPE.ASSET_HUB_REFERENCE_TO_CHARACTER]: 'progress.taskType.assetHubReferenceToCharacter',
}

const STAGE_LABELS: Record<string, string> = {
  received: 'progress.stage.received',
  generate_character_image: 'progress.stage.generateCharacterImage',
  generate_location_image: 'progress.stage.generateLocationImage',
  generate_panel_candidate: 'progress.stage.generatePanelCandidate',
  generate_panel_video: 'progress.stage.generatePanelVideo',
  generate_voice_submit: 'progress.stage.generateVoiceSubmit',
  generate_voice_persist: 'progress.stage.generateVoicePersist',
  voice_design_submit: 'progress.stage.voiceDesignSubmit',
  voice_design_done: 'progress.stage.voiceDesignDone',
  submit_lip_sync: 'progress.stage.submitLipSync',
  persist_lip_sync: 'progress.stage.persistLipSync',
  storyboard_clip: 'progress.stage.storyboardClip',
  regenerate_storyboard_prepare: 'progress.stage.regenerateStoryboardPrepare',
  regenerate_storyboard_persist: 'progress.stage.regenerateStoryboardPersist',
  story_to_script_prepare: 'progress.stage.storyToScriptPrepare',
  story_to_script_step: 'progress.stage.storyToScriptStep',
  story_to_script_persist: 'progress.stage.storyToScriptPersist',
  story_to_script_persist_done: 'progress.stage.storyToScriptPersistDone',
  script_to_storyboard_prepare: 'progress.stage.scriptToStoryboardPrepare',
  script_to_storyboard_step: 'progress.stage.scriptToStoryboardStep',
  script_to_storyboard_persist: 'progress.stage.scriptToStoryboardPersist',
  script_to_storyboard_persist_done: 'progress.stage.scriptToStoryboardPersistDone',
  insert_panel_generate_text: 'progress.stage.insertPanelGenerateText',
  insert_panel_persist: 'progress.stage.insertPanelPersist',
  polling_external: 'progress.stage.pollingExternal',
  enqueue_failed: 'progress.stage.enqueueFailed',
  llm_proxy_submit: 'progress.stage.llmProxySubmit',
  llm_proxy_execute: 'progress.stage.llmProxyExecute',
  llm_proxy_persist: 'progress.stage.llmProxyPersist',
  analyze_global_prepare: 'progress.stage.analyzeGlobalPrepare',
  analyze_global_chunk: 'progress.stage.analyzeGlobalChunk',
  analyze_global_done: 'progress.stage.analyzeGlobalDone',
  analyze_novel_prepare: 'progress.stage.analyzeNovelPrepare',
  analyze_novel_characters_done: 'progress.stage.analyzeNovelCharactersDone',
  analyze_novel_locations_done: 'progress.stage.analyzeNovelLocationsDone',
  analyze_novel_persist: 'progress.stage.analyzeNovelPersist',
  analyze_novel_done: 'progress.stage.analyzeNovelDone',
  asset_hub_ai_design_prepare: 'progress.stage.assetHubAiDesignPrepare',
  asset_hub_ai_design_done: 'progress.stage.assetHubAiDesignDone',
  asset_hub_ai_modify_prepare: 'progress.stage.assetHubAiModifyPrepare',
  asset_hub_ai_modify_done: 'progress.stage.assetHubAiModifyDone',
  ai_modify_appearance_prepare: 'progress.stage.aiModifyAppearancePrepare',
  ai_modify_appearance_done: 'progress.stage.aiModifyAppearanceDone',
  ai_modify_location_prepare: 'progress.stage.aiModifyLocationPrepare',
  ai_modify_location_done: 'progress.stage.aiModifyLocationDone',
  ai_modify_shot_prompt_prepare: 'progress.stage.aiModifyShotPromptPrepare',
  ai_modify_shot_prompt_done: 'progress.stage.aiModifyShotPromptDone',
  analyze_shot_variants_prepare: 'progress.stage.analyzeShotVariantsPrepare',
  analyze_shot_variants_done: 'progress.stage.analyzeShotVariantsDone',
  character_profile_confirm_prepare: 'progress.stage.characterProfileConfirmPrepare',
  character_profile_confirm_persist: 'progress.stage.characterProfileConfirmPersist',
  character_profile_confirm_done: 'progress.stage.characterProfileConfirmDone',
  character_profile_batch_prepare: 'progress.stage.characterProfileBatchPrepare',
  character_profile_batch_loop_character: 'progress.stage.characterProfileBatchLoopCharacter',
  character_profile_batch_done: 'progress.stage.characterProfileBatchDone',
  clips_build_prepare: 'progress.stage.clipsBuildPrepare',
  clips_build_persist: 'progress.stage.clipsBuildPersist',
  clips_build_done: 'progress.stage.clipsBuildDone',
  episode_split_prepare: 'progress.stage.episodeSplitPrepare',
  episode_split_parse: 'progress.stage.episodeSplitParse',
  episode_split_match: 'progress.stage.episodeSplitMatch',
  episode_split_done: 'progress.stage.episodeSplitDone',
  reference_to_character_prepare: 'progress.stage.referenceToCharacterPrepare',
  reference_to_character_extract: 'progress.stage.referenceToCharacterExtract',
  reference_to_character_extract_done: 'progress.stage.referenceToCharacterExtractDone',
  reference_to_character_generate: 'progress.stage.referenceToCharacterGenerate',
  reference_to_character_done: 'progress.stage.referenceToCharacterDone',
  screenplay_convert_prepare: 'progress.stage.screenplayConvertPrepare',
  screenplay_convert_step: 'progress.stage.screenplayConvertStep',
  screenplay_convert_done: 'progress.stage.screenplayConvertDone',
  voice_analyze_prepare: 'progress.stage.voiceAnalyzePrepare',
  voice_analyze_persist: 'progress.stage.voiceAnalyzePersist',
  voice_analyze_persist_done: 'progress.stage.voiceAnalyzePersistDone',
  reconciled: 'progress.stage.reconciled',
  watchdog_timeout: 'progress.stage.watchdogTimeout',
  cancelled: 'progress.stage.cancelled',
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function isProgressContractKey(value: string | null) {
  return !!value && value.startsWith('progress.')
}

export function normalizeTaskStageLabel(stage?: string | null, stageLabel?: string | null) {
  const mapped = getTaskStageLabel(stage)
  if (mapped) return mapped
  const normalizedStageLabel = asString(stageLabel)
  if (isProgressContractKey(normalizedStageLabel)) return normalizedStageLabel
  return null
}

export function getTaskTypeLabel(taskType?: string | null) {
  if (!taskType) return 'progress.taskType.generic'
  return TASK_TYPE_LABELS[taskType] || 'progress.taskType.generic'
}

export function getTaskStageLabel(stage?: string | null) {
  if (!stage) return null
  return STAGE_LABELS[stage] || null
}

export function buildTaskProgressMessage(params: {
  eventType?: string | null
  taskType?: string | null
  progress?: number | null
  payload?: Record<string, unknown> | null
}) {
  const payloadMessage = asString(params.payload?.message)
  if (isProgressContractKey(payloadMessage)) return payloadMessage

  const stage = asString(params.payload?.stage)
  const payloadStageLabel = asString(params.payload?.stageLabel)
  const stageLabel = normalizeTaskStageLabel(stage, payloadStageLabel)

  if (params.eventType === TASK_EVENT_TYPE.CREATED) {
    return 'progress.runtime.taskCreated'
  }
  if (params.eventType === TASK_EVENT_TYPE.PROCESSING) {
    return stageLabel || 'progress.runtime.taskStarted'
  }
  if (params.eventType === TASK_EVENT_TYPE.COMPLETED) {
    return 'progress.runtime.taskCompleted'
  }
  if (params.eventType === TASK_EVENT_TYPE.FAILED) {
    return 'progress.runtime.taskFailed'
  }

  return stageLabel || 'progress.runtime.taskProcessing'
}
