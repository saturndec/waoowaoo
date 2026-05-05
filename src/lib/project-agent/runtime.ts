import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  streamText,
  type UIMessage,
  type ToolSet,
  type UIMessageStreamWriter,
} from 'ai'
import type { Tool } from '@ai-sdk/provider-utils'
import type { NextRequest } from 'next/server'
import { createProjectAgentOperationRegistry } from '@/lib/operations/registry'
import { getUserModelConfig } from '@/lib/config-service'
import { executeProjectAgentOperationFromTool } from '@/lib/adapters/tools/execute-project-agent-operation'
import { writeOperationDataPart } from '@/lib/operations/types'
import { getRequestId } from '@/lib/api-errors'
import { createScopedLogger } from '@/lib/logging/core'
import type { ProjectAgentContext } from './types'
import { resolveProjectPhase } from './project-phase'
import { createProjectAgentStopController } from './stop-conditions'
import type { AgentDebugPartData, AgentRuntimeContextPartData, ProjectAgentStopPartData } from './types'
import { routeProjectAgentRequest } from './router'
import { selectProjectAgentOperationsByGroups } from './operation-injection'
import { buildProjectAgentSystemPrompt, localizeSelectableToolDescription } from './copy'
import { normalizeProjectAgentLocale } from './locale'
import { compressMessages } from './message-compression'
import { resolveProjectAgentLanguageModel } from './model'
import type { ProjectAgentInteractionMode } from './types'
import { resolveProjectAgentExecutionMode } from './execution-mode'

type UnknownObject = { [key: string]: unknown }

const projectAgentLogger = createScopedLogger({
  module: 'project-agent.runtime',
})

function writeDebugText(writer: UIMessageStreamWriter<UIMessage>, text: string) {
  writer.write({ type: 'start' })
  writer.write({ type: 'start-step' })
  writer.write({ type: 'text-start', id: 'agent-debug' })
  writer.write({ type: 'text-delta', id: 'agent-debug', delta: text })
  writer.write({ type: 'text-end', id: 'agent-debug' })
  writer.write({ type: 'finish-step' })
}

function buildMessagePreview(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > 200 ? `${normalized.slice(0, 200)}...` : normalized
}

function normalizeInteractionMode(value: unknown): ProjectAgentInteractionMode | undefined {
  if (value !== 'auto' && value !== 'plan' && value !== 'fast') return undefined
  return value
}

function normalizeProjectAgentContext(raw: unknown): ProjectAgentContext {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const record = raw as UnknownObject
  const locale = typeof record.locale === 'string' ? record.locale.trim() : ''
  const episodeId = typeof record.episodeId === 'string' ? record.episodeId.trim() : ''
  const currentStage = typeof record.currentStage === 'string' ? record.currentStage.trim() : ''
  const selectedScopeRef = typeof record.selectedScopeRef === 'string' ? record.selectedScopeRef.trim() : ''
  const selectedPanelId = typeof record.selectedPanelId === 'string' ? record.selectedPanelId.trim() : ''
  const selectedClipId = typeof record.selectedClipId === 'string' ? record.selectedClipId.trim() : ''
  const selectedAssetId = typeof record.selectedAssetId === 'string' ? record.selectedAssetId.trim() : ''
  const interactionMode = normalizeInteractionMode(record.interactionMode)
  return {
    ...(locale ? { locale } : {}),
    ...(episodeId ? { episodeId } : {}),
    ...(currentStage ? { currentStage } : {}),
    ...(selectedScopeRef ? { selectedScopeRef } : {}),
    ...(selectedPanelId ? { selectedPanelId } : {}),
    ...(selectedClipId ? { selectedClipId } : {}),
    ...(selectedAssetId ? { selectedAssetId } : {}),
    ...(interactionMode ? { interactionMode } : {}),
  }
}

async function toModelMessages(messages: UIMessage[]) {
  const withoutIds = messages.map((message) => {
    const rest: Omit<UIMessage, 'id'> = {
      role: message.role,
      parts: message.parts,
      ...(message.metadata !== undefined ? { metadata: message.metadata } : {}),
    }
    return rest
  })
  return await convertToModelMessages(withoutIds)
}

