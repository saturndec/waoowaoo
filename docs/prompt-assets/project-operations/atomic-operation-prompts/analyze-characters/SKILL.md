---
name: analyze-characters
description: Extract normalized character analysis from story text before clip splitting and screenplay generation.
---

# Analyze Characters

## Purpose

Produce the canonical character analysis artifact for a story or episode. This skill is the first character-focused pass in the dynamic writing plan and should finish before any downstream skill depends on structured cast information.

## Use This Skill When

- Raw story text exists and character analysis has not been generated yet.
- Story text changed and downstream screenplay-related artifacts must be regenerated from fresh character data.
- A plan needs stable character names, aliases, and introductions before clip splitting.

## Do Not Use This Skill When

- The caller wants screenplay scenes or clip boundaries directly.
- The source text is empty or incomplete.
- Only locations or props need to be refreshed without touching character analysis.

## Inputs

- Raw story text.
- Existing base character names from project state.
- Existing character introductions when available.
- Skill-owned prompt files selected by locale.

## Outputs

- Normalized character analysis rows.
- Persistable character analysis object for the `analysis.characters` artifact.
- UI summary describing how many characters were identified or updated.

## Artifact Contract

- Reads: `story.raw`
- Writes: `analysis.characters`
- May invalidate downstream artifacts that depend on character analysis.

## Execution Rules

- Preserve canonical character names when they already exist in project state.
- Normalize aliases and introductions into a stable structured format.
- Return analysis only; never generate screenplay or clip content here.
- Treat the model output as untrusted until it passes schema validation.

## Failure Conditions

- Source text is empty.
- Model output is invalid JSON or fails schema validation.
- The result contains no usable character rows.
- Canonicalization fails and would produce ambiguous duplicate characters.

## Quality Bar

- Every returned character must be grounded in the source text.
- Character names should be stable enough for downstream clip and screenplay generation.
- Introductions should be concise and directly reusable by downstream prompts.
- The skill must fail explicitly instead of silently returning partial garbage.
