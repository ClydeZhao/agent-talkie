---
phase: 05-cross-runtime-proof-human-oversight
plan: "05"
subsystem: cli
tags: [websocket, tui, oversight, sqlite, relay]

requires:
  - phase: 05-cross-runtime-proof-human-oversight
    provides: Static oversight commands, possibly-blocked helpers, openRelayDatabase
provides:
  - "`talkie watch` live split-pane supervision (participants + timeline)"
  - TalkieSessionClient human session joining space for live envelopes without changing relay OVER-03 semantics
affects: [human-oversight, relay-operators]

tech-stack:
  added: []
  patterns:
    - "ANSI full-screen redraw via \\x1b[2J\\x1b[H before each frame"
    - "DB poll on interval merged with WebSocket membership for attention heuristics"

key-files:
  created:
    - packages/cli/src/oversight/watch.ts
  modified:
    - packages/cli/src/cli.ts

key-decisions:
  - "Checkpoint: Live watch UX auto-approved under AUTO-CHAIN (workflow._auto_chain_active / auto_advance); human may re-verify manually with node packages/cli/dist/cli.js watch --slug <slug>."

patterns-established:
  - "Watch uses getCollaborationMetadataSnapshot for status updatedAt required by inferPossiblyBlockedSessionIds"

requirements-completed: [OVER-01, OVER-02, OVER-03, MHUM-01]

duration: "~5 min"
completed: "2026-04-14"
---

# Phase 05 Plan 05: Live watch oversight Summary

**`talkie watch` delivers a split-pane terminal supervisor: eight-row participant grid with attention labels (blocked vs possibly-blocked) and a scrolling timeline tail parsed from SQLite, driven by a human TalkieSessionClient on the local relay.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-14 (executor session)
- **Completed:** 2026-04-14
- **Tasks:** 2 (1 implementation + 1 checkpoint)
- **Files modified:** 2 source files

## Accomplishments

- Implemented `runWatch` with `ensureRelayRunning`, `TalkieSessionClient` registration as human, `joinSpace`, and interval redraw.
- Participant pane matches D-06: `PARTICIPANTS`, tab-separated columns `session`, `role`, `focus`, `progress`, `attention`, merged with `inferPossiblyBlockedSessionIds` over a 500-entry transcript tail.
- Timeline pane shows `TIMELINE` and up to 20 lines of `relaySeq` + envelope `type`/`kind`.
- CLI `talkie watch --slug <s> [--refresh-ms <n>]` with default 1000 ms, clamp 1–60000, stderr prefix `[talkie-watch]` and exit 1 when above 60000.

## Task Commits

1. **Task 1: talkie watch split view** — `dc978e1` (feat)

**Plan metadata:** _pending orchestrator commit for this SUMMARY if desired_

_Checkpoint Task 2 produced no code commit._

## Checkpoints

- **Task 2 (checkpoint:human-verify — Live watch UX):** ⚡ Auto-approved: `talkie watch` split-pane TUI (AUTO-CHAIN: `workflow.auto_advance` / `workflow._auto_chain_active` in `.planning/config.json`). Resume signal recorded as **`approved`** for plan continuity.

## Files Created/Modified

- `packages/cli/src/oversight/watch.ts` — Live WebSocket client, ANSI redraw loop, oversight queries, OVER-03 comment.
- `packages/cli/src/cli.ts` — `watch` command and `--refresh-ms` validation.

## Decisions Made

- Relied on `getCollaborationMetadataSnapshot` to supply `updatedAt` for possibly-blocked inference (not present on `getOversightSpaceSummaryBySlug` members alone).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `npm run build -w @agent-talkie/cli` passes; `packages/cli/dist/cli.js` includes `watch`.
- Human spot-check of live TUI remains available via relay + active space when desired.

## Orchestrator note

Per wave instructions, **STATE.md** and **ROADMAP.md** were not modified in this executor run.

---

## Self-Check: PASSED

- `packages/cli/src/oversight/watch.ts` exists.
- Substrings `\x1b[2J\x1b[H`, `PARTICIPANTS`, and `// OVER-03: timeline shown here is not injected into agent sessions.` present in `watch.ts`.
- `packages/cli/dist/cli.js` exists after build.
- Commit `dc978e1` found on `HEAD`.

*Phase: 05-cross-runtime-proof-human-oversight*  
*Completed: 2026-04-14*
