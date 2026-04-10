---
phase: 02-relay-websocket-validate-route
verified: 2026-04-10T12:15:00Z
status: passed
score: 11/11
overrides_applied: 0
---

# Phase 2: Relay — WebSocket, validate, route — Verification Report

**Phase goal:** A running relay accepts WebSocket connections, authoritatively validates traffic, persists space state, and routes messages between sessions in one space without broadcast-to-all leakage.

**Verified:** 2026-04-10T12:15:00Z

**Status:** passed

**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (merged must_haves from 02-01 / 02-02 / 02-03)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Migration 002 extends spaces, memberships, sessions, transcript_entries with per-space `relay_seq` uniqueness | ✓ VERIFIED | `packages/persistence/migrations/002_relay_spaces_transcripts.sql` defines `transcript_entries` with `UNIQUE(space_id, relay_seq)`, alters sessions/spaces/space_memberships |
| 2 | Space membership and space rows survive close/reopen of same SQLite path (WAL + busy timeout) | ✓ VERIFIED | `packages/persistence/src/db.ts` — `timeout: 5000`, `journal_mode = WAL`; `spaces.test.ts` reopen flow; `RELAY-08.md` trace line |
| 3 | Transcript rows persist `envelope_json` and `relay_seq` for catch-up | ✓ VERIFIED | `transcript.ts` + `transcript.test.ts`; integration Test D counts `transcript_entries` after restart |
| 4 | WebSocket server binds 127.0.0.1; first frame is version handshake; mismatch → `handshake.nack` / close | ✓ VERIFIED | `server.ts` — `LISTEN_HOST`, `relayClientHandshakeSchema`, `buildVersionMismatchFailure` spread into `{ type: "handshake.nack", ... }`; `server.test.ts` |
| 5 | No space membership before successful `session.register` / `session.resume` | ✓ VERIFIED | `handleSpaceJoin` only via `dispatchValidatedEnvelope` after bind; pre-bind path only register/resume |
| 6 | Post-bind frames: JSON → `safeParseEnvelope` before routing side effects | ✓ VERIFIED | `parseAndValidateEnvelope` in `validation.ts` (wraps `safeParseEnvelope` + `formatEnvelopeIssues` from `@agent-talkie/protocol`); `server.ts` calls it before `dispatchValidatedEnvelope` |
| 7 | Disconnect removes socket from in-memory registry only; SQLite membership not deleted on TCP drop | ✓ VERIFIED | `ws.on("close")` → `registry.remove(ws)` only; no membership DELETE on disconnect |
| 8 | Join/leave use transactions + `tryRecordIdempotencyKey`; replay stable without double membership | ✓ VERIFIED | `space-lifecycle.ts` — `db.transaction`, idempotency replay SQL, `idempotency_replay_mismatch` on mismatch |
| 9 | Validates envelopes and routes to explicit `to` or space members (RELAY-01 + RELAY-03) | ✓ VERIFIED | `router.ts` — membership SQL, direct send vs fan-out excluding sender |
| 10 | Session in another space never receives payloads | ✓ VERIFIED | `integration.test.ts` Test A — `cConv === 0` for beta space |
| 11 | Multi-turn A↔B with distinct envelope ids | ✓ VERIFIED | Test C — `recvA`/`recvB` and four unique `id`s |

**Score:** 11/11 truths verified

### Roadmap success criteria (phase contract)

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Clients join, exchange direct and space-scoped messages, multi-turn | ✓ VERIFIED | Tests A–C |
| 2 | Inbound envelopes Zod-validated; invalid rejected without corrupting state | ✓ VERIFIED | `parseAndValidateEnvelope`; Test E (`invalid_envelope`, peer count stable) |
| 3 | Delivery to explicit peers/subset; not broadcast to unrelated sessions | ✓ VERIFIED | Tests A, B |
| 4 | Durable SQLite WAL + busy_timeout; restart preserves membership/registry | ✓ VERIFIED | `db.ts`, Test D (`findActiveMembershipForSession`, `transcript_entries`, resume + catch-up) |
| 5 | Explicit join/opt-in; disconnect consistent for others and persistence | ✓ VERIFIED | Register ≠ join; `server.test.ts` resume after close; registry cleanup only |

_Note:_ Success criterion 1 mentions “ordering/gap signals per protocol.” The relay forwards validated envelopes (optional `seq` per `envelopeSchema`); it does not perform gap detection or reordering — consistent with PROTO-04 living in the envelope and clients/tests using valid multi-turn traffic.

### Deferred Items

