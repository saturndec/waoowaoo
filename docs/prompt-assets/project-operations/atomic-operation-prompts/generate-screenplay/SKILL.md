---
name: generate-screenplay
description: Generate structured screenplay scenes for each clip after clip splitting is complete.
---

# Generate Screenplay

## Purpose

Transform ordered clip units into validated screenplay output clip by clip. This skill is the final step of the dynamic writing plan and produces the structured screenplay artifact consumed by storyboard generation.

## Use This Skill When

- `clip.split` exists and is current.
- The plan needs screenplay scenes suitable for storyboard planning.
- Story text or upstream analyses changed and screenplay must be regenerated cleanly.

## Do Not Use This Skill When

- Clip splitting has not completed successfully.
- The caller needs clip segmentation rather than screenplay content.
- Downstream storyboard regeneration is the only intended change and screenplay is already valid.

## Inputs

- `clip.split`
- Upstream analysis context derived from characters, locations, and props
- Skill-owned prompt files selected by locale

## Outputs

- Structured screenplay scenes for each clip.
- Persistable screenplay payload for the `clip.screenplay` artifact.
- UI summary describing total clips, successes, failures, and scene count.

## Artifact Contract

- Reads: `clip.split`
- Writes: `clip.screenplay`
- May invalidate downstream storyboard and voice artifacts.

## Execution Rules

- Must run after `split-clips`.
- Process clips in clip order and preserve stable identifiers.
- Report clip-level failures explicitly.
- Never silently skip failed clips or backfill fake screenplay content.

## Failure Conditions

- `clip.split` is missing or invalid.
- A clip cannot be turned into schema-valid screenplay JSON.
- The aggregate result leaves unresolved failed clips.
- Output scenes do not preserve clip order or required identifiers.

## Quality Bar

- Every screenplay unit must remain grounded in the original clip content.
- Output must be valid structured data, not freeform prose.
- Failures must be visible so the plan stops before invalid storyboard generation begins.
