/**
 * Director Agent — "Đạo diễn AI"
 *
 * Agent chính điều phối toàn bộ quy trình sản xuất video từ tiểu thuyết.
 * Sử dụng Claude Opus 4.6 với extended thinking để:
 * - Phân tích truyện và lên kế hoạch sản xuất
 * - Gọi các tool để thực hiện từng bước
 * - Tự review chất lượng và sửa lỗi
 * - Stream thinking process ra UI real-time
 *
 * Architecture:
 *   User Request → Director Agent → [Think] → [Plan] → [Act] → [Review] → [Output]
 *                                      ↑                           |
 *                                      └───────── [Revise] ←──────┘
 */

import OpenAI from 'openai'
import { createScopedLogger } from '@/lib/logging/core'
import type {
  AgentState,
  AgentEvent,
  AgentMessage,
  AgentPhase,
  AgentToolCall,
  AgentToolResult,
  AgentToolName,
  AgentDecision,
  DirectorAgentConfig,
} from './types'
import { DEFAULT_DIRECTOR_CONFIG } from './types'
import { AGENT_TOOLS, buildToolDefinitionsForLLM } from './tools'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'
import type { Locale } from '@/i18n/routing'

const agentLogger = createScopedLogger({
  module: 'agent.director',
  action: 'agent.run',
})

// =====================================================
// System Prompt cho Director Agent
// =====================================================

function buildDirectorSystemPrompt(locale: 'vi' | 'zh' | 'en'): string {
  const localePrompts: Record<string, string> = {
    vi: `Bạn là Director Agent — "Đạo diễn AI" chuyên nghiệp cho hệ thống sản xuất video từ tiểu thuyết.

## Vai trò
Bạn là đạo diễn tổng thể, chịu trách nhiệm điều phối toàn bộ quy trình từ phân tích truyện đến xuất video hoàn chỉnh.

## Nguyên tắc làm việc
1. **Phân tích kỹ trước khi hành động**: Luôn đọc và hiểu kỹ nội dung truyện trước khi bắt đầu.
2. **Lên kế hoạch chi tiết**: Tạo production plan trước khi thực hiện bất kỳ bước nào.
3. **Tính nhất quán**: Đảm bảo nhân vật, bối cảnh, phong cách nhất quán xuyên suốt.
4. **Review chất lượng**: Sau mỗi giai đoạn lớn, tự review và sửa nếu cần.
5. **Tối ưu parallel**: Chạy các task độc lập song song khi có thể.

## Quy trình sản xuất
1. Phân tích truyện → Trích xuất nhân vật, bối cảnh, cốt truyện
2. Viết kịch bản → Chuyển truyện thành kịch bản điện ảnh
3. Tạo storyboard → Phân cảnh với mô tả hình ảnh chi tiết
4. Tạo tài nguyên → Hình nhân vật, bối cảnh (song song)
5. Tạo hình panel → Hình ảnh cho từng khung hình
6. Review → Kiểm tra tính nhất quán visual
7. Tạo video → Chuyển hình thành video có chuyển động
8. Tạo giọng nói → Lời thoại và narration
9. Review tổng thể → Đánh giá chất lượng cuối cùng

## Quy tắc output
- Luôn trả lời bằng tiếng Việt
- Giải thích rõ ràng mỗi quyết định
- Khi gặp vấn đề, đề xuất giải pháp cụ thể
- Khi review, cho điểm từ 1-10 và giải thích
- Khi đã hoàn thành toàn bộ quy trình, kết thúc bằng [PRODUCTION_COMPLETE]`,

    zh: `你是Director Agent——专业AI导演，负责管理从小说到完整视频的全流程制作。

## 角色
你是总导演，负责协调从小说分析到最终视频输出的完整流程。

## 工作原则
1. 分析后再行动：始终先深入理解故事内容。
2. 详细规划：在执行任何步骤前创建制作计划。
3. 一致性：确保角色、场景、风格贯穿始终。
4. 质量审查：每个主要阶段后自我审查并修正。
5. 并行优化：尽可能并行运行独立任务。

完成全部流程后，以 [PRODUCTION_COMPLETE] 结尾。
请用中文回复所有内容。`,

    en: `You are the Director Agent — a professional AI director for the novel-to-video production system.

## Role
You are the overall director, responsible for orchestrating the entire pipeline from novel analysis to final video output.

## Working Principles
1. Analyze before acting: Always deeply understand the story content first.
2. Detailed planning: Create a production plan before executing any step.
3. Consistency: Ensure characters, locations, and style are consistent throughout.
4. Quality review: Self-review and revise after each major phase.
5. Parallel optimization: Run independent tasks in parallel when possible.

When the entire production is complete, end with [PRODUCTION_COMPLETE].
Always respond in English.`,
  }

  return localePrompts[locale] || localePrompts.vi
}

