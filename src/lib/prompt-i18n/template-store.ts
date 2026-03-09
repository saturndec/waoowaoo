import fs from 'fs'
import path from 'path'
import { PROMPT_CATALOG } from './catalog'
import type { PromptId } from './prompt-ids'
import type { PromptLocale, PromptTemplateLocale } from './types'
import { PromptI18nError } from './errors'

const templateCache = new Map<string, string>()

function normalizeTemplateLocale(locale: PromptLocale | PromptTemplateLocale): PromptTemplateLocale {
  return locale === 'zh' ? 'zh' : 'en'
}

function buildCacheKey(promptId: PromptId, locale: PromptTemplateLocale) {
  return `${promptId}:${locale}`
}

export function getPromptTemplate(promptId: PromptId, locale: PromptLocale | PromptTemplateLocale): string {
  const entry = PROMPT_CATALOG[promptId]
  if (!entry) {
    throw new PromptI18nError(
      'PROMPT_ID_UNREGISTERED',
      promptId,
      `Prompt is not registered: ${promptId}`,
    )
  }

  const templateLocale = normalizeTemplateLocale(locale)
  const cacheKey = buildCacheKey(promptId, templateLocale)
  const cached = templateCache.get(cacheKey)
  if (cached) return cached

  const filePath = path.join(process.cwd(), 'lib', 'prompts', `${entry.pathStem}.${templateLocale}.txt`)
  let template = ''
  try {
    template = fs.readFileSync(filePath, 'utf-8')
  } catch {
    throw new PromptI18nError(
      'PROMPT_TEMPLATE_NOT_FOUND',
      promptId,
      `Prompt template not found: ${filePath}`,
      { filePath, locale: templateLocale },
    )
  }

  templateCache.set(cacheKey, template)
  return template
}
