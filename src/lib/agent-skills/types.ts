export type AgentSkillRiskLevel = 'low' | 'medium' | 'high'

export type AgentSkillId =
  | 'creative-direction'
  | 'screenwriting'
  | 'story-structure'
  | 'storyboard-direction'
  | 'visual-continuity'
  | 'location-selection'
  | 'character-selection'
  | 'audio-direction'
  | 'media-generation'

export interface AgentSkillManifest {
  id: AgentSkillId
  name: string
  summary: string
  description: string
  triggers: string[]
  riskLevel: AgentSkillRiskLevel
  requiresApproval: boolean
  allowedOperationIds: string[]
  documentPath: string
}

export interface AgentSkillSearchResult {
  id: AgentSkillId
  name: string
  summary: string
  description: string
  triggers: string[]
  riskLevel: AgentSkillRiskLevel
  requiresApproval: boolean
}

export interface LoadedAgentSkill extends AgentSkillSearchResult {
  instructions: string
  allowedOperationIds: string[]
}

export type PlanValidationIssueCode =
  | 'UNKNOWN_SKILL'
  | 'UNKNOWN_OPERATION'
  | 'OPERATION_NOT_ALLOWED_BY_SKILL'
  | 'UNKNOWN_ARTIFACT'
  | 'DUPLICATE_STEP_KEY'
  | 'UNKNOWN_DEPENDENCY'
  | 'CONFIRMATION_REQUIRED'
  | 'BANNED_FIXED_WORKFLOW_REFERENCE'

export interface PlanValidationIssue {
  code: PlanValidationIssueCode
  message: string
  stepKey?: string
  skillId?: string
  operationId?: string
}

export interface AgentPlanStep {
  stepKey: string
  skillId: AgentSkillId
  operationId: string
  reason: string
  inputArtifacts: string[]
  outputArtifacts: string[]
  dependsOn: string[]
  requiresApproval: boolean
}

export interface AgentPlanValidationResult {
  ok: boolean
  issues: PlanValidationIssue[]
  steps: AgentPlanStep[]
}

export interface AgentPlanDraft {
  planId: string
  goal: string
  summary: string
  requiresApproval: boolean
  validation: AgentPlanValidationResult
  steps: AgentPlanStep[]
}
