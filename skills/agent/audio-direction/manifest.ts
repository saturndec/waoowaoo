import type { AgentSkillManifest } from '@/lib/agent-skills/types'

export const audioDirectionSkill: AgentSkillManifest = {
  id: 'audio-direction',
  name: 'Audio Direction',
  summary: 'Guide voice, music, ambience, silence, and lip-sync decisions.',
  description: 'Helps the assistant plan audio choices and call generation operations only after user approval when needed.',
  triggers: ['声音', '配音', '音乐', '氛围声', 'lip sync', 'voice', 'music', 'audio'],
  riskLevel: 'medium',
  requiresApproval: true,
  allowedOperationIds: ['get_project_context', 'get_project_snapshot', 'create_voice_line', 'update_voice_line', 'generate_voice_line_audio', 'generate_episode_voice_audio', 'voice_design', 'generate_project_music', 'lip_sync'],
  documentPath: 'skills/agent/audio-direction/SKILL.md',
}
