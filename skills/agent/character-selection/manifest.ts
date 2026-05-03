import type { AgentSkillManifest } from '@/lib/agent-skills/types'

export const characterSelectionSkill: AgentSkillManifest = {
  id: 'character-selection',
  name: 'Character Selection',
  summary: 'Guide choosing, creating, or confirming characters for story, clip, or panel work.',
  description: 'Helps the assistant compare candidates, ask when identity is ambiguous, and call character operations safely.',
  triggers: ['选择角色', '换角色', '人物', 'character', 'cast', 'protagonist'],
  riskLevel: 'medium',
  requiresApproval: true,
  allowedOperationIds: ['get_project_context', 'get_project_snapshot', 'get_project_assets', 'create_character', 'update_character', 'create_character_appearance', 'update_character_appearance', 'confirm_character_appearance_selection'],
  documentPath: 'skills/agent/character-selection/SKILL.md',
}
