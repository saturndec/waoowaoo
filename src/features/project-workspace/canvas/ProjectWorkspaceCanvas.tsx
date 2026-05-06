'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type NodeMouseHandler,
  type NodeChange,
  useReactFlow,
} from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type { UpsertCanvasLayoutInput } from '@/lib/project-canvas/layout/canvas-layout-contract'
import type { CanvasNodeLayout } from '@/lib/project-canvas/layout/canvas-layout.types'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'
import { useWorkspaceProvider } from '../WorkspaceProvider'
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
import { workspaceNodeTypes } from './nodes/workspaceNodeTypes'
import CanvasObjectDetailLayer from './details/CanvasObjectDetailLayer'
import type { WorkspaceCanvasFlowEdge, WorkspaceCanvasFlowNode, WorkspaceCanvasNodeAction } from './node-canvas-types'

const DEFAULT_VIEWPORT = { x: 24, y: 136, zoom: 0.82 }
const EMPTY_SAVED_NODE_LAYOUTS: readonly CanvasNodeLayout[] = []
const CANVAS_FLOATING_PANEL_BOTTOM_OFFSET_PX = 56

export interface WorkspaceAssistantSelectionContext {
  selectedScopeRef?: string | null
  selectedPanelId?: string | null
  selectedClipId?: string | null
  selectedAssetId?: string | null
}

interface ProjectWorkspaceCanvasContentProps {
  onAssistantSelectionChange?: (selection: WorkspaceAssistantSelectionContext) => void
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

function ProjectWorkspaceCanvasContent({ onAssistantSelectionChange }: ProjectWorkspaceCanvasContentProps) {
  const t = useTranslations('projectWorkflow.canvas.workspace')
  const { projectId, episodeId } = useWorkspaceProvider()
  const { episodeName, novelText, clips, storyboards, shots } = useWorkspaceEpisodeStageData()
  const reactFlow = useReactFlow<WorkspaceCanvasFlowNode>()
  const runNodeAction = useWorkspaceNodeCanvasActions()
  const [nodes, setNodes] = useState<WorkspaceCanvasFlowNode[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
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
  const onNodeAction = useCallback((action: WorkspaceCanvasNodeAction) => {
    if (action.type === 'open_details') {
      setSelectedNodeId(action.nodeId)
      return
    }
    runNodeAction(action)
  }, [runNodeAction])

  const projection = useWorkspaceNodeCanvasProjection({
    projectId,
    episodeId: episodeId ?? 'pending-episode',
    episodeName,
    storyText: novelText,
    clips,
    storyboards,
    shots,
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
    setNodes([...projection.nodes])
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

  const handleNodesChange = useCallback((changes: NodeChange<WorkspaceCanvasFlowNode>[]) => {
    setNodes((currentNodes) => applyNodeChanges(changes, currentNodes))
  }, [])

  const handleNodeClick = useCallback<NodeMouseHandler<WorkspaceCanvasFlowNode>>((_event, node) => {
    if (node.data.kind === 'analysis' || node.data.kind === 'storyInput') return
    setSelectedNodeId(node.id)
  }, [])

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
      savedLayouts: EMPTY_SAVED_NODE_LAYOUTS,
      translate: t,
      onAction: onNodeAction,
    })
    setNodes([...defaultProjection.nodes])
    void reactFlow.setViewport(DEFAULT_VIEWPORT)
    void resetSavedLayout()
  }, [clips, episodeId, episodeName, novelText, onNodeAction, projectId, reactFlow, resetSavedLayout, shots, storyboards, t])

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
      <div className="h-full">
        <ReactFlow
          nodes={nodes}
          edges={flowEdges}
          nodeTypes={workspaceNodeTypes}
          onNodesChange={handleNodesChange}
          onNodeClick={handleNodeClick}
          onPaneClick={() => setSelectedNodeId(null)}
          onNodeDragStop={async () => persistCurrentLayout(nodes)}
          onMoveEnd={async () => persistCurrentLayout(nodes)}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          minZoom={0.25}
          maxZoom={1.25}
          defaultViewport={DEFAULT_VIEWPORT}
          onlyRenderVisibleElements
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
          <MiniMap
            pannable
            zoomable
            position="bottom-left"
            bgColor="transparent"
            maskColor="transparent"
            maskStrokeColor="rgba(100,116,139,0.42)"
            nodeColor="rgba(148,163,184,0.7)"
            nodeStrokeColor="rgba(71,85,105,0.46)"
            nodeBorderRadius={10}
            offsetScale={0}
            className="!z-[60] !m-0 !overflow-hidden !rounded-lg !border !border-[var(--glass-stroke-base)] !bg-transparent !shadow-lg"
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

      <CanvasObjectDetailLayer
        selectedNode={selectedNode}
        clips={clips}
        storyboards={storyboards}
        onClose={() => setSelectedNodeId(null)}
      />
    </div>
  )
}

interface ProjectWorkspaceCanvasProps {
  onAssistantSelectionChange?: (selection: WorkspaceAssistantSelectionContext) => void
}

export default function ProjectWorkspaceCanvas({ onAssistantSelectionChange }: ProjectWorkspaceCanvasProps) {
  return (
    <ReactFlowProvider>
      <ProjectWorkspaceCanvasContent onAssistantSelectionChange={onAssistantSelectionChange} />
    </ReactFlowProvider>
  )
}
