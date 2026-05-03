---
name: analyze-props
description: Extract normalized prop analysis from story text before clip splitting and screenplay generation.
---

# Analyze Props

## Purpose

Produce the canonical prop inventory used by downstream clip splitting and screenplay generation. This skill converts prop mentions in raw story text into structured reusable records.

## Use This Skill When

- The story has props that influence actions, staging, or scene composition.
- Prop analysis is missing or stale after story text changes.
- Downstream prompts need a clean prop inventory instead of raw text scanning.

## Do Not Use This Skill When

- The plan only needs character or location regeneration.
- The source text is incomplete.
- The caller expects storyboard output directly.

## Inputs

- Raw story text.
- Existing base props from project state when available.
- Skill-owned prompt files selected by locale.

## Outputs

- Normalized prop analysis rows.
- Persistable prop analysis object for the `analysis.props` artifact.
- UI summary describing prop count and notable merges.

## Artifact Contract

- Reads: `story.raw`
- Writes: `analysis.props`
- May invalidate downstream artifacts that depend on prop analysis.

## Execution Rules

- Preserve canonical prop names when a reliable match exists.
- Return only structured prop analysis.
- Avoid inventing props not supported by the text.
- Fail explicitly if the model output cannot be validated.

## Failure Conditions

- Source text is empty.
- Model output is invalid JSON or fails schema validation.
- No usable prop rows are produced when props are expected.
- The skill cannot normalize conflicting duplicate prop names safely.

## Quality Bar

- Props should be concrete enough for clip and screenplay prompts.
- The output must stay grounded in the source text and avoid hallucinated objects.
- Names should be stable and deduplicated across reruns.
