/**
 * API Route: Director Agent Run
 *
 * POST /api/novel-promotion/[projectId]/agent-run
 *
 * Khởi chạy Director Agent cho một episode cụ thể.
 * Agent sẽ tự động phân tích truyện, lên kế hoạch, và thực hiện
 * toàn bộ quy trình sản xuất video.
 *
 * Request body:
 *   - episodeId: string (bắt buộc)
 *   - request?: string (yêu cầu tùy chỉnh, mặc định: tự động sản xuất)
 *   - config?: Partial<DirectorAgentConfig> (tùy chỉnh cấu hình agent)
 *
 * Response: SSE stream với các AgentEvent
 */

import { NextRequest } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { ApiError } from '@/lib/api-errors'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import {
  createAgentState,
  runDirectorAgent,
  createDefaultToolExecutor,
  type AgentEventHandler,
} from '@/lib/agent/director'
import type { DirectorAgentConfig } from '@/lib/agent/types'
import { createScopedLogger } from '@/lib/logging/core'

const logger = createScopedLogger({
  module: 'api.agent-run',
  action: 'agent.api',
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json()
  const locale = resolveRequiredTaskLocale(request, body)
  const episodeId = body?.episodeId
  const userRequest = body?.request || ''
  const configOverrides = body?.config as Partial<DirectorAgentConfig> | undefined

  if (!episodeId || typeof episodeId !== 'string') {
    return new Response(
      JSON.stringify({ error: 'INVALID_PARAMS', message: 'episodeId is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const userId = session.user.id
  const runId = `agent-${projectId}-${episodeId}-${Date.now()}`

  logger.info({
    action: 'agent.api.start',
    message: 'Starting Director Agent via API',
    userId,
    projectId,
    details: { runId, episodeId },
  })

  // SSE streaming response
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(data: Record<string, unknown>) {
        try {
          const chunk = `data: ${JSON.stringify(data)}\n\n`
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // Stream đã đóng, bỏ qua
        }
      }

      // Event handler — stream mỗi event ra SSE
      const onEvent: AgentEventHandler = (event) => {
        sendEvent({
          type: event.type,
          runId: event.runId,
          projectId: event.projectId,
          timestamp: event.timestamp,
          data: event.data,
        })
      }

      try {
        // Tạo agent state
        const state = createAgentState(
          runId,
          projectId,
          episodeId,
          userId,
          { locale: locale as DirectorAgentConfig['locale'], ...configOverrides },
        )

        // Build default request nếu user không cung cấp
        const defaultRequest = locale === 'vi'
          ? `Hãy phân tích truyện và thực hiện toàn bộ quy trình sản xuất video cho episode ${episodeId}. Tự động lên kế hoạch, tạo kịch bản, storyboard, hình ảnh, video, và giọng nói.`
          : locale === 'zh'
            ? `请分析故事并执行完整的视频制作流程。自动规划、创建脚本、分镜、图像、视频和配音。`
            : `Analyze the story and execute the complete video production pipeline for episode ${episodeId}. Automatically plan, create script, storyboard, images, videos, and voice.`

        // Chạy agent
        const finalState = await runDirectorAgent(
          state,
          userRequest || defaultRequest,
          {
            config: configOverrides,
            onEvent,
            toolExecutor: createDefaultToolExecutor(locale as DirectorAgentConfig['locale']),
          },
        )

        // Gửi final state
        sendEvent({
          type: 'agent_final_state',
          runId,
          projectId,
          timestamp: Date.now(),
          data: {
            phase: finalState.phase,
            iterationCount: finalState.iterationCount,
            totalDecisions: finalState.decisions.length,
            artifacts: finalState.artifacts,
          },
        })

        // Đóng stream
        sendEvent({ type: 'done', runId, projectId, timestamp: Date.now(), data: {} })
        controller.close()
      } catch (error) {
        logger.error({
          action: 'agent.api.error',
          message: 'Director Agent API failed',
          userId,
          projectId,
          details: { error: error instanceof Error ? error.message : String(error) },
        })

        sendEvent({
          type: 'error',
          runId,
          projectId,
          timestamp: Date.now(),
          data: {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        })

        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Agent-Run-Id': runId,
    },
  })
}
