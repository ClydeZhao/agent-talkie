---
phase: 01-protocol-persistence-foundation
verified: 2026-04-10T18:57:00Z
status: passed
score: 15/15
overrides_applied: 0
---

# Phase 1: Protocol & persistence foundation — Verification Report

**Phase goal:** The wire contract, session identity model, and durable session registry in SQLite are defined, validated, and consumable before any relay networking ships.

**Verified:** 2026-04-10T18:57:00Z

**Status:** passed

**Re-verification:** No — initial verification.

## Goal achievement

### Roadmap success criteria (contract)

| # | Criterion | Status | Evidence |
|---|-----------|--------|------------|
| 1 | Consumer can serialize/parse envelope with explicit wire version; invalid payloads → structured errors | ✓ VERIFIED | `envelopeSchema`, `safeParseEnvelope`, `formatEnvelopeIssues` in `packages/protocol/src/envelope.ts`; Vitest in `envelope.test.ts` |
| 2 | JSON Schema from Zod for non-TypeScript consumers (build/CI) | ✓ VERIFIED | `packages/protocol/schemas/envelope.schema.json` (`$schema` draft 2020-12); `npm run build:schema -w @agent-talkie/protocol` exits 0; script `packages/protocol/scripts/export-envelope-schema.ts` uses `z.toJSONSchema(envelopeSchema, { target: "draft-2020-12" })` |
| 3 | Side-effect ops accept idempotency keys; `seq` and control vs conversation in envelope | ✓ VERIFIED | Optional `idempotencyKey`, `seq`, `kind` enum in `envelope.ts`; tests for optional key + `seq`; `idempotency_keys` table + `tryRecordIdempotencyKey` / `pruneExpiredIdempotencyKeys` |
| 4 | Handshake / connect negotiates version (PROTO-06); incompatible clients rejected explicitly | ✓ VERIFIED (library scope) | `handshake.ts`: `versionRangesOverlap`, `agreeProtocolVersion` (throws on no overlap), `buildVersionMismatchFailure` / `versionNegotiationFailureSchema` with `relay` range; `handshake.test.ts`. End-to-end WebSocket handshake is Phase 2 — not a gap for this phase goal. |
| 5 | Session records (stable id, disambiguation, workspace context without raw paths) persist and survive restart in tests | ✓ VERIFIED | `sessions.ts` + `sessions.test.ts` (`impl` / `impl-1`, validation, temp-file close/reopen `SESS-04`) |

**Roadmap score:** 5/5

### Plan must-haves — observable truths

| Source | Truth | Status | Evidence |
|--------|-------|--------|----------|
| 01-01 | Valid envelope parses; invalid → structured Zod issues (not throws from `safeParseEnvelope`) | ✓ VERIFIED | `safeParseEnvelope` + `formatEnvelopeIssues`; tests use `safeParse` paths |
| 01-01 | Wire shape: version, id, sessionId, kind, type, payload, optional idempotencyKey, seq, to, spaceId | ✓ VERIFIED | `envelopeSchema` fields match |
| 01-01 | `kind` only `control` \| `conversation`; optional UUID / nonnegative `seq` | ✓ VERIFIED | `z.enum`, `.uuid().optional()`, `z.number().int().nonnegative().optional()` |
| 01-02 | Schema export produces draft-2020-12 JSON without throw | ✓ VERIFIED | `build:schema` run; committed `envelope.schema.json` |
| 01-02 | Handshake overlap + agreed version match plan rules | ✓ VERIFIED | `Math.min(relay.maxVersion, client.maxVersion)`; overlap symmetric with plan |
| 01-02 | Version mismatch shape includes relay supported range (D-10) | ✓ VERIFIED | `versionNegotiationFailureSchema` / `buildVersionMismatchFailure` |
| 01-03 | `openDatabase`: WAL, `foreign_keys = ON`, `timeout: 5000` | ✓ VERIFIED | `packages/persistence/src/db.ts` |
| 01-03 | Migration `001_initial.sql`: schema_version, sessions, spaces, space_memberships, idempotency_keys | ✓ VERIFIED | File contents |
| 01-03 | `migrate()` applies pending SQL, records `schema_version`, idempotent re-run | ✓ VERIFIED | `migrate.ts` + `migrate.test.ts` |
| 01-04 | Session rows: v7 ids, field length limits, no filesystem path columns | ✓ VERIFIED | `createSession` + `validateSessionFields`; DDL columns |
| 01-04 | Display name disambiguation `-1`, `-2`, … | ✓ VERIFIED | `disambiguateDisplayName` + test `impl-1` |
| 01-04 | Idempotency dedup + prune default `300_000` ms | ✓ VERIFIED | `idempotency.ts` + `idempotency.test.ts` |
| 01-04 | File DB survives new connection after close | ✓ VERIFIED | `SESS-04 file DB reopen` in `sessions.test.ts` |

### Required artifacts (existence + substance)

