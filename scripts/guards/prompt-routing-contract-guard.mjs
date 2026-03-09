#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import process from 'process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)

const CONTRACT_FILES = [
  'src/lib/prompt-i18n/types.ts',
  'src/lib/ai-runtime/types.ts',
  'src/lib/llm/types.ts',
  'src/lib/prompt-i18n/policy.ts',
]

const REQUIRED_TELEMETRY_FIELDS = [
  'prompt_language',
  'output_language',
  'contract_language',
  'contract_valid',
]

const EN_FIRST_PROMPT_IDS = [
  'np_episode_split',
  'np_screenplay_conversion',
  'np_agent_clip',
  'np_voice_analysis',
]

const ALLOWLIST_PATH = 'standards/guardrails/prompt-routing-contract-allowlist.json'
const CJK_LITERAL_PATTERN = /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u
const STRING_LITERAL_PATTERN = /(['"`])(?:\\.|(?!\1)[^\\])*\1/g

function toRel(rootDir, fullPath) {
  return path.relative(rootDir, fullPath).split(path.sep).join('/')
}

function toLineNumber(content, index) {
  return content.slice(0, index).split('\n').length
}

function fail(title, details = []) {
  console.error(`\n[prompt-routing-contract-guard] ${title}`)
  for (const line of details) {
    console.error(`  - ${line}`)
  }
  process.exit(1)
}

function readUtf8(rootDir, relPath) {
  const fullPath = path.join(rootDir, relPath)
  if (!fs.existsSync(fullPath)) {
    throw new Error(`required file missing: ${relPath}`)
  }
  return fs.readFileSync(fullPath, 'utf8')
}

export function detectCjkStringLiterals(content) {
  const hits = []
  for (const match of content.matchAll(STRING_LITERAL_PATTERN)) {
    const literal = match[0] || ''
    const raw = literal.slice(1, -1)
    if (!raw) continue
    if (!CJK_LITERAL_PATTERN.test(raw)) continue
    hits.push({
      index: match.index ?? 0,
      literal,
    })
  }
  return hits
}

export function validateAllowlist(allowlistJson, now = new Date()) {
  const violations = []
  if (!allowlistJson || typeof allowlistJson !== 'object' || Array.isArray(allowlistJson)) {
    return ['allowlist must be a JSON object']
  }

  const entries = Array.isArray(allowlistJson.entries) ? allowlistJson.entries : null
  if (!entries) {
    return ['allowlist.entries must be an array']
  }

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      violations.push(`allowlist.entries[${i}] must be an object`)
      continue
    }

    const file = typeof entry.file === 'string' ? entry.file.trim() : ''
    const owner = typeof entry.owner === 'string' ? entry.owner.trim() : ''
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : ''
    const expiresAt = typeof entry.expiresAt === 'string' ? entry.expiresAt.trim() : ''

    if (!file) violations.push(`allowlist.entries[${i}] missing file`)
    if (!owner) violations.push(`allowlist.entries[${i}] missing owner`)
    if (!reason) violations.push(`allowlist.entries[${i}] missing reason`)
    if (!expiresAt) {
      violations.push(`allowlist.entries[${i}] missing expiresAt`)
      continue
    }

    const expiresDate = new Date(expiresAt)
    if (Number.isNaN(expiresDate.getTime())) {
      violations.push(`allowlist.entries[${i}] invalid expiresAt: ${expiresAt}`)
      continue
    }
    if (expiresDate.getTime() <= now.getTime()) {
      violations.push(`allowlist.entries[${i}] expired: ${expiresAt}`)
    }
  }

  return violations
}

function isAllowlisted(allowlistEntries, input) {
  return allowlistEntries.some((entry) => {
    if (!entry || typeof entry !== 'object') return false
    if (entry.file !== input.file) return false

    if (typeof entry.line === 'number' && entry.line !== input.line) return false
    if (typeof entry.literal === 'string' && entry.literal !== input.literal) return false

    return true
  })
}

