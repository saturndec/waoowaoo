---
name: split-clips
description: Split story text into ordered clip units after character, location, and prop analysis are ready.
---

# Split Clips

## Purpose

Convert raw story text plus upstream analysis artifacts into an ordered set of clip boundaries that can be fed directly into screenplay generation.

## Use This Skill When

- Character, location, and prop analysis artifacts are already available.
- The plan needs deterministic clip units before screenplay generation.
- Story text changed and previous clip boundaries are now stale.

## Do Not Use This Skill When

- Upstream analysis artifacts are missing.
- The caller wants screenplay output directly.
- The story is too incomplete to support stable clip segmentation.

## Inputs

- Raw story text.
- `analysis.characters`
- `analysis.locations`
- `analysis.props`
- Skill-owned prompt files selected by locale.

## Outputs

- Ordered clip boundaries and clip metadata.
- Persistable clip split payload for the `clip.split` artifact.
- UI summary of total clips and any warnings about boundary ambiguity.

## Artifact Contract

- Reads: `story.raw`, `analysis.characters`, `analysis.locations`, `analysis.props`
- Writes: `clip.split`
- May invalidate downstream screenplay and storyboard artifacts.

## Execution Rules

- Must run after character, location, and prop analysis.
- Preserve source order; clip indices must be stable and monotonic.
- Every generated clip must map back to real source text.
- Do not silently repair unresolved boundary mismatches.

## Failure Conditions

- Any required upstream analysis artifact is missing.
- Model output is invalid JSON or fails schema validation.
- Clip boundaries cannot be matched back to the source text.
- The result contains zero clips or overlapping/unsorted clips.

## Quality Bar

- Clip boundaries must be stable enough for reruns and downstream screenplay generation.
- Each clip should represent a coherent beat or scene unit.
- The skill must fail fast on invalid segmentation instead of returning fuzzy output.
