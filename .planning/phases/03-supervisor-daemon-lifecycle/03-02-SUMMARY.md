---
phase: 03-supervisor-daemon-lifecycle
plan: "02"
subsystem: relay
tags: [supervisor, fork, ipc, lockfile, health, lifecycle]

requires:
  - phase: 03
    provides: forkable relay daemon, relay.lock, generation health (Plan 01)
provides:
  - "@agent-talkie/supervisor with ensureRelayRunning, stopRelay, getRelayStatus"
  - XDG-aligned data dir helper and lock read/remove + liveness classification
affects:
  - cli integration (later plans in phase 03)

tech-stack:
  added: [@agent-talkie/supervisor workspace]
  patterns:
    - "fork + relay.ready validation + subprocess.disconnect for detached child"
    - "Stale lock: PID probe then loopback health with generation match"

key-files:
  created:
    - packages/supervisor/package.json
    - packages/supervisor/tsconfig.json
    - packages/supervisor/tsup.config.ts
    - packages/supervisor/vitest.config.ts
    - packages/supervisor/src/paths.ts
    - packages/supervisor/src/lockfile.ts
    - packages/supervisor/src/liveness.ts
    - packages/supervisor/src/ensure-relay.ts
    - packages/supervisor/src/ensure-relay.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Use require.resolve path string for fork entry (not fileURLToPath — resolve returns a filesystem path)."
  - "stdio includes a fourth ipc channel so forked children can emit relay.ready; plan text omitted ipc but Node requires it."

patterns-established:
  - "Corrupt relay.lock (on disk but invalid JSON/shape): remove in ensureRelayRunning; stopRelay treats as stale_lock_removed."
  - "getRelayStatus does not unlink stale locks; ensureRelayRunning and stopRelay do when acting."

requirements-completed: [RELAY-04, RELAY-05, RELAY-06]

duration: ""
completed: 2026-04-13
---

# Phase 03 Plan 02: Supervisor daemon lifecycle — Summary

**New `@agent-talkie/supervisor` package:** data-dir resolution, `relay.lock` read/strip, PID + health liveness, and `ensureRelayRunning` via `fork`, strict `relay.ready` handling, and IPC `disconnect` so the relay survives parent exit.

## Performance

- **Duration:** (not measured)
- **Completed:** 2026-04-13
- **Tasks:** 3
- **Files modified:** 11 tracked paths (excluding `dist/`, gitignored)

## Accomplishments

- `resolveAgentTalkieDataDir` matches daemon semantics (trimmed override, then `AGENT_TALKIE_DATA_DIR`, then `env-paths`).
- `readRelayLock` / `removeRelayLock` and `classifyRelayLock` implement the plan’s stale rules (structure in reader; `kill(0)` + `GET /__agent-talkie/v1/health?generation=` in classifier).
- `ensureRelayRunning`, `stopRelay`, and `getRelayStatus` exported; integration test covers spawn, idempotent second call, health check, SIGTERM stop, and status polling.

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold @agent-talkie/supervisor package** — `117ded0` (feat)
2. **Task 2: Lockfile + liveness helpers** — `87020f5` (feat)
3. **Task 3: ensureRelayRunning + stop + status + integration test** — `b84b956` (feat)

4. **Plan summary** — docs commit on branch (this file)

## Files Created/Modified

- `packages/supervisor/src/paths.ts` — Data directory resolution.
- `packages/supervisor/src/lockfile.ts` — `RelayLock` type, read with validation, best-effort remove.
- `packages/supervisor/src/liveness.ts` — Live vs stale via PID and loopback health fetch (5s timeout).
- `packages/supervisor/src/ensure-relay.ts` — Fork daemon, await `relay.ready`, `disconnect`, stop/status helpers.
- `packages/supervisor/src/ensure-relay.test.ts` — End-to-end supervisor + relay in temp `dataDir`.
- `packages/supervisor/src/index.ts` — Public exports.
- Root `package.json` / `package-lock.json` — Build and test wiring for the new workspace.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 — Blocking] `fileURLToPath(require.resolve(...))` throws `Invalid URL`**

- **Found during:** Task 3 (`vitest` run).
- **Fix:** Pass `require.resolve("@agent-talkie/relay/daemon")` directly to `fork` (absolute path string).
- **Commit:** `b84b956`

**2. [Rule 3 — Blocking] `fork` without IPC in `stdio`**

- **Found during:** Task 3 (`vitest` run).
- **Fix:** Set `stdio` to `["ignore", "inherit", "inherit", "ipc"]` so `process.send` / `message` work.
- **Commit:** `b84b956`

**3. [Rule 2 — DTS] `isValidLockBody` type narrowing for `d.ts` emit**

- **Found during:** Task 2 (`npm run build -w @agent-talkie/supervisor`).
- **Fix:** Check `typeof pid === "number"` / `port` before `Number.isInteger`.
- **Commit:** `87020f5`

**4. [Rule 2 — Correctness] `removeRelayLock` must not swallow non-ENOENT errors**

- **Found during:** Implementation review in Task 2.
- **Fix:** Rethrow when `unlinkSync` fails with a code other than `ENOENT`.
- **Commit:** `87020f5`

Otherwise behavior matches the plan’s lock, health, and API contracts.

## Known Stubs

None.

## Threat Flags

None beyond the plan threat model (strict `relay.ready` schema; health ties liveness to generation, not PID alone).

## Verification

- `npm run build -w @agent-talkie/supervisor` — pass.
- `npm run test -w @agent-talkie/supervisor` — pass (1 test).

## Self-Check: PASSED

- `packages/supervisor/src/ensure-relay.ts` exists.
- `packages/supervisor/src/ensure-relay.test.ts` exists.
- Commits `117ded0`, `87020f5`, `b84b956` present on branch.
