---
name: plan-storyboard-phase1
description: Produce the first-pass storyboard panel plan for each screenplay clip.
---

# Plan Storyboard Phase 1

## Purpose

Generate the initial storyboard panel plan from screenplay clips. This skill creates the base panel structure that all later storyboard refinement skills depend on.

## Use This Skill When

- `clip.screenplay` exists and the storyboard pipeline is starting.
- Storyboard panel planning needs to be regenerated after screenplay changes.
- Downstream cinematography and acting passes need a fresh phase-1 panel set.

## Do Not Use This Skill When

- Screenplay artifacts are missing or stale.
- The plan only needs a later storyboard refinement rerun with a guaranteed compatible phase-1 artifact.
- The caller expects final detailed storyboard output immediately.

## Inputs

- `clip.screenplay`
- Prompt template for phase-1 storyboard planning
- Clip-local screenplay content and project analysis context

## Outputs

- First-pass storyboard panels for each clip.
- Persistable payload for the `storyboard.phase1` artifact.
- UI summary of total clips and total panels produced.

## Artifact Contract

- Reads: `clip.screenplay`
- Writes: `storyboard.phase1`
- May invalidate downstream storyboard phase-2, phase-3, panel set, and voice artifacts.

## Execution Rules

- Must run before any storyboard refinement skill.
- Generate at least one valid panel set for every screenplay clip.
- Preserve clip-to-panel mapping so later phases can align their outputs.
- Fail explicitly instead of synthesizing placeholder panels.

## Failure Conditions

- Screenplay artifact is missing or invalid.
- A clip returns zero valid panels.
- Model output fails schema validation.
- Generated panels cannot be traced back to the source clip.

## Quality Bar

- Phase-1 panels should be structurally complete enough for later enrichment.
- Output must preserve clip ordering and stable identifiers.
- Panels should be concise, not overloaded with later-phase detail.
