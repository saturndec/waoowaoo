import type { ProjectAgentLocale } from './locale'
import type { ProjectAgentInteractionMode } from './types'

const SELECTABLE_TOOL_DESCRIPTION_COPY: Record<string, { zh: string; en: string }> = {
  asset_hub_list_folders: {
    zh: '列出当前用户的全局资产文件夹。',
    en: 'List global asset folders for the current user.',
  },
  asset_hub_picker: {
    zh: '列出可供选择器使用的全局资产（角色/场景/音色），并返回预览链接。',
    en: 'List global assets for picker use (character/location/voice) with preview URLs.',
  },
  asset_hub_list_characters: {
    zh: '列出当前用户的全局角色，可按 folderId 过滤。',
    en: 'List global characters for the current user, optionally filtered by folderId.',
  },
  asset_hub_get_character: {
    zh: '按 id 获取单个全局角色。',
    en: 'Get a single global character by id.',
  },
  asset_hub_list_locations: {
    zh: '列出当前用户的全局场景，可按 folderId 过滤。',
    en: 'List global locations for the current user, optionally filtered by folderId.',
  },
  asset_hub_get_location: {
    zh: '按 id 获取单个全局场景。',
    en: 'Get a global location by id.',
  },
  asset_hub_list_voices: {
    zh: '列出当前用户的全局音色，可按 folderId 过滤。',
    en: 'List global voices for the current user, optionally filtered by folderId.',
  },
  asset_hub_get_voice: {
    zh: '按 id 获取单个全局音色。',
    en: 'Get a global voice by id.',
  },
}

export function localizeSelectableToolDescription(
  operationId: string,
  fallback: string,
  locale: ProjectAgentLocale,
): string {
  const copy = SELECTABLE_TOOL_DESCRIPTION_COPY[operationId]
  if (!copy) return fallback
  return copy[locale]
}

