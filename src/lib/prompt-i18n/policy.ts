import type { PromptId } from './prompt-ids'
import type {
  PromptLocale,
  PromptPolicyContext,
  PromptRoutingTelemetry,
  PromptTemplateLocale,
} from './types'

const EN_FIRST_PROMPT_IDS = new Set<PromptId>([
  'np_episode_split',
  'np_screenplay_conversion',
  'np_agent_clip',
  'np_voice_analysis',
])

const NON_CHINESE_PROVIDER_HINTS = ['openai', 'openrouter', 'anthropic', 'deepseek', 'xai', 'grok']
const CHINESE_PROVIDER_HINTS = ['qwen', 'doubao', 'ark', 'baidu']

type PromptLanguageRoute = {
  templateLocale: PromptTemplateLocale
  outputLocale: PromptLocale
  routeReason: string
  fallbackApplied: boolean
  fallbackReason?: string
}

function normalize(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function includesAny(text: string, hints: readonly string[]): boolean {
  return hints.some((hint) => text.includes(hint))
}

function mapOutputLocale(locale: PromptLocale): PromptLocale {
  if (locale === 'zh') return 'zh'
  if (locale === 'ko') return 'ko'
  if (locale === 'vi') return 'vi'
  return 'en'
}

export function resolvePromptLanguageRoute(input: {
  promptId: PromptId
  locale: PromptLocale
  context?: PromptPolicyContext
}): PromptLanguageRoute {
  const { promptId, locale, context } = input
  const preferredOutput = mapOutputLocale(locale)
  const provider = normalize(context?.provider)
  const modelKey = normalize(context?.modelKey)
  const action = normalize(context?.action)
  const taskType = normalize(context?.taskType)

  if (context?.profile === 'en-first') {
    return {
      templateLocale: 'en',
      outputLocale: preferredOutput,
      routeReason: 'profile:en-first',
      fallbackApplied: false,
    }
  }

  if (context?.profile === 'zh-preferred') {
    return {
      templateLocale: 'zh',
      outputLocale: 'zh',
      routeReason: 'profile:zh-preferred',
      fallbackApplied: false,
    }
  }

  const candidateText = `${provider}|${modelKey}|${action}|${taskType}`
  const enFirstByPrompt = EN_FIRST_PROMPT_IDS.has(promptId)

  if (preferredOutput !== 'zh') {
    return {
      templateLocale: 'en',
      outputLocale: preferredOutput,
      routeReason: 'locale:non-zh',
      fallbackApplied: false,
    }
  }

  if (includesAny(candidateText, CHINESE_PROVIDER_HINTS) && !enFirstByPrompt) {
    return {
      templateLocale: 'zh',
      outputLocale: 'zh',
      routeReason: 'provider:zh-capable',
      fallbackApplied: false,
    }
  }

  if (enFirstByPrompt || includesAny(candidateText, NON_CHINESE_PROVIDER_HINTS)) {
    return {
      templateLocale: 'en',
      outputLocale: 'zh',
      routeReason: enFirstByPrompt ? 'prompt:contract-heavy' : 'provider:non-zh-hint',
      fallbackApplied: true,
      fallbackReason: enFirstByPrompt ? 'contract_stability' : 'provider_locale_risk',
    }
  }

  return {
    templateLocale: 'zh',
    outputLocale: 'zh',
    routeReason: 'default:balanced-zh',
    fallbackApplied: false,
  }
}

export function buildPromptRoutingTelemetry(input: {
  route: PromptLanguageRoute
  contractValid: boolean
}): PromptRoutingTelemetry {
  const { route, contractValid } = input
  return {
    prompt_language: route.templateLocale,
    output_language: route.outputLocale,
    contract_language: 'en',
    contract_valid: contractValid,
    fallback_applied: route.fallbackApplied,
    ...(route.fallbackReason ? { fallback_reason: route.fallbackReason } : {}),
    route_reason: route.routeReason,
  }
}
