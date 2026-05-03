import type { AgentSkillManifest } from '@/lib/agent-skills/types'

export const visualContinuitySkill: AgentSkillManifest = {
  id: 'visual-continuity',
  name: 'Visual Continuity',
  summary: 'Guide visual consistency across characters, locations, panels, and generated media.',
  description: 'Helps the assistant inspect existing assets and decide which visual updates or generations are needed.',
  triggers: ['视觉一致性', '角色一致', '场景一致', '画风', 'style continuity', 'visual consistency'],
  riskLevel: 'medium',
  requiresApproval: true,
  allowedOperationIds: ['get_project_context', 'get_project_snapshot', 'get_project_assets', 'modify_character_image', 'modify_location_image', 'modify_asset_image', 'regenerate_panel_image', 'panel_variant'],
  documentPath: 'skills/agent/visual-continuity/SKILL.md',
}
