import type { NextRequest } from 'next/server'
import { getProjectModelConfig } from '@/lib/config-service'
import { resolveProjectContextPolicy } from '@/lib/project-context/policy'
import { prisma } from '@/lib/prisma'
import { assembleProjectContext } from '@/lib/project-context/assembler'
import { submitTask } from '@/lib/task/submitter'
import { getTaskById } from '@/lib/task/service'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_STATUS, TASK_TYPE, type TaskType } from '@/lib/task/types'
import { buildExecutionPlanDraft } from './plan-builder'
import type {
  CommandEnvelope,
  CommandExecutionResult,
  CommandListItem,
  CommandStatus,
  ExecutionPlanDraft,
  PlanStep,
} from './types'

type JsonRecord = Record<string, unknown>

type ProjectCommandRow = {
  id: string
  projectId: string
  userId: string
  episodeId: string | null
  source: string
  commandType: string
  scopeRef: string | null
  status: string
  summary: string | null
  rawInput: unknown
  normalizedInput: unknown
  currentPlanId: string | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: Date
  updatedAt: Date
}

type ExecutionPlanRow = {
  id: string
  commandId: string
  projectId: string
  episodeId: string | null
  status: string
  summary: string | null
  requiresApproval: boolean
  riskSummary: unknown
  linkedTaskId: string | null
  createdAt: Date
  updatedAt: Date
}

type ExecutionPlanStepRow = {
  id: string
  planId: string
  stepKey: string
  skillId: string
  orderIndex: number
  scopeRef: string | null
  dependsOnJson: unknown
  inputArtifactsJson: unknown
  outputArtifactsJson: unknown
  invalidatesJson: unknown
  mutationKind: string
  riskLevel: string
  requiresApproval: boolean
}

type PlanApprovalRow = {
  id: string
  planId: string
  commandId: string
  status: string
  reason: string | null
  responseNote: string | null
}

type CreateArgs = {
  data: Record<string, unknown>
}

type UpdateArgs = {
  where: Record<string, unknown>
  data: Record<string, unknown>
}

type FindUniqueArgs = {
  where: Record<string, unknown>
}

type FindManyArgs = {
  where?: Record<string, unknown>
  orderBy?: Record<string, unknown> | Array<Record<string, unknown>>
  take?: number
}

type CommandModel = {
  create: (args: CreateArgs) => Promise<ProjectCommandRow>
  update: (args: UpdateArgs) => Promise<ProjectCommandRow>
  findUnique: (args: FindUniqueArgs) => Promise<ProjectCommandRow | null>
  findMany: (args: FindManyArgs) => Promise<ProjectCommandRow[]>
}

type PlanModel = {
  create: (args: CreateArgs) => Promise<ExecutionPlanRow>
  update: (args: UpdateArgs) => Promise<ExecutionPlanRow>
  findUnique: (args: FindUniqueArgs) => Promise<ExecutionPlanRow | null>
  findMany: (args: FindManyArgs) => Promise<ExecutionPlanRow[]>
}

type PlanStepModel = {
  createMany: (args: { data: Array<Record<string, unknown>> }) => Promise<{ count: number }>
  findMany: (args: FindManyArgs) => Promise<ExecutionPlanStepRow[]>
}

type ApprovalModel = {
  create: (args: CreateArgs) => Promise<PlanApprovalRow>
  update: (args: UpdateArgs) => Promise<PlanApprovalRow>
  findFirst: (args: FindManyArgs) => Promise<PlanApprovalRow | null>
}

type CommandCenterPrismaClient = {
  projectCommand: CommandModel
  executionPlan: PlanModel
  executionPlanStep: PlanStepModel
  planApproval: ApprovalModel
}

const commandCenterClient = prisma as unknown as CommandCenterPrismaClient

function asJsonRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as JsonRecord
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function normalizeCommandEnvelope(params: {
  projectId: string
  body: unknown
}): CommandEnvelope {
  const body = readObject(params.body)
  const commandType = readTrimmedString(body.commandType)
  const source = readTrimmedString(body.source) === 'assistant-panel' ? 'assistant-panel' : 'gui'
  const episodeId = readTrimmedString(body.episodeId) || null
  const scopeRef = readTrimmedString(body.scopeRef) || null
  const input = readObject(body.input)
  const policyOverrides = readObject(body.policyOverrides)

  if (commandType === 'run_skill') {
    const skillIdRaw = readTrimmedString(body.skillId)
    if (
      skillIdRaw !== 'insert_panel'
      && skillIdRaw !== 'panel_variant'
      && skillIdRaw !== 'regenerate_storyboard_text'
      && skillIdRaw !== 'modify_shot_prompt'
    ) {
      throw new Error('skillId is invalid')
    }
    return {
      commandType,
      source,
      projectId: params.projectId,
      episodeId,
      scopeRef,
      policyOverrides,
      skillId: skillIdRaw,
      input,
    }
  }

  throw new Error('commandType is invalid')
}

export function requiresExplicitApproval(plan: ExecutionPlanDraft): boolean {
  return plan.requiresApproval || plan.steps.some((step) => step.mutationKind === 'delete')
}

export function resolvePlanApprovalRequirement(command: CommandEnvelope, plan: ExecutionPlanDraft): boolean {
  void command
  return requiresExplicitApproval(plan)
}

function toStatus(value: string): CommandStatus {
  if (
    value === 'planned'
    || value === 'awaiting_approval'
    || value === 'approved'
    || value === 'rejected'
    || value === 'running'
    || value === 'completed'
    || value === 'failed'
    || value === 'canceled'
  ) {
    return value
  }
  return 'failed'
}

function mapPlanStepRow(row: ExecutionPlanStepRow): PlanStep {
  return {
    stepKey: row.stepKey,
    skillId: row.skillId,
    title: row.skillId,
    orderIndex: row.orderIndex,
    scopeRef: row.scopeRef,
    inputArtifacts: Array.isArray(row.inputArtifactsJson) ? row.inputArtifactsJson as PlanStep['inputArtifacts'] : [],
    outputArtifacts: Array.isArray(row.outputArtifactsJson) ? row.outputArtifactsJson as PlanStep['outputArtifacts'] : [],
    invalidates: Array.isArray(row.invalidatesJson) ? row.invalidatesJson as PlanStep['invalidates'] : [],
    mutationKind: row.mutationKind as PlanStep['mutationKind'],
    riskLevel: row.riskLevel as PlanStep['riskLevel'],
    requiresApproval: row.requiresApproval,
    dependsOn: Array.isArray(row.dependsOnJson) ? row.dependsOnJson as string[] : [],
  }
}

function mapCommandResult(params: {
  command: ProjectCommandRow
  plan: ExecutionPlanRow
  steps: ExecutionPlanStepRow[]
  approval: PlanApprovalRow | null
}): CommandListItem {
  return {
    commandId: params.command.id,
    planId: params.plan.id,
    requiresApproval: params.plan.requiresApproval,
    status: toStatus(params.command.status),
    linkedTaskId: params.plan.linkedTaskId,
    summary: params.plan.summary || params.command.summary || '',
    steps: params.steps.sort((left, right) => left.orderIndex - right.orderIndex).map(mapPlanStepRow),
    createdAt: params.command.createdAt.toISOString(),
    updatedAt: params.command.updatedAt.toISOString(),
    commandType: params.command.commandType as CommandListItem['commandType'],
    source: params.command.source as CommandListItem['source'],
    episodeId: params.command.episodeId,
    approval: params.approval
      ? {
          id: params.approval.id,
          status: params.approval.status as 'pending' | 'approved' | 'rejected',
          reason: params.approval.reason,
          responseNote: params.approval.responseNote,
        }
      : null,
  }
}

function taskTypeForCommand(command: CommandEnvelope): TaskType {
  switch (command.skillId) {
    case 'insert_panel':
      return TASK_TYPE.INSERT_PANEL
    case 'panel_variant':
      return TASK_TYPE.PANEL_VARIANT
    case 'regenerate_storyboard_text':
      return TASK_TYPE.REGENERATE_STORYBOARD_TEXT
    case 'modify_shot_prompt':
      return TASK_TYPE.AI_MODIFY_SHOT_PROMPT
    default:
      throw new Error(`TASK_TYPE_NOT_SUPPORTED: ${command.skillId satisfies never}`)
  }
}