// =====================================================
// Agent Event Emitter
// =====================================================

export type AgentEventHandler = (event: AgentEvent) => void | Promise<void>

function emitEvent(
  handler: AgentEventHandler | undefined,
  type: AgentEvent['type'],
  state: AgentState,
  data: Record<string, unknown> = {},
): void {
  if (!handler) return
  const event: AgentEvent = {
    type,
    runId: state.runId,
    projectId: state.projectId,
    timestamp: Date.now(),
    data,
  }
  // Fire and forget — không block agent loop
  void Promise.resolve(handler(event)).catch((err) => {
    agentLogger.warn({
      action: 'agent.event.emit_failed',
      message: 'Failed to emit agent event',
      details: { type, error: err instanceof Error ? err.message : String(err) },
    })
  })
}

// =====================================================
// Tool Executor — kết nối với task submission system
// =====================================================

export type ToolExecutor = (
  toolCall: AgentToolCall,
  state: AgentState,
) => Promise<AgentToolResult>

/**
 * Map từ agent tool name sang task type tương ứng trong system
 */
const TOOL_TO_TASK_MAP: Record<AgentToolName, { taskType: string; targetType: string }> = {
  analyze_novel: { taskType: TASK_TYPE.ANALYZE_NOVEL, targetType: 'episode' },
  create_script: { taskType: TASK_TYPE.STORY_TO_SCRIPT_RUN, targetType: 'episode' },
  create_storyboard: { taskType: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN, targetType: 'episode' },
  generate_character_image: { taskType: TASK_TYPE.IMAGE_CHARACTER, targetType: 'character' },
  generate_location_image: { taskType: TASK_TYPE.IMAGE_LOCATION, targetType: 'location' },
  generate_panel_image: { taskType: TASK_TYPE.IMAGE_PANEL, targetType: 'panel' },
  generate_video: { taskType: TASK_TYPE.VIDEO_PANEL, targetType: 'panel' },
  generate_voice: { taskType: TASK_TYPE.VOICE_LINE, targetType: 'voiceLine' },
  review_quality: { taskType: 'agent_review', targetType: 'project' },
  revise_panel: { taskType: TASK_TYPE.MODIFY_ASSET_IMAGE, targetType: 'panel' },
  get_project_status: { taskType: 'agent_status', targetType: 'project' },
}

/**
 * Default tool executor — kết nối với task submission system
 * Map mỗi agent tool call thành submitTask call tương ứng
 */
