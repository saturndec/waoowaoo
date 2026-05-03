import type { AgentSkillManifest } from '@/lib/agent-skills/types'

export const mediaGenerationSkill: AgentSkillManifest = {
  id: 'media-generation',
  name: 'Media Generation',
  summary: 'Guide image, video, music, voice, and lip-sync generation from current project context.',
  description: 'Helps the assistant inspect selection context, explain cost/risk, and submit only the needed generation operations.',
  triggers: ['生成图片', '生成视频', '生成音乐', '重生成', 'image', 'video', 'music', 'generate'],
  riskLevel: 'high',
  requiresApproval: true,
  allowedOperationIds: ['get_project_context', 'get_project_snapshot', 'generate_character_image', 'generate_location_image', 'modify_character_image', 'modify_location_image', 'regenerate_panel_image', 'panel_variant', 'generate_panel_video', 'generate_episode_videos', 'generate_project_music', 'generate_voice_line_audio', 'generate_episode_voice_audio', 'lip_sync'],
  documentPath: 'skills/agent/media-generation/SKILL.md',
}
