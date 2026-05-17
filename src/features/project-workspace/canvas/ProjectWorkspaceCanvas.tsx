'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WheelEvent } from 'react'
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type NodeMouseHandler,
  type OnNodeDrag,
  type NodeChange,
  type Viewport,
  useReactFlow,
} from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { logWarn as _ulogWarn } from '@/lib/logging/core'
import { TASK_TYPE } from '@/lib/task/types'
import type { UpsertCanvasLayoutInput } from '@/lib/project-canvas/layout/canvas-layout-contract'
import type { CanvasNodeLayout } from '@/lib/project-canvas/layout/canvas-layout.types'
import { useProjectEditScreenplay, useProjectEditScript } from '@/lib/query/hooks'
import { useTaskTargetStateMap } from '@/lib/query/hooks/useTaskTargetStateMap'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'
import { useWorkspaceProvider } from '../WorkspaceProvider'
import { useWorkspaceRuntime } from '../WorkspaceRuntimeContext'
import { useCanvasLayoutPersistence } from './hooks/useCanvasLayoutPersistence'
import {
  buildWorkspaceNodeCanvasProjection,
  useWorkspaceNodeCanvasProjection,
} from './hooks/useWorkspaceNodeCanvasProjection'
import { useWorkspaceNodeCanvasActions } from './hooks/useWorkspaceNodeCanvasActions'
import {
  buildWorkspaceCanvasEdgeSignature,
  buildWorkspaceCanvasNodeSignature,
} from './hooks/canvas-projection-signature'
import {
  DEFAULT_WORKSPACE_CANVAS_VIEWPORT,
  getNextWorkspaceCanvasWheelZoom,
  WORKSPACE_CANVAS_MAX_ZOOM,
  WORKSPACE_CANVAS_MIN_ZOOM,
} from './canvasViewport'
import { workspaceNodeTypes } from './nodes/workspaceNodeTypes'
import type { WorkspaceCanvasFlowEdge, WorkspaceCanvasFlowNode, WorkspaceCanvasNodeAction } from './node-canvas-types'
import {
  getWorkspaceCanvasNodePresentationProfile,
  resolveWorkspaceCanvasNodeSize,
} from './node-presentation-profiles'
import { repairWorkspaceNodeOverlapsNearMovedNodes } from './layout/workspace-node-auto-layout'

const EMPTY_SAVED_NODE_LAYOUTS: readonly CanvasNodeLayout[] = []
const CANVAS_FLOATING_PANEL_BOTTOM_OFFSET_PX = 56
const OPTIMISTIC_NODE_RUNNING_TIMEOUT_MS = 15000

export interface WorkspaceAssistantSelectionContext {
  selectedScopeRef?: string | null
  selectedPanelId?: string | null
  selectedClipId?: string | null
  selectedAssetId?: string | null
}

interface ProjectWorkspaceCanvasContentProps {
  onAssistantSelectionChange?: (selection: WorkspaceAssistantSelectionContext) => void
  editScriptPending?: boolean
}

interface CanvasViewportControlsProps {
  readonly resetLabel: string
  readonly fitViewLabel: string
  readonly zoomInLabel: string
  readonly zoomOutLabel: string
  readonly onResetLayout: () => void
  readonly onFitView: () => void
  readonly onZoomIn: () => void
  readonly onZoomOut: () => void
}

function CanvasViewportControls({
  resetLabel,
  fitViewLabel,
  zoomInLabel,
  zoomOutLabel,
  onResetLayout,
  onFitView,
  onZoomIn,
  onZoomOut,
}: CanvasViewportControlsProps) {
  const buttonClassName = 'inline-flex h-10 w-10 items-center justify-center border-r border-[var(--glass-stroke-soft)] text-[var(--glass-text-primary)] transition last:border-r-0 hover:bg-[var(--glass-bg-hover)]'

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/95 shadow-lg backdrop-blur-md">
      <button
        type="button"
        className={buttonClassName}
        aria-label={zoomInLabel}
        title={zoomInLabel}
        onClick={onZoomIn}
      >
        <AppIcon name="plus" className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={buttonClassName}
        aria-label={zoomOutLabel}
        title={zoomOutLabel}
        onClick={onZoomOut}
      >
        <AppIcon name="minus" className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={buttonClassName}
        aria-label={fitViewLabel}
        title={fitViewLabel}
        onClick={onFitView}
      >
        <AppIcon name="searchPlus" className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={buttonClassName}
        aria-label={resetLabel}
        title={resetLabel}
        onClick={onResetLayout}
      >
        <AppIcon name="refresh" className="h-4 w-4" />
      </button>
    </div>
  )
}

