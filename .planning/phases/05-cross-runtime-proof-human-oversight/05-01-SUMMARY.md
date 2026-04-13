---
phase: 05-cross-runtime-proof-human-oversight
plan: 01
subsystem: database
tags: [sqlite, relay, orchestrator, ownership, mhum-01]

requires:
  - phase: 04-adapter-ingress
    provides: collaboration-handlers, migrations 001–003, is_human
provides:
  - Migration 004 `spaces.owner_session_id` with FK to sessions
  - Persistence helpers getSpaceOwnerSessionId, tryAssignSpaceOwnerIfUnsetForHuman
  - Join path assigns first human owner; orchestrator designate/clear owner-gated
affects:
  - Phase 05 follow-on MCP / human oversight plans

tech-stack:
  added: []
  patterns:
    - "Per-space persistent human owner for management controls; claim on first human join or first management op when unset"

key-files:
  created:
    - packages/persistence/migrations/004_space_owner.sql
    - packages/persistence/src/repositories/space-owner.ts
    - packages/persistence/src/repositories/space-owner.test.ts
    - packages/relay/src/__tests__/collaboration-handlers.owner.test.ts
  modified:
    - packages/persistence/src/index.ts
    - packages/relay/src/space-lifecycle.ts
    - packages/relay/src/collaboration-handlers.ts
    - packages/relay/src/__tests__/router-orchestrator.test.ts

key-decisions:
  - "Owner test file lives under src/__tests__/ (not src root) so acceptance grep over __tests__ finds not_space_owner."

patterns-established:
  - "Relay collaboration orchestrator mutations require space owner session (or successful NULL claim by human sender)."

requirements-completed: [MHUM-01]

duration: ~12 min
completed: 2026-04-13
---

# Phase 05 Plan 01: Space owner persistence and orchestrator gate Summary

**SQLite `owner_session_id` on spaces, persistence helpers with Vitest coverage, join-time owner assignment, and `not_space_owner` enforcement on `orchestrator.designate` / `orchestrator.clear` with a dedicated relay regression test.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-13T17:57:00Z (approx.)
- **Completed:** 2026-04-13T18:00:00Z (approx.)
- **Tasks:** 2
- **Files touched:** 8 (4 created, 4 modified)

## Accomplishments

- Migration 004 adds optional human-owner column referencing `sessions(id)`.
- `tryAssignSpaceOwnerIfUnsetForHuman` only assigns for human sessions and is idempotent for a second human.
- `handleSpaceJoin` claims owner on idempotent replay, already-in-space shortcut, and post-membership-activation paths.
- Orchestrator designate/clear require owner match, or claim when owner is unset; otherwise `protocol.error` with `not_space_owner`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 004 and space-owner persistence API** — `0ad34ed` (feat)
2. **Task 2: Enforce owner on join and orchestrator controls** — `a7ae611` (feat)

## Files Created/Modified

- `packages/persistence/migrations/004_space_owner.sql` — DDL for `owner_session_id`.
- `packages/persistence/src/repositories/space-owner.ts` — Owner read + conditional assign.
- `packages/persistence/src/repositories/space-owner.test.ts` — Migrate column + assign rules.
- `packages/persistence/src/index.ts` — Re-exports owner helpers.
- `packages/relay/src/space-lifecycle.ts` — Owner claim after active membership on join.
- `packages/relay/src/collaboration-handlers.ts` — Owner gate before idempotency transactions.
- `packages/relay/src/__tests__/router-orchestrator.test.ts` — Fixture owner alignment via `tryAssignSpaceOwnerIfUnsetForHuman`.
- `packages/relay/src/__tests__/collaboration-handlers.owner.test.ts` — Non-owner designate → `not_space_owner`.

## Decisions Made

- Placed `collaboration-handlers.owner.test.ts` under `src/__tests__/` so plan acceptance grep over `__tests__` matches; behavior matches plan intent.

## Deviations from Plan

### Minor scope / process

**1. [TDD process] Task 1 delivered as single feat commit**

- **Found during:** Task 1 (`tdd="true"` in plan)
- **Issue:** Plan calls for separate RED/GREEN commits; executor shipped migration + implementation + tests in one atomic task commit for speed and per user “one commit per task” instruction.
- **Fix:** None required for correctness; tests were written to match behaviors before ship.
- **Verification:** `npm run test -w @agent-talkie/persistence` exit 0.

**2. [Path] Owner gate test file location**

- **Found during:** Task 2 acceptance (`grep __tests__` for `not_space_owner`)
- **Issue:** Plan text named `packages/relay/src/collaboration-handlers.owner.test.ts`.
- **Fix:** File is `packages/relay/src/__tests__/collaboration-handlers.owner.test.ts`.
- **Verification:** `rg not_space_owner packages/relay/src/__tests__` matches; relay tests pass.

---

**Total deviations:** 2 (both non-functional / housekeeping)

**Impact on plan:** None on runtime behavior or threat mitigations (T-05-01).

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- Persistence and relay suites green; ready for MCP `assign_orchestrator` and further MHUM work on this branch.
- Manual check still useful: two human WebSockets, non-owner designate → JSON contains `not_space_owner`.

## Self-Check: PASSED

- `packages/persistence/migrations/004_space_owner.sql` exists.
- `packages/persistence/src/repositories/space-owner.ts` exists.
- `packages/relay/src/__tests__/collaboration-handlers.owner.test.ts` exists.
- Commits `0ad34ed` and `a7ae611` on branch history.

---
*Phase: 05-cross-runtime-proof-human-oversight*
*Completed: 2026-04-13*
