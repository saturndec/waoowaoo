import type { Locale } from '@/i18n/routing'
import type { PromptId } from './prompt-ids'

export type PromptLocale = Locale
export type PromptTemplateLocale = 'zh' | 'en'

export type PromptVariables = Record<string, string>

export type PromptCatalogEntry = {
  pathStem: string
  variableKeys: readonly string[]
}

export type PromptPolicyContext = {
  modelKey?: string | null
  provider?: string | null
  action?: string | null
  taskType?: string | null
  profile?: 'balanced' | 'en-first' | 'zh-preferred'
}

export type PromptRoutingTelemetry = {
  prompt_language: PromptTemplateLocale
  output_language: PromptLocale
  contract_language: 'en'
  contract_valid: boolean
  fallback_applied: boolean
  fallback_reason?: string
  route_reason: string
}

export type BuildPromptInput = {
  promptId: PromptId
  locale: PromptLocale
  variables?: PromptVariables
}

export type BuildPromptWithPolicyInput = BuildPromptInput & {
  policyContext?: PromptPolicyContext
  requireEnglishContract?: boolean
}

export type BuildPromptWithPolicyResult = {
  prompt: string
  telemetry: PromptRoutingTelemetry
}
