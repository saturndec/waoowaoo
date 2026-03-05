# Codebase Architecture Review Report

## Overview

This report reviews the architecture and code quality of the **Novel Promotion Video Production Workspace** — a React/TypeScript application for creating promotional videos from novel content.

**Tech Stack:** React 18 + TypeScript + Vite + TailwindCSS + React Query + Zustand

---

## 1. Project Structure

```
src/
├── components/           # UI components
│   ├── audio/            # AudioMixerPanel (432 LOC)
│   ├── timeline/         # TimelineEditor (485 LOC)
│   ├── novel-promotion/  # Main workspace (118 components, ~1.1MB)
│   │   ├── config/       # Video ratio, art style selection
│   │   ├── script/       # Script editing & clip management
│   │   ├── storyboard/   # Storyboard canvas & panel editing (36+ components)
│   │   ├── video/        # Video production with timeline/audio tools
│   │   ├── voice/        # Voice line management & TTS
│   │   ├── assets/       # Character/location asset management
│   │   └── prompts/      # Prompt management
│   └── ui/               # Shared UI primitives
├── lib/                  # Business logic & hooks
│   ├── audio/            # useAudioMix hook (318 LOC)
│   ├── timeline/         # useTimeline hook (391 LOC)
│   └── i18n/             # Vietnamese translations
├── types/                # TypeScript type definitions
│   ├── audio.ts          # Audio system types (162 LOC)
│   ├── timeline.ts       # Timeline types (136 LOC)
│   └── project.ts        # Project/episode types (275 LOC)
└── services/             # API service layer
```

---

## 2. Architecture Quality

### Strengths

| Aspect | Rating | Detail |
|--------|--------|--------|
| **Type Safety** | 5/5 | Discriminated unions, strict prop interfaces, no `any` usage in core components |
| **State Management** | 5/5 | React Query for server state + useReducer for local state + Context for shared runtime |
| **Code Organization** | 5/5 | Clear folder structure, logical separation by feature |
| **Component Composition** | 4/5 | Good use of composition pattern, shared utilities |
| **Error Handling** | 4/5 | `resolveTaskErrorMessage()` pattern in parent contexts, staleTime tuning |
| **Responsive Design** | 3/5 | Desktop-optimized with some breakpoints, limited mobile coverage |
| **Accessibility** | 2/5 | Minimal — missing aria-labels, keyboard navigation, screen reader support |
| **Test Coverage** | 1/5 | No test files found in review |

### State Management Architecture

```
WorkspaceProvider (Context)
├── projectId, episodeId
├── refreshData() → React Query refetch
├── subscribeTaskEvents() → SSE listener
│
└── WorkspaceStageRuntimeProvider (Runtime Context)
    ├── Loading flags: assetsLoading, isSubmittingTTS, isTransitioning
    ├── Settings: videoRatio, artStyle, videoModel
    ├── Stage handlers: onRunStoryToScript, onGenerateVideo, etc.
    │
    ├── useAudioMix (useReducer)
    │   └── 8+ action types, AudioContext lifecycle, playback state
    │
    └── useTimeline (useReducer)
        └── 17+ action types, snap-to-grid, viewport math
```

---

## 3. Component Integration Status

All stage components are fully wired and functional:

| Stage | Route Component | Status |
|-------|----------------|--------|
| Config | `ConfigStage.tsx` → `NovelInputStage.tsx` | ✅ Complete |
| Script | `ScriptStage.tsx` → `ScriptView.tsx` | ✅ Complete |
| Storyboard | `StoryboardStage.tsx` → storyboard/* | ✅ Complete |
| Video | `VideoStageRoute.tsx` → `VideoStage.tsx` | ✅ Complete |
| Voice | `VoiceStageRoute.tsx` → `VoiceStage.tsx` | ✅ Complete |
| Assets | `AssetsStage.tsx` → Asset Library | ✅ Complete |
| Prompts | `PromptsStage.tsx` | ✅ Complete |

**New Components (AudioMixerPanel + TimelineEditor):** Fully integrated into `VideoProductionTools.tsx` with tab switching, collapsible UI, and proper hook connections.

---

## 4. i18n / Vietnamese Localization

- **Coverage:** ~95%+ of user-facing strings localized
- **Pattern:** `useTranslation()` hook with namespace keys
- **Files:** `vi.json` with structured key hierarchy
- **Minor gaps:** Some inline English strings in audio/timeline components and error messages

---

## 5. Issues Found

### Critical
- **No test coverage** — No unit or integration tests found
- **Audio/Timeline state not persisted** — Local useReducer state lost on page refresh

### Important
- **Accessibility gaps** — Icon buttons missing aria-labels, no keyboard navigation in timeline/audio mixer
- **No React Error Boundaries** at stage level — runtime errors could crash entire workspace
- **Some Vietnamese translation gaps** in newer components (audio mixer categories, timeline labels)

### Minor
- **Mobile responsiveness** limited — Timeline and Audio Mixer assume wider viewport
- **No optimistic UI updates** for save operations
- **Empty state handling** present but basic in new components

---

## 6. Recommendations

1. **Add Error Boundaries** — Wrap each stage in `<ErrorBoundary>` to isolate failures
2. **Persist audio/timeline state** — Save to backend or localStorage to survive refresh
3. **Accessibility pass** — Add aria-labels, keyboard shortcuts, focus management
4. **Add tests** — Start with hooks (useAudioMix, useTimeline) and critical workflows
5. **Complete i18n** — Audit remaining English strings in audio/timeline components
6. **Consider memoization** — Large timeline track lists may benefit from `React.memo` / `useMemo`

---

## 7. Key Files Reference

| Purpose | File |
|---------|------|
| Audio Mixer UI | `src/components/audio/AudioMixerPanel.tsx` |
| Timeline UI | `src/components/timeline/TimelineEditor.tsx` |
| Production Tools Container | `src/components/novel-promotion/video/VideoProductionTools.tsx` |
| Audio State Hook | `src/lib/audio/useAudioMix.ts` |
| Timeline State Hook | `src/lib/timeline/useTimeline.ts` |
| Audio Types | `src/types/audio.ts` |
| Timeline Types | `src/types/timeline.ts` |
| Workspace Provider | `src/components/novel-promotion/WorkspaceProvider.tsx` |
| Stage Runtime Context | `src/components/novel-promotion/WorkspaceStageRuntimeContext.tsx` |
| Vietnamese Translations | `src/lib/i18n/vi.json` |