export function createDefaultToolExecutor(locale: Locale = 'vi'): ToolExecutor {
  return async (toolCall: AgentToolCall, state: AgentState): Promise<AgentToolResult> => {
    agentLogger.info({
      action: 'agent.tool.execute',
      message: `Executing tool: ${toolCall.name}`,
      userId: state.userId,
      projectId: state.projectId,
      details: { toolName: toolCall.name, arguments: toolCall.arguments },
    })

    const mapping = TOOL_TO_TASK_MAP[toolCall.name]
    if (!mapping) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        success: false,
        output: {},
        error: `No task mapping for tool: ${toolCall.name}`,
      }
    }

    // review_quality và get_project_status là internal agent tools — không submit task
    if (toolCall.name === 'review_quality' || toolCall.name === 'get_project_status') {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        success: true,
        output: {
          message: `Internal tool ${toolCall.name} executed`,
          phase: state.phase,
          iterationCount: state.iterationCount,
          artifacts: state.artifacts,
          ...(toolCall.name === 'get_project_status'
            ? {
                completedSteps: state.decisions.length,
                currentPhase: state.phase,
              }
            : {}),
        },
      }
    }

    // Xác định targetId dựa trên tool arguments
    const targetId = resolveTargetId(toolCall, state)

    try {
      const result = await submitTask({
        userId: state.userId,
        locale,
        projectId: state.projectId,
        episodeId: state.episodeId,
        type: mapping.taskType as Parameters<typeof submitTask>[0]['type'],
        targetType: mapping.targetType,
        targetId,
        payload: {
          ...toolCall.arguments,
          agentRunId: state.runId,
          agentIteration: state.iterationCount,
        },
      })

      // Track artifacts sinh ra
      trackArtifact(state, toolCall.name, targetId, result.taskId)

      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        success: true,
        output: {
          taskId: result.taskId,
          runId: result.runId,
          status: result.status,
          targetId,
          message: `Task ${mapping.taskType} submitted successfully`,
        },
      }
    } catch (error) {
      agentLogger.error({
        action: 'agent.tool.submit_failed',
        message: `Failed to submit task for tool: ${toolCall.name}`,
        userId: state.userId,
        projectId: state.projectId,
        details: { error: error instanceof Error ? error.message : String(error) },
      })

      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        success: false,
        output: {},
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

/**
 * Xác định targetId từ tool arguments
 */
function resolveTargetId(toolCall: AgentToolCall, state: AgentState): string {
  const args = toolCall.arguments
  // Ưu tiên targetId từ arguments
  if (typeof args.targetId === 'string') return args.targetId
  if (typeof args.characterName === 'string') return args.characterName
  if (typeof args.locationName === 'string') return args.locationName
  if (typeof args.panelIndex === 'number') return `panel-${args.panelIndex}`
  if (typeof args.scriptId === 'string') return args.scriptId
  // Fallback: episode id
  return state.episodeId
}

/**
 * Track artifacts sinh ra từ tool execution
 */
function trackArtifact(
  state: AgentState,
  toolName: AgentToolName,
  targetId: string,
  taskId: string,
): void {
  switch (toolName) {
    case 'create_script':
      state.artifacts.scriptId = taskId
      break
    case 'create_storyboard':
      state.artifacts.storyboardId = taskId
      break
    case 'generate_character_image':
      state.artifacts.characterIds.push(targetId)
      break
    case 'generate_location_image':
      state.artifacts.locationIds.push(targetId)
      break
    case 'generate_panel_image':
      state.artifacts.panelImageIds.push(targetId)
      break
    case 'generate_video':
      state.artifacts.videoIds.push(targetId)
      break
    case 'generate_voice':
      state.artifacts.voiceLineIds.push(targetId)
      break
  }
}

// =====================================================
// Director Agent Core Loop
// =====================================================

export interface DirectorAgentOptions {
  config?: Partial<DirectorAgentConfig>
  onEvent?: AgentEventHandler
  toolExecutor?: ToolExecutor
}

/**
 * Khởi tạo state cho Director Agent
 */
export function createAgentState(
  runId: string,
  projectId: string,
  episodeId: string,
  userId: string,
  config?: Partial<DirectorAgentConfig>,
): AgentState {
  const fullConfig = { ...DEFAULT_DIRECTOR_CONFIG, ...config }
  return {
    runId,
    projectId,
    episodeId,
    userId,
    phase: 'planning',
    plan: null,
    conversationHistory: [],
    iterationCount: 0,
    maxIterations: fullConfig.maxIterations,
    decisions: [],
    artifacts: {
      characterIds: [],
      locationIds: [],
      panelImageIds: [],
      videoIds: [],
      voiceLineIds: [],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

/**
 * Thêm message vào conversation history
 */
function addMessage(state: AgentState, message: Omit<AgentMessage, 'timestamp'>): void {
  state.conversationHistory.push({
    ...message,
    timestamp: Date.now(),
  })
  state.updatedAt = Date.now()
}

/**
 * Ghi lại quyết định của agent
 */
function recordDecision(
  state: AgentState,
  reasoning: string,
  action: string,
): void {
  const decision: AgentDecision = {
    iteration: state.iterationCount,
    phase: state.phase,
    reasoning,
    action,
    timestamp: Date.now(),
  }
  state.decisions.push(decision)
}

/**
 * Cập nhật phase của agent
 */
function updatePhase(state: AgentState, phase: AgentPhase): void {
  state.phase = phase
  state.updatedAt = Date.now()
}

/**
 * Main agent loop — chạy Director Agent
 *
 * Quy trình:
 * 1. Gửi system prompt + user request tới LLM
 * 2. LLM trả về thinking + tool calls hoặc text response
 * 3. Nếu có tool calls → execute tools → gửi kết quả lại LLM
 * 4. Lặp lại cho đến khi LLM trả về final response (không có tool call)
 * 5. Giới hạn bởi maxIterations
 */
export async function runDirectorAgent(
  state: AgentState,
  userRequest: string,
  options: DirectorAgentOptions = {},
): Promise<AgentState> {
  const config = { ...DEFAULT_DIRECTOR_CONFIG, ...options.config }
  const { onEvent, toolExecutor = createDefaultToolExecutor(config.locale) } = options

  agentLogger.info({
    action: 'agent.run.start',
    message: 'Director Agent started',
    userId: state.userId,
    projectId: state.projectId,
    details: { runId: state.runId, config },
  })

  // Emit start event
  emitEvent(onEvent, 'agent_started', state, { config })

  // Thêm system prompt
  addMessage(state, {
    role: 'system',
    content: buildDirectorSystemPrompt(config.locale),
  })

  // Thêm user request
  addMessage(state, {
    role: 'user',
    content: userRequest,
  })

  // Available tools
  const toolDefinitions = buildToolDefinitionsForLLM()
  const toolMap = new Map(AGENT_TOOLS.map((t) => [t.name, t]))

  try {
    // Agent loop
    while (state.iterationCount < state.maxIterations) {
      state.iterationCount += 1

      agentLogger.info({
        action: 'agent.loop.iteration',
        message: `Agent iteration ${state.iterationCount}`,
        userId: state.userId,
        projectId: state.projectId,
        details: { iteration: state.iterationCount, phase: state.phase },
      })

      // Gọi LLM với conversation history + tools
      const llmResponse = await callDirectorLLM(state, config, toolDefinitions)

      // Stream thinking nếu có
      if (llmResponse.thinking) {
        emitEvent(onEvent, 'agent_thinking', state, {
          thinking: llmResponse.thinking,
          iteration: state.iterationCount,
        })
      }

      // Nếu LLM trả về tool calls
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        // Ghi lại message assistant với tool calls
        addMessage(state, {
          role: 'assistant',
          content: llmResponse.text || '',
          toolCalls: llmResponse.toolCalls,
          thinking: llmResponse.thinking,
        })

        // Execute từng tool
        const toolResults: AgentToolResult[] = []
        for (const toolCall of llmResponse.toolCalls) {
          const toolDef = toolMap.get(toolCall.name)
          if (!toolDef) {
            toolResults.push({
              toolCallId: toolCall.id,
              name: toolCall.name,
              success: false,
              output: {},
              error: `Unknown tool: ${toolCall.name}`,
            })
            continue
          }

          emitEvent(onEvent, 'agent_tool_calling', state, {
            toolName: toolCall.name,
            arguments: toolCall.arguments,
          })

          const result = await toolExecutor(toolCall, state)
          toolResults.push(result)

          emitEvent(onEvent, 'agent_tool_result', state, {
            toolName: toolCall.name,
            success: result.success,
            output: result.output,
          })

          // Ghi quyết định
          recordDecision(state, llmResponse.thinking || '', `Called tool: ${toolCall.name}`)
        }

        // Thêm tool results vào conversation
        addMessage(state, {
          role: 'tool',
          content: JSON.stringify(toolResults),
          toolResults,
        })

        // Tiếp tục loop — LLM sẽ xử lý kết quả tool
        continue
      }

      // LLM trả về text response (không có tool call) → đã hoàn thành bước hiện tại
      addMessage(state, {
        role: 'assistant',
        content: llmResponse.text || '',
        thinking: llmResponse.thinking,
      })

      recordDecision(
        state,
        llmResponse.thinking || '',
        `Completed phase: ${state.phase}`,
      )

      // Kiểm tra xem agent đã hoàn thành chưa
      if (isAgentComplete(state, llmResponse.text || '')) {
        updatePhase(state, 'completed')
        emitEvent(onEvent, 'agent_completed', state, {
          totalIterations: state.iterationCount,
          totalDecisions: state.decisions.length,
          artifacts: state.artifacts,
        })
        break
      }
    }

    // Nếu hết iterations mà chưa xong
    if (state.phase !== 'completed') {
      agentLogger.warn({
        action: 'agent.run.max_iterations',
        message: 'Agent reached max iterations',
        userId: state.userId,
        projectId: state.projectId,
        details: { iterations: state.iterationCount, phase: state.phase },
      })
      updatePhase(state, 'failed')
      emitEvent(onEvent, 'agent_failed', state, {
        reason: 'max_iterations_reached',
        iterations: state.iterationCount,
      })
    }
  } catch (error) {
    agentLogger.error({
      action: 'agent.run.error',
      message: 'Director Agent failed',
      userId: state.userId,
      projectId: state.projectId,
      details: { error: error instanceof Error ? error.message : String(error) },
    })
    updatePhase(state, 'failed')
    emitEvent(onEvent, 'agent_failed', state, {
      reason: 'error',
      error: error instanceof Error ? error.message : String(error),
    })
  }

  agentLogger.info({
    action: 'agent.run.end',
    message: `Director Agent ended in phase: ${state.phase}`,
    userId: state.userId,
    projectId: state.projectId,
    details: {
      finalPhase: state.phase,
      iterations: state.iterationCount,
      decisions: state.decisions.length,
    },
  })

  return state
}

// =====================================================
// LLM Integration — sử dụng Anthropic Claude Proxy
// =====================================================

interface DirectorLLMResponse {
  text: string
  thinking?: string
  toolCalls?: AgentToolCall[]
}

/**
 * Tạo OpenAI client trỏ tới Claude proxy
 */
function createProxyClient(): OpenAI {
  const baseUrl = process.env.CLAUDE_PROXY_BASE_URL
  const apiKey = process.env.CLAUDE_PROXY_API_KEY
  if (!baseUrl || !apiKey) {
    throw new Error('CLAUDE_PROXY_NOT_CONFIGURED: CLAUDE_PROXY_BASE_URL và CLAUDE_PROXY_API_KEY chưa được cấu hình')
  }
  return new OpenAI({ baseURL: baseUrl, apiKey })
}

/**
 * Chuyển đổi conversation history sang OpenAI message format
 * Hỗ trợ system, user, assistant (có tool_calls), và tool messages
 */
function buildOpenAIMessages(
  state: AgentState,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

  for (const msg of state.conversationHistory) {
    if (msg.role === 'system') {
      messages.push({ role: 'system', content: msg.content })
    } else if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content })
    } else if (msg.role === 'assistant') {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        // Assistant message với tool calls
        messages.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        })
      } else {
        messages.push({ role: 'assistant', content: msg.content })
      }
    } else if (msg.role === 'tool' && msg.toolResults) {
      // Tool results — mỗi result thành 1 tool message
      for (const result of msg.toolResults) {
        messages.push({
          role: 'tool',
          tool_call_id: result.toolCallId,
          content: JSON.stringify({
            success: result.success,
            output: result.output,
            ...(result.error ? { error: result.error } : {}),
          }),
        })
      }
    }
  }

  return messages
}

