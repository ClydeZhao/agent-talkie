---
phase: 02-relay-websocket-validate-route
plan: "03"
subsystem: api
tags: [websocket, sqlite, relay, vitest, zod, routing]

requires:
  - phase: 02-relay-websocket-validate-route
    provides: WebSocket handshake, envelope validation, SessionRegistry from plan 02-02
provides:
  - Space join/leave with idempotency, slug create-or-revive, last-member archive
  - Message routing by membership (direct + fan-out) with transcript append and cap prune
  - Bounded transcript catch-up on join and on session.resume
  - Integration tests for isolation, direct, multi-turn, resume, invalid envelope
affects:
  - Future adapter/CLI work consuming relay protocol
  - Phase 3+ relay daemon lifecycle

tech-stack:
  added: []
  patterns:
    - "SQLite transaction per mutating join/leave with tryRecordIdempotencyKey first"
    - "routeEnvelope: membership check → append (except protocol skips) → prune → deliver"
    - "Pre-attach WS message listeners before resume to observe async catch-up frames"

key-files:
  created:
    - packages/relay/src/space-lifecycle.ts
    - packages/relay/src/catch-up.ts
    - packages/relay/src/router.ts
    - packages/relay/src/integration.test.ts
  modified:
    - packages/relay/src/server.ts
    - packages/relay/src/server.test.ts
    - packages/relay/package.json
    - packages/persistence/src/repositories/spaces.ts
    - packages/persistence/src/repositories/transcript.ts
    - packages/persistence/src/index.ts

key-decisions:
  - "Leave idempotency replay: derive spaceId from latest left membership row when no active row"
  - "Transcript prune: delete oldest rows by relay_seq when count exceeds TRANSCRIPT_MAX_ROWS_PER_SPACE (50000)"
  - "createRelayServer returns dbPath for integration tests that reopen SQLite"

patterns-established:
  - "Protocol control types skip transcript append; transcript.query uses capped SQL window (max 500)"
  - "Expired/archived slug path deletes space row and re-inserts active space to release slug"

requirements-completed: [RELAY-01, RELAY-03, SPACE-01, SPACE-02, MSG-01, MSG-02, MSG-03]

duration: ~25min
completed: 2026-04-10
---

# Phase 02 Plan 03: Relay routing and collaboration messaging Summary

**SQLite-backed join/leave with idempotency, membership-gated WebSocket routing, transcript append with row-cap prune, bounded catch-up on join/resume, and Vitest integration coverage for isolation, direct, multi-turn, and restart.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-10 (executor session)
- **Completed:** 2026-04-10
- **Tasks:** 3
- **Files modified:** 10 (4 new relay sources + integration test + persistence/repo/index + relay package.json)

## Accomplishments

- `handleSpaceJoin` / `handleSpaceLeave` implement CONTEXT rules (slug resolution, SPACE-02, idempotency replay, last-member archive TTL).
- `routeEnvelope` enforces RELAY-03 (membership, direct vs fan-out), `transcript.query` with membership + capped limit, and `appendTranscriptEntry` + prune after append.
- `sendTranscriptCatchUp` after `space.joined` and after `session.resumed` when an active membership exists.
- `setInterval(60000)` deletes expired archived spaces via `pruneExpiredArchivedSpaces`.
- Integration tests A–E cover roadmap-style success criteria (isolation, direct, multi-turn `n:3`, resume + `transcript.catchup`, `invalid_envelope`).

## Task Commits

1. **Task 1: Space join/leave handlers + persistence helpers** — `aeb93b6` (feat)
2. **Task 2: Router — direct, space fan-out, transcript append, transcript.query** — `217c5ee` (feat)
3. **Task 3: Integration tests** — `7d7db57` (test)

## Files Created/Modified

- `packages/persistence/src/repositories/spaces.ts` — `findActiveMembershipForSession`, `deleteSpaceById`
- `packages/persistence/src/repositories/transcript.ts` — `listTranscriptEntriesAfterSeq`
- `packages/persistence/src/index.ts` — re-exports
- `packages/relay/src/space-lifecycle.ts` — join/leave transactions, archived-space GC helper
- `packages/relay/src/catch-up.ts` — `CATCH_UP_DEFAULT_LIMIT = 100`, `sendTranscriptCatchUp`
- `packages/relay/src/router.ts` — `TRANSCRIPT_MAX_ROWS_PER_SPACE`, `routeEnvelope`
- `packages/relay/src/server.ts` — dispatch join/leave, router, GC interval, `dbPath` on server handle, resume catch-up
- `packages/relay/src/server.test.ts` — join before routed `test.ping`
- `packages/relay/src/integration.test.ts` — five integration scenarios
- `packages/relay/package.json` — pretest builds persistence as well as protocol

## Decisions Made

- Idempotent `space.leave` replay without active membership uses the most recent `left_at` row to return a stable `spaceId` in `space.left`.
- Integration test D collects inbound messages from a listener installed **before** `session.resume` so `transcript.catchup` frames are not missed if they arrive immediately after `session.resumed`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Relay tests used stale persistence build (missing new exports)**

- **Found during:** Task 1 verification (`npm run test -w @agent-talkie/relay`)
- **Issue:** Runtime `findActiveMembershipForSession is not a function` when Vitest imported built `@agent-talkie/persistence` without rebuilding after API change.
- **Fix:** Extended relay `pretest` to run `npm run build -w @agent-talkie/persistence` before tests.
- **Files modified:** `packages/relay/package.json`
- **Verification:** Relay test suite green
- **Committed in:** `aeb93b6`

**2. [Rule 1 - Bug] Race losing `transcript.catchup` after resume in integration test**

- **Found during:** Task 3 (`Test D` timeout / empty buffer)
- **Issue:** `session.resumed` was consumed with `nextJson` before attaching a listener; catch-up frames could arrive before the test subscribed.
- **Fix:** Subscribe to `message` before sending `session.resume`, then assert both `session.resumed` and `transcript.catchup` in the buffer.
- **Files modified:** `packages/relay/src/integration.test.ts`
- **Verification:** `npm run test -w @agent-talkie/relay`
- **Committed in:** `7d7db57`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)

**Impact on plan:** No product semantics change; test harness and local build order only.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None — no external services.

## Next Phase Readiness

- Relay core routing and transcript path are in place for adapter/daemon work and further REQ validation.
- Orchestrator should update `STATE.md` / `ROADMAP.md` / requirements when merging this wave (not updated in this executor run per instructions).

## Self-Check: PASSED

- `packages/relay/src/router.ts` — FOUND
- `packages/relay/src/integration.test.ts` — FOUND
- Commits `aeb93b6`, `217c5ee`, `7d7db57` — FOUND on branch

---
*Phase: 02-relay-websocket-validate-route*

*Completed: 2026-04-10*
