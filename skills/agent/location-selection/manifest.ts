import type { AgentSkillManifest } from '@/lib/agent-skills/types'

export const locationSelectionSkill: AgentSkillManifest = {
  id: 'location-selection',
  name: 'Location Selection',
  summary: 'Guide choosing, creating, or confirming locations for a story, clip, or selected panel.',
  description: 'Helps the assistant compare location candidates and avoid inventing location ids before calling location operations.',
  triggers: ['选择场景', '换场景', '地点', 'location', 'setting', 'where'],
  riskLevel: 'medium',
  requiresApproval: true,
  allowedOperationIds: ['get_project_context', 'get_project_snapshot', 'get_project_assets', 'create_location', 'patch_location', 'confirm_location_selection'],
  documentPath: 'skills/agent/location-selection/SKILL.md',
}
