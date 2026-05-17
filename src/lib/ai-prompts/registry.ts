import { AI_PROMPT_IDS, type AiPromptId } from './ids'
import type { AiPromptCatalogEntry } from './types'

export const AI_PROMPT_CATALOG: Record<AiPromptId, AiPromptCatalogEntry> = {
  [AI_PROMPT_IDS.CHARACTER_ANALYZE]: {
    pathStem: 'character/analyze',
    variableKeys: ['input', 'characters_lib_info', 'style_requirements'],
    operationIds: ['analyze_characters'],
  },
  [AI_PROMPT_IDS.CHARACTER_VISUAL_PROFILE]: {
    pathStem: 'character/visual-profile',
    variableKeys: ['character_profiles'],
  },
  [AI_PROMPT_IDS.CHARACTER_CREATE]: {
    pathStem: 'character/create',
    variableKeys: ['user_input'],
  },
  [AI_PROMPT_IDS.CHARACTER_MODIFY]: {
    pathStem: 'character/modify',
    variableKeys: ['character_input', 'user_input'],
  },
  [AI_PROMPT_IDS.CHARACTER_REGENERATE]: {
    pathStem: 'character/regenerate',
    variableKeys: ['character_name', 'current_descriptions', 'change_reason', 'novel_text'],
  },
  [AI_PROMPT_IDS.CHARACTER_UPDATE_DESCRIPTION]: {
    pathStem: 'character/update-description',
    variableKeys: ['original_description', 'modify_instruction', 'image_context'],
  },
  [AI_PROMPT_IDS.CHARACTER_REFERENCE_DESCRIBE_IMAGE]: {
    pathStem: 'character/reference/describe-image',
    variableKeys: [],
  },
  [AI_PROMPT_IDS.CHARACTER_REFERENCE_TO_SHEET]: {
    pathStem: 'character/reference/to-sheet',
    variableKeys: [],
  },
  [AI_PROMPT_IDS.LOCATION_ANALYZE]: {
    pathStem: 'location/analyze',
    variableKeys: ['input', 'locations_lib_name', 'style_requirements'],
    operationIds: ['analyze_locations'],
  },
  [AI_PROMPT_IDS.LOCATION_CREATE]: {
    pathStem: 'location/create',
    variableKeys: ['user_input'],
  },
  [AI_PROMPT_IDS.LOCATION_MODIFY]: {
    pathStem: 'location/modify',
    variableKeys: ['location_name', 'location_input', 'user_input'],
  },
  [AI_PROMPT_IDS.LOCATION_REGENERATE]: {
    pathStem: 'location/regenerate',
    variableKeys: ['location_name', 'current_descriptions'],
  },
  [AI_PROMPT_IDS.LOCATION_UPDATE_DESCRIPTION]: {
    pathStem: 'location/update-description',
    variableKeys: ['location_name', 'original_description', 'modify_instruction', 'image_context'],
  },
  [AI_PROMPT_IDS.PROP_ANALYZE]: {
    pathStem: 'prop/analyze',
    variableKeys: ['input', 'props_lib_name', 'style_requirements'],
    operationIds: ['analyze_props'],
  },
  [AI_PROMPT_IDS.PROP_UPDATE_DESCRIPTION]: {
    pathStem: 'prop/update-description',
    variableKeys: ['prop_name', 'original_description', 'modify_instruction', 'image_context'],
  },
  [AI_PROMPT_IDS.SCRIPT_CLIP_SEGMENTS]: {
    pathStem: 'script/clip-segments',
    variableKeys: ['input', 'locations_lib_name', 'characters_lib_name', 'props_lib_name', 'characters_introduction'],
    operationIds: ['split_clips'],
  },
  [AI_PROMPT_IDS.SCRIPT_EPISODE_SPLIT]: {
    pathStem: 'script/episode-split',
    variableKeys: ['CONTENT'],
  },
  [AI_PROMPT_IDS.SCRIPT_GENERATE_SCREENPLAY]: {
    pathStem: 'script/generate-screenplay',
    variableKeys: ['clip_content', 'locations_lib_name', 'characters_lib_name', 'props_lib_name', 'characters_introduction', 'clip_id'],
    operationIds: ['write_screenplay'],
  },
  [AI_PROMPT_IDS.SCRIPT_EXPAND_STORY]: {
    pathStem: 'script/expand-story',
    variableKeys: ['input'],
  },
  [AI_PROMPT_IDS.STORYBOARD_PLAN]: {
    pathStem: 'storyboard/plan',
    variableKeys: [
      'characters_lib_name',
      'locations_lib_name',
      'characters_introduction',
      'characters_appearance_list',
      'characters_full_description',
      'props_description',
      'clip_json',
      'clip_content',
      'style_requirements',
    ],
    operationIds: ['create_shot_plan'],
  },
  [AI_PROMPT_IDS.STORYBOARD_REFINE_CINEMATOGRAPHY]: {
    pathStem: 'storyboard/refine-cinematography',
    variableKeys: ['panels_json', 'panel_count', 'locations_description', 'characters_info', 'props_description', 'style_requirements'],
    operationIds: ['refine_cinematography'],
  },
  [AI_PROMPT_IDS.STORYBOARD_REFINE_ACTING]: {
    pathStem: 'storyboard/refine-acting',
    variableKeys: ['panels_json', 'panel_count', 'characters_info', 'style_requirements'],
    operationIds: ['refine_acting'],
  },
  [AI_PROMPT_IDS.STORYBOARD_REFINE_DETAIL]: {
    pathStem: 'storyboard/refine-detail',
    variableKeys: ['panels_json', 'characters_age_gender', 'locations_description', 'props_description', 'style_requirements'],
    operationIds: ['finalize_storyboard'],
  },
  [AI_PROMPT_IDS.STORYBOARD_INSERT_PANEL]: {
    pathStem: 'storyboard/insert-panel',
    variableKeys: [
      'prev_panel_json',
      'next_panel_json',
      'characters_full_description',
      'locations_description',
      'props_description',
      'user_input',
      'style_requirements',
    ],
  },
  [AI_PROMPT_IDS.STORYBOARD_EDIT]: {
    pathStem: 'storyboard/edit',
    variableKeys: ['user_input'],
  },
  [AI_PROMPT_IDS.SHOT_VARIANT_ANALYZE]: {
    pathStem: 'storyboard/shot-variant-analysis',
    variableKeys: ['panel_description', 'shot_type', 'camera_move', 'location', 'characters_info', 'style_requirements'],
  },
  [AI_PROMPT_IDS.SHOT_VARIANT_GENERATE]: {
    pathStem: 'storyboard/shot-variant-generate',
    variableKeys: [
      'original_description',
      'original_shot_type',
      'original_camera_move',
      'location',
      'characters_info',
      'variant_title',
      'variant_description',
      'target_shot_type',
      'target_camera_move',
      'video_prompt',
      'character_assets',
      'location_asset',
      'reference_images',
      'aspect_ratio',
      'style',
      'style_requirements',
    ],
  },
  [AI_PROMPT_IDS.PANEL_IMAGE_GENERATE]: {
    pathStem: 'image/panel-generate',
    variableKeys: ['storyboard_text_json_input', 'source_text', 'aspect_ratio', 'style', 'style_requirements'],
  },
  [AI_PROMPT_IDS.IMAGE_UPDATE_SHOT_PROMPT]: {
    pathStem: 'image/update-shot-prompt',
    variableKeys: ['prompt_input', 'user_input', 'video_prompt_input'],
  },
  [AI_PROMPT_IDS.DESIGN_VISUAL_STYLE_PRESET]: {
    pathStem: 'style-preset/design-visual-style',
    variableKeys: ['instruction'],
  },
  [AI_PROMPT_IDS.DESIGN_DIRECTOR_STYLE_PRESET]: {
    pathStem: 'style-preset/design-director-style',
    variableKeys: ['instruction'],
  },
  [AI_PROMPT_IDS.VOICE_GENERATE_LINES]: {
    pathStem: 'voice/generate-lines',
    variableKeys: ['input', 'characters_lib_name', 'characters_introduction', 'storyboard_json'],
    operationIds: ['generate_voice_lines'],
  },
  [AI_PROMPT_IDS.MUSIC_LYRIA_PROMPT_EXPAND]: {
    pathStem: 'music/lyria-prompt-expand',
    variableKeys: ['user_input', 'duration_seconds', 'vocal_mode', 'genre', 'mood'],
  },
  [AI_PROMPT_IDS.MUSIC_FINAL_RENDER_BGM]: {
    pathStem: 'music/final-render-bgm',
    variableKeys: [
      'title',
      'story_context',
      'duration_seconds',
      'project_context_json',
      'edit_script_json',
      'rendered_timeline_json',
      'timeline_map',
    ],
  },
  [AI_PROMPT_IDS.EDIT_SCRIPT_SCREENPLAY]: {
    pathStem: 'edit-script/screenplay',
    variableKeys: ['user_request', 'duration_seconds', 'aspect_ratio', 'style_context'],
  },
  [AI_PROMPT_IDS.EDIT_SCRIPT_TIMELINE]: {
    pathStem: 'edit-script/timeline',
    variableKeys: ['user_request', 'screenplay_text', 'duration_seconds'],
  },
  [AI_PROMPT_IDS.EDIT_SCRIPT_VISUAL_ACTION]: {
    pathStem: 'edit-script/visual-action',
    variableKeys: ['user_request', 'screenplay_text', 'timeline_json'],
  },
  [AI_PROMPT_IDS.EDIT_SCRIPT_CAMERA]: {
    pathStem: 'edit-script/camera',
    variableKeys: ['user_request', 'screenplay_text', 'visual_action_json', 'aspect_ratio', 'style_context'],
  },
  [AI_PROMPT_IDS.EDIT_SCRIPT_AUDIO]: {
    pathStem: 'edit-script/audio',
    variableKeys: ['user_request', 'screenplay_text', 'camera_json'],
  },
  [AI_PROMPT_IDS.EDIT_SCRIPT_PRIMARY]: {
    pathStem: 'edit-script/primary',
    variableKeys: [
      'user_request',
      'screenplay_text',
      'duration_seconds',
      'aspect_ratio',
      'style_context',
    ],
  },
  [AI_PROMPT_IDS.EDIT_SCRIPT_ASSET_EXTRACT]: {
    pathStem: 'edit-script/asset-extract',
    variableKeys: ['edit_script_json'],
  },
  [AI_PROMPT_IDS.EDIT_SCRIPT_STORYBOARD_PANEL]: {
    pathStem: 'edit-script/storyboard-panel',
    variableKeys: [
      'shot_json',
      'video_block_json',
      'character_assets_json',
      'location_assets_json',
    ],
  },
}

const OPERATION_TO_AI_PROMPT_ID = new Map<string, AiPromptId>()

for (const [promptId, entry] of Object.entries(AI_PROMPT_CATALOG) as Array<[AiPromptId, AiPromptCatalogEntry]>) {
  for (const operationId of entry.operationIds ?? []) {
    OPERATION_TO_AI_PROMPT_ID.set(operationId, promptId)
  }
}

export function resolveAiPromptIdFromOperationId(operationId: string): AiPromptId {
  const resolved = OPERATION_TO_AI_PROMPT_ID.get(operationId)
  if (!resolved) {
    throw new Error(`AI_PROMPT_OPERATION_UNREGISTERED:${operationId}`)
  }
  return resolved
}
