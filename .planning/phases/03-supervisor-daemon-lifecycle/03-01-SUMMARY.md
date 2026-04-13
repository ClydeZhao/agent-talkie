---
phase: 03-supervisor-daemon-lifecycle
plan: "01"
subsystem: relay
tags: [websocket, sqlite, health, daemon, lifecycle]

requires:
  - phase: 02
    provides: prior relay protocol and persistence usage
provides:
  - Forkable relay daemon with lockfile and IPC ready payload
  - Loopback health URL with generation token
  - Idle shutdown and bounded graceful close on signals
affects:
  - 03-supervisor-daemon-lifecycle
  - supervisor lockfile liveness checks (Plan 02)

tech-stack:
  added: [env-paths@4.0.0]
  patterns:
    - Health gate via shared secret query param (no token logging)
    - tsup `splitting: false` for standalone `dist/daemon.js` entry detection

key-files:
  created:
    - packages/relay/src/daemon.ts
    - packages/relay/src/daemon.test.ts
  modified:
    - packages/relay/src/server.ts
    - packages/relay/tsup.config.ts
    - packages/relay/package.json
    - packages/relay/src/index.ts

key-decisions:
  - "Disable ESM code splitting for relay tsup so `import.meta.url` in daemon entry matches `dist/daemon.js` (shared chunk broke CLI auto-start)."
  - "Import `WebSocket` as a value in `server.ts` so d.ts generation succeeds for `readyState` checks."

patterns-established:
  - "Idle shutdown: schedule when `wss.clients.size === 0` after listen and after each close/error; clear on new connection."
  - "Graceful close: `close(1001, relay_shutdown)` then up to 2000ms wait, then `terminate()` remaining clients."

requirements-completed: [RELAY-07]

duration: ""
completed: 2026-04-13
---

# Phase 03 Plan 01: Relay daemon lifecycle hooks — Summary

**Relay gains a forkable daemon, generation-token health checks, idle shutdown after the last WebSocket closes, and bounded signal shutdown — enabling supervisor lockfile liveness without orphaning SQLite.**

## Performance

- **Duration:** (not measured)
- **Completed:** 2026-04-13
- **Tasks:** 3
- **Files modified:** 6 (plus root `package-lock.json`)

## Accomplishments

- `createRelayServer` supports `relayGenerationToken`, `idleShutdownMs` + `onIdleShutdown`, fixed `port: 0` binding, and a 2s polite WebSocket close phase before `terminate()`.
- `runRelayDaemon()` resolves data dir (`AGENT_TALKIE_DATA_DIR` or XDG via `env-paths`), writes `relay.lock`, emits `relay.ready` over IPC when forked, and handles SIGINT/SIGTERM with a 10s hard cap.
- `dist/daemon.js` is built and exported as `@agent-talkie/relay/daemon`; Vitest covers health (200/403/405) and idle callback timing.

## Task Commits

Each task was committed atomically:

1. **Task 1: createRelayServer — health, idle timer, graceful close phase** — `2098333` (feat)
2. **Task 2: daemon entry — data dir, lockfile, IPC ready, signals** — `7d2fc03` (feat; includes `WebSocket` value import fix for dts)
3. **Task 3: Build entry, exports, and tests** — `9ce5d53` (feat)

## Files Created/Modified

- `packages/relay/src/server.ts` — Health route, idle scheduling, polite close, `DEFAULT_RELAY_IDLE_SHUTDOWN_MS`, port binding fix.
- `packages/relay/src/daemon.ts` — Daemon entry, lockfile, env parsing, signals, ESM CLI guard.
- `packages/relay/tsup.config.ts` — Entries `index` + `daemon`; `splitting: false` for runnable daemon bundle.
- `packages/relay/package.json` — `env-paths`, `./daemon` export.
- `packages/relay/src/index.ts` — Re-exports for library consumers.
- `packages/relay/src/daemon.test.ts` — Health and idle shutdown tests.
- `package-lock.json` — Workspace lockfile for `env-paths`.

## Deviations from Plan

### Auto-fixed / follow-up fixes

**1. [Rule 3 — Blocking] DTS build: `WebSocket` used as value while `import type` only**

- **Found during:** Task 2 verify (`npm run build -w @agent-talkie/relay`)
- **Fix:** Import `WebSocket` as a runtime value alongside `WebSocketServer` in `server.ts`.
- **Commit:** `7d2fc03`

**2. [Rule 3 — Blocking] Daemon CLI: shared tsup chunk made `import.meta.url` point at chunk, not `daemon.js`**

- **Found during:** Manual smoke of `node packages/relay/dist/daemon.js`
- **Fix:** Set `splitting: false` in `packages/relay/tsup.config.ts` so the daemon entry is self-contained and the ESM entry guard runs.
- **Commit:** `9ce5d53`

Otherwise the plan was executed as written.

## Known Stubs

None — health, idle, daemon lock/IPC, and tests are wired to real behavior.

## Threat Flags

None beyond the plan’s threat model (health gated by `generation`; idle/exit are local-trust boundaries).

## Verification

- `npm run test -w @agent-talkie/relay` — pass (16 tests).
- `npm run build -w @agent-talkie/relay` — pass.
- Manual: `AGENT_TALKIE_DATA_DIR` temp + long idle + `node packages/relay/dist/daemon.js` + `curl` health with generation from `relay.lock` — 200 with expected JSON.

## Self-Check: PASSED

- `packages/relay/src/daemon.ts` exists.
- `packages/relay/dist/daemon.js` produced by build (standalone bundle).
- Commits `2098333`, `7d2fc03`, `9ce5d53` present on branch.
