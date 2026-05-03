import type { AgentSkillManifest } from '@/lib/agent-skills/types'

export const storyStructureSkill: AgentSkillManifest = {
  id: 'story-structure',
  name: 'Story Structure',
  summary: 'Guide narrative structure, beats, suspense, reveals, and pacing.',
  description: 'Helps the assistant reason about story shape without requiring fixed character/location extraction.',
  triggers: ['故事结构', '悬疑机制', '反转', '节奏', '三幕', '恐怖', '希区柯克', 'narrative', 'suspense', 'horror'],
  riskLevel: 'low',
  requiresApproval: false,
  allowedOperationIds: ['get_project_context', 'get_project_snapshot', 'analyze_novel'],
  documentPath: 'skills/agent/story-structure/SKILL.md',
}
