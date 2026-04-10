# Phase 1: Protocol & persistence foundation — Research

**Researched:** 2026-04-10  
**Domain:** Versioned wire envelope (Zod 4 + JSON Schema), UUID v7 identities, SQLite (`better-sqlite3`) session registry, protocol versioning & idempotency patterns  
**Confidence:** HIGH for stack and library APIs; MEDIUM for exact handshake payload shapes (Phase 2 consumer) and idempotency table placement vs D-08

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Envelope**

- **D-01:** Flat top-level envelope — `version` (integer), `id` (message UUID), `sessionId` (sender), `kind` (`control` | `conversation`), `type` (string), `payload` (object), optional `idempotencyKey`, optional `seq`. No deep nesting of envelope metadata.
- **D-02:** `kind` distinguishes control vs conversation; same envelope shape for both.
- **D-03:** Addressing fields (`to` for direct session, or space-scoped delivery) are part of the envelope, not buried in payload.

**Session identity**

- **D-04:** Session IDs = UUID v7 (time-sortable, global uniqueness without coordination). Display names = human-chosen strings.
- **D-05:** Collision disambiguation: relay appends short numeric suffix (`impl-1`, `impl-2`); suffix is relay-managed.
- **D-06:** Minimal workspace context: `runtime`, `workspaceLabel`, optional `branch`, optional `focus` — declared by session.

**SQLite**

- **D-07:** Raw `better-sqlite3`, manual numbered SQL migrations under `migrations/`, `schema_version` table.
- **D-08:** Phase 1 tables: `sessions`, `schema_version`. Space/membership tables may exist as schema but primary use Phase 2.

**Versioning**

- **D-09:** Single integer envelope `version` starting at 1.
- **D-10:** Handshake includes `supportedVersions` range; relay rejects if no overlap with relay range; structured rejection with expected version info.

**Idempotency**

- **D-11:** Idempotency keys (UUID-based) on state-changing ops only (join, leave, metadata mutations, other SQLite-mutating protocol ops). Not required on conversation messages.
- **D-12:** Dedup by idempotency key within configurable window (default 5 minutes), then evict.

### Claude's Discretion

- Zod field naming: camelCase (TypeScript ecosystem).
- JSON Schema export: CI script vs build step.
- Migration file naming convention.
- Test fixture design for envelope validation.

### Deferred Ideas (OUT OF SCOPE)

- None per CONTEXT.md.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROTO-01 | Versioned envelope + wire `version` validated by Zod | `z.object` + `version: z.number().int().positive()`; avoid unrepresentable types for JSON Schema export [CITED: v4.zod.dev/json-schema] |
| PROTO-02 | JSON Schema from Zod | `z.toJSONSchema()` default draft-2020-12; `.meta()` / registry for `$defs` [CITED: v4.zod.dev/json-schema] |
| PROTO-03 | Idempotency keys on side-effecting ops | Optional `idempotencyKey` on envelope; UUID generation + dedup store pattern (see §Idempotency) — **note:** D-08 does not list a dedup table; planner chooses Phase 1 table vs Phase 2 relay store |
| PROTO-04 | Per-session `seq` for ordering / gap detection | Optional `seq` in envelope; monotonic rules owned by client + validated bounds in Zod [ASSUMED: relay enforcement in Phase 2] |
| PROTO-05 | Control vs conversation at protocol level | `kind: z.enum(['control','conversation'])` or `z.discriminatedUnion` if payloads diverge [VERIFIED: Context7 Zod v4 discriminatedUnion] |
| PROTO-06 | Schema evolution + handshake version negotiation | Integer version + interval overlap on `supportedVersions` (see §Protocol versioning) |
| SESS-01 | Stable session identity across reconnect / relay restart | UUID v7 from `uuid` package; persist session row in SQLite [VERIFIED: npm uuid@13] |
| SESS-02 | Display names + auto disambiguation | Application logic (suffix); not a Zod concern — persisted `display_name` reflects relay-resolved label [from CONTEXT] |
| SESS-03 | Minimal workspace context | Columns / JSON fields per D-06; validate length and charset in Zod [ASSUMED] |
| SESS-04 | Identity in SQLite, recoverable after restart | `sessions` table + migrations; WAL + timeout on open [VERIFIED: better-sqlite3 docs] |
</phase_requirements>

## Summary

