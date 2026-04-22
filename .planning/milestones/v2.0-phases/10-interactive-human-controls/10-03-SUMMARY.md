---
phase: 10-interactive-human-controls
plan: "03"
subsystem: relay
tags: [sqlite, idempotency, websocket, lit, vitest]

requires:
  - phase: 10-interactive-human-controls
    provides: sendEnvelope, human echo (10-01); roster/control wiring (10-02)
provides:
  - `runConversationIdempotentTranscriptAppend` + migration for `conversation_replay_wire`
  - `routeEnvelope` gate for `conversation` + `idempotencyKey` (fresh / replay echo / mismatch)
  - Dashboard error bar **Retry** with same envelope reference and key (D-10/D-11)
affects:
  - Phase 11/12 only indirectly (transcript semantics now idempotent for keyed conversation)

tech-stack:
  added: []
  patterns:
    - "SQLite transaction: INSERT idempotency row then appendTranscriptEntry + prune in one txn"
    - "Replay: senderWs.send(stored UTF-8 wire) without fan-out or second echo"
    - "Retry UI: onRetry then dismissError (error bar click order)"

key-files:
  created:
    - packages/persistence/migrations/005_idempotency_conversation_replay.sql
    - packages/relay/src/__tests__/router-conversation-idempotency.test.ts
  modified:
    - packages/persistence/src/repositories/idempotency.ts
    - packages/persistence/src/repositories/idempotency.test.ts
    - packages/persistence/src/index.ts
    - packages/relay/src/router.ts
    - packages/dashboard/src/bridge/browser-session-bridge.ts
    - packages/dashboard/src/bridge/browser-session-bridge.test.ts
    - packages/dashboard/src/store/dashboard-store.ts
    - packages/dashboard/src/errors/talkie-error-bar.ts
    - packages/dashboard/src/shell/talkie-send-bar.ts
    - packages/dashboard/src/demo/main.ts

key-decisions:
  - "Migration numbered **005** (not 002): repo already had `002_relay_…`; a duplicate `002_idempotency_*` would skip relay migration — corrected before merge."
  - "Error bar: invoke `onRetry` then `dismissError` so the bar clears after a resend attempt."

patterns-established:
  - "Conversation idempotency uses dedicated columns on `idempotency_keys`; `tryRecordIdempotencyKey` INSERT unchanged for control ops."

requirements-completed: [CTRL-03]

duration: 45min
completed: 2026-04-20
---

# Phase 10 Plan 03: Conversation idempotency + retry UI Summary

**Relay gates `conversation` + `idempotencyKey` with SQLite `runConversationIdempotentTranscriptAppend` (fresh txn append, replay wire to sender only, mismatch error); dashboard tracks last conversation envelope for error-bar Retry with unchanged `id` and key.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-04-20
- **Tasks:** 3
- **Files touched:** 11 (2 new)

## Accomplishments

- Persistence: transactional gate with `fresh` / `replay` / `mismatch`; replay returns stored JSON string for WebSocket send.
- Relay: skips duplicate transcript append and duplicate fan-out on replay; `idempotency_replay_mismatch` when key reused with different `envelope.id` or bad row.
- Dashboard: `sendConversationWithRetryTracking` + **Retry** in `talkie-error-bar`; demo attaches `onRetry` when `hasRetryableConversation()`.

## Task Commits

1. **Task 1: Persistence migration + gate + tests** — `55140b3` (feat), `1620d87` (fix: migration 005 + DTS), `d11d2b8` (chore: remove mistaken `002_idempotency_*` file)
2. **Task 2: routeEnvelope + relay tests** — `66aaa8f` (feat)
3. **Task 3: Bridge / store / error bar / demo** — `8c114c1` (feat)

## Files Created/Modified

- `packages/persistence/migrations/005_idempotency_conversation_replay.sql` — `conversation_envelope_id`, `conversation_replay_wire` on `idempotency_keys`.
- `packages/persistence/src/repositories/idempotency.ts` — `runConversationIdempotentTranscriptAppend`.
- `packages/relay/src/router.ts` — membership → `wire` → idempotency branch → conditional global append.
- `packages/relay/src/__tests__/router-conversation-idempotency.test.ts` — transcript count + replay + mismatch.
- `packages/dashboard/src/bridge/browser-session-bridge.ts` — retry tracking API.
- `packages/dashboard/src/store/dashboard-store.ts` — `pushProtocolError(wire, { onRetry })`.
- `packages/dashboard/src/errors/talkie-error-bar.ts` — **Retry** button (D-10 copy).
- `packages/dashboard/src/shell/talkie-send-bar.ts` — `sendConversationWithRetryTracking`.
- `packages/dashboard/src/demo/main.ts` — protocol error wiring + missing Zod schema imports for orchestrator payloads.

## Decisions Made

- Use migration **005** to avoid colliding with existing `002_relay_spaces_transcripts.sql` on `schema_version` (numeric prefix from filename).

## Deviations from Plan

### Auto-fixed (Rule 3 — blocking)

- **Migration filename:** Plan listed `002_idempotency_conversation_replay.sql`; repository already uses `002` for relay/transcript DDL. Implemented as `005_idempotency_conversation_replay.sql` and removed the erroneous `002_idempotency_*` file so `migrate()` applies all layers.

### Auto-fixed (Rule 1 — TypeScript)

- **`ConversationIdempotencyOutcome` DTS:** Transaction callback returns widened `string` for `outcome`; narrowed with `as const` on each return branch.

### Auto-fixed (Rule 2 — demo correctness)

- **`demo/main.ts`:** Added `@agent-talkie/protocol` imports for `orchestratorDesignatePayloadSchema` / `orchestratorClearPayloadSchema` (references were previously undefined).

Otherwise the plan’s behavioral spec (wire timing, replay send, skip global append on fresh idempotency path) was followed.

## Issues Encountered

None remaining after migration renumbering.

## Threat Flags

None beyond plan `<threat_model>` (replay wire from validated envelope; in-memory `lastRetryableEnvelope` accepted per T-10-03-03).

## Known Stubs

None for CTRL-03 scope.

## User Setup Required

None.

## Next Phase Readiness

- Phase 11 can assume keyed human `conversation` retries do not duplicate `transcript_entries` rows when the client reuses `idempotencyKey` + `id`.

## Self-Check: PASSED

- `[ -f packages/persistence/migrations/005_idempotency_conversation_replay.sql ]` — FOUND
- `[ -f packages/relay/src/__tests__/router-conversation-idempotency.test.ts ]` — FOUND
- `git log --oneline | grep -E '55140b3|1620d87|d11d2b8|66aaa8f|8c114c1'` — all FOUND

---
*Phase: 10-interactive-human-controls*
*Completed: 2026-04-20*
