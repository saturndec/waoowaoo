import { z } from 'zod'
import { queryTaskTargetStates } from '@/lib/task/state-service'
import { withPrismaRetry } from '@/lib/prisma-retry'
import { assembleProjectContext } from '@/lib/project-context/assembler'
import { listProjectCommands, syncProjectCommandStatus } from '@/lib/command-center/executor'
import { listAgentSkillManifests, loadAgentSkill } from '@/lib/agent-skills/registry'
import { resolveProjectPhase } from '@/lib/project-agent/project-phase'
import { assembleProjectProjectionLite } from '@/lib/project-projection/lite'
import { assembleProjectProjectionFull } from '@/lib/project-projection/full'
import { listSavedSkills } from '@/lib/saved-skills/service'
import { buildAssistantProjectContextSnapshot } from '@/lib/project-agent/presentation'
import type {
  ProjectContextPartData,
  ProjectPhasePartData,
} from '@/lib/project-agent/types'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { writeOperationDataPart } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'

const taskTargetSchema = z.object({
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  types: z.array(z.string().min(1)).optional(),
})

const EFFECTS_NONE = {
  writes: false,
  billable: false,
  destructive: false,
  overwrite: false,
  bulk: false,
  externalSideEffects: false,
  longRunning: false,
} as const

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseProjectionScope(scopeRef: string | undefined): { clipId?: string | null; storyboardId?: string | null; panelId?: string | null } | null {
  const normalized = normalizeString(scopeRef)
  if (!normalized) return null
  if (normalized.startsWith('clip:')) {
    const clipId = normalized.slice('clip:'.length).trim()
    return clipId ? { clipId } : null
  }
  if (normalized.startsWith('storyboard:')) {
    const storyboardId = normalized.slice('storyboard:'.length).trim()
    return storyboardId ? { storyboardId } : null
  }
  if (normalized.startsWith('panel:')) {
    const panelId = normalized.slice('panel:'.length).trim()
    return panelId ? { panelId } : null
  }
  return null
}

