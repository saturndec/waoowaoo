/**
 * Kiến trúc Agent - Hệ thống agentic cho quy trình sản xuất video
 *
 * Director Agent điều phối toàn bộ pipeline với khả năng:
 * - Tự lên kế hoạch sản xuất
 * - Gọi các tool (tạo kịch bản, storyboard, ảnh, video, giọng nói)
 * - Tự review và sửa lỗi (self-critique loop)
 * - Streaming quá trình thinking ra UI
 */

// =====================================================
// Agent Tool Definitions
// =====================================================

export type AgentToolName =
  | 'analyze_novel'
  | 'create_script'
  | 'create_storyboard'
  | 'generate_character_image'
  | 'generate_location_image'
  | 'generate_panel_image'
  | 'generate_video'
  | 'generate_voice'
  | 'review_quality'
  | 'revise_panel'
  | 'get_project_status'

export interface AgentToolDefinition {
  name: AgentToolName
  description: string
  parameters: Record<string, {
    type: string
    description: string
    required?: boolean
    enum?: string[]
  }>
}

export interface AgentToolCall {
  id: string
  name: AgentToolName
  arguments: Record<string, unknown>
}

export interface AgentToolResult {
  toolCallId: string
  name: AgentToolName
  success: boolean
  output: Record<string, unknown>
  error?: string
}

// =====================================================
// Agent Message Types
// =====================================================

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: AgentToolCall[]
  toolResults?: AgentToolResult[]
  thinking?: string
  timestamp: number
}

// =====================================================
// Agent State
// =====================================================

export type AgentPhase =
  | 'planning'          // Đang lên kế hoạch
  | 'analyzing'         // Đang phân tích truyện
  | 'scripting'         // Đang viết kịch bản
  | 'storyboarding'     // Đang tạo storyboard
  | 'generating_assets' // Đang tạo hình ảnh
  | 'generating_video'  // Đang tạo video
  | 'generating_voice'  // Đang tạo giọng nói
  | 'reviewing'         // Đang review chất lượng
  | 'revising'          // Đang sửa lỗi
  | 'completed'         // Hoàn thành
  | 'failed'            // Thất bại

export interface AgentPlan {
  totalSteps: number
  currentStep: number
  steps: AgentPlanStep[]
}

export interface AgentPlanStep {
  id: string
  phase: AgentPhase
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  startedAt?: number
  completedAt?: number
  result?: Record<string, unknown>
  error?: string
}

export interface AgentState {
  runId: string
  projectId: string
  episodeId: string
  userId: string
  phase: AgentPhase
  plan: AgentPlan | null
  conversationHistory: AgentMessage[]
  iterationCount: number
  maxIterations: number
  decisions: AgentDecision[]
  artifacts: AgentArtifacts
  createdAt: number
  updatedAt: number
}

export interface AgentDecision {
  iteration: number
  phase: AgentPhase
  reasoning: string
  action: string
  timestamp: number
}

export interface AgentArtifacts {
  scriptId?: string
  storyboardId?: string
  characterIds: string[]
  locationIds: string[]
  panelImageIds: string[]
  videoIds: string[]
  voiceLineIds: string[]
}

// =====================================================
// Agent Events (cho UI streaming)
// =====================================================

export type AgentEventType =
  | 'agent_started'
  | 'agent_thinking'        // Streaming thinking text
  | 'agent_plan_created'
  | 'agent_step_started'
  | 'agent_step_completed'
  | 'agent_step_failed'
  | 'agent_tool_calling'
  | 'agent_tool_result'
  | 'agent_review'
  | 'agent_revision'
  | 'agent_completed'
  | 'agent_failed'

export interface AgentEvent {
  type: AgentEventType
  runId: string
  projectId: string
  timestamp: number
  data: Record<string, unknown>
}

// =====================================================
// Agent Configuration
// =====================================================

export interface DirectorAgentConfig {
  model: string                    // LLM model key (e.g., 'anthropic::claude-opus-4-6')
  maxIterations: number            // Giới hạn vòng lặp agent (mặc định 50)
  maxReviewCycles: number          // Số lần review tối đa cho mỗi output (mặc định 3)
  enableThinking: boolean          // Bật extended thinking
  reasoningEffort: 'low' | 'medium' | 'high'
  autoMode: boolean                // true = tự động chạy toàn bộ, false = xác nhận từng bước
  locale: 'vi' | 'zh' | 'en'
}

export const DEFAULT_DIRECTOR_CONFIG: DirectorAgentConfig = {
  model: 'anthropic::claude-opus-4-6',
  maxIterations: 50,
  maxReviewCycles: 3,
  enableThinking: true,
  reasoningEffort: 'high',
  autoMode: true,
  locale: 'vi',
}
