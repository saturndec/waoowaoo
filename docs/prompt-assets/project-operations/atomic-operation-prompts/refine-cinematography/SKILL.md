---
name: refine-cinematography
description: Add cinematography guidance to the phase-1 storyboard panel plan.
---

# Refine Cinematography

## Purpose

Enrich phase-1 storyboard panels with camera language, framing, lens, movement, and visual grammar needed for final storyboard detail assembly.

## Use This Skill When

- `storyboard.phase1` already exists.
- The storyboard plan needs a cinematography pass before final detail assembly.
- Panel structure is correct, but shot language needs to be specified.

## Do Not Use This Skill When

- Phase-1 panels are missing.
- The caller needs acting directions instead of shot design.
- Final detail assembly is already invalid and phase-1 should be regenerated first.

## Inputs

- `storyboard.phase1`
- Skill-owned prompt files selected by locale
- Clip and panel context from the current storyboard run

## Outputs

- Cinematography annotations aligned to phase-1 panels.
- Persistable payload for the `storyboard.phase2.cinematography` artifact.
- UI summary describing clips, panels, and notable camera refinements.

## Artifact Contract

- Reads: `storyboard.phase1`
- Writes: `storyboard.phase2.cinematography`
- May invalidate downstream final detail and voice artifacts.

## Execution Rules

- Preserve the existing panel structure and identifiers.
- Only add cinematography guidance; do not rewrite phase-1 semantics wholesale.
- Keep output aligned one-to-one with the phase-1 panel set.
- Fail explicitly on schema or alignment mismatches.

## Failure Conditions

- `storyboard.phase1` is missing or invalid.
- Output panel count or panel identifiers do not match phase-1.
- Model output fails schema validation.
- The pass produces empty or unusable shot guidance.

## Quality Bar

- Guidance should be specific enough for final detail assembly.
- Shot choices must remain grounded in screenplay intent and panel structure.
- The skill must not silently discard mismatched panels.
