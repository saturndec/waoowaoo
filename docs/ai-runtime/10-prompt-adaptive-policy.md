# 10 Prompt Adaptive Policy (VAT-41..VAT-46)

## Policy summary

This document defines the P0 prompt policy under VAT-28:

- **English-contract-first** at contract layer (schema/enum/error keys stable in English).
- **Adaptive prompt language** for natural-language content by model/provider/task/profile.
- **No force English-all** and no blind default `zh` fallback on backend-facing contract-heavy paths.

## Audit scope (VAT-42)

High-impact P0 paths audited and normalized:

1. `src/lib/workers/handlers/episode-split.ts`
2. `src/lib/workers/handlers/clips-build.ts`
3. `src/lib/workers/handlers/screenplay-convert.ts`
4. `src/lib/workers/handlers/voice-analyze.ts`

Classification:

- **Contract-heavy outputs (EN contract must remain stable):**
  - episode_split (JSON episodes schema)
  - split_clips (boundary JSON list)
  - screenplay_conversion (structured screenplay JSON)
  - voice_analyze (voice line JSON with panel mapping)
- **Natural-language content:** adaptive by output locale / provider capability.

## Routing rules (VAT-43)

Implemented in `src/lib/prompt-i18n/policy.ts`:

- Non-zh output locale (`en/vi/ko`) => EN template.
- zh + zh-capable provider hint (`qwen/ark/doubao/...`) and non-contract-heavy prompt => zh template.
- Contract-heavy prompt IDs (`np_episode_split`, `np_screenplay_conversion`, `np_agent_clip`, `np_voice_analysis`) => EN template with zh output allowed.
- Profile override:
  - `en-first` => EN template
  - `zh-preferred` => zh template

## Fallback behavior (VAT-44)

Fallback is now **adaptive and explicit**, not implicit `zh` defaulting:

- `fallback_applied=true` with `fallback_reason` when route degrades to EN template for contract stability or provider locale risk.
- `contract_valid=true` remains required in telemetry.
- Guardrail block appended by prompt builder:
  - keep contract keys/enums/schema in English
  - allow narrative content in routed output language

## Telemetry contract (VAT-45)

Telemetry attached from prompt builder and forwarded into AI runtime/LLM log input:

- `prompt_language`
- `output_language`
- `contract_language` (`en`)
- `contract_valid`
- `fallback_applied`
- `fallback_reason` (optional)
- `route_reason`

## Tests and fixtures (VAT-45)

- `tests/unit/prompt-i18n/policy-routing.test.ts`
  - route decisions by locale/provider/prompt type
  - fallback behavior and contract telemetry
  - EN template usage for non-zh locales
- Worker unit tests updated for policy builder integration:
  - `tests/unit/worker/episode-split.test.ts`
  - `tests/unit/worker/clips-build.test.ts`
  - `tests/unit/worker/screenplay-convert.test.ts`
  - `tests/unit/worker/voice-analyze.test.ts`

## Migration note for fullstack team (VAT-46)

### What changed

- Use `buildPromptWithPolicy(...)` for contract-heavy worker paths.
- Keep legacy `buildPrompt(...)` for simple locale template rendering only.
- `getPromptTemplate(...)` now normalizes non-zh locale to EN template.

### Rollout checklist

1. Migrate contract-heavy prompt callsites to `buildPromptWithPolicy`.
2. Pass `promptTelemetry` into `executeAiTextStep`.
3. Ensure output parser still validates EN contract keys.
4. Verify logs include `promptPolicy` metadata.

### Rollback checklist

If quality regression appears:

1. Temporarily set profile `zh-preferred` in policy context for affected path.
2. Keep EN contract guardrail enabled (do not remove contract policy block).
3. Re-run policy routing tests + worker unit tests.
4. Roll forward after provider/profile tuning.
