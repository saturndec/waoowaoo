---
name: refine-acting
description: Add acting direction to the phase-1 storyboard panel plan.
---

# Refine Acting

## Purpose

Enrich phase-1 storyboard panels with performance direction, pose, expression, and character intention needed for final storyboard detail assembly.

## Use This Skill When

- `storyboard.phase1` already exists.
- The storyboard plan needs acting guidance before final detail assembly.
- Panel structure is stable and now needs character performance detail.

## Do Not Use This Skill When

- Phase-1 panels are missing.
- The caller needs camera language instead of acting direction.
- The storyboard requires a fresh phase-1 planning pass first.

## Inputs

- `storyboard.phase1`
- Skill-owned prompt files selected by locale
- Clip and panel context from the current storyboard run

## Outputs

- Acting annotations aligned to phase-1 panels.
- Persistable payload for the `storyboard.phase2.acting` artifact.
- UI summary describing clips, panels, and notable acting refinements.

## Artifact Contract

- Reads: `storyboard.phase1`
- Writes: `storyboard.phase2.acting`
- May invalidate downstream final detail and voice artifacts.

## Execution Rules

- Preserve the panel structure and identifiers from phase-1.
- Add acting guidance only; do not rewrite clip or panel identity.
- Keep output aligned one-to-one with the phase-1 panel set.
- Fail explicitly when alignment or schema validation fails.

## Failure Conditions

- `storyboard.phase1` is missing or invalid.
- Output panel count or identifiers no longer match phase-1.
- Model output fails schema validation.
- The acting pass returns empty or unusable direction.

## Quality Bar

- Guidance should make performer intention and visible action unambiguous.
- Details must remain grounded in screenplay and character context.
- The skill must not fabricate unsupported character beats.