| Artifact | Expected | Status | Notes |
|----------|----------|--------|-------|
| `packages/protocol/src/envelope.ts` | Zod envelope + parsers | ✓ VERIFIED | Substantive (>50 lines logic) |
| `packages/protocol/package.json` | deps/scripts | ✓ VERIFIED | |
| `packages/protocol/schemas/envelope.schema.json` | Generated schema | ✓ VERIFIED | draft 2020-12 |
| `packages/protocol/src/handshake.ts` | Negotiation + Zod | ✓ VERIFIED | |
| `packages/persistence/migrations/001_initial.sql` | DDL | ✓ VERIFIED | |
| `packages/persistence/src/migrate.ts` | Runner | ✓ VERIFIED | |
| `packages/persistence/src/repositories/sessions.ts` | Session CRUD + disambiguation | ✓ VERIFIED | |
| `packages/persistence/src/repositories/idempotency.ts` | Try-insert + prune | ✓ VERIFIED | |

### Key link verification

`gsd-tools verify key-links` reported false negatives (barrel `export … from "./envelope.js"` and migrations read via directory, not string reference to `.sql` filenames). Manual trace:

| From | To | Via | Status | Detail |
|------|-----|-----|--------|--------|
| `packages/protocol/src/index.ts` | `packages/protocol/src/envelope.ts` | Re-export `./envelope.js` | ✓ WIRED | |
| `packages/protocol/scripts/export-envelope-schema.ts` | `packages/protocol/src/envelope.ts` | `import … from "../src/envelope.ts"` | ✓ WIRED | |
| `packages/persistence/src/migrate.ts` | `packages/persistence/migrations/*.sql` | `readdirSync` + `readFileSync` under `../migrations` | ✓ WIRED | Plan linked `db.ts`→SQL; actual reader is `migrate.ts` (acceptable indirection) |
| `packages/persistence/src/repositories/sessions.ts` | `sessions` table (from migration) | `INSERT` / `SELECT` | ✓ WIRED | |
| `packages/persistence/src/index.ts` | repositories, db, migrate | Re-exports | ✓ WIRED | |

### Data-flow trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| `createSession` / `getSessionById` | Row fields | SQLite `sessions` | INSERT then SELECT | ✓ FLOWING |
| `tryRecordIdempotencyKey` | Dedup | `idempotency_keys` PK | `INSERT OR IGNORE` + `changes` | ✓ FLOWING |

### Behavioral spot-checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Protocol build + tests | `npm run build -w @agent-talkie/protocol && npm run test -w @agent-talkie/protocol` | 2 files, 8 tests passed | ✓ PASS |
| Persistence build + tests | `npm run build -w @agent-talkie/persistence && npm run test -w @agent-talkie/persistence` | 3 files, 6 tests passed | ✓ PASS |
| JSON Schema export | `npm run build:schema -w @agent-talkie/protocol` | Exit 0 | ✓ PASS |

### Requirements coverage

Every Phase 1 requirement ID appears in at least one PLAN `requirements:` frontmatter; each is satisfied by implementation evidence below. No orphaned Phase 1 IDs in `REQUIREMENTS.md` traceability table.

| Requirement | Plan(s) | Description (abbrev.) | Status | Evidence |
|-------------|---------|------------------------|--------|----------|
| PROTO-01 | 01-01 | Versioned envelope, Zod runtime | ✓ SATISFIED | `envelopeSchema`, parsers, tests |
| PROTO-02 | 01-02 | JSON Schema from Zod | ✓ SATISFIED | `envelope.schema.json`, `build:schema` |
| PROTO-03 | 01-01, 01-03, 01-04 | Idempotency for retries | ✓ SATISFIED | Wire `idempotencyKey` + table + repos |
| PROTO-04 | 01-01 | Sequence numbers | ✓ SATISFIED | Optional `seq` on envelope; per-session ordering authority deferred to relay (field present) |
| PROTO-05 | 01-01 | Control vs conversation | ✓ SATISFIED | `kind` enum |
| PROTO-06 | 01-02 | Version negotiation | ✓ SATISFIED | `handshake.ts` + tests; wire handshake in Phase 2 |
| SESS-01 | 01-04 | Stable identity | ✓ SATISFIED | UUID v7 default `createSession` |
| SESS-02 | 01-04 | Display name disambiguation | ✓ SATISFIED | `disambiguateDisplayName` + tests |
| SESS-03 | 01-04 | Workspace context, no raw paths | ✓ SATISFIED | Validated labels/runtime/branch/focus; DDL has no path columns |
| SESS-04 | 01-04 | SQLite survives restart | ✓ SATISFIED | Temp-file reopen test |

**Requirement ID accounting:** PROTO-01 … PROTO-06 and SESS-01 … SESS-04 — all mapped and verified (10/10). Union of plan `requirements:` arrays matches this set (PROTO-03 duplicated across plans intentionally).

### Anti-patterns

| File | Pattern | Severity | Notes |
|------|---------|----------|-------|
| — | TODO/FIXME in `packages/protocol/src`, `packages/persistence/src` | — | No matches |

### Human verification required

None required for automated gate: no UI, no live WebSocket in Phase 1 scope. Phase 2 should UAT full handshake on the wire.

### Gaps summary

No gaps found. `gsd-tools verify key-links` automation does not detect ESM barrel re-exports (`.js` specifiers) or migration indirection; manual wiring confirmed.

### Deferred (Step 9b)

No Phase 1 gaps were moved to later phases. Relay/WebSocket integration is expected in Phase 2 by roadmap design, not treated as a failed Phase 1 truth.

---

_Verified: 2026-04-10T18:57:00Z_

_Verifier: Claude (gsd-verifier)_