function ProjectWorkspaceCanvasContent({ onAssistantSelectionChange, editScriptPending = false }: ProjectWorkspaceCanvasContentProps) {
  const t = useTranslations('projectWorkflow.canvas.workspace')
  const { projectId, episodeId } = useWorkspaceProvider()
  const runtime = useWorkspaceRuntime()
  const { episodeName, novelText, clips, storyboards, shots, finalVideo, videoGroups } = useWorkspaceEpisodeStageData()
  const { data: editScreenplay } = useProjectEditScreenplay(projectId, episodeId ?? null)
  const { data: editScript } = useProjectEditScript(projectId, episodeId ?? null)
  const reactFlow = useReactFlow<WorkspaceCanvasFlowNode>()
  const runNodeAction = useWorkspaceNodeCanvasActions()
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [nodes, setNodes] = useState<WorkspaceCanvasFlowNode[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [nodeExpansionOverrides, setNodeExpansionOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map())
  const defaultExpandedNodeIdsRef = useRef<ReadonlySet<string>>(new Set())
  const optimisticRunningNodeIdsRef = useRef<ReadonlySet<string>>(new Set())
  const optimisticRunningClearTimersRef = useRef<Map<string, number>>(new Map())
  const appliedProjectionNodeSignatureRef = useRef<string | null>(null)
  const stableEdgesRef = useRef<{
    signature: string
    edges: WorkspaceCanvasFlowEdge[]
  } | null>(null)

  const {
    layout,
    saveLayout,
    resetLayout: resetSavedLayout,
  } = useCanvasLayoutPersistence({
    projectId,
    episodeId: episodeId ?? '',
  })

  const savedNodeLayouts = layout?.nodeLayouts ?? EMPTY_SAVED_NODE_LAYOUTS
  const finalRenderTargets = useMemo(
    () => episodeId
      ? [{ targetType: 'ProjectEpisode', targetId: episodeId, types: [TASK_TYPE.FINAL_VIDEO_RENDER] }]
      : [],
    [episodeId],
  )
  const bgmScoreTargets = useMemo(
    () => episodeId
      ? [{ targetType: 'ProjectEpisode', targetId: episodeId, types: [TASK_TYPE.BGM_SCORE_GENERATE] }]
      : [],
    [episodeId],
  )
  const editScriptGenerationTargets = useMemo(
    () => episodeId
      ? [{ targetType: 'ProjectEpisode', targetId: episodeId, types: [TASK_TYPE.EDIT_SCRIPT_GENERATE] }]
      : [],
    [episodeId],
  )
  const finalRenderTaskState = useTaskTargetStateMap(projectId, finalRenderTargets, {
    enabled: Boolean(projectId && episodeId),
  }).byKey.get(episodeId ? `ProjectEpisode:${episodeId}` : '')
  const bgmScoreTaskState = useTaskTargetStateMap(projectId, bgmScoreTargets, {
    enabled: Boolean(projectId && episodeId),
  }).byKey.get(episodeId ? `ProjectEpisode:${episodeId}` : '')
  const editScriptGenerationTaskState = useTaskTargetStateMap(projectId, editScriptGenerationTargets, {
    enabled: Boolean(projectId && episodeId),
  }).byKey.get(episodeId ? `ProjectEpisode:${episodeId}` : '')
  const editScriptGenerationActive =
    editScriptGenerationTaskState?.phase === 'queued' || editScriptGenerationTaskState?.phase === 'processing'
  const projectedEditScript = useMemo(() => (
    editScriptGenerationActive && editScript
      ? { ...editScript, status: 'generating' }
      : editScript
  ), [editScript, editScriptGenerationActive])
  const effectiveEditScriptPending = editScriptPending || (editScriptGenerationActive && !editScript)
  const nodeRunningStatusLabel = useCallback((node: WorkspaceCanvasFlowNode): string => (
    node.data.kind === 'finalTimeline'
      ? t('status.aiEditing')
      : node.data.kind === 'bgmScore'
        ? t('status.generatingBgm')
        : t('status.processing')
  ), [t])
  const clearOptimisticRunningNode = useCallback((nodeId: string) => {
    const timer = optimisticRunningClearTimersRef.current.get(nodeId)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      optimisticRunningClearTimersRef.current.delete(nodeId)
    }
    const nextIds = new Set(optimisticRunningNodeIdsRef.current)
    nextIds.delete(nodeId)
    optimisticRunningNodeIdsRef.current = nextIds
  }, [])
  const markNodeOptimisticallyRunning = useCallback((nodeId: string) => {
    const previousTimer = optimisticRunningClearTimersRef.current.get(nodeId)
    if (previousTimer !== undefined) window.clearTimeout(previousTimer)
    const nextIds = new Set(optimisticRunningNodeIdsRef.current)
    nextIds.add(nodeId)
    optimisticRunningNodeIdsRef.current = nextIds
    const timer = window.setTimeout(() => {
      clearOptimisticRunningNode(nodeId)
      setNodes((currentNodes) => currentNodes.map((node) => node.id === nodeId
        ? {
            ...node,
            data: {
              ...node.data,
              isRunning: false,
            },
          }
        : node))
    }, OPTIMISTIC_NODE_RUNNING_TIMEOUT_MS)
    optimisticRunningClearTimersRef.current.set(nodeId, timer)
    setNodes((currentNodes) => currentNodes.map((node) => node.id === nodeId
      ? {
          ...node,
          data: {
            ...node.data,
            isRunning: true,
            statusLabel: nodeRunningStatusLabel(node),
          },
        }
      : node))
  }, [clearOptimisticRunningNode, nodeRunningStatusLabel])
  const onNodeAction = useCallback(async (action: WorkspaceCanvasNodeAction, nodeId?: string) => {
    if (nodeId) markNodeOptimisticallyRunning(nodeId)
    try {
      await runNodeAction(action)
    } catch (error: unknown) {
      if (nodeId) {
        clearOptimisticRunningNode(nodeId)
        setNodes((currentNodes) => currentNodes.map((node) => node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                isRunning: false,
              },
            }
          : node))
      }
      _ulogWarn('[ProjectWorkspaceCanvas] node action failed', error)
      throw error
    }
  }, [clearOptimisticRunningNode, markNodeOptimisticallyRunning, runNodeAction])
  const toggleNodeExpanded = useCallback((nodeId: string) => {
    setNodeExpansionOverrides((current) => {
      const defaultExpanded = defaultExpandedNodeIdsRef.current.has(nodeId)
      const currentExpanded = current.get(nodeId) ?? defaultExpanded
      const next = new Map(current)
      next.set(nodeId, !currentExpanded)
      return next
    })
  }, [])
  const attachNodeUiState = useCallback((inputNodes: readonly WorkspaceCanvasFlowNode[]) => {
    const defaultExpandedNodeIds = new Set<string>()
    const nextNodes = inputNodes.map((node) => {
      const isOptimisticallyRunning = optimisticRunningNodeIdsRef.current.has(node.id) && node.data.isRunning !== true
      const profile = getWorkspaceCanvasNodePresentationProfile(node.data.kind)
      const defaultExpanded = node.data.defaultExpanded ?? profile.defaultExpanded
      if (defaultExpanded) defaultExpandedNodeIds.add(node.id)
      const expanded = nodeExpansionOverrides.get(node.id) ?? defaultExpanded
      const size = resolveWorkspaceCanvasNodeSize({
        kind: node.data.kind,
        expanded,
        collapsedSize: {
          width: node.data.width,
          height: node.data.height,
        },
      })
      return {
        ...node,
        style: {
          ...node.style,
          width: size.width,
          height: size.height,
        },
        data: {
          ...node.data,
          ...(isOptimisticallyRunning
            ? {
                isRunning: true,
                statusLabel: nodeRunningStatusLabel(node),
              }
            : {}),
          expanded,
          expandedLayout: expanded ? profile.expandedLayout : undefined,
          onToggleExpanded: toggleNodeExpanded,
        },
      }
    })
    defaultExpandedNodeIdsRef.current = defaultExpandedNodeIds
    return nextNodes
  }, [nodeExpansionOverrides, nodeRunningStatusLabel, toggleNodeExpanded])

  const projection = useWorkspaceNodeCanvasProjection({
    projectId,
    episodeId: episodeId ?? 'pending-episode',
    episodeName,
    storyText: novelText,
    clips,
    storyboards,
    shots,
    editScreenplay,
    editScript: projectedEditScript,
    editScriptPending: effectiveEditScriptPending,
    finalVideo,
    videoGroups,
    defaultVideoModel: runtime.singleShotVideoModel ?? runtime.videoModel ?? null,
    defaultSequenceVideoModel: runtime.sequenceVideoModel ?? null,
    finalRenderPhase: finalRenderTaskState?.phase,
    finalRenderErrorMessage: finalRenderTaskState?.lastError?.message ?? null,
    bgmScorePhase: bgmScoreTaskState?.phase,
    bgmScoreErrorMessage: bgmScoreTaskState?.lastError?.message ?? null,
    savedLayouts: savedNodeLayouts,
    translate: t,
    onAction: onNodeAction,
  })
  const projectionEdges = projection.edges

  const projectionNodeSignature = useMemo(
    () => buildWorkspaceCanvasNodeSignature(projection.nodes),
    [projection.nodes],
  )
  const projectionEdgeSignature = useMemo(
    () => buildWorkspaceCanvasEdgeSignature(projectionEdges),
    [projectionEdges],
  )
  if (stableEdgesRef.current?.signature !== projectionEdgeSignature) {
    stableEdgesRef.current = {
      signature: projectionEdgeSignature,
      edges: [...projectionEdges],
    }
  }
  const flowEdges = stableEdgesRef.current.edges

  useEffect(() => {
    if (appliedProjectionNodeSignatureRef.current === projectionNodeSignature) return
    appliedProjectionNodeSignatureRef.current = projectionNodeSignature
    setNodes(attachNodeUiState(projection.nodes))
  }, [attachNodeUiState, projection.nodes, projectionNodeSignature])

  useEffect(() => {
    const projectionByNodeId = new Map(projection.nodes.map((node) => [node.id, node]))
    let changed = false
    const nextIds = new Set<string>()
    optimisticRunningNodeIdsRef.current.forEach((nodeId) => {
      const projectedNode = projectionByNodeId.get(nodeId)
      if (!projectedNode || projectedNode.data.isRunning === true) {
        const timer = optimisticRunningClearTimersRef.current.get(nodeId)
        if (timer !== undefined) {
          window.clearTimeout(timer)
          optimisticRunningClearTimersRef.current.delete(nodeId)
        }
        changed = true
        return
      }
      nextIds.add(nodeId)
    })
    if (changed) optimisticRunningNodeIdsRef.current = nextIds
  }, [projection.nodes, projectionNodeSignature])

  useEffect(() => () => {
    optimisticRunningClearTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    optimisticRunningClearTimersRef.current.clear()
  }, [])

  useEffect(() => {
    setNodes((currentNodes) => attachNodeUiState(currentNodes))
  }, [attachNodeUiState])

  useEffect(() => {
    const projectedNodeIds = new Set(projection.nodes.map((node) => node.id))
    setNodeExpansionOverrides((current) => {
      let changed = false
      const next = new Map<string, boolean>()
      current.forEach((expanded, nodeId) => {
        if (projectedNodeIds.has(nodeId)) {
          next.set(nodeId, expanded)
        } else {
          changed = true
        }
      })
      return changed ? next : current
    })
  }, [projection.nodes, projectionNodeSignature])

  useEffect(() => {
    if (!layout) return
    void reactFlow.setViewport(layout.viewport)
  }, [layout, reactFlow])

  const persistCurrentLayout = useCallback(async (nextNodes: readonly WorkspaceCanvasFlowNode[]) => {
    if (!episodeId) return

    const input: UpsertCanvasLayoutInput = {
      episodeId,
      viewport: reactFlow.getViewport(),
      nodeLayouts: nextNodes.map((node, index) => ({
        nodeKey: node.id,
        nodeType: node.data.layoutNodeType,
        targetType: node.data.targetType,
        targetId: node.data.targetId,
        x: node.position.x,
        y: node.position.y,
        width: node.data.width,
        height: node.data.height,
        zIndex: typeof node.zIndex === 'number' ? node.zIndex : index,
        locked: false,
        collapsed: false,
      })),
    }

    await saveLayout(input)
  }, [episodeId, reactFlow, saveLayout])

  const persistCurrentLayoutSafely = useCallback((nextNodes: readonly WorkspaceCanvasFlowNode[]) => {
    void persistCurrentLayout(nextNodes).catch((error: unknown) => {
      _ulogWarn('[ProjectWorkspaceCanvas] canvas layout save failed', error)
    })
  }, [persistCurrentLayout])

  const handleNodesChange = useCallback((changes: NodeChange<WorkspaceCanvasFlowNode>[]) => {
    setNodes((currentNodes) => applyNodeChanges(changes, currentNodes))
  }, [])

  const handleNodeDragStop = useCallback<OnNodeDrag<WorkspaceCanvasFlowNode>>((_event, node, draggedNodes) => {
    const movedNodesById = new Map<string, WorkspaceCanvasFlowNode>(
      [node, ...draggedNodes].map((movedNode) => [movedNode.id, movedNode]),
    )
    const movedNodeIds = new Set(movedNodesById.keys())
    const currentNodes = reactFlow.getNodes().map((currentNode) => movedNodesById.get(currentNode.id) ?? currentNode)
    const repairedNodes = attachNodeUiState(
      repairWorkspaceNodeOverlapsNearMovedNodes(currentNodes, movedNodeIds),
    )
    setNodes(repairedNodes)
    persistCurrentLayoutSafely(repairedNodes)
  }, [attachNodeUiState, persistCurrentLayoutSafely, reactFlow])

  const handleNodeClick = useCallback<NodeMouseHandler<WorkspaceCanvasFlowNode>>((_event, node) => {
    if (node.data.kind === 'analysis' || node.data.kind === 'storyInput') return
    setSelectedNodeId(node.id)
  }, [])

  const applyWheelZoom = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const bounds = canvasRef.current?.getBoundingClientRect()
    if (!bounds) return

    event.preventDefault()

    const viewport = reactFlow.getViewport()
    const nextZoom = getNextWorkspaceCanvasWheelZoom(viewport.zoom, event.deltaY)
    if (nextZoom === viewport.zoom) return

    const pointerX = event.clientX - bounds.left
    const pointerY = event.clientY - bounds.top
    const zoomRatio = nextZoom / viewport.zoom
    const nextViewport: Viewport = {
      x: pointerX - (pointerX - viewport.x) * zoomRatio,
      y: pointerY - (pointerY - viewport.y) * zoomRatio,
      zoom: nextZoom,
    }

    void reactFlow.setViewport(nextViewport)
  }, [reactFlow])

  const resetLayout = useCallback(() => {
    if (!episodeId) return
    const defaultProjection = buildWorkspaceNodeCanvasProjection({
      projectId,
      episodeId,
      episodeName,
      storyText: novelText,
      clips,
      storyboards,
      shots,
      editScreenplay,
      editScript: projectedEditScript,
      editScriptPending: effectiveEditScriptPending,
      finalVideo,
      videoGroups,
      defaultVideoModel: runtime.singleShotVideoModel ?? runtime.videoModel ?? null,
      defaultSequenceVideoModel: runtime.sequenceVideoModel ?? null,
      finalRenderPhase: finalRenderTaskState?.phase,
      finalRenderErrorMessage: finalRenderTaskState?.lastError?.message ?? null,
      bgmScorePhase: bgmScoreTaskState?.phase,
      bgmScoreErrorMessage: bgmScoreTaskState?.lastError?.message ?? null,
      savedLayouts: EMPTY_SAVED_NODE_LAYOUTS,
      translate: t,
      onAction: onNodeAction,
    })
    setNodes(attachNodeUiState(defaultProjection.nodes))
    void resetSavedLayout().catch((error: unknown) => {
      _ulogWarn('[ProjectWorkspaceCanvas] canvas layout reset failed', error)
    })
  }, [attachNodeUiState, bgmScoreTaskState?.lastError?.message, bgmScoreTaskState?.phase, clips, editScreenplay, effectiveEditScriptPending, episodeId, episodeName, finalRenderTaskState?.lastError?.message, finalRenderTaskState?.phase, finalVideo, novelText, onNodeAction, projectId, projectedEditScript, resetSavedLayout, runtime.sequenceVideoModel, runtime.singleShotVideoModel, runtime.videoModel, shots, storyboards, t, videoGroups])

  const fitView = useCallback(() => {
    void reactFlow.fitView({ padding: 0.14, duration: 180 })
  }, [reactFlow])
  const zoomIn = useCallback(() => {
    void reactFlow.zoomIn({ duration: 160 })
  }, [reactFlow])
  const zoomOut = useCallback(() => {
    void reactFlow.zoomOut({ duration: 160 })
  }, [reactFlow])
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  )
  const assistantSelection = useMemo<WorkspaceAssistantSelectionContext>(() => {
    if (!selectedNode) return {}
    const targetType = selectedNode.data.targetType
    const targetId = selectedNode.data.targetId
    return {
      selectedScopeRef: `${targetType}:${targetId}`,
      selectedPanelId: targetType === 'panel' ? targetId : null,
      selectedClipId: targetType === 'clip' ? targetId : null,
      selectedAssetId: null,
    }
  }, [selectedNode])

  useEffect(() => {
    onAssistantSelectionChange?.(assistantSelection)
  }, [assistantSelection, onAssistantSelectionChange])

  if (!episodeId) return null

  return (
    <div className="h-full min-h-0 w-full overflow-hidden bg-[var(--glass-bg-canvas)]">
      <div ref={canvasRef} className="h-full" onWheelCapture={applyWheelZoom}>
        <ReactFlow
          nodes={nodes}
          edges={flowEdges}
          nodeTypes={workspaceNodeTypes}
          onNodesChange={handleNodesChange}
          onNodeClick={handleNodeClick}
          onPaneClick={() => setSelectedNodeId(null)}
          onNodeDragStop={handleNodeDragStop}
          onMoveEnd={() => persistCurrentLayoutSafely(nodes)}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          minZoom={WORKSPACE_CANVAS_MIN_ZOOM}
          maxZoom={WORKSPACE_CANVAS_MAX_ZOOM}
          zoomOnScroll={false}
          defaultViewport={DEFAULT_WORKSPACE_CANVAS_VIEWPORT}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
          <MiniMap
            pannable
            zoomable
            position="bottom-left"
            bgColor="rgba(255,255,255,0.82)"
            maskColor="rgba(100,116,139,0.2)"
            maskStrokeColor="rgba(71,85,105,0.68)"
            nodeColor="rgba(148,163,184,0.7)"
            nodeStrokeColor="rgba(71,85,105,0.46)"
            nodeBorderRadius={10}
            offsetScale={0}
            className="!z-[60] !m-0 !overflow-hidden !rounded-[22px] !border-0 !bg-white/82 !shadow-lg !ring-1 !ring-[var(--glass-stroke-base)]/70 !backdrop-blur-2xl"
            style={{
              left: 16,
              bottom: CANVAS_FLOATING_PANEL_BOTTOM_OFFSET_PX + 72,
              width: 180,
              height: 96,
            }}
          />
          <Panel
            position="bottom-left"
            className="!z-[70] !m-0"
            style={{
              left: 16,
              bottom: CANVAS_FLOATING_PANEL_BOTTOM_OFFSET_PX + 16,
            }}
          >
            <CanvasViewportControls
              resetLabel={t('toolbar.resetLayout')}
              fitViewLabel={t('toolbar.fitView')}
              zoomInLabel={t('toolbar.zoomIn')}
              zoomOutLabel={t('toolbar.zoomOut')}
              onResetLayout={resetLayout}
              onFitView={fitView}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
            />
          </Panel>
        </ReactFlow>
      </div>
    </div>
  )
}

interface ProjectWorkspaceCanvasProps {
  onAssistantSelectionChange?: (selection: WorkspaceAssistantSelectionContext) => void
  editScriptPending?: boolean
}

export default function ProjectWorkspaceCanvas({ onAssistantSelectionChange, editScriptPending = false }: ProjectWorkspaceCanvasProps) {
  return (
    <ReactFlowProvider>
      <ProjectWorkspaceCanvasContent
        onAssistantSelectionChange={onAssistantSelectionChange}
        editScriptPending={editScriptPending}
      />
    </ReactFlowProvider>
  )
}