function dedupeKeyForCommand(command: CommandEnvelope): string | null {
  if (!command.episodeId) return null
  return `${command.skillId}:${command.episodeId}:${command.scopeRef || 'scope'}`
}

async function resolveCommandTaskPayload(command: CommandEnvelope, userId: string): Promise<JsonRecord> {
  const payload = { ...command.input } as JsonRecord
  const projectConfig = await getProjectModelConfig(command.projectId, userId)

  if (!payload.model && projectConfig.analysisModel) {
    payload.model = projectConfig.analysisModel
  }
  if (!payload.analysisModel && projectConfig.analysisModel) {
    payload.analysisModel = projectConfig.analysisModel
  }
  if (command.episodeId) {
    payload.episodeId = command.episodeId
  }

  payload.displayMode = 'detail'
  payload.async = true
  return payload
}

async function createPersistentCommand(params: {
  command: CommandEnvelope
  userId: string
  plan: ExecutionPlanDraft
  request: NextRequest
}): Promise<{
  command: ProjectCommandRow
  plan: ExecutionPlanRow
}> {
  const context = await assembleProjectContext({
    projectId: params.command.projectId,
    userId: params.userId,
    episodeId: params.command.episodeId || null,
  })
  const policy = resolveProjectContextPolicy({
    projectId: params.command.projectId,
    episodeId: params.command.episodeId || null,
    projectPolicy: context.policy,
    commandPolicy: params.command.policyOverrides || null,
  })
  const requiresApproval = resolvePlanApprovalRequirement(params.command, params.plan)
  const commandRow = await commandCenterClient.projectCommand.create({
    data: {
      projectId: params.command.projectId,
      userId: params.userId,
      episodeId: params.command.episodeId || null,
      source: params.command.source,
      commandType: params.command.commandType,
      scopeRef: params.command.scopeRef || null,
      status: requiresApproval ? 'awaiting_approval' : 'planned',
      summary: params.plan.summary,
      rawInput: asJsonRecord(params.command),
      normalizedInput: asJsonRecord(params.command),
    },
  })
  const planRow = await commandCenterClient.executionPlan.create({
    data: {
      commandId: commandRow.id,
      projectId: params.command.projectId,
      episodeId: params.command.episodeId || null,
      status: requiresApproval ? 'awaiting_approval' : 'planned',
      summary: params.plan.summary,
      requiresApproval,
      riskSummary: params.plan.riskSummary,
      contextSnapshot: context,
      policySnapshot: policy,
    },
  })
  await commandCenterClient.projectCommand.update({
    where: { id: commandRow.id },
    data: {
      currentPlanId: planRow.id,
    },
  })
  await commandCenterClient.executionPlanStep.createMany({
    data: params.plan.steps.map((step) => ({
      planId: planRow.id,
      stepKey: step.stepKey,
      skillId: step.skillId,
      orderIndex: step.orderIndex,
      scopeRef: step.scopeRef || null,
      dependsOnJson: step.dependsOn,
      inputArtifactsJson: step.inputArtifacts,
      outputArtifactsJson: step.outputArtifacts,
      invalidatesJson: step.invalidates,
      mutationKind: step.mutationKind,
      riskLevel: step.riskLevel,
      requiresApproval: step.requiresApproval,
    })),
  })
  if (requiresApproval) {
    await commandCenterClient.planApproval.create({
      data: {
        planId: planRow.id,
        commandId: commandRow.id,
        projectId: params.command.projectId,
        userId: params.userId,
        status: 'pending',
        reason: params.plan.riskSummary.reasons.join('\n'),
      },
    })
  }
  return {
    command: {
      ...commandRow,
      currentPlanId: planRow.id,
    },
    plan: planRow,
  }
}

