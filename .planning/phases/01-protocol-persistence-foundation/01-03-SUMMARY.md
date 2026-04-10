---
phase: 01-protocol-persistence-foundation
plan: "03"
subsystem: database
tags: [better-sqlite3, sqlite, migrations, vitest, wal]

requires:
  - phase: 01-protocol-persistence-foundation
    provides: Monorepo workspaces and protocol package from prior plans
provides:
  - "@agent-talkie/persistence with openDatabase (WAL, foreign_keys, busy timeout) and migrate()"
  - Numbered SQL migration 001_initial.sql (sessions, spaces, memberships, idempotency_keys, schema_version)
affects:
  - Phase 2 relay (durable registry and idempotency storage)
  - Plan 01-04 session/idempotency repositories

tech-stack:
  added: [better-sqlite3, @types/better-sqlite3]
  patterns:
    - "Manual numbered *.sql migrations with schema_version ledger and transactional apply"
    - "Persistence package ships ESM-only so bundled import.meta.url resolves ../migrations from dist/"

key-files:
  created:
    - packages/persistence/package.json
    - packages/persistence/tsconfig.json
    - packages/persistence/tsup.config.ts
    - packages/persistence/vitest.config.ts
    - packages/persistence/migrations/001_initial.sql
    - packages/persistence/src/db.ts
    - packages/persistence/src/migrate.ts
    - packages/persistence/src/index.ts
    - packages/persistence/src/migrate.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Ship @agent-talkie/persistence as ESM-only (no dist .cjs): tsup CJS output left import.meta empty and would break migrations path resolution."
  - "Bootstrap isMigrationApplied by checking sqlite_master for schema_version before querying versions, so first migration can create the ledger table."

patterns-established:
  - "openDatabase(path): timeout 5000ms, journal_mode WAL, foreign_keys ON"
  - "migrate(db): lexicographic *.sql, numeric filename prefix as version, skip if already recorded"

requirements-completed: [PROTO-03]

duration: 12min
completed: 2026-04-10
---

# Phase 1 Plan 03: SQLite persistence and migrations Summary

**`@agent-talkie/persistence` with better-sqlite3 `openDatabase` (WAL, foreign keys, 5s busy timeout), a transactional `migrate()` runner over numbered SQL files, and `001_initial.sql` defining sessions, spaces, memberships, and `idempotency_keys` for durable PROTO-03 dedup.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-10T10:32:00Z
- **Completed:** 2026-04-10T10:44:30Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- New workspace package `@agent-talkie/persistence` aligned with protocol tooling (TypeScript 5.9, tsup, vitest).
- Initial DDL matches D-07/D-08 plus `idempotency_keys` with index on `first_seen_at` for TTL pruning (D-12).
- Root `npm test` runs protocol and persistence workspaces.

## Task Commits

Each task was committed atomically:

1. **Task 1: packages/persistence package and migration SQL** — `708eb48` (feat)
2. **Task 2: openDatabase and migrate runner** — `945a2de` (feat)
3. **Task 3: Migration integration test** — `e11150c` (test)

**Plan metadata:** Planning files committed with message `docs(01-03): complete persistence migrations plan` (see `git log -1 --oneline -- .planning/phases/01-protocol-persistence-foundation/01-03-SUMMARY.md`).

## Files Created/Modified

- `packages/persistence/migrations/001_initial.sql` — schema_version, sessions, spaces, space_memberships, idempotency_keys + index.
- `packages/persistence/src/db.ts` — `openDatabase` with WAL, foreign_keys, `timeout: 5000`.
- `packages/persistence/src/migrate.ts` — reads `../migrations` from bundled `import.meta.url`, applies pending versions in a transaction.
- `packages/persistence/src/index.ts` — exports `openDatabase`, `migrate`.
- `packages/persistence/src/migrate.test.ts` — `:memory:` migrate + idempotent second run.
- `package.json` — root test script includes `@agent-talkie/persistence`.

## Decisions Made

- ESM-only distribution for persistence (see Deviations) so migration directory resolution stays correct when built to `dist/index.js`.
- `isMigrationApplied` uses `sqlite_master` first so version checks do not run before `schema_version` exists.

## Deviations from Plan

### Planned adjustments

**1. ESM-only build for `@agent-talkie/persistence`**

- **Found during:** Task 2 (tsup build warned that `import.meta` is empty in CJS output)
- **Issue:** Dual ESM+CJS bundle set `import.meta` to `{}` in `dist/index.cjs`, so `fileURLToPath(import.meta.url)` could not resolve the migrations folder for `require()` consumers.
- **Fix:** `tsup` `format: ["esm"]` only; `package.json` exports `import`/`default` to `./dist/index.js` (removed `main` CJS and `require` condition).
- **Files modified:** `packages/persistence/tsup.config.ts`, `packages/persistence/package.json`
- **Verification:** `npm run build -w @agent-talkie/persistence` without import.meta warning; `npm run test -w @agent-talkie/persistence` passes.

**2. Minimal stub `src/index.ts` in Task 1**

- **Found during:** Task 1 verification (`tsup` requires an entry file)
- **Issue:** Plan Task 1 file list did not include `index.ts`; build would fail without an entry.
- **Fix:** Added placeholder `export {}` in Task 1, replaced with real re-exports in Task 2.
- **Files modified:** `packages/persistence/src/index.ts`
- **Committed in:** `708eb48` / `945a2de`

**3. `vitest.config.ts` added with Task 1**

- **Found during:** Task 3 (consistent with `@agent-talkie/protocol` test discovery)
- **Issue:** Plan Task 1 did not list vitest config; default vitest still finds tests, but explicit `environment: node` matches protocol.
- **Fix:** Added `packages/persistence/vitest.config.ts` in Task 1 commit.
- **Committed in:** `708eb48`

---

**Total deviations:** 3 (1 build/export shape, 2 small scaffolding)
**Impact on plan:** Behavior matches plan for ESM consumers; CJS `require` of persistence is not supported until a separate strategy (e.g. copied migrations + `__dirname`) is added if needed.

## Issues Encountered

None beyond the CJS `import.meta` limitation above.

## Known Stubs

None — migrations apply real DDL; tests assert `sessions` and `schema_version`.

## Threat Flags

None beyond plan threat model (trusted migration SQL; idempotency enforcement remains relay logic in later phases).

## User Setup Required

None — native `better-sqlite3` prebuild succeeded on the execution host; other platforms may need a build toolchain if prebuilds are missing.

## Next Phase Readiness

- Persistence package is buildable and tested; ready for 01-04 repositories and restart tests.
- Relay can depend on `openDatabase` + `migrate` + `idempotency_keys` table for durable dedup.

## Self-Check: PASSED

- `packages/persistence/migrations/001_initial.sql` exists.
- Task commits `708eb48`, `945a2de`, `e11150c` and the `docs(01-03): complete persistence migrations plan` commit present in `git log`.

---
*Phase: 01-protocol-persistence-foundation*
*Completed: 2026-04-10*
