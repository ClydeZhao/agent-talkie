---
phase: 03-supervisor-daemon-lifecycle
plan: "03"
subsystem: cli
tags: [commander, supervisor, relay, ping, vitest, bin]

requires:
  - phase: 03
    provides: ensureRelayRunning, stopRelay, getRelayStatus (Plan 02)
provides:
  - npm `talkie` bin via `@agent-talkie/cli` (CLI-01)
  - relay start|ensure|stop|status, ping, session list stub (CLI-02, CLI-03)
affects:
  - automation and npx-style invocation of relay lifecycle

tech-stack:
  added: [commander@14.0.3, @agent-talkie/cli workspace]
  patterns:
    - tsup ESM banner shebang for runnable `dist/cli.js`
    - Vitest spawns built CLI with `spawnSync` for stdout contracts

key-files:
  created:
    - packages/cli/package.json
    - packages/cli/tsconfig.json
    - packages/cli/tsup.config.ts
    - packages/cli/src/cli.ts
    - packages/cli/src/cli.test.ts
    - packages/cli/vitest.config.ts
  modified:
    - package.json
    - packages/supervisor/src/ensure-relay.ts

key-decisions:
  - "Forked relay daemon uses stdio ignore on fd 0–2 so piped parents (Vitest, tooling) never deadlock; IPC remains on fd 3."
  - "child.unref() after disconnect so `talkie relay start` exits while the daemon stays up."

patterns-established:
  - "`talkie ping` shares ensure path with automation: ensureRelayRunning then loopback health with generation query param."

requirements-completed: [CLI-01, CLI-02, CLI-03]

duration: ""
completed: 2026-04-13
---

# Phase 03 Plan 03: Commander `talkie` CLI — Summary

**`@agent-talkie/cli`** ships a **`talkie` bin** (commander 14.0.3, ESM + shebang via tsup) with **relay** subcommands (**start**, **ensure**, **stop**, **status**), **`ping`** (ensure + health), and **`session list`** stub text for Phase 4. Root **build** and **test** scripts include the CLI workspace.

## Performance

- **Duration:** (not measured)
- **Completed:** 2026-04-13
- **Plan tasks:** 3
- **Extra commit:** supervisor fork lifecycle fix (required for CLI + tests)

## Accomplishments

- `packages/cli/dist/cli.js` is the published-style entry; first line is `#!/usr/bin/env node`.
- Relay commands call `@agent-talkie/supervisor`; output matches plan strings (`relay port=… spawned=…`, JSON one-liners for stop/status, `ping ok port=…`).
- Vitest locks **session list** stub and **relay start → ping** behavior under `AGENT_TALKIE_DATA_DIR` + `AGENT_TALKIE_RELAY_PORT=0`.

## Task Commits

Each plan task was committed atomically (Task 1–2 on branch before this completion; Task 3 + supporting fix in this session):

1. **Task 1: Scaffold @agent-talkie/cli + tsup bin** — `422eb74` (feat)
2. **Task 2: Commander wiring — relay, ping, session** — `79ce962` (feat)
3. **Supervisor fix: fork stdio + unref** — `5306fc4` (fix; see Deviations)
4. **Task 3: Vitest for CLI output contracts** — `473ef85` (test)

## Files Created/Modified

- `packages/cli/package.json` — `bin.talkie`, commander + supervisor deps, pretest build chain.
- `packages/cli/tsup.config.ts` — ESM, shebang banner, `dts: false`.
- `packages/cli/src/cli.ts` — Commander tree and supervisor/fetch wiring.
- `packages/cli/src/cli.test.ts` — Spawn `dist/cli.js` contract tests.
- `package.json` — Root build/test include `@agent-talkie/cli`.
- `packages/supervisor/src/ensure-relay.ts` — Detached stdio + `unref` after successful fork (CLI exit + no `spawnSync` pipe deadlock).

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Bug] CLI hung after `relay start` (event loop held by forked child)**

- **Found during:** Task 3 / manual `node packages/cli/dist/cli.js relay start`
- **Fix:** Call `child.unref()` after `disconnect()` in `ensureRelayRunning` so the parent process can exit.
- **Commit:** `5306fc4`

**2. [Rule 3 — Blocking] Vitest `spawnSync` hung on relay integration test (pipe deadlock)**

- **Found during:** `npm run test -w @agent-talkie/cli`
- **Issue:** Daemon inherited parent stdout/stderr; with piped `spawnSync`, the child daemon kept pipe writers open so Node never finished draining the CLI’s stdout pipe.
- **Fix:** Fork relay with `stdio: ["ignore", "ignore", "ignore", "ipc"]` (keep IPC only).
- **Commit:** `5306fc4`

Otherwise behavior matches the plan command tree and output contracts.

## Known Stubs

- **`session list`** — prints `not implemented (Phase 4)` by design (CLI-02 stub).

## Threat Flags

None beyond the plan threat model (commander parsing only; fixed health path; local stop capability).

## Verification

- `npm run build -w @agent-talkie/cli` — pass.
- `npm run test -w @agent-talkie/cli` — pass (2 tests).
- `npm run test` (repo root) — pass.
- Manual: `AGENT_TALKIE_DATA_DIR=$(mktemp -d) AGENT_TALKIE_RELAY_PORT=0 node packages/cli/dist/cli.js ping` — prints `ping ok port=…` without a pre-running relay.

## Self-Check: PASSED

- `packages/cli/src/cli.test.ts` exists.
- `packages/cli/dist/cli.js` first line is `#!/usr/bin/env node`.
- Commits `422eb74`, `79ce962`, `5306fc4`, `473ef85` present on branch.
