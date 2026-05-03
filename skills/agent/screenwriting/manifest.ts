import type { AgentSkillManifest } from '@/lib/agent-skills/types'

export const screenwritingSkill: AgentSkillManifest = {
  id: 'screenwriting',
  name: 'Screenwriting',
  summary: 'Guide writing or rewriting scripts without assuming a fixed upstream analysis chain.',
  description: 'Helps the assistant decide whether to write directly, ask for missing intent, analyze structure, or submit a screenplay-related operation.',
  triggers: ['写剧本', '短片剧本', '对白', '场景文本', 'screenplay', 'script', 'rewrite'],
  riskLevel: 'medium',
  requiresApproval: true,
  allowedOperationIds: ['get_project_context', 'get_project_snapshot', 'analyze_novel', 'screenplay_convert', 'split_episodes_by_markers'],
  documentPath: 'skills/agent/screenwriting/SKILL.md',
}
