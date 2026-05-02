import type { ArtifactType } from '@/lib/artifact-system/types'
import type { PlanStep } from '@/lib/command-center/types'
import type { ProjectContextSnapshot } from '@/lib/project-context/types'
import { getWorkflowDisplayLabel, getProjectWorkflowMachine } from '@/lib/skill-system/project-workflow-machine'
import type { WorkflowPackageId } from '@/lib/skill-system/types'
import type {
  ProjectAssistantContextSnapshot,
} from './types'

const ARTIFACT_LABELS: Record<ArtifactType, string> = {
  'story.raw': '故事原文',
  'analysis.characters': '角色分析',
  'analysis.locations': '场景分析',
  'analysis.props': '道具分析',
  'clip.split': '片段切分',
  'clip.screenplay': '剧本结果',
  'storyboard.phase1': '分镜阶段一',
  'storyboard.phase2.cinematography': '摄影细化',
  'storyboard.phase2.acting': '表演细化',
  'storyboard.phase3.detail': '镜头细化',
  'storyboard.panel_set': '分镜面板',
  'voice.lines': '台词结果',
  'panel.prompt': '分镜提示词',
  'panel.image': '分镜图片',
  'panel.video': '分镜视频',
}

function collectInvalidatedLabels(steps: PlanStep[]): string[] {
  const labels = new Set<string>()
  for (const step of steps) {
    for (const artifact of step.invalidates) {
      const label = ARTIFACT_LABELS[artifact]
      if (label) labels.add(label)
    }
  }
  return Array.from(labels)
}

export function buildAssistantProjectContextSnapshot(
  context: ProjectContextSnapshot,
): ProjectAssistantContextSnapshot {
  return {
    projectId: context.projectId,
    projectName: context.projectName,
    episodeId: context.episodeId,
    episodeName: context.episodeName,
    currentStage: context.currentStage,
    selectedScopeRef: context.selectedScopeRef,
    selectedPanelId: context.selectedPanelId,
    selectedClipId: context.selectedClipId,
    selectedAssetId: context.selectedAssetId,
    activeRuns: context.activeRuns,
    activeOperationTasks: context.activeOperationTasks,
    recentOperationResults: context.recentOperationResults,
    latestArtifacts: context.latestArtifacts,
    config: {
      analysisModel: context.policy.analysisModel || null,
      artStyle: context.policy.artStyle,
      videoRatio: context.policy.videoRatio,
    },
    workflow: context.workflow,
  }
}

export function buildWorkflowPlanSummary(workflowId: WorkflowPackageId): string {
  return `${getWorkflowDisplayLabel(workflowId)}执行计划`
}

export function buildWorkflowApprovalSummary(workflowId: WorkflowPackageId): string {
  return getProjectWorkflowMachine(workflowId).approvalSummary
}

export function buildWorkflowApprovalReasons(steps: PlanStep[]): string[] {
  const invalidatedLabels = collectInvalidatedLabels(steps)
  const reasons: string[] = []

  if (invalidatedLabels.includes('剧本结果')) {
    reasons.push('会覆盖现有剧本结果。')
  }
  if (
    invalidatedLabels.includes('分镜阶段一')
    || invalidatedLabels.includes('摄影细化')
    || invalidatedLabels.includes('表演细化')
    || invalidatedLabels.includes('镜头细化')
    || invalidatedLabels.includes('分镜面板')
  ) {
    reasons.push('现有分镜相关结果会失效，需要重新生成。')
  }
  if (invalidatedLabels.includes('台词结果')) {
    reasons.push('现有台词结果会失效。')
  }
  if (reasons.length > 0) return reasons

  if (invalidatedLabels.length > 0) {
    return [`会影响以下结果：${invalidatedLabels.join('、')}。`]
  }

  return ['该操作涉及生成或覆盖结果，需要你确认后执行。']
}
