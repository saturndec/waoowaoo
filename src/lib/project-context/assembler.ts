import { prisma } from '@/lib/prisma'
import { listArtifacts, listRuns } from '@/lib/run-runtime/service'
import { normalizeTaskOperationResult, type OperationResultTaskRow } from '@/lib/task/operation-result-normalizer'
import { resolveProjectContextPolicy } from './policy'
import type { ProjectContextSnapshot } from './types'

type ApprovalSummaryRow = {
  id: string
  status: string
  createdAt: Date
  plan: {
    linkedRunId: string | null
  }
}

async function listLatestArtifactsForContext(params: {
  userId: string
  projectId: string
  episodeId?: string | null
}) {
  const latestRun = (await listRuns({
    userId: params.userId,
    projectId: params.projectId,
    episodeId: params.episodeId || undefined,
    limit: 1,
  }))[0] || null
  if (!latestRun) return []
  const artifacts = await listArtifacts({
    runId: latestRun.id,
    limit: 20,
  })
  return artifacts.map((artifact) => ({
    type: artifact.artifactType,
    refId: artifact.refId,
    createdAt: artifact.createdAt,
  }))
}

async function listOperationResultsForContext(params: {
  userId: string
  projectId: string
  statuses: string[]
  limit?: number
}) {
  const rows = await prisma.task.findMany({
    where: {
      userId: params.userId,
      projectId: params.projectId,
      operationId: { not: null },
      status: { in: params.statuses },
    },
    orderBy: { updatedAt: 'desc' },
    take: params.limit ?? 10,
    select: {
      id: true,
      type: true,
      status: true,
      targetType: true,
      targetId: true,
      episodeId: true,
      payload: true,
      result: true,
      errorCode: true,
      errorMessage: true,
      operationId: true,
      operationSource: true,
      operationConfirmed: true,
      queuedAt: true,
      finishedAt: true,
      updatedAt: true,
    },
  })
  return rows
    .map((row) => normalizeTaskOperationResult(row satisfies OperationResultTaskRow))
    .filter((item): item is NonNullable<typeof item> => item !== null)
}

export async function assembleProjectContext(params: {
  projectId: string
  userId: string
  episodeId?: string | null
  currentStage?: string | null
  selectedScopeRef?: string | null
  selectedPanelId?: string | null
  selectedClipId?: string | null
  selectedAssetId?: string | null
}): Promise<ProjectContextSnapshot> {
  const [project, episode, runs, latestArtifacts, approvals, activeOperationTasks, recentOperationResults] = await Promise.all([
    prisma.project.findUnique({
      where: { id: params.projectId },
    }),
    params.episodeId
      ? prisma.projectEpisode.findUnique({
          where: { id: params.episodeId },
          include: {
            clips: {
              orderBy: { createdAt: 'asc' },
              include: {
                storyboard: {
                  include: {
                    panels: {
                      orderBy: { panelIndex: 'asc' },
                      select: {
                        id: true,
                        panelIndex: true,
                        description: true,
                        imagePrompt: true,
                        imageUrl: true,
                        imageMediaId: true,
                        candidateImages: true,
                        videoPrompt: true,
                        videoUrl: true,
                        videoMediaId: true,
                        updatedAt: true,
                      },
                    },
                  },
                },
              },
            },
            voiceLines: {
              orderBy: { lineIndex: 'asc' },
              select: {
                id: true,
              },
            },
          },
        })
      : Promise.resolve(null),
    listRuns({
      userId: params.userId,
      projectId: params.projectId,
      episodeId: params.episodeId || undefined,
      statuses: ['queued', 'running', 'canceling'],
      limit: 10,
    }),
    listLatestArtifactsForContext({
      userId: params.userId,
      projectId: params.projectId,
      episodeId: params.episodeId || undefined,
    }),
    params.episodeId
      ? prisma.planApproval.findMany({
          where: {
            projectId: params.projectId,
            status: {
              in: ['pending', 'approved'],
            },
            plan: {
              episodeId: params.episodeId,
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            plan: {
              select: {
                linkedRunId: true,
              },
            },
          },
        }) as Promise<ApprovalSummaryRow[]>
      : Promise.resolve([] as ApprovalSummaryRow[]),
    listOperationResultsForContext({
      userId: params.userId,
      projectId: params.projectId,
      statuses: ['queued', 'processing'],
      limit: 10,
    }),
    listOperationResultsForContext({
      userId: params.userId,
      projectId: params.projectId,
      statuses: ['completed', 'failed', 'canceled'],
      limit: 10,
    }),
  ])

  if (!project) {
    throw new Error(`PROJECT_CONTEXT_NOT_FOUND: ${params.projectId}`)
  }

  const policy = resolveProjectContextPolicy({
    projectId: params.projectId,
    episodeId: params.episodeId || null,
    projectPolicy: {
      projectId: params.projectId,
      episodeId: params.episodeId || null,
      videoRatio: project.videoRatio,
      artStyle: project.artStyle,
      analysisModel: project.analysisModel,
      overrides: {},
    },
  })

  const clipSnapshots = (episode?.clips || []).map((clip) => ({
    clipId: clip.id,
    summary: clip.summary,
    screenplayReady: !!clip.screenplay,
    storyboardReady: !!clip.storyboard,
    panelCount: clip.storyboard?.panels.length || 0,
  }))
  const panelSnapshots = (episode?.clips || []).flatMap((clip) =>
    (clip.storyboard?.panels || []).map((panel) => ({
      panelId: panel.id,
      clipId: clip.id,
      storyboardId: clip.storyboard?.id || '',
      panelIndex: panel.panelIndex,
      description: panel.description,
      imagePrompt: panel.imagePrompt ?? null,
      imageUrl: panel.imageUrl ?? null,
      imageMediaId: panel.imageMediaId ?? null,
      candidateImages: panel.candidateImages ?? null,
      videoPrompt: panel.videoPrompt ?? null,
      videoUrl: panel.videoUrl ?? null,
      videoMediaId: panel.videoMediaId ?? null,
      updatedAt: panel.updatedAt.toISOString(),
    })),
  )
  const storyboardCount = (episode?.clips || []).filter((clip) => !!clip.storyboard).length
  const panelCount = panelSnapshots.length
  const screenplayClipCount = (episode?.clips || []).filter((clip) => !!clip.screenplay).length

  return {
    projectId: project.id,
    projectName: project.name,
    episodeId: episode?.id || null,
    episodeName: episode?.name || null,
    currentStage: params.currentStage || null,
    selectedScopeRef: params.selectedScopeRef || null,
    selectedPanelId: params.selectedPanelId || null,
    selectedClipId: params.selectedClipId || null,
    selectedAssetId: params.selectedAssetId || null,
    latestArtifacts,
    activeRuns: runs.map((run) => ({
      id: run.id,
      workflowType: run.workflowType,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    })),
    activeOperationTasks,
    recentOperationResults,
    policy,
    workflow: {
      latestRunId: runs[0]?.id || null,
      episode: episode
        ? {
            novelText: episode.novelText || null,
            clipCount: episode.clips.length,
            screenplayClipCount,
            storyboardCount,
            panelCount,
            voiceLineCount: episode.voiceLines.length,
          }
        : null,
      clips: clipSnapshots,
      panels: panelSnapshots,
      approvals: approvals.map((approval) => ({
        id: approval.id,
        status: approval.status,
        createdAt: approval.createdAt.toISOString(),
        linkedRunId: approval.plan.linkedRunId,
      })),
    },
  }
}