function checkTelemetryContract(rootDir, relPath, content) {
  const violations = []

  for (const key of REQUIRED_TELEMETRY_FIELDS) {
    if (!new RegExp(`\\b${key}\\b`).test(content)) {
      violations.push(`${relPath} missing telemetry field: ${key}`)
    }
  }

  if (relPath === 'src/lib/prompt-i18n/types.ts') {
    if (!/export\s+type\s+PromptTemplateLocale\s*=\s*'zh'\s*\|\s*'en'/.test(content)) {
      violations.push(`${relPath} PromptTemplateLocale must be 'zh' | 'en'`)
    }
    if (!/prompt_language\s*:\s*PromptTemplateLocale/.test(content)) {
      violations.push(`${relPath} prompt_language must use PromptTemplateLocale`)
    }
    if (!/output_language\s*:\s*PromptLocale/.test(content)) {
      violations.push(`${relPath} output_language must use PromptLocale`)
    }
    if (!/contract_language\s*:\s*'en'/.test(content)) {
      violations.push(`${relPath} contract_language must be 'en' literal`)
    }
    if (!/contract_valid\s*:\s*boolean/.test(content)) {
      violations.push(`${relPath} contract_valid must be boolean`)
    }
  }

  if (relPath === 'src/lib/ai-runtime/types.ts' || relPath === 'src/lib/llm/types.ts') {
    if (!/prompt_language\s*:\s*'zh'\s*\|\s*'en'/.test(content)) {
      violations.push(`${relPath} prompt_language union must be 'zh' | 'en'`)
    }

    if (!/output_language\s*:\s*'zh'\s*\|\s*'en'\s*\|\s*'vi'\s*\|\s*'ko'/.test(content)) {
      violations.push(`${relPath} output_language union must include zh/en/vi/ko`)
    }

    if (!/contract_language\s*:\s*'en'/.test(content)) {
      violations.push(`${relPath} contract_language must be 'en' literal`)
    }

    if (!/contract_valid\s*:\s*boolean/.test(content)) {
      violations.push(`${relPath} contract_valid must be boolean`)
    }
  }

  return violations
}

export function runPromptRoutingContractGuard(input = {}) {
  const rootDir = input.rootDir || process.cwd()
  const now = input.now instanceof Date ? input.now : new Date()

  const violations = []
  let allowlist = { entries: [] }

  try {
    const allowlistText = readUtf8(rootDir, ALLOWLIST_PATH)
    allowlist = JSON.parse(allowlistText)
  } catch (error) {
    violations.push(`cannot read allowlist ${ALLOWLIST_PATH}: ${error instanceof Error ? error.message : String(error)}`)
    return {
      violations,
      scannedFiles: 0,
      contractChecks: 0,
    }
  }

  const allowlistViolations = validateAllowlist(allowlist, now)
  violations.push(...allowlistViolations)

  const allowEntries = Array.isArray(allowlist.entries) ? allowlist.entries : []

  for (const relPath of CONTRACT_FILES) {
    let content = ''
    try {
      content = readUtf8(rootDir, relPath)
    } catch (error) {
      violations.push(error instanceof Error ? error.message : String(error))
      continue
    }

    const cjkLiterals = detectCjkStringLiterals(content)
    for (const hit of cjkLiterals) {
      const line = toLineNumber(content, hit.index)
      const candidate = {
        file: relPath,
        line,
        literal: hit.literal,
      }
      if (!isAllowlisted(allowEntries, candidate)) {
        violations.push(`${relPath}:${line} non-English contract literal detected: ${hit.literal}`)
      }
    }

    violations.push(...checkTelemetryContract(rootDir, relPath, content))
  }

  try {
    const policyText = readUtf8(rootDir, 'src/lib/prompt-i18n/policy.ts')
    for (const promptId of EN_FIRST_PROMPT_IDS) {
      if (!policyText.includes(`'${promptId}'`)) {
        violations.push(`src/lib/prompt-i18n/policy.ts missing EN-first prompt id: ${promptId}`)
      }
    }
  } catch (error) {
    violations.push(error instanceof Error ? error.message : String(error))
  }

  return {
    violations,
    scannedFiles: CONTRACT_FILES.length,
    contractChecks: REQUIRED_TELEMETRY_FIELDS.length + EN_FIRST_PROMPT_IDS.length,
  }
}

export function main() {
  const result = runPromptRoutingContractGuard({ rootDir: process.cwd() })
  if (result.violations.length > 0) {
    fail('contract guard failed', result.violations)
  }
  console.log(`[prompt-routing-contract-guard] OK files=${result.scannedFiles} checks=${result.contractChecks}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main()
}
