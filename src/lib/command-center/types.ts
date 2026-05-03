import type { ArtifactType } from '@/lib/artifact-system/types'
import type { ProjectPolicyOverrideInput } from '@/lib/project-context/types'

export type CommandSource = 'gui' | 'assistant-panel'
export type CommandType = 'run_skill'
export type CommandStatus =
  | 'planned'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled'

export interface CommandEnvelopeBase {
  source: CommandSource
  projectId: string
  episodeId?: string | null
  scopeRef?: string | null
  policyOverrides?: ProjectPolicyOverrideInput | null
}

export interface RunSkillCommand extends CommandEnvelopeBase {
  commandType: 'run_skill'
  skillId: 'insert_panel' | 'panel_variant' | 'regenerate_storyboard_text' | 'modify_shot_prompt'
  input: Record<string, unknown>
}

export type CommandEnvelope = RunSkillCommand

export interface PlanStep {
  stepKey: string
  skillId: string
  title: string
  orderIndex: number
  scopeRef?: string | null
  inputArtifacts: ArtifactType[]
  outputArtifacts: ArtifactType[]
  invalidates: ArtifactType[]
  mutationKind: 'read' | 'generate' | 'update' | 'delete'
  riskLevel: 'low' | 'medium' | 'high'
  requiresApproval: boolean
  dependsOn: string[]
}

export interface ExecutionPlanDraft {
  summary: string
  requiresApproval: boolean
  riskSummary: {
    highestRiskLevel: 'low' | 'medium' | 'high'
    reasons: string[]
  }
  steps: PlanStep[]
}

export interface CommandExecutionResult {
  commandId: string
  planId: string
  requiresApproval: boolean
  status: CommandStatus
  linkedTaskId?: string | null
  summary: string
  steps: PlanStep[]
}

export interface CommandListItem extends CommandExecutionResult {
  createdAt: string
  updatedAt: string
  commandType: CommandType
  source: CommandSource
  episodeId?: string | null
  approval?: {
    id: string
    status: 'pending' | 'approved' | 'rejected'
    reason?: string | null
    responseNote?: string | null
  } | null
}
