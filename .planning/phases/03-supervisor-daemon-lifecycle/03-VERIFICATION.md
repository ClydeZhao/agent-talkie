---
phase: 03-supervisor-daemon-lifecycle
verified: 2026-04-13T15:30:00Z
status: passed
score: 14/14
overrides_applied: 0
re_verification: false
---

# Phase 3: Supervisor & daemon lifecycle — Verification Report

**Phase goal:** The local relay daemon starts automatically when needed, enforces single instance, idles down safely, and is operable via npm/npx without separate infrastructure.

**Verified:** 2026-04-13T15:30:00Z  
**Status:** passed  
**Re-verification:** No — initial verification

## Goal achievement

### Roadmap success criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | With no relay running, a normal client or CLI action brings up a local relay without the user manually starting a long-lived process first. | ✓ VERIFIED | `ensureRelayRunning` forks `daemon.js` when lock missing or stale (`packages/supervisor/src/ensure-relay.ts`). CLI `relay start` / `relay ensure` / `ping` call `ensureRelayRunning({})` (`packages/cli/src/cli.ts`). Integration: `ensure-relay.test.ts`, `cli.test.ts`. |
| 2 | Relay keeps running across participant disconnect/reconnect; no session is required to stay connected for the relay to remain valid. | ✓ VERIFIED | Relay process is not the CLI parent: `child.disconnect()` + `child.unref()` after valid `relay.ready` (`ensure-relay.ts`). Liveness is lock + PID probe + health with `generation`, not “any session still connected.” Idle shutdown is explicit policy when `wss.clients.size === 0` for the grace period (`server.ts` + `daemon.ts`), not tied to a single participant lifetime. |
| 3 | Only one relay instance binds locally; stale lockfiles are detectable via generation tokens and documented recovery works. | ✓ VERIFIED | `readRelayLock` + `classifyRelayLock`: `kill(pid,0)` then `GET /__agent-talkie/v1/health?generation=` with JSON `ok` + `generation` match (`liveness.ts`). Invalid lock → remove; live lock → reuse (`ensure-relay.ts`). |
| 4 | When no WebSockets remain and there is no pending protocol state, the relay shuts down or scales down per policy without trapping orphan state. | ✓ VERIFIED | Idle timer when `wss.clients.size === 0` after close/error; `onIdleShutdown` closes relay, unlinks lock, `process.exit(0)` in daemon (`server.ts`, `daemon.ts`). `close()` does polite WS close (1001) then up to 2000ms wait, then `terminate()`, then `wss`/`db`/`server` close (`server.ts`). Test: `daemon.test.ts` idle case. |
| 5 | The package installs with `npm install` or runs via `npx`; CLI exposes relay start/stop/status and session-oriented commands; basic local use does not require the user to manage daemon lifecycle by hand. | ✓ VERIFIED | `@agent-talkie/cli` has `"bin": { "talkie": "./dist/cli.js" }`, commander tree: `relay start|ensure|stop|status`, `ping`, `session list` stub (`packages/cli/package.json`, `cli.ts`). Root `package.json` wires `build`/`test` through all workspaces including CLI. Shebang verified on `dist/cli.js`. *Note:* CI exercises the monorepo workspace and built `dist/cli.js`; install from the public npm registry was not exercised here. |

### Plan must-have truths (consolidated)

