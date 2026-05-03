import type { AgentSkillManifest } from '@/lib/agent-skills/types'

export const creativeDirectionSkill: AgentSkillManifest = {
  id: 'creative-direction',
  name: 'Creative Direction',
  summary: 'Guide open-ended creative goals without forcing character, scene, or episode structure.',
  description: 'Helps the assistant clarify intent, choose an artistic route, and decide which downstream skills or operations are actually needed.',
  triggers: ['开放创作', '导演风格', '短片概念', '意识流', '科普短片', '恐怖片', 'creative brief', 'director style'],
  riskLevel: 'low',
  requiresApproval: false,
  allowedOperationIds: ['get_project_context', 'get_project_snapshot', 'get_project_data'],
  documentPath: 'skills/agent/creative-direction/SKILL.md',
}
