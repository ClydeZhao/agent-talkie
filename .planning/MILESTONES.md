# Milestones

## v1.0 MVP (Shipped: 2026-04-15)

**Phases completed:** 6 phases, 20 plans, 51 tasks

**Key accomplishments:**

- Versioned flat message envelope (Zod 4) with UUID v7 `sessionId`, control/conversation `kind`, optional idempotency key and `seq`, and `to` / `spaceId` addressing — built as `@agent-talkie/protocol` with Vitest.
- Envelope JSON Schema generated from Zod via `z.toJSONSchema()` (draft-2020-12), plus pure handshake range overlap, agreed version, and structured `version_mismatch` failures including relay-supported ranges.
- `@agent-talkie/persistence` with better-sqlite3 `openDatabase` (WAL, foreign keys, 5s busy timeout), a transactional `migrate()` runner over numbered SQL files, and `001_initial.sql` defining sessions, spaces, memberships, and `idempotency_keys` for durable PROTO-03 dedup.
- SQLite session CRUD with UUID v7, D-05 numeric suffix disambiguation, validated workspace metadata caps, plus idempotency try-record and 5-minute-window prune — verified with in-memory tests and a temp-file reopen integration for SESS-04.
- SQLite migration 002 plus spaces/transcript repositories with per-space `relay_seq`, membership survive file reopen, and RELAY-08 WAL/busy_timeout trace line in-repo.
- Local `@agent-talkie/relay` WebSocket server with version handshake, explicit session bind via persistence `createSession` or resume with hashed secret, strict inbound size and Zod envelope validation, in-memory disconnect cleanup only, and a no-op `dispatchValidatedEnvelope` stub for plan 02-03.
- SQLite-backed join/leave with idempotency, membership-gated WebSocket routing, transcript append with row-cap prune, bounded catch-up on join/resume, and Vitest integration coverage for isolation, direct, multi-turn, and restart.
- Relay gains a forkable daemon, generation-token health checks, idle shutdown after the last WebSocket closes, and bounded signal shutdown — enabling supervisor lockfile liveness without orphaning SQLite.
- New `@agent-talkie/supervisor` package:
- `@agent-talkie/cli`
- SQLite migration 003 plus Zod collaboration payloads and persistence snapshot/upsert helpers, with `isHuman` on session registration, ready for relay enforcement in Plan 02.
- Relay enforces human→orchestrator default routing, Zod-backed collaboration controls with ACL and idempotency, metadata snapshot query, and Vitest coverage — without a separate transport (ADAPT-03).
- Shared WebSocket session client (`@agent-talkie/client`), reference stdio adapter with Content-Length framing and bounded outbound queue, plus adapter ingress documentation — no relay-core transport fork.
- SQLite `owner_session_id` on spaces, persistence helpers with Vitest coverage, join-time owner assignment, and `not_space_owner` enforcement on `orchestrator.designate` / `orchestrator.clear` with a dedicated relay regression test.
- Shipped `@agent-talkie/adapter-codex` with bidirectional Content-Length framing to the Codex child, `joinSpace` on the shared client, and stderr-driven `metadata.patch` blocked self-report with cooldown—verified by Vitest mocks (no Codex binary in CI).
- MCP stdio server (`talkie-cursor-mcp`) on SDK ^1.29.0 with four named tools and `talkie://space/{slug}/…` resources backed by new SQLite oversight helpers; relay integration test proves two runtimes in one space.
- SQLite-backed `talkie space status`, `transcript`, and `who` plus 120s possibly-blocked inference, with OVER-03 non-injection called out in help — prerequisite for live `talkie watch`.
- `talkie watch` delivers a split-pane terminal supervisor: eight-row participant grid with attention labels (blocked vs possibly-blocked) and a scrolling timeline tail parsed from SQLite, driven by a human TalkieSessionClient on the local relay.
- openRelayDatabase now creates data directory and runs migrations before queries, with regression test for fresh-dir scenario
- Removed unused @agent-talkie/protocol from CLI dependencies, tsup externals, and pretest script

---
