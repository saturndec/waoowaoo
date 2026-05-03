import type { AgentSkillManifest } from '@/lib/agent-skills/types'

export const storyboardDirectionSkill: AgentSkillManifest = {
  id: 'storyboard-direction',
  name: 'Storyboard Direction',
  summary: 'Guide shot planning, storyboard structure, and panel edits without a fixed storyboard pipeline.',
  description: 'Helps the assistant decide whether to create, edit, reorder, or regenerate storyboard content based on current context.',
  triggers: ['分镜', '镜头计划', '镜头语言', 'storyboard', 'shot plan', 'panel'],
  riskLevel: 'medium',
  requiresApproval: true,
  allowedOperationIds: ['get_project_context', 'get_project_snapshot', 'create_storyboard_panel', 'insert_storyboard_panel', 'update_storyboard_panel_fields', 'update_storyboard_panel_prompt', 'regenerate_storyboard_text', 'update_shot_prompt', 'ai_modify_shot_prompt'],
  documentPath: 'skills/agent/storyboard-direction/SKILL.md',
}
