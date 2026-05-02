import { z } from 'zod'
import { createHash } from 'crypto'
import { ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { validatePreviewText, validateVoicePrompt } from '@/lib/ai-exec/voice-design'
import { getProviderConfig } from '@/lib/user-api/runtime-config'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { submitOperationTask } from '@/lib/operations/submit-operation-task'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function createAssetHubVoiceOperations(): ProjectAgentOperationRegistryDraft {
  return {
    asset_hub_voice_design: {
      id: 'asset_hub_voice_design',
      summary: 'Submit asset hub voice design task (ASSET_HUB_VOICE_DESIGN).',
      intent: 'act',
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将提交声音设计任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const body = input as unknown as Record<string, unknown>
        const voicePrompt = normalizeString(body.voicePrompt)
        const previewText = normalizeString(body.previewText)
        const preferredName = normalizeString(body.preferredName) || 'custom_voice'
        const language = body.language === 'en' ? 'en' : 'zh'

        const promptValidation = validateVoicePrompt(voicePrompt)
        if (!promptValidation.valid) {
          throw new ApiError('INVALID_PARAMS')
        }
        const textValidation = validatePreviewText(previewText)
        if (!textValidation.valid) {
          throw new ApiError('INVALID_PARAMS')
        }

        await getProviderConfig(ctx.userId, 'bailian')

        const digest = createHash('sha1')
          .update(`${ctx.userId}:${voicePrompt}:${previewText}:${preferredName}:${language}`)
          .digest('hex')
          .slice(0, 16)

        const payload = {
          voicePrompt,
          previewText,
          preferredName,
          language,
          displayMode: 'detail' as const,
        }

        return await submitOperationTask({
          request: ctx.request,
          userId: ctx.userId,
          projectId: 'global-asset-hub',
          type: TASK_TYPE.ASSET_HUB_VOICE_DESIGN,
          targetType: 'GlobalAssetHubVoiceDesign',
          targetId: ctx.userId,
          operationId: 'asset_hub_voice_design',
          source: ctx.source,
          confirmed: body.confirmed === true,
          payload,
          dedupeKey: `${TASK_TYPE.ASSET_HUB_VOICE_DESIGN}:${digest}`,
        })
      },
    },
  }
}
