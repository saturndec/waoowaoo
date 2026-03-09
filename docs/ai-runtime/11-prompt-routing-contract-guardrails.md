# 11 Prompt Routing Contract Guardrails & Telemetry (VAT-53..58)

## Scope

This document defines the **P2** guardrails and observability layer for:

- Adaptive prompt language routing
- English-contract-first stability for contract layer
- CI/runtime assertions preventing regressions

This extends P0 (`10-prompt-adaptive-policy.md`) without changing its routing policy baseline.

## Contract baseline

The telemetry contract for prompt routing is mandatory and stable:

- `prompt_language`
- `output_language`
- `contract_language`
- `contract_valid`

The following fields are optional-but-recommended for diagnostics:

- `fallback_applied`
- `fallback_reason`
- `route_reason`

## Fallback matrix (runtime)

Current adaptive policy must remain explicit:

1. Non-zh locale (`en/vi/ko`) => EN prompt template + output locale follows request.
2. zh locale + zh-capable provider + non-contract-heavy prompt => zh template.
3. Contract-heavy prompt IDs => EN template with zh output allowed.
4. Profile overrides:
   - `en-first` => EN template
   - `zh-preferred` => zh template

Contract-heavy prompt IDs:

- `np_episode_split`
- `np_screenplay_conversion`
- `np_agent_clip`
- `np_voice_analysis`

## Guardrails (CI/local)

### Script

- `scripts/guards/prompt-routing-contract-guard.mjs`

### Checks

1. Required files are present and scanned:
   - `src/lib/prompt-i18n/types.ts`
   - `src/lib/ai-runtime/types.ts`
   - `src/lib/llm/types.ts`
   - `src/lib/prompt-i18n/policy.ts`
2. Required telemetry fields exist in contract/types/policy.
3. Telemetry union constraints remain stable:
   - `prompt_language`: `'zh' | 'en'`
   - `output_language`: `'zh' | 'en' | 'vi' | 'ko'`
   - `contract_language`: `'en'`
   - `contract_valid`: `boolean`
4. EN-first prompt ID list remains present in policy.
5. Contract files reject CJK string literals unless allowlisted.

### Allowlist

- `standards/guardrails/prompt-routing-contract-allowlist.json`

Rules:

- Each entry requires `file`, `owner`, `reason`, `expiresAt`.
- Expired entries fail guardrail.
- Default should be empty entries array.

### NPM scripts

- `npm run check:prompt-routing-contract`
- `npm run check:prompt-guardrails`

`check:prompt-guardrails` aggregates:

- `check:prompt-i18n`
- `check:prompt-i18n-regression`
- `check:prompt-json-canary`
- `check:prompt-routing-contract`

And is included in:

- `npm run test:guards`

## Test evidence expectations

### Unit

- `tests/unit/guards/prompt-routing-contract-guard.test.ts`
  - literal scan behavior
  - allowlist validation behavior
  - current-repo guard pass

- `tests/unit/ai-runtime/prompt-telemetry-propagation.test.ts`
  - verifies telemetry propagation from `executeAiTextStep` to LLM call options

### Chain/e2e-style integration

- `tests/integration/chain/text.prompt-routing-contract.chain.test.ts`
  - multi-locale (`vi`) path
  - asserts telemetry fields in runtime call:
    - `prompt_language`
    - `output_language`
    - `contract_valid`
    - `contract_language`

## Non-goals

- No production deployment changes.
- No UI localization refactor.
- No forced single-language prompt policy (adaptive routing remains).
