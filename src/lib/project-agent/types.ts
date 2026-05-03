import type { UIMessage } from 'ai'
import type { CommandExecutionResult } from '@/lib/command-center/types'
import type { WorkflowCanonicalEvent } from '@/lib/agent/events/workflow-events'
import type { ProjectContextSnapshot } from '@/lib/project-context/types'
import type { ProjectPhase, ProjectPhaseSnapshot } from './project-phase'
import type {
  WorkflowPackageId,
  WorkflowSkillId,
} from '@/lib/skill-system/types'
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

export interface WorkflowPlanPartData {
  workflowId: WorkflowPackageId
  commandId: string
  planId: string
  summary: string
  requiresApproval: boolean
  event?: WorkflowCanonicalEvent | null
  steps: Array<{
    skillId: string
    title: string
  }>
}

export interface ApprovalRequestPartData {
  workflowId: WorkflowPackageId
  commandId: string
  planId: string
  summary: string
  reasons: string[]
  event?: WorkflowCanonicalEvent | null
}

export interface WorkflowStatusPartData {
  workflowId: WorkflowPackageId
  commandId: string
  planId: string
  runId?: string | null
  status: CommandExecutionResult['status']
  activeSkillId?: WorkflowSkillId | null
  event?: WorkflowCanonicalEvent | null
}

export interface ScriptPreviewPartData {
  workflowId: 'story-to-script'
  episodeId: string
  clips: Array<{
    clipId: string
    summary: string
    sceneCount: number
  }>
}

export interface StoryboardPreviewPartData {
  workflowId: 'script-to-storyboard'
  episodeId: string
  storyboards: Array<{
    storyboardId: string
    clipId: string
    clipSummary: string
    panelCount: number
    sampleDescriptions: string[]
  }>
  voiceLineCount: number
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
  planId: string
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
  activeRuns: ProjectContextSnapshot['activeRuns']
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
  | 'data-agent-stop'
  | 'data-project-phase'
  | 'data-confirmation-request'
  | 'data-task-submitted'
  | 'data-task-batch-submitted'
  | 'data-workflow-plan'
  | 'data-approval-request'
  | 'data-workflow-status'
  | 'data-plan'
  | 'data-script-preview'
  | 'data-storyboard-preview'
  | 'data-project-context'