async function dispatchCommandPlan(params: {
  request: NextRequest
  userId: string
  command: CommandEnvelope
  commandRow: ProjectCommandRow
  planRow: ExecutionPlanRow
}): Promise<CommandExecutionResult> {
  const locale = resolveRequiredTaskLocale(params.request, params.command)
  const taskType = taskTypeForCommand(params.command)
  const payload = await resolveCommandTaskPayload(params.command, params.userId)
  const targetType = 'ProjectEpisode'
  const targetId = params.command.episodeId || params.command.projectId
  const taskResult = await submitTask({
    userId: params.userId,
    locale,
    projectId: params.command.projectId,
    episodeId: params.command.episodeId || null,
    type: taskType,
    targetType,
    targetId,
    payload: {
      ...payload,
      commandId: params.commandRow.id,
      planId: params.planRow.id,
    },
    dedupeKey: dedupeKeyForCommand(params.command),
    priority: 2,
  })

  const nextStatus: CommandStatus = taskResult.taskId ? 'running' : 'failed'
  await commandCenterClient.projectCommand.update({
    where: { id: params.commandRow.id },
    data: {
      status: nextStatus,
    },
  })
  await commandCenterClient.executionPlan.update({
    where: { id: params.planRow.id },
    data: {
      linkedTaskId: taskResult.taskId,
      status: nextStatus,
    },
  })

  return {
    commandId: params.commandRow.id,
    planId: params.planRow.id,
    requiresApproval: false,
    status: nextStatus,
    linkedTaskId: taskResult.taskId,
    summary: params.planRow.summary || '',
    steps: [],
  }
}

export async function executeProjectCommand(params: {
  request: NextRequest
  projectId: string
  userId: string
  body: unknown
}): Promise<CommandExecutionResult> {
  const command = normalizeCommandEnvelope({
    projectId: params.projectId,
    body: params.body,
  })
  const planDraft = buildExecutionPlanDraft(command)
  const persisted = await createPersistentCommand({
    command,
    userId: params.userId,
    plan: planDraft,
    request: params.request,
  })

  if (resolvePlanApprovalRequirement(command, planDraft)) {
    return {
      commandId: persisted.command.id,
      planId: persisted.plan.id,
      requiresApproval: true,
      status: 'awaiting_approval',
      linkedTaskId: null,
      summary: persisted.plan.summary || '',
      steps: planDraft.steps,
    }
  }

  const dispatched = await dispatchCommandPlan({
    request: params.request,
    userId: params.userId,
    command,
    commandRow: persisted.command,
    planRow: persisted.plan,
  })
  return {
    ...dispatched,
    steps: planDraft.steps,
  }
}

async function getPlanRowsForCommand(commandId: string): Promise<{
  plan: ExecutionPlanRow | null
  steps: ExecutionPlanStepRow[]
  approval: PlanApprovalRow | null
}> {
  const plan = await commandCenterClient.executionPlan.findUnique({
    where: { commandId },
  })
  if (!plan) {
    return {
      plan: null,
      steps: [],
      approval: null,
    }
  }
  const [steps, approval] = await Promise.all([
    commandCenterClient.executionPlanStep.findMany({
      where: { planId: plan.id },
      orderBy: { orderIndex: 'asc' },
    }),
    commandCenterClient.planApproval.findFirst({
      where: { planId: plan.id },
      orderBy: { createdAt: 'desc' },
      take: 1,
    }),
  ])
  return { plan, steps, approval }
}

