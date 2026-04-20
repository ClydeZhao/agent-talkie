---
phase: 10-interactive-human-controls
plan: "02"
subsystem: ui
tags: [lit, websocket, relay, zod, orchestrator, vitest]

requires:
  - phase: 10-interactive-human-controls
    provides: sendEnvelope, sendTargetSessionId / toggleSendTargetSession (10-01)
provides:
  - Non-envelope WS schemas and bridge dispatch for orchestrator.designated / orchestrator.cleared / collaboration.orchestrator
  - DashboardStore.syncOrchestratorFromRelay for immediate roster orchestrator flags
  - Owner-gated roster ⋯ menu and control envelope wiring in demo
affects:
  - 10-03-PLAN (idempotent conversation retry remains)

tech-stack:
  added: []
  patterns:
    - "Single onOrchestratorRosterWire listener with OrchestratorRosterWire union (designated | cleared | collaboration.orchestrator)"
    - "D-04: row body → talkie-select-send-target; ⋯ menu → designate/clear events (separate from 10-01 talkie-toggle-send-target name)"

key-files:
  created:
    - packages/dashboard/src/bridge/orchestrator-wire.test.ts
  modified:
    - packages/dashboard/src/bridge/wire-schemas.ts
    - packages/dashboard/src/bridge/browser-session-bridge.ts
    - packages/dashboard/src/store/dashboard-store.ts
    - packages/dashboard/src/roster/talkie-roster-entry.ts
    - packages/dashboard/src/demo/main.ts

key-decisions:
  - "Used one listener set onOrchestratorRosterWire(msg) instead of three parallel listener collections."
  - "D-04 UX: clicking the roster row body (not the ⋯) emits talkie-select-send-target; demo calls toggleSendTargetSession (same toggle behavior as 10-01, renamed event per plan acceptance)."

patterns-established:
  - "Parse orchestrator roster wires in dispatchPostHandshake before safeParseEnvelope, mirroring collaboration.metadata."

requirements-completed: [CTRL-02]

duration: 35min
completed: 2026-04-20
---

# Phase 10 Plan 02: Orchestrator roster controls (CTRL-02) Summary

**Dashboard consumes relay orchestrator fan-out wires, updates roster flags in real time, and lets space owners designate/clear via a roster menu using sendEnvelope with fresh idempotency keys.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-04-20
- **Tasks:** 2
- **Files touched:** 6 (1 new test file)

## Accomplishments

- Zod wire schemas aligned with `collaboration-handlers.ts` ack/fan-out JSON; bridge routes them before envelope parsing and notifies `onOrchestratorRosterWire` subscribers.
- `DashboardStore.syncOrchestratorFromRelay` updates `RosterRow.orchestrator` for the active space only.
- Roster entry: owner-only `⋯` menu with immediate designate/clear (no confirm); row body sets send target via `talkie-select-send-target`.
- Demo wires WS → store, menu events → `orchestrator.designate` / `orchestrator.clear` envelopes with protocol payload parsing.

## Task Commits

1. **Task 1: Wire schemas + bridge dispatch + store sync** — `ee9dc11` (feat)
2. **Task 2: Roster menu + demo control envelopes** — `a1301d1` (feat)

## Files Created/Modified

- `packages/dashboard/src/bridge/wire-schemas.ts` — `orchestratorDesignatedWireSchema`, `orchestratorClearedWireSchema`, `collaborationOrchestratorWireSchema`, `OrchestratorRosterWire` union.
- `packages/dashboard/src/bridge/browser-session-bridge.ts` — `onOrchestratorRosterWire`, `emitOrchestratorRosterWire`, parse order before `safeParseEnvelope`.
- `packages/dashboard/src/store/dashboard-store.ts` — `syncOrchestratorFromRelay(spaceId, orchestratorSessionId | null)`.
- `packages/dashboard/src/bridge/orchestrator-wire.test.ts` — schema/store/bridge callback coverage (TDD Task 1).
- `packages/dashboard/src/roster/talkie-roster-entry.ts` — layout split: row main vs owner `details` menu; custom events for target + orchestration.
- `packages/dashboard/src/demo/main.ts` — `onOrchestratorRosterWire`, roster listeners, Zod payloads for control sends.

## Decisions Made

- **Listener shape:** One `onOrchestratorRosterWire` callback carrying a discriminated union; demo branches on `msg.type` (including `collaboration.orchestrator` nullable session id).
- **D-04 vs 10-01 event name:** Plan acceptance required `talkie-select-send-target`; behavior remains `toggleSendTargetSession` in the store (click row toggles direct target vs default orchestrator path).

## Deviations from Plan

None — `talkie-roster.ts` needed no changes (events bubble from entries; plan listed it as optional parent wiring).

## Issues Encountered

None.

## Threat Flags

None beyond plan `<threat_model>` (UI owner gate; relay remains authority).

## Known Stubs

None for CTRL-02 scope.

## User Setup Required

None.

## Next Phase Readiness

- 10-03 can add conversation idempotency + error-bar retry; orchestrator path already uses per-click UUID `idempotencyKey` as specified.

## Self-Check: PASSED

- `[ -f packages/dashboard/src/bridge/orchestrator-wire.test.ts ]` — FOUND
- `git log --oneline | grep -E 'ee9dc11|a1301d1'` — both commits present on branch

---
*Phase: 10-interactive-human-controls*
*Completed: 2026-04-20*