| # | Truth (source) | Status | Evidence |
|---|----------------|--------|----------|
| P1 | Idle shutdown after last WebSocket closes and grace (`03-01`) | ✓ VERIFIED | `scheduleIdle` / `clearIdle` on connection and close/error; `idleShutdownMs` + `onIdleShutdown` (`server.ts` L227–L251, L459–L499). |
| P2 | Loopback health URL with shared generation token (`03-01`) | ✓ VERIFIED | `GET /__agent-talkie/v1/health`, 200/403/405 behavior (`server.ts` L199–L222). Tests in `daemon.test.ts`. |
| P3 | SIGINT/SIGTERM bounded shutdown (`03-01`) | ✓ VERIFIED | `SIGNAL_SHUTDOWN_HARD_CAP_MS = 10000`, `closeRelay().finally(...)` (`daemon.ts` L13, L97–L117). `createRelayServer` `close()` implements polite close phase (`server.ts` L504–L558). |
| P4 | Supervisor: live vs stale lock; only remove stale before new relay (`03-02`) | ✓ VERIFIED | `ensure-relay.ts` L60–L73: parse failure or stale → `removeRelayLock`; live → return without fork. |
| P5 | `fork` daemon, await IPC `relay.ready`, then disconnect (`03-02`) | ✓ VERIFIED | `require.resolve("@agent-talkie/relay/daemon")`, `fork`, validation, `disconnect()` (`ensure-relay.ts` L76–L118). |
| P6 | Relay not tied to spawning parent (`03-02`) | ✓ VERIFIED | `stdio` IPC-only for forked child; `unref()` after disconnect (`ensure-relay.ts` L77–L118). |
| P7 | Published-style binary: relay management + ping auto-start (`03-03`) | ✓ VERIFIED | `cli.ts` + `cli.test.ts` (spawn `dist/cli.js`). |
| P8 | Subcommands: relay start/stop/status/ensure, session stub (`03-03`) | ✓ VERIFIED | Commander wiring (`cli.ts`); `session list` → `not implemented (Phase 4)` per plan. |
| P9 | `ping` uses same ensure path as automation (`03-03`) | ✓ VERIFIED | `ping` calls `ensureRelayRunning({})` then fetches health URL with returned `generation` (`cli.ts` L70–L82). |

**Score:** 14/14 (5 roadmap success criteria + 9 plan must-have truths; each row in the two tables above verified).

### Required artifacts (gsd-tools + manual)

| Artifact | Expected | Exists | Substantive | Wired | Status |
|----------|----------|--------|-------------|-------|--------|
| `packages/relay/src/server.ts` | Health, idle, close | ✓ | ✓ | ✓ (daemon imports) | ✓ VERIFIED |
| `packages/relay/src/daemon.ts` | Lock, IPC, signals | ✓ | ✓ | ✓ (fork target) | ✓ VERIFIED |
| `packages/relay/tsup.config.ts` | `daemon` entry | ✓ | ✓ | ✓ (build output) | ✓ VERIFIED |
| `packages/supervisor/src/lockfile.ts` | Lock I/O | ✓ | ✓ | ✓ (ensure-relay) | ✓ VERIFIED |
| `packages/supervisor/src/liveness.ts` | Live/stale | ✓ | ✓ | ✓ (ensure-relay) | ✓ VERIFIED |
| `packages/supervisor/src/ensure-relay.ts` | Fork + API | ✓ | ✓ | ✓ (index + CLI) | ✓ VERIFIED |
| `packages/cli/package.json` | `bin` | ✓ | ✓ | ✓ | ✓ VERIFIED |
| `packages/cli/src/cli.ts` | Commander | ✓ | ✓ | ✓ (supervisor imports) | ✓ VERIFIED |

### Key link verification (gsd-tools)

| Plan | From → To | Via | Status |
|------|-----------|-----|--------|
| 03-01 | `daemon.ts` → `server.ts` | `createRelayServer(...)` | ✓ VERIFIED |
| 03-01 | `server.ts` → HTTP | `GET /__agent-talkie/v1/health` | ✓ VERIFIED |
| 03-02 | `ensure-relay.ts` → relay daemon | `require.resolve("@agent-talkie/relay/daemon")` + `fork` | ✓ VERIFIED |
| 03-02 | `liveness.ts` | Health URL string | ✓ VERIFIED |
| 03-03 | `cli.ts` → supervisor | `ensureRelayRunning`, `stopRelay`, `getRelayStatus` | ✓ VERIFIED |

### Data-flow trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| `cli.ts` `ping` | `port`, `generation` | `ensureRelayRunning` → fork → `relay.ready` or live lock | ✓ | ✓ FLOWING |
| `liveness.ts` | health JSON | `fetch` to loopback relay | ✓ | ✓ FLOWING |
| `daemon.ts` lock | `pid`, `port`, `generation` | runtime + bound server | ✓ | ✓ FLOWING |

