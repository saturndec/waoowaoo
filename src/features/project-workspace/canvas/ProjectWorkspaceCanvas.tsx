'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type NodeMouseHandler,
  type NodeChange,
  useReactFlow,
} from '@xyflow/react'
import { useTranslations } from 'next-intl'
import type { UpsertCanvasLayoutInput } from '@/lib/project-canvas/layout/canvas-layout-contract'
import type { CanvasNodeLayout } from '@/lib/project-canvas/layout/canvas-layout.types'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'
import { useWorkspaceProvider } from '../WorkspaceProvider'
import CanvasToolbar from './CanvasToolbar'
import { useCanvasLayoutPersistence } from './hooks/useCanvasLayoutPersistence'
import {
  buildWorkspaceNodeCanvasProjection,
  useWorkspaceNodeCanvasProjection,
} from './hooks/useWorkspaceNodeCanvasProjection'
import { useWorkspaceNodeCanvasActions } from './hooks/useWorkspaceNodeCanvasActions'
import { workspaceNodeTypes } from './nodes/workspaceNodeTypes'
import CanvasObjectDetailLayer from './details/CanvasObjectDetailLayer'
import type { WorkspaceCanvasFlowNode, WorkspaceCanvasNodeAction } from './node-canvas-types'

const DEFAULT_VIEWPORT = { x: 48, y: 96, zoom: 0.72 }
const EMPTY_SAVED_NODE_LAYOUTS: readonly CanvasNodeLayout[] = []

export interface WorkspaceAssistantSelectionContext {
  selectedScopeRef?: string | null
  selectedPanelId?: string | null
  selectedClipId?: string | null
  selectedAssetId?: string | null
}

interface ProjectWorkspaceCanvasContentProps {
  onAssistantSelectionChange?: (selection: WorkspaceAssistantSelectionContext) => void
}

function ProjectWorkspaceCanvasContent({ onAssistantSelectionChange }: ProjectWorkspaceCanvasContentProps) {
  const t = useTranslations('projectWorkflow.canvas.workspace')
  const { projectId, episodeId } = useWorkspaceProvider()
  const { episodeName, novelText, clips, storyboards, shots } = useWorkspaceEpisodeStageData()
  const reactFlow = useReactFlow<WorkspaceCanvasFlowNode>()
  const runNodeAction = useWorkspaceNodeCanvasActions()
  const [nodes, setNodes] = useState<WorkspaceCanvasFlowNode[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const {
    layout,
    isLoading,
    saveLayout,
    isSaving,
    loadError,
    saveError,
    layoutWarningCode,
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
    episodeId: episodeId ?? 'pending-episode',
    storyText: novelText,
    clips,
    storyboards,
    shots,
    savedLayouts: savedNodeLayouts,
    translate: t,
    onAction: onNodeAction,
  })

  useEffect(() => {
    setNodes([...projection.nodes])
  }, [projection.nodes])

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
    if (node.data.kind === 'analysis') return
    setSelectedNodeId(node.id)
  }, [])

  const resetLayout = useCallback(() => {
    if (!episodeId) return
    const defaultProjection = buildWorkspaceNodeCanvasProjection({
      episodeId,
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
  }, [clips, episodeId, novelText, onNodeAction, reactFlow, resetSavedLayout, shots, storyboards, t])

  const fitView = useCallback(() => {
    void reactFlow.fitView({ padding: 0.14, duration: 180 })
  }, [reactFlow])

  const statusItems = useMemo(() => {
    const panels = storyboards.reduce((total, storyboard) => total + (storyboard.panels?.length ?? 0), 0)
    const images = storyboards.reduce((total, storyboard) => (
      total + (storyboard.panels ?? []).filter((panel) => Boolean(panel.imageUrl || panel.media?.url || panel.imageTaskRunning)).length
    ), 0)
    const videos = storyboards.reduce((total, storyboard) => (
      total + (storyboard.panels ?? []).filter((panel) => Boolean(panel.videoUrl || panel.videoMedia?.url || panel.videoTaskRunning)).length
    ), 0)
    return [
      t(novelText.trim() ? 'statusBar.storyReady' : 'statusBar.storyEmpty'),
      t('statusBar.clips', { count: clips.length }),
      t('statusBar.panels', { count: panels }),
      t('statusBar.images', { count: images }),
      t('statusBar.videos', { count: videos }),
    ]
  }, [clips.length, novelText, storyboards, t])

  const errorLabel = loadError || saveError || layoutWarningCode ? t('layoutWarning') : null
  const nodeCountSummary = t('summary', {
    nodes: nodes.length,
    edges: projection.edges.length,
  })
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
    <div className="h-[calc(100vh-8rem)] min-h-[640px] overflow-hidden rounded-lg border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-canvas)]">
      <CanvasToolbar
        title={t('title')}
        subtitle={t('subtitle')}
        summary={nodeCountSummary}
        resetLabel={t('toolbar.resetLayout')}
        fitViewLabel={t('toolbar.fitView')}
        loadingLabel={t('layoutLoading')}
        savingLabel={t('layoutSaving')}
        errorLabel={errorLabel}
        statusItems={statusItems}
        isLoading={isLoading}
        isSaving={isSaving}
        onResetLayout={resetLayout}
        onFitView={fitView}
      />

      <div className="h-[calc(100%-5.75rem)]">
        <ReactFlow
          nodes={nodes}
          edges={[...projection.edges]}
          nodeTypes={workspaceNodeTypes}
          onNodesChange={handleNodesChange}
          onNodeClick={handleNodeClick}
          onPaneClick={() => setSelectedNodeId(null)}
          onNodeDragStop={async () => persistCurrentLayout(nodes)}
          onMoveEnd={async () => persistCurrentLayout(nodes)}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          fitView
          fitViewOptions={{ padding: 0.14 }}
          minZoom={0.25}
          maxZoom={1.25}
          defaultViewport={DEFAULT_VIEWPORT}
          onlyRenderVisibleElements
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>

      <CanvasObjectDetailLayer
        selectedNode={selectedNode}
        clips={clips}
        storyboards={storyboards}
        storyText={novelText}
        episodeName={episodeName}
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
