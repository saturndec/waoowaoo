import { describe, expect, it, vi } from 'vitest'

const llmClientMock = vi.hoisted(() => ({
  chatCompletion: vi.fn(async () => ({
    id: 'completion-1',
    usage: {
      prompt_tokens: 11,
      completion_tokens: 7,
      total_tokens: 18,
    },
    choices: [
      {
        message: {
          content: [
            { type: 'text', text: 'ok' },
          ],
        },
      },
    ],
  })),
  chatCompletionWithVision: vi.fn(),
  getCompletionContent: vi.fn(),
}))

vi.mock('@/lib/llm-client', () => llmClientMock)

describe('ai-runtime prompt telemetry propagation', () => {
  it('forwards prompt telemetry to llm chatCompletion and returns it', async () => {
    const { executeAiTextStep } = await import('@/lib/ai-runtime')

    const promptTelemetry = {
      prompt_language: 'en' as const,
      output_language: 'vi' as const,
      contract_language: 'en' as const,
      contract_valid: true,
      fallback_applied: false,
      route_reason: 'locale:non-zh',
    }

    const result = await executeAiTextStep({
      userId: 'user-1',
      model: 'llm::analysis-1',
      messages: [{ role: 'user', content: 'hello' }],
      projectId: 'project-1',
      action: 'episode_split',
      meta: {
        stepId: 'episode_split',
        stepTitle: 'Episode split',
        stepIndex: 1,
        stepTotal: 1,
      },
      promptTelemetry,
    })

    expect(llmClientMock.chatCompletion).toHaveBeenCalledWith(
      'user-1',
      'llm::analysis-1',
      [{ role: 'user', content: 'hello' }],
      expect.objectContaining({
        promptTelemetry,
      }),
    )

    expect(result.promptTelemetry).toEqual(promptTelemetry)
    expect(result.usage).toEqual({
      promptTokens: 11,
      completionTokens: 7,
      totalTokens: 18,
    })
    expect(result.text).toBe('ok')
  })
})
