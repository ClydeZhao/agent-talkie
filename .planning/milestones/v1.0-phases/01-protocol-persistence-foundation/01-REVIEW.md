---
phase: 01-protocol-persistence-foundation
reviewed: 2026-04-10T12:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - packages/protocol/src/envelope.ts
  - packages/protocol/src/envelope.test.ts
  - packages/protocol/src/handshake.ts
  - packages/protocol/src/handshake.test.ts
  - packages/protocol/src/index.ts
  - packages/protocol/scripts/export-envelope-schema.ts
  - packages/persistence/src/db.ts
  - packages/persistence/src/migrate.ts
  - packages/persistence/src/migrate.test.ts
  - packages/persistence/src/repositories/sessions.ts
  - packages/persistence/src/repositories/sessions.test.ts
  - packages/persistence/src/repositories/idempotency.ts
  - packages/persistence/src/repositories/idempotency.test.ts
  - packages/persistence/src/index.ts
  - packages/persistence/migrations/001_initial.sql
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 01-protocol-persistence-foundation: Code Review Report

**Reviewed:** 2026-04-10T12:00:00Z  
**Depth:** standard  
**Files Reviewed:** 16  
**Status:** issues_found

## Summary

Review covered the protocol envelope and handshake Zod schemas, JSON Schema export script, SQLite open/migrate helpers, and sessions/idempotency repositories plus the initial migration. SQL uses parameterized statements; no hardcoded secrets or dangerous dynamic execution surfaced. Main risks are **data-model and concurrency semantics**: display-name disambiguation is not concurrency-safe, idempotency keys are globally unique at the DB layer without a foreign key to `sessions`, and the migration runner can **silently skip** a second file that shares the same leading numeric version as an already-applied migration. Handshake version overlap logic and envelope validation look consistent for the tested cases.

## Critical Issues

None.

## Warnings

### WR-01: Concurrent `createSession` can produce duplicate `display_name` values

**File:** `packages/persistence/src/repositories/sessions.ts:81-106`  
**Issue:** `createSession` reads all `display_name` values, computes a disambiguated name, then inserts. There is no `UNIQUE` constraint on `display_name` in `001_initial.sql`, and two concurrent transactions can observe the same snapshot of names and insert the same resolved `display_name`. Under multi-writer SQLite (or future connection pooling), UI or routing that assumes unique display names can break.  
**Fix:** Pick one strategy and enforce it end-to-end, for example:

- Add `UNIQUE(display_name)` and handle `SQLITE_CONSTRAINT` with a retry or deterministic suffix; or  
- Wrap read–compute–insert in `BEGIN IMMEDIATE` / single-writer discipline at the relay layer and document that sessions creation must be serialized.

```sql
-- Example direction (requires handling constraint errors in code):
-- ALTER TABLE sessions ADD CONSTRAINT ... UNIQUE(display_name);
-- (SQLite: UNIQUE index on display_name)
```

### WR-02: `idempotency_keys.session_id` is not a foreign key

**File:** `packages/persistence/migrations/001_initial.sql:8-9`  
**Issue:** `idempotency_keys` stores `session_id` but does not reference `sessions(id)`. Inserts are not validated against existing sessions, and deletes on `sessions` do not clean up idempotency rows (unlike `space_memberships`, which uses `REFERENCES ... ON DELETE CASCADE`). Callers can persist keys for bogus or stale session IDs.  
**Fix:** Add a foreign key and cascade behavior consistent with product rules, for example:

```sql
CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  first_seen_at INTEGER NOT NULL
);
```

(Adjust `ON DELETE` if keys must outlive sessions.)

### WR-03: Global idempotency primary key vs per-session semantics

**File:** `packages/persistence/src/repositories/idempotency.ts:9-15`  
**Issue:** The table uses `idempotency_key` as the sole primary key (`001_initial.sql`). `tryRecordIdempotencyKey(db, key, sessionId)` therefore treats the key as **globally** unique: the first `(key, sessionA)` insert succeeds; a later `(key, sessionB)` returns `{ inserted: false }` even though `session_id` differs. The envelope pairs `idempotencyKey` with `sessionId`; many designs scope idempotency **per session**. If the intended behavior is per-session, the second call should succeed.  
**Fix:** If per-session idempotency is required, use a composite primary key and update the insert:

```sql
PRIMARY KEY (session_id, idempotency_key)
```

```ts
// INSERT OR IGNORE with both columns in PK
```

If global uniqueness is intentional, document it next to `tryRecordIdempotencyKey` and in protocol docs so relay authors do not mis-handle multi-session clients.

### WR-04: Duplicate migration numeric prefix silently skips a file

**File:** `packages/persistence/src/migrate.ts:12-15,38-44`  
**Issue:** `migrationVersion` uses only the leading digits of the filename. After `001_initial.sql` applies version `1`, any additional file whose name starts with the same version (e.g. `001_add_index.sql` → version `1`) is skipped because `isMigrationApplied(db, 1)` is true—**without running its SQL**.  
**Fix:** Enforce one file per version (e.g. CI check), or encode version as the full numeric prefix with unique monotonic integers (`002_...`, `003_...`), or change discovery to use a single ordered list / checksum per file rather than collapsing to one integer per multiple files.

## Info

### IN-01: `formatEnvelopeIssues` depends on Zod’s internal issue type

**File:** `packages/protocol/src/envelope.ts:48`  
**Issue:** The callback types `issue` as `z.core.$ZodIssue`, which is an internal-style path in Zod 4. Upgrades may rename or narrow this type and break builds even if runtime behavior is unchanged.  
**Fix:** Prefer a public stable type from Zod’s exported surface (e.g. `z.ZodIssue` if exposed in your version) or infer from `result.error.issues` without asserting an internal module path.

### IN-02: `disambiguateDisplayName` unbounded numeric suffix

**File:** `packages/persistence/src/repositories/sessions.ts:26-30`  
**Issue:** The `for` loop has no upper bound. In practice the set of names is finite; in pathological cases (extremely dense `base-n` names), `n` could grow until numeric precision limits affect string formatting. Extremely low likelihood for this product.  
**Fix:** Optional cap with a clear error, or use a cryptographic/random suffix after N attempts.

---

_Reviewed: 2026-04-10T12:00:00Z_  
_Reviewer: Claude (gsd-code-reviewer)_  
_Depth: standard_
