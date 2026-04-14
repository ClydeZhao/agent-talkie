---
phase: 05-cross-runtime-proof-human-oversight
plan: 04
subsystem: cli
tags: [sqlite, oversight, commander, vitest, relay]

requires:
  - phase: 05-cross-runtime-proof-human-oversight
    provides: relay.sqlite path alignment, oversight repository queries from persistence
provides:
  - Static `talkie space status`, `talkie transcript`, `talkie who` against local relay DB
  - Possibly-blocked inference (120s silence) and label formatter for watch (05-05)
  - Session list redirect and OVER-03 transcript help string
affects:
  - 05-05 watch plan
  - operator workflows reading collaboration state offline

tech-stack:
  added: ["@agent-talkie/persistence", "@agent-talkie/protocol", "@agent-talkie/client"]
  patterns:
    - "openRelayDatabase() joins resolveAgentTalkieDataDir() with RELAY_SQLITE_BASENAME"
    - "tsup external list for better-sqlite3 and workspace packages"

key-files:
  created:
    - packages/cli/src/oversight/db.ts
    - packages/cli/src/oversight/format.ts
    - packages/cli/src/oversight/possibly-blocked.ts
    - packages/cli/src/oversight/static-commands.ts
    - packages/cli/src/oversight/possibly-blocked.test.ts
  modified:
    - packages/cli/src/cli.ts
    - packages/cli/src/cli.test.ts
    - packages/cli/package.json
    - packages/cli/tsup.config.ts
    - package-lock.json

key-decisions:
  - "Externalize @agent-talkie/* and better-sqlite3 in CLI bundle so native addon loads from node_modules"
  - "Transcript JSON uses JSON.parse with a small sentinel object on invalid JSON instead of failing the command"

patterns-established:
  - "Oversight read path: resolveAgentTalkieDataDir + relay.sqlite matches daemon"

requirements-completed: [OVER-01, OVER-02, OVER-03, MHUM-01]

duration: 3min
completed: 2026-04-14
---

# Phase 05 Plan 04: Static oversight CLI Summary

**SQLite-backed `talkie space status`, `transcript`, and `who` plus 120s possibly-blocked inference, with OVER-03 non-injection called out in help — prerequisite for live `talkie watch`.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-14T03:01:51Z (approx., first task commit)
- **Completed:** 2026-04-14T03:03:39Z
- **Tasks:** 2 (implementation + checkpoint)
- **Files modified:** 10 (incl. new oversight modules and lockfile)

## Accomplishments

- Static oversight commands read the same `relay.sqlite` as the relay daemon via `resolveAgentTalkieDataDir`.
- `space status` emits pretty JSON including `ownerSessionId` (MHUM-01 visibility).
- `transcript` and `who` implement tail read and TSV membership table; transcript help documents that the command does not inject into agent sessions (OVER-03).
- D-08 possibly-blocked heuristic (`POSSIBLY_BLOCKED_SILENCE_MS = 120000`) covered by Vitest.

## Task Commits

1. **Task 1: Static oversight commands (TDD RED)** — `b96a1c7` (test)
2. **Task 1: Static oversight commands (GREEN)** — `102ee02` (feat)

**Checkpoint (Task 2):** `checkpoint:human-verify` — ⚡ **Auto-approved** (`approved`) in auto-chain mode after Task 1 automated verify (`npm run test` / `npm run build` for `@agent-talkie/cli`) and presence of `packages/cli/dist/cli.js`. Manual numbered steps against a live `phase5-uat` space were not run in this executor context.

## Files Created/Modified

- `packages/cli/src/oversight/db.ts` — `RELAY_SQLITE_BASENAME`, `openRelayDatabase()`
- `packages/cli/src/oversight/possibly-blocked.ts` — silence window + inference
- `packages/cli/src/oversight/format.ts` — `blocked` / `possibly-blocked` labels
- `packages/cli/src/oversight/static-commands.ts` — status / transcript / who runners
- `packages/cli/src/oversight/possibly-blocked.test.ts` — behavior tests
- `packages/cli/src/cli.ts` — command wiring and session list redirect
- `packages/cli/src/cli.test.ts` — integration expectation for redirect
- `packages/cli/tsup.config.ts` — bundle externals for native/workspace packages
- `packages/cli/package.json` / `package-lock.json` — workspace dependencies

## Decisions Made

- Bundle externals for `better-sqlite3` and `@agent-talkie/*` packages so the CLI dist remains a thin ESM entry that resolves native and workspace code at runtime.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Update CLI integration test for session list redirect**
- **Found during:** Task 1 (`npm run test -w @agent-talkie/cli`)
- **Issue:** `cli.test.ts` still expected the removed Phase 4 stub string on stdout.
- **Fix:** Assert stderr message `Use: talkie who --slug <slug>` and empty stdout with exit 0.
- **Files modified:** `packages/cli/src/cli.test.ts`
- **Verification:** `npm run test -w @agent-talkie/cli` passes
- **Committed in:** `102ee02`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test alignment only; behavior matches plan.

## Issues Encountered

None beyond the integration test expectation drift, resolved before Task 1 completion.

## User Setup Required

None for code paths; live relay + a space with slug `phase5-uat` is only needed for the human checklist in the plan (auto-approved here).

## Next Phase Readiness

- Ready for **05-05** (`talkie watch`) to consume `inferPossiblyBlockedSessionIds` / `formatPossiblyBlockedLabel`.
- Human can still run the numbered `how-to-verify` steps from `05-04-PLAN.md` locally when convenient.

## Known Stubs

None introduced for this plan’s stated deliverables.

## Threat Flags

None beyond plan threat register (local SQLite read only).

## Self-Check: PASSED

- `packages/cli/dist/cli.js` exists
- Commits `b96a1c7`, `102ee02` on current branch

---
*Phase: 05-cross-runtime-proof-human-oversight*
*Completed: 2026-04-14*