Phase 1 establishes a **consumable protocol package**: flat JSON envelope validated with **Zod 4**, exported to **JSON Schema** via native `z.toJSONSchema()`, plus a **SQLite** session registry using **better-sqlite3** with **WAL** and **busy timeout** (via constructor `timeout` or `PRAGMA busy_timeout`). Session IDs should be generated with **`uuid/v7`** [VERIFIED: RFC9562 / uuid package]. Kind discrimination is a first-class field (`control` | `conversation`); because D-01 keeps one envelope shape, **`z.enum` on `kind`** inside a single `z.object` is usually enough; introduce **`z.discriminatedUnion('kind', …)`** only when per-kind payload schemas diverge [VERIFIED: Context7 `/websites/zod_dev_v4`]. Handshake version negotiation reduces to **range overlap** on integer protocol versions (client `min..max` vs relay `min..max`), then pick a single agreed version (typically **min(max sides)**) [ASSUMED: common practice]. Idempotency: store keys with **first-seen timestamp**, reject duplicates inside the window, **delete expired rows** (or TTL sweep) — align table placement with D-08 (see Open Questions).

**Primary recommendation:** Ship `packages/protocol` (or equivalent) with envelope schemas, `parseEnvelope`/`safeParse`, JSON Schema artifact from `z.toJSONSchema()`, and `packages/persistence` (or `protocol/db`) with migration runner + `sessions` repository — no ORM, no external services.

## Project Constraints (from .cursor/rules/)

From `.cursor/rules/gsd-context.md` (mirrors project constraints):

- **GSD workflow:** Prefer starting work through GSD commands (`/gsd-quick`, `/gsd-debug`, `/gsd-execute-phase`) so planning artifacts stay in sync; avoid ad-hoc edits unless user bypasses.
- **Infrastructure:** Zero external services default; SQLite default store; WebSocket canonical transport (Phase 2+); relay lifecycle independent of one participant.
- **Stack:** Node LTS, `better-sqlite3`, Zod 4 with `z.toJSONSchema()`, `uuid`, `vitest`, `tsup` per embedded STACK excerpt.

`AGENTS.md` (workspace): document discipline when editing docs — sync authoritative sources; not repeated here as implementation constraints for this phase.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **zod** | **4.3.6** [VERIFIED: npm registry 2026-04-10] | Runtime validation + inferred TS types | Product constraint; native JSON Schema export |
| **better-sqlite3** | **12.8.0** [VERIFIED: npm registry 2026-04-10] | Sync SQLite API | Single-process relay; WAL + `timeout` for busy handling |
| **uuid** | **13.0.0** [VERIFIED: npm registry 2026-04-10] | RFC9562 UUIDs including **v7** | `import { v7 as uuidv7 } from 'uuid'` — Unix epoch time-based, sortable |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **typescript** | ^5.9.3 (lib) per STACK.md | Types | Greenfield package + `declaration` |
| **tsup** | ^8.5.1 per STACK.md | Build ESM/CJS + dts | Publish protocol as consumable package |
| **vitest** | **4.1.4** [VERIFIED: npm registry 2026-04-10] | Unit + integration tests | Zod snapshot tests; SQLite temp file tests |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `uuid` v7 | `ulidx` / custom | `uuid` already in STACK; RFC9562 + battle-tested |
| Native `z.toJSONSchema()` | `zod-to-json-schema` | Third-party only if native gaps on your schemas [CITED: STACK.md] |
| Discriminated union on `kind` | Single object + `kind` enum | Union only if payload types differ materially |

**Installation (illustrative):**

```bash
npm install zod better-sqlite3 uuid
npm install -D typescript tsup vitest @types/node @types/better-sqlite3
```

## Architecture Patterns

### Recommended layout (consumable module)

Aligns with `.planning/research/ARCHITECTURE.md`; Phase 1 narrows to protocol + persistence only:

```text
packages/
  protocol/
    src/
      envelope.ts          # Zod schemas + parse helpers
      handshake.ts         # supportedVersions types + overlap helper (pure)
      json-schema/         # build script writes envelope.schema.json
      index.ts
  persistence/             # optional split; may live under protocol/db for tiny monorepo
    src/
      db.ts                # openDatabase(): WAL, foreign_keys, timeout
      migrate.ts           # apply numbered SQL migrations + schema_version
      repositories/
        sessions.ts
    migrations/
      001_initial.sql
```

**Boundary:** No WebSocket, no process spawn — **pure validation + DB** so Phase 2 relay imports `protocol` and `persistence` unchanged.

### Envelope schema (flat object, JSON-Schema-friendly)

