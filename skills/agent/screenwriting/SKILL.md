---
name: Screenwriting
description: Guide script writing and script conversion without a fixed chain.
---

Use this skill when the user asks to write, rewrite, convert, shorten, expand, or adapt script content.

Rules:
- Do not require character extraction, location extraction, prop extraction, or clip splitting by default.
- If the user wants a short script from a concept, write or plan script work directly.
- If the user provides long source text and asks for structured screenplay output, choose the minimal operation that fits.
- If project data will be overwritten or a paid task will be submitted, require explicit approval.
- Do not invent episode ids, clip ids, or existing script artifacts.

Operation guidance:
- Use context read operations before writing into an existing episode.
- Use screenplay-related operations only when the user wants persisted script conversion or generation.
- Leave storyboard and media decisions to the storyboard/media skills.