### Behavioral spot-checks

| Behavior | Command / check | Result | Status |
|----------|-----------------|--------|--------|
| Relay tests | `npm run test -w @agent-talkie/relay` | 16 passed | ✓ PASS |
| Supervisor tests | `npm run test -w @agent-talkie/supervisor` | 1 passed | ✓ PASS |
| CLI tests | `npm run test -w @agent-talkie/cli` | 2 passed | ✓ PASS |
| CLI help | `node packages/cli/dist/cli.js --help` | Shows `relay`, `ping`, `session` | ✓ PASS |
| Shebang | `head -n 1 packages/cli/dist/cli.js` | `#!/usr/bin/env node` | ✓ PASS |

### Requirements coverage (PLAN frontmatter → REQUIREMENTS.md)

Every ID declared across phase plans is traced below. Descriptions are from `.planning/REQUIREMENTS.md`.

| ID | Source plan(s) | Description (abbrev.) | Status | Evidence |
|----|----------------|----------------------|--------|----------|
| **RELAY-07** | 03-01 | Idle shutdown when no connections remain and no pending protocol state (interpreted as no open WS / idle timer policy per plan). | ✓ SATISFIED | `idleShutdownMs` + `onIdleShutdown` in `server.ts`; daemon default idle + env `AGENT_TALKIE_RELAY_IDLE_MS`; `daemon.test.ts`. |
| **RELAY-04** | 03-02 | Relay daemon auto-spawns on first use when no relay is running locally. | ✓ SATISFIED | `ensureRelayRunning` fork path when no live lock (`ensure-relay.ts`); CLI commands. |
| **RELAY-05** | 03-02 | Relay lifecycle independent of any participant — survives session disconnects/reconnects. | ✓ SATISFIED | Detached fork (`disconnect` + `unref`); relay process not child of CLI; health+generation liveness decoupled from any single session. |
| **RELAY-06** | 03-02 | Single-instance enforcement via lockfile + generation for stale detection. | ✓ SATISFIED | `relay.lock` written by daemon; `readRelayLock` + `classifyRelayLock` + removal only when stale (`lockfile.ts`, `liveness.ts`, `ensure-relay.ts`). |
| **CLI-01** | 03-03 | Installable via `npm install` or runnable via `npx` without separate infrastructure. | ✓ SATISFIED (monorepo) | `bin.talkie`, ESM build, root workspace scripts. *Registry `npx` not run in this verification.* |
| **CLI-02** | 03-03 | CLI entrypoints for relay management and session operations. | ✓ SATISFIED | `relay` subcommands + `session list` stub (Phase 4 placeholder per plan). |
| **CLI-03** | 03-03 | Relay auto-start transparent for basic local use. | ✓ SATISFIED | `ping` and `relay start`/`ensure` use `ensureRelayRunning`; `cli.test.ts`. |

**Orphaned requirements:** No phase-3 requirement ID appears in `REQUIREMENTS.md` traceability table without a corresponding plan claim — all seven IDs are declared across `03-01`–`03-03` PLAN frontmatter.

**Documentation note:** `REQUIREMENTS.md` still shows `[ ]` and traceability **Pending** for RELAY-04–07 and CLI-01–03. That is registry/checkbox drift vs. implementation; recommend updating those rows when the milestone marks these requirements complete.

### Anti-patterns

| File | Pattern | Severity | Notes |
|------|---------|----------|-------|
| — | TODO/FIXME/placeholder in phase-touched sources | — | No matches in `packages/relay/src`, `packages/supervisor/src`, `packages/cli/src` for this scope. |

### Human verification required

*None.* Automated tests and spot-checks cover the phase goal. Optional follow-up (not blocking): smoke `npm pack` / publish and `npx` from registry for CLI-01 end-to-end parity.

### Gaps summary

No gaps found. Phase goal and plan must-haves are reflected in the codebase with tests and build outputs.

---

_Verified: 2026-04-13T15:30:00Z_  
_Verifier: Claude (gsd-verifier)_
