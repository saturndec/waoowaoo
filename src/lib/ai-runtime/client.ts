import { chatCompletion, getCompletionParts } from '@/lib/llm-client'
import { toAiRuntimeError } from './errors'
import type { AiStepExecutionInput, AiStepExecutionResult } from './types'

function toInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value))
  return 0
}

function extractUsage(completion: AiStepExecutionResult['completion']) {
  const promptTokens = toInt(completion.usage?.prompt_tokens)
  const completionTokens = toInt(completion.usage?.completion_tokens)
  const totalTokens = toInt(completion.usage?.total_tokens) || (promptTokens + completionTokens)
  return {
    promptTokens,
    completionTokens,
    totalTokens,
  }
}

export async function executeAiTextStep(input: AiStepExecutionInput): Promise<AiStepExecutionResult> {
  try {
    const completion = await chatCompletion(
      input.userId,
      input.model,
      input.messages,
      {
        temperature: input.temperature,
        reasoning: input.reasoning,
        reasoningEffort: input.reasoningEffort,
        projectId: input.projectId,
        action: input.action,
        streamStepId: input.meta.stepId,
        streamStepAttempt: input.meta.stepAttempt || 1,
        streamStepTitle: input.meta.stepTitle,
        streamStepIndex: input.meta.stepIndex,
        streamStepTotal: input.meta.stepTotal,
      },
    )

    const parts = getCompletionParts(completion)
    return {
      text: parts.text,
      reasoning: parts.reasoning,
      usage: extractUsage(completion),
      completion,
    }
  } catch (error) {
    throw toAiRuntimeError(error)
  }
}