export async function createProjectAgentChatResponse(input: {
  request: NextRequest
  userId: string
  projectId: string
  context: unknown
  messages: unknown
}): Promise<Response> {
  const stableRequestId = getRequestId(input.request) ?? crypto.randomUUID()
  const validation = await safeValidateUIMessages({ messages: input.messages })
  if (!validation.success) {
    throw new Error('PROJECT_AGENT_INVALID_MESSAGES')
  }
  const normalizedMessages = validation.data
  if (normalizedMessages.length === 0) {
    throw new Error('PROJECT_AGENT_EMPTY_MESSAGES')
  }

  const userConfig = await getUserModelConfig(input.userId)
  const analysisModelKey = userConfig.analysisModel?.trim() || ''
  if (!analysisModelKey) {
    throw new Error('PROJECT_AGENT_MODEL_NOT_CONFIGURED')
  }

  const contextBase = normalizeProjectAgentContext(input.context)
  const context: ProjectAgentContext = {
    ...contextBase,
  }
  const phase = await resolveProjectPhase({
    projectId: input.projectId,
    userId: input.userId,
    episodeId: context.episodeId || null,
    currentStage: context.currentStage || null,
  })
  const resolved = await resolveProjectAgentLanguageModel({
    userId: input.userId,
    analysisModelKey,
  })
  const locale = normalizeProjectAgentLocale(context.locale)
  const runtimeMessages = await compressMessages({
    messages: normalizedMessages,
    locale,
    model: resolved.languageModel,
  })

  const stream = createUIMessageStream({
    originalMessages: runtimeMessages,
    execute: async ({ writer }) => {
      const agentDebug = new URL(input.request.url).searchParams.get('agentDebug') === '1'
      const operations = createProjectAgentOperationRegistry()
      const allowedRequestedGroups = Array.from(new Set(
        Object.values(operations)
          .filter((operation) => operation.channels.tool)
          .map((operation) => operation.groupPath.join('/')),
      ))
        .sort()
        .map((serialized) => serialized.split('/').filter(Boolean))
      const route = await routeProjectAgentRequest({
        messages: runtimeMessages,
        phase,
        context,
        model: resolved.languageModel,
        allowedRequestedGroups,
      })
      const executionMode = resolveProjectAgentExecutionMode({
        interactionMode: context.interactionMode,
        routedIntent: route.intent,
      })
      const requestId = stableRequestId
      projectAgentLogger.info({
        action: route.needsClarification ? 'assistant.route.clarification' : 'assistant.tool.selection',
        message: route.needsClarification ? 'Project agent route requires clarification' : 'Project agent tool selection decided',
        requestId,
        projectId: input.projectId,
        userId: input.userId,
        details: {
          interactionMode: executionMode.interactionMode,
          routedIntent: route.intent,
          effectiveIntent: executionMode.effectiveIntent,
          domains: route.domains,
          requestedGroups: route.requestedGroups,
          latestUserTextPreview: buildMessagePreview(route.latestUserText),
          ...(route.needsClarification
            ? {
                clarifyingQuestion: route.clarifyingQuestion,
                reasoning: route.reasoning,
              }
            : {}),
        },
      })
      if (route.needsClarification && route.clarifyingQuestion) {
        writer.write({ type: 'start' })
        writer.write({ type: 'start-step' })
        writer.write({ type: 'text-start', id: 'clarification' })
        writer.write({ type: 'text-delta', id: 'clarification', delta: route.clarifyingQuestion })
        writer.write({ type: 'text-end', id: 'clarification' })
        writer.write({ type: 'finish-step' })
        writer.write({ type: 'finish', finishReason: 'stop' })
        return
      }
      const allowedIntents = executionMode.effectiveIntent === 'query'
        ? (['query'] as const)
        : executionMode.effectiveIntent === 'plan'
          ? (['query', 'plan'] as const)
          : (['query', 'plan', 'act'] as const)
      const skillOnlyRequestedGroups = route.requestedGroups.filter((groupPath) => groupPath[0] === 'skill')
      const selection = selectProjectAgentOperationsByGroups({
        registry: operations,
        requestedGroups: skillOnlyRequestedGroups,
        maxTools: 45,
        allowedIntents,
      })
      const toolEntries = selection.operationIds.map((operationId) => {
        const operation = operations[operationId]
        const description = localizeSelectableToolDescription(operationId, operation.summary, locale)
        const definition: Tool<unknown, unknown> = {
          description,
          inputSchema: operation.inputSchema,
          execute: async (args: unknown) => {
            return executeProjectAgentOperationFromTool({
              request: input.request,
              operationId,
              projectId: input.projectId,
              userId: input.userId,
              context,
              source: 'assistant-panel',
              writer,
              input: args,
            })
          },
        }
        return {
          entry: [operationId, definition] as const,
          debugTool: {
            operationId,
            description,
          },
        }
      })
      const tools = Object.fromEntries(toolEntries.map((item) => item.entry)) as ToolSet
      const systemPrompt = buildProjectAgentSystemPrompt({
        locale,
        projectId: input.projectId,
        episodeId: context.episodeId || 'unknown',
        stage: context.currentStage || 'unknown',
        interactionMode: executionMode.interactionMode,
      })
      const modelMessages = await toModelMessages(runtimeMessages)
      writeOperationDataPart<AgentRuntimeContextPartData>(writer, 'data-agent-runtime-context', {
        requestId,
        modelKey: analysisModelKey,
        locale,
        projectId: input.projectId,
        episodeId: context.episodeId || null,
        interactionMode: executionMode.interactionMode,
        systemPrompt,
        rawMessages: normalizedMessages,
        runtimeMessages,
        modelMessages,
        projectContext: context,
        projectPhase: phase,
        route,
        selectedTools: toolEntries.map((item) => item.debugTool),
      })
      if (agentDebug) {
        writeDebugText(writer, [
          '[agentDebug]',
          `requestId=${requestId}`,
          `interactionMode=${executionMode.interactionMode}`,
          `routedIntent=${route.intent}`,
          `effectiveIntent=${executionMode.effectiveIntent}`,
          `requestedGroups=${JSON.stringify(skillOnlyRequestedGroups)}`,
          `alwaysOn=${String(selection.alwaysOnOperationIds.length)}`,
          `tools=${String(selection.operationIds.length)}`,
        ].join('\n'))
        writeOperationDataPart<AgentDebugPartData>(writer, 'data-agent-debug', {
          requestId,
          interactionMode: executionMode.interactionMode,
          routedIntent: route.intent,
          effectiveIntent: executionMode.effectiveIntent,
          requestedGroups: skillOnlyRequestedGroups,
          alwaysOnOperationIds: selection.alwaysOnOperationIds,
          operationIds: selection.operationIds,
        })
      }
      projectAgentLogger.info({
        action: 'assistant.tool.selection.result',
        message: 'Project agent tool selection result',
        requestId,
        projectId: input.projectId,
        userId: input.userId,
        details: {
          interactionMode: executionMode.interactionMode,
          routedIntent: route.intent,
          effectiveIntent: executionMode.effectiveIntent,
          requestedGroups: selection.requestedGroups,
          toolChannelCount: Object.values(operations).filter((operation) => operation.channels.tool).length,
          operationIds: selection.operationIds,
        },
      })
      const stopController = createProjectAgentStopController(tools)

      let result: ReturnType<typeof streamText>
      try {
        result = streamText({
          model: resolved.languageModel,
          system: systemPrompt,
          messages: modelMessages,
          tools,
          stopWhen: stopController.stopWhen,
          experimental_onToolCallStart: ({ toolCall }) => {
            projectAgentLogger.info({
              action: 'assistant.tool.call.start',
              message: 'Project agent tool call started',
              requestId,
              projectId: input.projectId,
              userId: input.userId,
              details: {
                toolName: toolCall.toolName,
              },
            })
          },
          experimental_onToolCallFinish: ({ toolCall, durationMs, success, error }) => {
            projectAgentLogger.info({
              action: 'assistant.tool.call.finish',
              message: 'Project agent tool call finished',
              requestId,
              projectId: input.projectId,
              userId: input.userId,
              details: {
                toolName: toolCall.toolName,
                durationMs,
                success,
                ...(success ? {} : { error: error instanceof Error ? error.message : String(error) }),
              },
            })
          },
          onFinish: ({ steps }) => {
            const stopPart = stopController.buildStopPart(steps.length)
            if (!stopPart) return
            writeOperationDataPart<ProjectAgentStopPartData>(writer, 'data-agent-stop', stopPart)
          },
          temperature: 0.2,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        projectAgentLogger.error({
          action: 'assistant.streamText.failed',
          message: 'Project agent streamText failed',
          requestId,
          projectId: input.projectId,
          userId: input.userId,
          details: {
            error: message,
          },
        })
        throw new Error(`PROJECT_AGENT_STREAM_FAILED requestId=${requestId}: ${message}`)
      }

      writer.merge(result.toUIMessageStream({
        originalMessages: runtimeMessages,
      }))
    },
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  })

  const response = createUIMessageStreamResponse({ stream })
  response.headers.set('x-request-id', stableRequestId)
  return response
}