/**
 * Trích xuất thinking content từ response choices
 * Claude proxy trả thinking qua reasoning_content trong choice message
 */
function extractThinking(choice: OpenAI.Chat.Completions.ChatCompletion.Choice): string {
  const message = choice.message as Record<string, unknown>
  if (typeof message.reasoning_content === 'string') {
    return message.reasoning_content
  }
  // Một số proxy trả reasoning dưới dạng thinking field
  if (typeof message.thinking === 'string') {
    return message.thinking
  }
  return ''
}

/**
 * Gọi LLM cho Director Agent qua Claude proxy
 * Sử dụng OpenAI-compatible API với tool calling và extended thinking
 */
async function callDirectorLLM(
  state: AgentState,
  config: DirectorAgentConfig,
  toolDefinitions: Record<string, unknown>[],
): Promise<DirectorLLMResponse> {
  agentLogger.info({
    action: 'agent.llm.call',
    message: 'Calling LLM for Director Agent',
    userId: state.userId,
    projectId: state.projectId,
    details: {
      iteration: state.iterationCount,
      historyLength: state.conversationHistory.length,
      model: config.model,
    },
  })

  const client = createProxyClient()

  // Resolve model ID: 'anthropic::claude-opus-4-6' → 'claude-opus-4-6'
  const modelId = config.model.includes('::')
    ? config.model.split('::')[1]
    : config.model

  const messages = buildOpenAIMessages(state)

  // Build request params
  const extraParams: Record<string, unknown> = {}
  if (config.enableThinking) {
    extraParams.reasoning = { effort: config.reasoningEffort }
  }

  const startTime = Date.now()

  try {
    const completion = await client.chat.completions.create({
      model: modelId,
      messages,
      // Không truyền temperature khi reasoning enabled (Claude yêu cầu)
      ...(config.enableThinking ? {} : { temperature: 0.7 }),
      tools: toolDefinitions as OpenAI.Chat.Completions.ChatCompletionTool[],
      ...extraParams,
    })

    const durationMs = Date.now() - startTime
    agentLogger.info({
      action: 'agent.llm.success',
      message: `LLM call completed in ${durationMs}ms`,
      userId: state.userId,
      projectId: state.projectId,
      details: {
        model: modelId,
        durationMs,
        usage: completion.usage,
      },
    })

    const choice = completion.choices[0]
    if (!choice) {
      return { text: '', thinking: '' }
    }

    // Trích xuất thinking
    const thinking = extractThinking(choice)

    // Trích xuất tool calls nếu có
    const toolCalls: AgentToolCall[] = []
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      for (const tc of choice.message.tool_calls) {
        if (tc.type === 'function') {
          let parsedArgs: Record<string, unknown> = {}
          try {
            parsedArgs = JSON.parse(tc.function.arguments || '{}')
          } catch {
            agentLogger.warn({
              action: 'agent.llm.parse_args_failed',
              message: `Failed to parse tool arguments for ${tc.function.name}`,
              details: { raw: tc.function.arguments },
            })
          }
          toolCalls.push({
            id: tc.id,
            name: tc.function.name as AgentToolName,
            arguments: parsedArgs,
          })
        }
      }
    }

    return {
      text: choice.message.content || '',
      thinking,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    agentLogger.error({
      action: 'agent.llm.error',
      message: `LLM call failed after ${durationMs}ms`,
      userId: state.userId,
      projectId: state.projectId,
      details: {
        model: modelId,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      },
    })
    throw error
  }
}

/**
 * Kiểm tra xem agent đã hoàn thành task chưa
 */
function isAgentComplete(state: AgentState, responseText: string): boolean {
  // Agent hoàn thành khi:
  // 1. Phase là 'completed'
  // 2. Hoặc response chứa signal hoàn thành
  if (state.phase === 'completed') return true
  if (responseText.includes('[PRODUCTION_COMPLETE]')) return true
  if (responseText.includes('[TASK_DONE]')) return true
  return false
}

// =====================================================
// Exports
// =====================================================

export {
  buildDirectorSystemPrompt,
  type DirectorLLMResponse,
}
