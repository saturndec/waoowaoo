---
name: refine-storyboard-detail
description: Merge phase-1 storyboard panels with cinematography and acting guidance into the final detailed storyboard set.
---

# Refine Storyboard Detail

## Purpose

Assemble the final detailed storyboard representation by merging the base panel plan with phase-2 cinematography and acting refinements.

## Use This Skill When

- `storyboard.phase1`, `storyboard.phase2.cinematography`, and `storyboard.phase2.acting` all exist.
- The plan is ready to produce the final detailed storyboard output.
- Downstream panel set rendering and voice generation need the resolved final board.

## Do Not Use This Skill When

- Any upstream storyboard phase artifact is missing or stale.
- The caller only needs phase-2 refinements without assembling the final board.
- Final panel output already exists and the upstream phases have not changed.

## Inputs

- `storyboard.phase1`
- `storyboard.phase2.cinematography`
- `storyboard.phase2.acting`
- Skill-owned prompt files selected by locale

## Outputs

- Detailed storyboard payload for downstream rendering.
- Persistable payloads for `storyboard.phase3.detail` and `storyboard.panel_set`.
- UI summary of merged clips, panels, and final detail completeness.

## Artifact Contract

- Reads: `storyboard.phase1`, `storyboard.phase2.cinematography`, `storyboard.phase2.acting`
- Writes: `storyboard.phase3.detail`, `storyboard.panel_set`
- May invalidate downstream voice and media-generation artifacts.

## Execution Rules

- Preserve clip and panel identifiers across the merge.
- Require exact alignment between phase-1, acting, and cinematography outputs.
- Produce the final detailed board and final panel set together.
- Fail explicitly on any structural mismatch.

## Failure Conditions

- Any required upstream artifact is missing or invalid.
- Panel counts or identifiers differ across the three inputs.
- Model output fails schema validation.
- The merged board cannot produce a consistent final panel set.

## Quality Bar

- Final panel detail must be complete enough for downstream rendering.
- The merge must preserve the intent of both acting and cinematography passes.
- No implicit fallback or panel dropping is allowed.
