import type { UIMessage } from 'ai'
import type { ProjectContextSnapshot } from '@/lib/project-context/types'
import type { ProjectPhase, ProjectPhaseSnapshot } from './project-phase'
import type { PlanValidationIssue } from '@/lib/agent-skills/types'

export type UnknownObject = { [key: string]: unknown }

export type ProjectAssistantId = 'workspace-command'

export type ProjectAgentInteractionMode = 'auto' | 'plan' | 'fast'

export interface ProjectAgentContext {
  locale?: string
  episodeId?: string | null
  currentStage?: string | null
  selectedScopeRef?: string | null
  selectedPanelId?: string | null
  selectedClipId?: string | null
  selectedAssetId?: string | null
  interactionMode?: ProjectAgentInteractionMode
}

export interface ProjectContextPartData {
  context: ProjectAssistantContextSnapshot
}

export interface ProjectPhasePartData {
  phase: ProjectPhase
  snapshot: ProjectPhaseSnapshot
}

export interface ProjectAgentStopPartData {
  reason: 'step_cap'
  stepCount: number
  maxSteps: number
}

export interface AgentPlanPartData {
  draftPlanId: string
  goal: string
  summary: string
  requiresApproval: boolean
  validation: {
    ok: boolean
    issues: PlanValidationIssue[]
  }
  steps: Array<{
    stepKey: string
    skillId: string
    reason: string
    operationId: string
    inputArtifacts: string[]
    outputArtifacts: string[]
    dependsOn: string[]
    requiresApproval: boolean
  }>
}

export interface AgentDebugPartData {
  requestId: string
  interactionMode: ProjectAgentInteractionMode
  routedIntent: 'query' | 'plan' | 'act'
  effectiveIntent: 'query' | 'plan' | 'act'
  requestedGroups: string[][]
  alwaysOnOperationIds: string[]
  operationIds: string[]
}

export interface AgentRuntimeContextPartData {
  requestId: string
  modelKey: string
  locale: string
  projectId: string
  episodeId?: string | null
  interactionMode: ProjectAgentInteractionMode
  systemPrompt: string
  rawMessages: unknown
  runtimeMessages: unknown
  modelMessages: unknown
  projectContext: ProjectAgentContext
  projectPhase: unknown
  route: unknown
  selectedTools: Array<{
    operationId: string
    description: string
  }>
}

export interface ConfirmationRequestPartData {
  operationId: string
  summary: string
  argsHint?: UnknownObject | null
  budget?: {
    key?: string
    estimatedCostUnits?: number
  } | null
}

export interface TaskSubmittedPartData {
  operationId: string
  taskId: string
  status: string
  runId?: string | null
  deduped?: boolean
  mutationBatchId?: string | null
}

export interface TaskBatchSubmittedPartData {
  operationId: string
  total: number
  taskIds: string[]
  results?: Array<{
    refId: string
    taskId: string
  }>
  mutationBatchId?: string | null
}

export interface ProjectAssistantContextSnapshot {
  projectId: string
  projectName: string
  episodeId?: string | null
  episodeName?: string | null
  currentStage?: string | null
  selectedScopeRef?: string | null
  selectedPanelId?: string | null
  selectedClipId?: string | null
  selectedAssetId?: string | null
  activePlanRuns: ProjectContextSnapshot['activePlanRuns']
  activeOperationTasks: ProjectContextSnapshot['activeOperationTasks']
  recentOperationResults: ProjectContextSnapshot['recentOperationResults']
  latestArtifacts: ProjectContextSnapshot['latestArtifacts']
  config: {
    analysisModel?: string | null
    artStyle: string
    videoRatio: string
  }
}

export interface ProjectAssistantThreadSnapshot {
  id: string
  assistantId: ProjectAssistantId
  projectId: string
  episodeId?: string | null
  scopeRef: string
  messages: UIMessage[]
  createdAt: string
  updatedAt: string
}

export type WorkspaceAssistantPartType =
  | 'data-agent-debug'
  | 'data-agent-runtime-context'
  | 'data-agent-stop'
  | 'data-project-phase'
  | 'data-confirmation-request'
  | 'data-task-submitted'
  | 'data-task-batch-submitted'
  | 'data-plan'
  | 'data-project-context'
