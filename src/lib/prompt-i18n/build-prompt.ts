import { PROMPT_CATALOG } from './catalog'
import { PromptI18nError } from './errors'
import { getPromptTemplate } from './template-store'
import { buildPromptRoutingTelemetry, resolvePromptLanguageRoute } from './policy'
import type {
  BuildPromptInput,
  BuildPromptWithPolicyInput,
  BuildPromptWithPolicyResult,
  PromptTemplateLocale,
} from './types'

const SINGLE_PLACEHOLDER_PATTERN = /\{([A-Za-z0-9_]+)\}/g
const DOUBLE_PLACEHOLDER_PATTERN = /\{\{([A-Za-z0-9_]+)\}\}/g

function extractPlaceholders(template: string): string[] {
  const keys = new Set<string>()

  for (const match of template.matchAll(SINGLE_PLACEHOLDER_PATTERN)) {
    const key = match[1]
    if (key) keys.add(key)
  }
  for (const match of template.matchAll(DOUBLE_PLACEHOLDER_PATTERN)) {
    const key = match[1]
    if (key) keys.add(key)
  }

  return Array.from(keys)
}

function escapeRegex(raw: string) {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replaceAllPlaceholders(template: string, key: string, value: string): string {
  const escaped = escapeRegex(key)
  const pattern = new RegExp(`\\{\\{${escaped}\\}\\}|\\{${escaped}\\}`, 'g')
  return template.replace(pattern, value)
}

function renderPromptTemplate(input: {
  promptId: BuildPromptInput['promptId']
  templateLocale: PromptTemplateLocale
  variables: Record<string, string>
}): string {
  const { promptId, templateLocale, variables } = input
  const entry = PROMPT_CATALOG[promptId]
  if (!entry) {
    throw new PromptI18nError(
      'PROMPT_ID_UNREGISTERED',
      promptId,
      `Prompt is not registered: ${promptId}`,
    )
  }

  const template = getPromptTemplate(promptId, templateLocale)

  const templatePlaceholders = extractPlaceholders(template)
  const defined = new Set(entry.variableKeys)

  for (const key of templatePlaceholders) {
    if (!defined.has(key)) {
      throw new PromptI18nError(
        'PROMPT_PLACEHOLDER_MISMATCH',
        promptId,
        `Template placeholder not declared in catalog: ${key}`,
        { key },
      )
    }
  }

  const providedKeys = Object.keys(variables)
  for (const key of providedKeys) {
    if (!defined.has(key)) {
      throw new PromptI18nError(
        'PROMPT_VARIABLE_UNEXPECTED',
        promptId,
        `Unexpected prompt variable: ${key}`,
        { key },
      )
    }
    if (typeof variables[key] !== 'string') {
      throw new PromptI18nError(
        'PROMPT_VARIABLE_VALUE_INVALID',
        promptId,
        `Prompt variable must be string: ${key}`,
        { key, type: typeof variables[key] },
      )
    }
  }

  for (const key of entry.variableKeys) {
    if (!(key in variables)) {
      throw new PromptI18nError(
        'PROMPT_VARIABLE_MISSING',
        promptId,
        `Missing prompt variable: ${key}`,
        { key },
      )
    }
  }

  let rendered = template
  for (const key of entry.variableKeys) {
    rendered = replaceAllPlaceholders(rendered, key, variables[key] || '')
  }

  return rendered
}

function appendLanguageGuardrails(input: {
  prompt: string
  outputLocale: BuildPromptInput['locale']
  requireEnglishContract: boolean
}): string {
  const { prompt, outputLocale, requireEnglishContract } = input
  const outputLanguageName = outputLocale === 'zh'
    ? 'Chinese'
    : outputLocale === 'vi'
      ? 'Vietnamese'
      : outputLocale === 'ko'
        ? 'Korean'
        : 'English'

  const lines = [
    '',
    '[Prompt Policy]',
    '- Keep system/output contract keys, enums, and schema in stable English.',
    `- Narrative and natural-language content should be in ${outputLanguageName}.`,
  ]

  if (requireEnglishContract) {
    lines.push('- contract_valid must remain true for downstream parser/schema checks.')
  }

  return `${prompt}${lines.join('\n')}`
}

export function buildPrompt(input: BuildPromptInput): string {
  const { promptId, locale, variables = {} } = input
  const templateLocale: PromptTemplateLocale = locale === 'zh' ? 'zh' : 'en'
  return renderPromptTemplate({
    promptId,
    templateLocale,
    variables,
  })
}

export function buildPromptWithPolicy(input: BuildPromptWithPolicyInput): BuildPromptWithPolicyResult {
  const {
    promptId,
    locale,
    variables = {},
    policyContext,
    requireEnglishContract = true,
  } = input

  const route = resolvePromptLanguageRoute({
    promptId,
    locale,
    context: policyContext,
  })

  const rendered = renderPromptTemplate({
    promptId,
    templateLocale: route.templateLocale,
    variables,
  })

  const prompt = appendLanguageGuardrails({
    prompt: rendered,
    outputLocale: route.outputLocale,
    requireEnglishContract,
  })

  const telemetry = buildPromptRoutingTelemetry({
    route,
    contractValid: true,
  })

  return {
    prompt,
    telemetry,
  }
}
