---
name: generate-voice-lines
description: Generate voice lines aligned with the final storyboard panel set.
---

# Generate Voice Lines

## Purpose

Generate structured voice-over or spoken line output aligned with the final storyboard panel set. This is the final skill in the dynamic storyboard plan.

## Use This Skill When

- `storyboard.panel_set` exists and is current.
- The storyboard plan needs voice output aligned to final panels.
- Storyboard detail changed and prior voice lines are no longer trustworthy.

## Do Not Use This Skill When

- Final storyboard panels are missing.
- The caller only needs storyboard structure without voice output.
- Upstream panel alignment is unresolved.

## Inputs

- `storyboard.panel_set`
- Story text for narrative grounding
- Voice generation context derived from final storyboard output

## Outputs

- Structured voice line payload.
- Persistable payload for the `voice.lines` artifact.
- UI summary describing line count and clip coverage.

## Artifact Contract

- Reads: `storyboard.panel_set`
- Writes: `voice.lines`
- Does not replace upstream storyboard artifacts, but depends on them being valid.

## Execution Rules

- Must run after `refine-storyboard-detail`.
- Preserve clip and panel alignment from the final panel set.
- Do not invent voice lines disconnected from the storyboard structure.
- Fail explicitly if alignment or schema validation breaks.

## Failure Conditions

- `storyboard.panel_set` is missing or invalid.
- Voice lines cannot be aligned to final panels.
- Model output fails schema validation.
- The result leaves clips without required voice coverage.

## Quality Bar

- Voice lines must stay grounded in the final board and source story.
- Output should be structured, concise, and ready for downstream preview or generation.
- The skill must fail rather than emit ambiguous orphan lines.