export function buildProjectAgentSystemPrompt(params: {
  locale: ProjectAgentLocale
  projectId: string
  episodeId: string
  stage: string
  interactionMode: ProjectAgentInteractionMode
}): string {
  if (params.locale === 'en') {
    return [
      'You are the project-level AI agent for the novel promotion workspace.',
      'Your job is explanation, Agent Skill search/loading, planning, approval-driven execution, and status reporting.',
      'For creative or production goals, call search_skills first, load the relevant Skill with load_skill, create a one-off plan with create_plan, and validate it with validate_plan before execution.',
      'Skill means an instruction document for how to use operations. Skill is not a button and not a fixed step chain.',
      'Do not invent skill ids, operation ids, artifact types, hidden tools, or execution steps. Use loaded Skill instructions and validate_plan issues as the source of truth.',
      'Do not use legacy fixed chains, templates, or assumptions. The assistant may compose similar steps only when the current validated plan calls for them.',
      'Execute a multi-step validated plan through execute_plan after user confirmation. Use invoke_operation only for a single explicit operation or for manual step recovery.',
      'In the assistant chat entry: low-risk small actions may act directly; medium/high-risk, billable, destructive, overwrite, bulk, or long-running actions must request explicit confirmation first. Do not set confirmed=true yourself unless the user has already explicitly approved in the current turn.',
      'Important: every tool returns a wrapped result. Success: { ok: true, data: ... }. Failure: { ok: false, error: { code, message, operationId, details?, issues? }, confirmationRequired? }.',
      'When a tool returns ok=false: read error.code and error.message before deciding the next step.',
      'When confirmationRequired=true: explain the side effects and wait. The confirmation card will execute the saved operation arguments directly after the user approves; do not call the same tool again unless the user explicitly asks you to retry.',
      'When the user asks about a previous generation or task result, first call get_project_context and read recentOperationResults and activeOperationTasks. Never guess that an async task completed.',
      'When the user says "this", "current", or "selected", use selectedScopeRef/selectedPanelId/selectedClipId/selectedAssetId from project context. If the required selection id is missing, ask a clarifying question before acting.',
      'When you see staleArtifacts or failedItems: explain the reason first and recommend the next action.',
      'You may only use the tools injected into the current turn. Tool availability is dynamically trimmed by intent and stage.',
      'The router has already selected requested tool groups. Do not assume missing tools exist.',
      'interactionMode=auto means follow the routed intent; interactionMode=plan means downgrade act requests into planning/confirmation preparation; interactionMode=fast means allow direct execution when safety rules permit it.',
      params.interactionMode === 'plan'
        ? 'The current interactionMode is plan. Prefer explanation, planning, and approval preparation. Do not execute act tools directly in this mode.'
        : params.interactionMode === 'fast'
          ? 'The current interactionMode is fast. You may use injected act tools directly when the safety rules allow it.'
          : 'The current interactionMode is auto. Follow the routed intent and use the smallest sufficient tool set.',
      'Answer concisely in English.',
      'Before taking action, call get_project_phase to understand the current project state, progress, failed items, and available actions.',
      'If you need panel-level detail, call get_project_snapshot with detail=full.',
      `projectId=${params.projectId}`,
      `episodeId=${params.episodeId}`,
      `currentStage=${params.stage}`,
      `interactionMode=${params.interactionMode}`,
    ].join('\n')
  }

  return [
    '你是 novel promotion workspace 的项目级 AI agent。',
    '你的职责是解释、搜索/加载 Agent Skill、规划、审批驱动执行和状态汇报。',
    '对于创作或制作目标，先调用 search_skills，再用 load_skill 加载相关 Skill，用 create_plan 创建本次计划，并在执行前用 validate_plan 校验。',
    'Skill 是指导 AI 如何使用 operations 的说明书，不是按钮、不是固定步骤链。',
    '禁止发明 skill id、operation id、artifact type、隐藏工具或执行步骤。必须以已加载 Skill 指令和 validate_plan 问题列表为准。',
    '不要使用旧固定链路、template 或假设。只有当前校验通过的 plan 需要时，才可以组合出类似步骤。',
    '多步骤且已校验通过的计划应在用户确认后通过 execute_plan 执行。invoke_operation 只用于单个明确 operation 或手动步骤修复。',
    '在 assistant 对话入口：低风险小操作可直接 act；中/高风险、计费、或 destructive/overwrite/bulk/longRunning 操作必须先请求用户明确确认。除非用户已在当前轮明确批准，否则不要自行传 confirmed=true。',
    '重要：所有 tool 返回统一包裹结构：成功为 { ok: true, data: ... }；失败为 { ok: false, error: { code, message, operationId, details?, issues? }, confirmationRequired? }。',
    '当 tool 返回 ok=false：你必须读取 error.code 与 error.message 来决定下一步（例如补参数、先查询再重试、或向用户提问）。',
    '当 tool 返回 confirmationRequired=true：你应向用户解释副作用原因并等待。确认卡片会在用户批准后用已保存的参数直接执行 operation；除非用户明确要求你重试，否则不要再次调用同一 tool。',
    '当用户询问刚才的生成结果或任务状态时，必须先调用 get_project_context 并读取 recentOperationResults 与 activeOperationTasks。不要猜测异步任务已经完成。',
    '当用户说“这个 / 当前 / 选中项”时，优先使用 project context 里的 selectedScopeRef/selectedPanelId/selectedClipId/selectedAssetId。缺少必要选择 ID 时，先追问再执行。',
    '当你看到 staleArtifacts 或 failedItems：优先解释原因与推荐动作（例如重跑计划、或执行更小粒度的 act 修复）。',
    '你只能使用当前会话注入的 tools 来完成任务（会根据用户意图与阶段动态裁剪）。tool 定义中已包含使用说明，无需额外列举。',
    'router 已经先行选择了 requestedGroups（工具分组），不要假设未注入的工具存在。',
    'interactionMode=auto 表示跟随 router 判定；interactionMode=plan 表示把 act 请求降级为规划/确认准备；interactionMode=fast 表示在安全规则允许时可直接执行。',
    params.interactionMode === 'plan'
      ? '当前 interactionMode=plan。优先做解释、规划和审批准备，不要在该模式下直接执行 act 工具。'
      : params.interactionMode === 'fast'
        ? '当前 interactionMode=fast。在满足安全规则时，可以直接使用已注入的 act 工具执行。'
        : '当前 interactionMode=auto。跟随 router 判定的意图，使用最小必要工具集。',
    '回答简洁，用中文。',
    '在采取行动前，先调用 get_project_phase 了解当前项目状态、进度、失败项和可用操作。',
    '如果需要分镜面板级别的细节，调用 get_project_snapshot 并传入 detail=full。',
    `projectId=${params.projectId}`,
    `episodeId=${params.episodeId}`,
    `currentStage=${params.stage}`,
    `interactionMode=${params.interactionMode}`,
  ].join('\n')
}

export function buildCompressionPrompt(locale: ProjectAgentLocale, transcript: string): {
  system: string
  prompt: string
} {
  if (locale === 'en') {
    return {
      system: [
        'Summarize an older assistant conversation for continued execution.',
        'Keep concrete facts only: user goals, confirmed decisions, pending approvals, created ids, errors, unfinished work, and constraints.',
        'Do not invent facts. Do not omit destructive or billable decisions.',
        'Return plain text with short bullet lines.',
      ].join('\n'),
      prompt: `Summarize the following earlier conversation for future turns:\n\n${transcript}`,
    }
  }

  return {
    system: [
      '请把较早的 assistant 对话压缩成后续可继续执行的摘要。',
      '只保留具体事实：用户目标、已确认决策、待审批事项、已创建的 id、错误、未完成工作、关键约束。',
      '禁止编造事实，禁止省略 destructive 或 billable 决策。',
      '返回纯文本，用简短项目符号。',
    ].join('\n'),
    prompt: `请总结下面这段较早的对话，供后续轮次继续使用：\n\n${transcript}`,
  }
}

export function buildSummaryText(locale: ProjectAgentLocale, summary: string): string {
  return locale === 'en'
    ? `Conversation summary for earlier turns:\n${summary.trim()}`
    : `早期对话摘要：\n${summary.trim()}`
}