export async function listProjectCommands(params: {
  projectId: string
  episodeId?: string | null
  limit?: number
}): Promise<CommandListItem[]> {
  const commands = await commandCenterClient.projectCommand.findMany({
    where: {
      projectId: params.projectId,
      ...(params.episodeId ? { episodeId: params.episodeId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit || 20,
  })

  const items: CommandListItem[] = []
  for (const command of commands) {
    const planRows = await getPlanRowsForCommand(command.id)
    if (!planRows.plan) continue
    items.push(mapCommandResult({
      command,
      plan: planRows.plan,
      steps: planRows.steps,
      approval: planRows.approval,
    }))
  }
  return items
}

export async function approveProjectPlan(params: {
  request: NextRequest
  userId: string
  planId: string
}): Promise<CommandExecutionResult> {
  const plan = await commandCenterClient.executionPlan.findUnique({
    where: { id: params.planId },
  })
  if (!plan) {
    throw new Error(`PLAN_NOT_FOUND: ${params.planId}`)
  }
  const command = await commandCenterClient.projectCommand.findUnique({
    where: { id: plan.commandId },
  })
  if (!command) {
    throw new Error(`COMMAND_NOT_FOUND: ${plan.commandId}`)
  }
  const approval = await commandCenterClient.planApproval.findFirst({
    where: { planId: plan.id },
    orderBy: { createdAt: 'desc' },
    take: 1,
  })
  if (approval) {
    await commandCenterClient.planApproval.update({
      where: { id: approval.id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
      },
    })
  }
  await commandCenterClient.projectCommand.update({
    where: { id: command.id },
    data: { status: 'approved' },
  })
  await commandCenterClient.executionPlan.update({
    where: { id: plan.id },
    data: { status: 'approved' },
  })

  const normalizedCommand = asJsonRecord(command.normalizedInput) as unknown as CommandEnvelope
  const dispatched = await dispatchCommandPlan({
    request: params.request,
    userId: params.userId,
    command: normalizedCommand,
    commandRow: {
      ...command,
      status: 'approved',
    },
    planRow: {
      ...plan,
      status: 'approved',
    },
  })
  const steps = await commandCenterClient.executionPlanStep.findMany({
    where: { planId: plan.id },
    orderBy: { orderIndex: 'asc' },
  })
  return {
    ...dispatched,
    steps: steps.map(mapPlanStepRow),
  }
}

export async function rejectProjectPlan(params: {
  planId: string
  note?: string
}): Promise<CommandExecutionResult> {
  const plan = await commandCenterClient.executionPlan.findUnique({
    where: { id: params.planId },
  })
  if (!plan) {
    throw new Error(`PLAN_NOT_FOUND: ${params.planId}`)
  }
  const command = await commandCenterClient.projectCommand.findUnique({
    where: { id: plan.commandId },
  })
  if (!command) {
    throw new Error(`COMMAND_NOT_FOUND: ${plan.commandId}`)
  }
  const approval = await commandCenterClient.planApproval.findFirst({
    where: { planId: plan.id },
    orderBy: { createdAt: 'desc' },
    take: 1,
  })
  if (approval) {
    await commandCenterClient.planApproval.update({
      where: { id: approval.id },
      data: {
        status: 'rejected',
        responseNote: params.note || null,
        rejectedAt: new Date(),
      },
    })
  }
  await commandCenterClient.executionPlan.update({
    where: { id: plan.id },
    data: {
      status: 'rejected',
    },
  })
  await commandCenterClient.projectCommand.update({
    where: { id: command.id },
    data: {
      status: 'rejected',
      errorMessage: params.note || 'rejected',
    },
  })
  const steps = await commandCenterClient.executionPlanStep.findMany({
    where: { planId: plan.id },
    orderBy: { orderIndex: 'asc' },
  })
  return {
    commandId: command.id,
    planId: plan.id,
    requiresApproval: plan.requiresApproval,
    status: 'rejected',
    linkedTaskId: plan.linkedTaskId,
    summary: plan.summary || command.summary || '',
    steps: steps.map(mapPlanStepRow),
  }
}

export async function syncProjectCommandStatus(params: {
  commandId: string
}): Promise<void> {
  const command = await commandCenterClient.projectCommand.findUnique({
    where: { id: params.commandId },
  })
  if (!command || !command.currentPlanId) return
  const plan = await commandCenterClient.executionPlan.findUnique({
    where: { id: command.currentPlanId },
  })
  if (!plan?.linkedTaskId) return
  const task = await getTaskById(plan.linkedTaskId)
  if (!task) return

  const nextStatus: CommandStatus =
    task.status === TASK_STATUS.COMPLETED
      ? 'completed'
      : task.status === TASK_STATUS.FAILED || task.status === TASK_STATUS.CANCELED
        ? 'failed'
        : 'running'

  await commandCenterClient.projectCommand.update({
    where: { id: command.id },
    data: {
      status: nextStatus,
      errorMessage: task.errorMessage || null,
    },
  })
  await commandCenterClient.executionPlan.update({
    where: { id: command.currentPlanId },
    data: {
      status: nextStatus,
    },
  })
}