None — no open gaps matched later milestone phases in a way that would defer verification.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `packages/persistence/migrations/002_relay_spaces_transcripts.sql` | DDL + transcript | ✓ VERIFIED | Exists, substantive (`gsd-tools verify artifacts` 02-01) |
| `packages/persistence/src/repositories/spaces.ts` | Slug, membership, lifecycle | ✓ VERIFIED | `normalizeSpaceSlug`, join helpers, `findActiveMembershipForSession`, `deleteSpaceById` |
| `packages/persistence/src/repositories/transcript.ts` | Seq + append + tail/after | ✓ VERIFIED | Used by router + catch-up |
| `packages/relay/src/server.ts` | WS + handshake + dispatch | ✓ VERIFIED | Wired to lifecycle + router |
| `packages/protocol/src/relay-wire.ts` | Wire Zod schemas | ✓ VERIFIED | Handshake + session messages |
| `packages/relay/src/router.ts` | Route + transcript + prune | ✓ VERIFIED | `TRANSCRIPT_MAX_ROWS_PER_SPACE`, membership gates |
| `packages/relay/src/integration.test.ts` | E2E isolation/routing/resume | ✓ VERIFIED | Tests A–E pass |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `packages/persistence/src/db.ts` | `002_relay_spaces_transcripts.sql` | WAL/open + migrations | ⚠️ TOOL_FALSE_NEGATIVE / ✓ MANUAL | `db.ts` does not import the SQL path; `migrate.ts` applies every `*.sql` under `migrations/` after `openDatabase`; relay calls `migrate(db)` in `createRelayServer` |
| `packages/relay/src/validation.ts` | `packages/protocol/src/envelope.ts` | `safeParseEnvelope` | ⚠️ TOOL_FALSE_NEGATIVE / ✓ MANUAL | Imports `@agent-talkie/protocol`; `index.ts` re-exports `safeParseEnvelope` / `formatEnvelopeIssues` from `envelope.ts` |
| `packages/relay/src/router.ts` | `packages/persistence/src/repositories/transcript.ts` | append + list | ⚠️ TOOL_FALSE_NEGATIVE / ✓ MANUAL | `appendTranscriptEntry`, `listTranscriptEntriesAfterSeq` imported from `@agent-talkie/persistence` (re-exported from `index.ts`) |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Produces real data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `router.ts` | routed payloads | `appendTranscriptEntry` + `SELECT` memberships | SQLite `transcript_entries` + membership rows | ✓ FLOWING |
| `catch-up.ts` | catch-up frames | `listTranscriptTailBySeq` | DB tail | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Monorepo tests (protocol, persistence, relay) | `npm test` (repo root) | All suites exit 0 | ✓ PASS |

### Requirements Coverage

Every ID requested for this phase appears in PLAN frontmatter and is mapped below to evidence. **Orphan check:** no extra Phase-2-only IDs in `REQUIREMENTS.md` traceability table for this phase that are missing from the three plans.

| Requirement | Source plan | Description (from REQUIREMENTS.md) | Status | Evidence |
| ----------- | ----------- | ----------------------------------- | ------ | -------- |
| RELAY-01 | 02-03 | WS relay accepts connections, validates, routes to addressed recipients | ✓ SATISFIED | `createRelayServer`, `routeEnvelope`, integration Tests B/C |
| RELAY-02 | 02-02 | Authoritative Zod validation on inbound envelopes before routing | ✓ SATISFIED | `parseAndValidateEnvelope` → `safeParseEnvelope`; Test E |
| RELAY-03 | 02-03 | Routed by explicit addressing, not broadcast-to-all | ✓ SATISFIED | Direct `to` + space-scoped fan-out with membership; Test A |
| RELAY-08 | 02-01 | SQLite durable state; WAL; busy_timeout | ✓ SATISFIED | `db.ts`, `RELAY-08.md`, migration + repos |
| RELAY-09 | 02-02 | Graceful disconnect — no corrupt state | ✓ SATISFIED | Registry-only removal on close; resume path in tests |
| SPACE-01 | 02-03 | Create/join/leave collaboration space | ✓ SATISFIED | `handleSpaceJoin` / `handleSpaceLeave`, integration flows |
| SPACE-02 | 02-03 | At most one space per session | ✓ SATISFIED | `already_in_space` in `space-lifecycle.ts` |
| SPACE-03 | 02-01 | Membership persisted; survives relay restart | ✓ SATISFIED | `spaces.test.ts` reopen; Test D membership query |
| SPACE-04 | 02-02 | Explicit opt-in before membership | ✓ SATISFIED | Join only via `space.join` envelope after session bind |
| MSG-01 | 02-03 | Direct message to another session in same space | ✓ SATISFIED | Test B |
| MSG-02 | 02-03 | Message to all sessions in same space | ✓ SATISFIED | Test A (fan-out to B, not C) |
| MSG-03 | 02-03 | Multi-turn back-and-forth | ✓ SATISFIED | Test C |

**Documentation drift:** `REQUIREMENTS.md` checkboxes and traceability “Pending” rows for these IDs are stale relative to implementation — recommend updating when the phase is closed in planning state (not a code gap).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | — | — | No blocking TODO/FIXME/placeholder patterns found in relay sources (grep) |

### Gaps Summary

None. Plan must-haves, phase goal, and listed requirement IDs are supported by the codebase and passing tests.

---

_Verified: 2026-04-10T12:15:00Z_

_Verifier: Claude (gsd-verifier)_
