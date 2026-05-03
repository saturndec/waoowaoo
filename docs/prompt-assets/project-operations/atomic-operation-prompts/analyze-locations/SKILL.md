---
name: analyze-locations
description: Extract normalized location analysis from story text before clip splitting.
---

# Analyze Locations

## Purpose

Produce the canonical location analysis artifact that downstream clip splitting and screenplay generation rely on. This skill turns freeform setting mentions into stable structured location records.

## Use This Skill When

- Raw story text exists and structured locations are missing.
- Story text changed and existing location analysis is stale.
- Clip splitting needs normalized place names before partitioning the story.

## Do Not Use This Skill When

- The plan only needs character or prop refreshes.
- Screenplay generation is the primary goal and location analysis is already current.
- The caller expects this skill to infer clip boundaries.

## Inputs

- Raw story text.
- Existing base locations from project state.
- Skill-owned prompt files selected by locale.

## Outputs

- Normalized location analysis rows.
- Persistable location analysis object for the `analysis.locations` artifact.
- UI summary for newly identified, preserved, or merged locations.

## Artifact Contract

- Reads: `story.raw`
- Writes: `analysis.locations`
- May invalidate downstream artifacts that depend on location analysis.

## Execution Rules

- Preserve canonical project location names when a stable match already exists.
- Keep output strictly structured; do not emit screenplay prose.
- Merge equivalent location names when the evidence is clear.
- Reject malformed model output instead of patching it silently.

## Failure Conditions

- Source text is empty.
- Model output is invalid JSON or fails schema validation.
- No usable location records are produced.
- The output introduces unresolved duplicate locations that cannot be normalized safely.

## Quality Bar

- Each location must map back to real story evidence.
- The result should be concise, deduplicated, and stable for downstream reuse.
- Output must be deterministic enough that reruns do not churn names unnecessarily.