export function createReadOperations(): ProjectAgentOperationRegistryDraft {
  return {
    get_project_phase: defineOperation({
      id: 'get_project_phase',
      summary: 'Resolve the current project phase, progress counts, active runs, failed items, stale artifacts, and available next actions. Always call this before acting to understand the project state.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: z.object({}),
      outputSchema: z.unknown(),
      execute: async (ctx) => {
        const snapshot = await resolveProjectPhase({
          projectId: ctx.projectId,
          userId: ctx.userId,
          episodeId: ctx.context.episodeId || null,
          currentStage: ctx.context.currentStage || null,
        })
        writeOperationDataPart<ProjectPhasePartData>(ctx.writer, 'data-project-phase', {
          phase: snapshot.phase,
          snapshot,
        })
        return snapshot
      },
    }),
    get_project_snapshot: defineOperation({
      id: 'get_project_snapshot',
      summary: 'Load a project snapshot projection with progress, active runs, latest artifacts, and approvals. Use detail=full to inspect panel-level state including descriptions, prompts, and media URLs.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: z.object({
        detail: z.enum(['lite', 'full']).optional(),
        panelLimit: z.number().int().positive().max(1000).optional(),
        scopeRef: z.string().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => (input.detail === 'full'
        ? assembleProjectProjectionFull({
            projectId: ctx.projectId,
            userId: ctx.userId,
            episodeId: ctx.context.episodeId || null,
            currentStage: ctx.context.currentStage || null,
            panelLimit: input.panelLimit,
            scope: parseProjectionScope(input.scopeRef) ?? null,
          })
        : assembleProjectProjectionLite({
            projectId: ctx.projectId,
            userId: ctx.userId,
            episodeId: ctx.context.episodeId || null,
            currentStage: ctx.context.currentStage || null,
          })),
    }),
    get_project_context: defineOperation({
      id: 'get_project_context',
      summary: 'Load the current project and episode context snapshot.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: z.object({
        detail: z.enum(['snapshot', 'full']).optional(),
        selectedScopeRef: z.string().optional(),
        selectedPanelId: z.string().optional(),
        selectedClipId: z.string().optional(),
        selectedAssetId: z.string().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const projectContext = await assembleProjectContext({
          projectId: ctx.projectId,
          userId: ctx.userId,
          episodeId: ctx.context.episodeId || null,
          currentStage: ctx.context.currentStage || null,
          selectedScopeRef: normalizeString(input.selectedScopeRef) || ctx.context.selectedScopeRef || null,
          selectedPanelId: normalizeString(input.selectedPanelId) || ctx.context.selectedPanelId || null,
          selectedClipId: normalizeString(input.selectedClipId) || ctx.context.selectedClipId || null,
          selectedAssetId: normalizeString(input.selectedAssetId) || ctx.context.selectedAssetId || null,
        })
        const snapshot = buildAssistantProjectContextSnapshot(projectContext)
        writeOperationDataPart<ProjectContextPartData>(ctx.writer, 'data-project-context', {
          context: snapshot,
        })
        if (input.detail === 'full') return projectContext
        return snapshot
      },
    }),
    list_skill_catalog: defineOperation({
      id: 'list_skill_catalog',
      summary: 'List available Agent Skill catalog entries.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: z.object({
        documentPath: z.string().min(1).optional(),
        maxChars: z.number().int().positive().max(20000).optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (_, input) => {
        const catalog = listAgentSkillManifests().map((skill) => ({
          id: skill.id,
          kind: 'agent-skill' as const,
          name: skill.name,
          summary: skill.summary,
          description: skill.description,
          documentPath: skill.documentPath,
        }))
        const payload = {
          catalog,
        }

        const documentPath = normalizeString(input.documentPath)
        if (!documentPath) return payload

        const manifest = listAgentSkillManifests().find((skill) => skill.documentPath === documentPath)
        if (!manifest) return payload
        const loaded = loadAgentSkill(manifest.id)
        if (!loaded) return payload
        const content = loaded.instructions
        const limit = Math.max(200, Math.min(20000, input.maxChars ?? 6000))
        return {
          ...payload,
          document: {
            documentPath,
            truncated: content.length > limit,
            content: content.slice(0, limit),
          },
        }
      },
    }),
    list_saved_skills: defineOperation({
      id: 'list_saved_skills',
      summary: 'List saved skills for the current user within this project.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: z.object({
        limit: z.number().int().positive().max(50).optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const items = await listSavedSkills({
          userId: ctx.userId,
          projectId: ctx.projectId,
          limit: input.limit ?? 20,
        })
        return items.map((item) => ({
          id: item.id,
          name: item.name,
          summary: item.summary,
          kind: item.kind,
          projectId: item.projectId,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        }))
      },
    }),
    get_task_status: defineOperation({
      id: 'get_task_status',
      summary: 'Query task target states for one or more project targets.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: z.object({
        targets: z.array(taskTargetSchema).min(1).max(500),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => ({
        states: await withPrismaRetry(() =>
          queryTaskTargetStates({
            projectId: ctx.projectId,
            userId: ctx.userId,
            targets: input.targets,
          })
        ),
      }),
    }),
    list_recent_commands: defineOperation({
      id: 'list_recent_commands',
      summary: 'List recent command and run status for the current project or episode.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: z.object({
        limit: z.number().int().positive().max(50).optional(),
        syncRunning: z.boolean().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const limit = input.limit || 10
        const syncRunning = input.syncRunning === true

        const commands = await listProjectCommands({
          projectId: ctx.projectId,
          episodeId: ctx.context.episodeId || null,
          limit,
        })

        if (!syncRunning) return commands

        for (const command of commands) {
          if (command.status === 'running' || command.status === 'approved') {
            await syncProjectCommandStatus({ commandId: command.commandId })
          }
        }

        return await listProjectCommands({
          projectId: ctx.projectId,
          episodeId: ctx.context.episodeId || null,
          limit,
        })
      },
    }),
    get_project_command: defineOperation({
      id: 'get_project_command',
      summary: 'Get a single command by id (optionally sync status from its linked run).',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: z.object({
        commandId: z.string().min(1),
        sync: z.boolean().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        if (input.sync !== false) {
          await syncProjectCommandStatus({ commandId: input.commandId })
        }
        const commands = await listProjectCommands({
          projectId: ctx.projectId,
          limit: 50,
        })
        const command = commands.find((item) => item.commandId === input.commandId) || null
        return { command }
      },
    }),
  }
}
