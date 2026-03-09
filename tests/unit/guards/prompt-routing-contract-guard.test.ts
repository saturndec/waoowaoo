import { describe, expect, it } from 'vitest'
import {
  detectCjkStringLiterals,
  runPromptRoutingContractGuard,
  validateAllowlist,
} from '../../../scripts/guards/prompt-routing-contract-guard.mjs'

describe('prompt routing contract guard', () => {
  it('detects CJK literals in string literals only', () => {
    const hits = detectCjkStringLiterals([
      "const a = '中文提示';",
      "const b = 'english_only';",
      "const c = `한국어`;",
    ].join('\n'))

    expect(hits).toHaveLength(2)
    expect(hits[0]?.literal).toContain('中文提示')
    expect(hits[1]?.literal).toContain('한국어')
  })

  it('validates allowlist entries require owner/reason/expiresAt and unexpired date', () => {
    const now = new Date('2026-03-09T00:00:00.000Z')
    const violations = validateAllowlist({
      entries: [
        {
          file: 'src/lib/prompt-i18n/types.ts',
          owner: 'vat-fullstack',
          reason: 'temporary waiver',
          expiresAt: '2026-03-10T00:00:00.000Z',
        },
        {
          file: 'src/lib/ai-runtime/types.ts',
          owner: 'vat-fullstack',
          reason: 'expired waiver',
          expiresAt: '2026-03-01T00:00:00.000Z',
        },
      ],
    }, now)

    expect(violations).toContain('allowlist.entries[1] expired: 2026-03-01T00:00:00.000Z')
  })

  it('passes on current repository state', () => {
    const result = runPromptRoutingContractGuard({
      rootDir: process.cwd(),
      now: new Date('2026-03-09T00:00:00.000Z'),
    })

    expect(result.violations).toEqual([])
    expect(result.scannedFiles).toBeGreaterThanOrEqual(4)
  })
})