- **Base fields:** `version`, `id`, `sessionId`, `kind`, `type`, `payload`, optional `idempotencyKey`, `seq`, plus **D-03** addressing (`to`, `spaceId`, or other space-delivery fields as decided in PLAN).
- **Primitives:** Use `z.string().uuid()` for UUID strings [CITED: zod.dev v4 JSON Schema — maps to `format: uuid`]. Session IDs are v7 strings — still valid UUID strings; optional **refine** with `uuid.version(id) === 7` from `uuid` for stricter checks on `sessionId` only [VERIFIED: uuid package `version()`].
- **`payload`:** Start with `z.record(z.string(), z.unknown())` or `z.looseObject()` if you must allow arbitrary keys **and** export JSON Schema — avoid `.transform()` on the envelope if you need accurate Schema export [CITED: v4.zod.dev/json-schema — transform unrepresentable].
- **`kind`:** `z.enum(['control', 'conversation'])`. If later payloads differ by kind, split into `z.discriminatedUnion('kind', [controlSchema, conversationSchema])` [VERIFIED: Context7 Zod v4].

### Zod → JSON Schema (`z.toJSONSchema()`)

- Default target **draft-2020-12** [CITED: https://v4.zod.dev/json-schema].
- **Do not** use on the envelope path: `z.transform`, `z.custom`, `z.date()`, `bigint`, `z.undefined()` as required fields — they throw or are unsound for export [CITED: v4.zod.dev/json-schema `unrepresentable`].
- Use **`z.object({...})`** defaults: `additionalProperties: false` in output mode — matches strict stripping [CITED: v4.zod.dev/json-schema].
- Add **titles/descriptions** via `.meta({ title, description })` for generated schema documentation [CITED: v4.zod.dev/json-schema].
- For multi-schema bundles, use **registry** with `id` on each schema and `z.toJSONSchema(registry, { uri: ... })` [CITED: v4.zod.dev/json-schema].

### better-sqlite3 setup

- After open: `db.pragma('journal_mode = WAL');` [VERIFIED: better-sqlite3 docs / Context7].
- `db.pragma('foreign_keys = ON');` recommended for referential integrity when Phase 2 tables land.
- **Busy handling:** `new Database(path, { timeout: 5000 })` — milliseconds to wait on lock before `SQLITE_BUSY` [VERIFIED: better-sqlite3 `api.md` via Context7]. STACK also mentions `busy_timeout` pragma — equivalent concern; pick one consistent approach per codebase.
- **Synchronous = NORMAL** often paired with WAL for local daemons [CITED: better-sqlite3 performance docs via Context7] — validate durability expectations for your threat model.

### Migration file pattern

- Numbered files: `001_sessions.sql`, `002_....sql` — apply in order; record in `schema_version(version INTEGER PRIMARY KEY, applied_at TEXT)`.
- Single integer **schema version** per D-09 analogy for DB (D-08: `schema_version` table) — bump on each migration.
- On startup: transaction wrapping `CREATE TABLE IF NOT EXISTS` migrations or idempotent `PRAGMA user_version` alternative — **manual SQL only** per D-07 (no Drizzle in Phase 1).

### Protocol versioning (handshake)

- Represent **supported range** as `{ minVersion: number, maxVersion: number }` with `min <= max` [ASSUMED: wire naming camelCase per discretion].
- **Overlap test:** ranges overlap iff `client.max >= relay.min && client.min <= relay.max` [ASSUMED: interval intersection].
- **Agreed version:** common choice is `min(relay.max, client.max)` clamped to ≥ both `min` sides — document explicitly in PLAN so all implementations match [ASSUMED].
- On failure: structured error envelope including relay’s supported range (D-10).

### Idempotency implementation

- **Key:** UUID string (D-11); validate format with Zod on envelope when present.
- **Store:** table keyed by `(idempotency_key)` or `(session_id, idempotency_key)` depending on whether keys are globally unique [ASSUMED: global UUID → single column PK sufficient].
- **Flow:** on state-changing op, `INSERT` key + timestamp; if unique violation, return prior outcome idempotently [ASSUMED: or short-circuit before side effect].
- **Eviction:** periodic `DELETE FROM idempotency_keys WHERE first_seen_at < ?` with threshold = now − window (5 min default D-12); run after successful ops or on timer [ASSUMED].
- **Conflict with D-08:** Phase 1 locked tables are `sessions` + `schema_version` only — if dedup table is **not** added in Phase 1, document PROTO-03 as **wire + validation + in-memory test double**, with relay-backed table in Phase 2 (planner must reconcile).

### Anti-patterns to avoid

- **CP7 / PITFALLS:** Wire version only in TS types — envelope `version` + handshake required [from `.planning/research/PITFALLS.md`].
- **Transforms on exported schemas** — breaks or unsound JSON Schema [CITED: Zod docs].
- **Session id = WebSocket connection id** — CP6; persist UUID v7 per adapter [from PITFALLS.md].

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID v7 | Timestamp + random concatenation | `uuid/v7` | RFC9562; monotonicity within ms via `seq` option [VERIFIED: uuid README] |
| JSON Schema from Zod | Custom converter | `z.toJSONSchema()` | Maintained mapping; registries for `$defs` [CITED: zod.dev] |
| SQLite busy retries | Busy-wait loops | `timeout` option + WAL | Library + SQLite semantics [VERIFIED: better-sqlite3] |
| Schema migration framework | Ad-hoc `exec` scattered | Numbered SQL + runner | D-07 explicit |

## Common Pitfalls

### Pitfall 1: JSON Schema export fails on envelope

**What goes wrong:** `z.toJSONSchema(envelope)` throws at build time.  
**Why:** `transform`, `custom`, or `date` sneaks into schema.  
**How to avoid:** Keep envelope path to primitives, `record`/`object`, `enum`, `optional`; integration test that calls `z.toJSONSchema` in CI.

### Pitfall 2: `SQLITE_BUSY` under WAL

**What goes wrong:** Spurious errors if `timeout` too low or writers hold transactions across I/O.  
**Why:** Single-writer SQLite; WAL allows concurrent reads but writes still serialize [CITED: SQLite WAL model / PITFALLS CP5].  
**How to avoid:** `timeout` 5s+; short transactions; single writer process for relay DB [from PITFALLS.md].

### Pitfall 3: Discriminated union overkill

**What goes wrong:** Two parallel schema trees drift when D-01 says same envelope shape.  
**Why:** Extra branches for control vs conversation without payload divergence.  
**How to avoid:** Single `z.object` + `kind` enum until payloads differ; then refactor to `discriminatedUnion`.

### Pitfall 4: Idempotency without eviction

**What goes wrong:** Table grows forever.  
**Why:** Only insert, no TTL sweep.  
**How to avoid:** Bounded window (D-12) + delete job + index on `first_seen_at` [ASSUMED].

## Code Examples

### UUID v7 session id

```typescript
// Source: https://www.npmjs.com/package/uuid/v/13.0.0
import { v7 as uuidv7 } from "uuid";

const sessionId = uuidv7();
```

### better-sqlite3 open + WAL + timeout

```typescript
// Source: Context7 /wiselibs/better-sqlite3 + api.md
import Database from "better-sqlite3";

const db = new Database("talkie.db", { timeout: 5000 });
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
```

### Kind + JSON Schema–safe envelope fragment

```typescript
// Source: Zod 4 — https://v4.zod.dev/json-schema
import * as z from "zod";

const envelopeCore = z.object({
  version: z.number().int().positive(),
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  kind: z.enum(["control", "conversation"]),
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().uuid().optional(),
  seq: z.number().int().nonnegative().optional(),
});

// z.toJSONSchema(envelopeCore, { target: "draft-2020-12" });
```

### Version range overlap

```typescript
// [ASSUMED] common interval overlap — verify in PLAN as normative
export function rangesOverlap(
  a: { min: number; max: number },
  b: { min: number; max: number },
): boolean {
  return a.max >= b.min && a.min <= b.max;
}
```

## Testing patterns (Zod + SQLite)

> **Note:** `workflow.nyquist_validation` is `false` in `.planning/config.json` — no formal REQ→test matrix for this milestone; still use automated tests for protocol and DB.

### Zod schemas

- **`safeParse` fixtures:** Table-driven tests with `{ name, input, ok, expectedIssuePath }` covering valid envelopes, wrong `kind`, bad UUIDs, missing `version`, oversize strings [ASSUMED: project convention].
- **JSON Schema build smoke:** Assert `z.toJSONSchema(envelopeSchema)` does not throw and includes required keys (`properties.version`, etc.) — catches regressions when adding unrepresentable refinements [CITED: zod.dev].
- **Type tests (optional):** `expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<...>()` with Vitest + `@vitest/expect-type` if added [ASSUMED].

### SQLite / better-sqlite3

- **`:memory:` or temp file:** `new Database(':memory:')` for fast unit tests; run full `migrate()` then repository methods [VERIFIED: better-sqlite3 supports `:memory:`].
- **Isolation:** Each test file gets a fresh DB or wraps in `transaction` + rollback pattern (`db.transaction(() => { ... })()` rollback via try/catch) [ASSUMED].
- **WAL pragma:** Optionally assert `db.pragma('journal_mode', { simple: true }) === 'wal'` after open helper [VERIFIED: Context7 pragma example].

### Integration touchpoints

- Golden **JSON files** for envelope examples consumed by both Zod tests and (later) non-TS consumers against exported JSON Schema [ASSUMED: discretionary per CONTEXT].

## State of the Art

| Old Approach | Current Approach | When | Impact |
|--------------|------------------|------|--------|
| `zod-to-json-schema` only | Zod 4 native `z.toJSONSchema()` | Zod 4 stable | Fewer deps; registries / draft targets [CITED: zod.dev] |
| UUID v1/v4 for sortable ids | UUID v7 (RFC9562) | uuid@10+ | Time-orderable session ids [VERIFIED: uuid package] |
| rollback journal default | WAL for concurrent readers | SQLite 3.7+ | Throughput for relay + tools reading DB |

**Deprecated/outdated:** Optional envelope `version` string — D-09 locks integer only.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Agreed protocol version = clamped max of overlapping ranges | Protocol versioning | Interop bugs if client/relay pick different rules |
| A2 | `z.record(z.string(), z.unknown())` exports acceptably for `payload` | Code Examples | May need `looseObject` or OpenAPI `additionalProperties` tuning |
| A3 | Idempotency durable table can wait for Phase 2 if D-08 is strict | Open Questions | PROTO-03 partially unmet if only types ship |

## Open Questions

1. **Idempotency table vs D-08**  
   - What we know: D-08 lists only `sessions` and `schema_version` for Phase 1; PROTO-03 still maps to Phase 1.  
   - What’s unclear: Whether `idempotency_keys` (or similar) is added in Phase 1 anyway, or dedup storage is deferred to relay Phase 2.  
   - Recommendation: Planner confirms with user once; if deferred, Phase 1 still adds Zod optional + tests and documents relay behavior.

2. **Exact addressing fields on envelope (D-03)**  
   - What we know: `to` and space-scoped delivery semantics are required.  
   - What’s unclear: Field names and optional vs required per message kind.  
   - Recommendation: Define in PLAN.md; keep schemas JSON-Schema-friendly.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v22.14.0 [VERIFIED: local probe 2026-04-10] | Use >=20 per STACK |
| npm | Install / scripts | ✓ | 10.9.2 | — |
| better-sqlite3 native build | SQLite driver | ✓ [ASSUMED: darwin dev machine] | 12.8.0 npm | Document `node-gyp` toolchain if prebuild missing |

**Missing dependencies with no fallback:** None for Phase 1 research.

## Security Domain

Applicable to this phase (input validation + identifiers):

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V5 Input Validation | yes | Zod on all parsed wire JSON; max sizes on strings (`type`, `payload` depth/size limits) [ASSUMED: caps in PLAN] |
| V2 Authentication | no | Handshake auth deferred (ARCHITECTURE-CONSTRAINTS open questions) |
| V6 Cryptography | partial | UUIDs via `uuid` (crypto RNG) [VERIFIED: uuid package]; no custom crypto |

| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Oversized / deeply nested JSON | DoS | `max` on message size at relay boundary [Phase 2]; Zod limits where possible |
| Injection via `type` / metadata | Tampering | Treat as opaque labels + allowlists per op class [ASSUMED: Phase 2] |

## Sources

### Primary (HIGH confidence)

- [Zod 4 — JSON Schema](https://v4.zod.dev/json-schema) — `z.toJSONSchema()`, unrepresentable types, registries, object/additionalProperties
- Context7 `/websites/zod_dev_v4` — `z.discriminatedUnion` v4 behavior
- Context7 `/wiselibs/better-sqlite3` — PRAGMA WAL, performance notes
- better-sqlite3 `api.md` (via Context7) — `Database` constructor `timeout`
- [npm uuid 13.0.0](https://www.npmjs.com/package/uuid/v/13.0.0) — `v7()`, RFC9562
- npm registry `npm view` (2026-04-10) — zod 4.3.6, better-sqlite3 12.8.0, uuid 13.0.0, vitest 4.1.4

### Secondary (MEDIUM)

- `.planning/research/STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md` — project-specific alignment
- `PRD.md`, `ARCHITECTURE-CONSTRAINTS.md` — constraints

### Tertiary (LOW / assumptions)

- Interval overlap as version negotiation — common pattern; not tied to a single RFC for this product

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — npm + official Zod/SQLite/uuid docs
- Architecture: **HIGH** — aligns with existing ARCHITECTURE research + CONTEXT decisions
- Pitfalls: **HIGH** for Zod/SQLite; **MEDIUM** for idempotency table placement vs D-08

**Research date:** 2026-04-10  
**Valid until:** ~2026-05-10 (re-check Zod/patch minors sooner if upgrading majors)

---

*Phase: 01-protocol-persistence-foundation*
