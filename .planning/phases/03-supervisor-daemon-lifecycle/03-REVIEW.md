---
phase: 03-supervisor-daemon-lifecycle
reviewed: 2026-04-13T12:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - packages/relay/src/server.ts
  - packages/relay/src/daemon.ts
  - packages/relay/src/daemon.test.ts
  - packages/relay/src/index.ts
  - packages/relay/tsup.config.ts
  - packages/supervisor/src/paths.ts
  - packages/supervisor/src/lockfile.ts
  - packages/supervisor/src/liveness.ts
  - packages/supervisor/src/ensure-relay.ts
  - packages/supervisor/src/ensure-relay.test.ts
  - packages/supervisor/src/index.ts
  - packages/cli/src/cli.ts
  - packages/cli/src/cli.test.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-04-13  
**Depth:** standard  
**Files reviewed:** 16 (TypeScript sources and tests referenced in phase summaries; root/workspace `package.json` lockfile churn excluded)  
**Status:** issues_found

## Summary

Phase 3 adds relay daemon lifecycle (`createRelayServer` health/idle/graceful close, `runRelayDaemon` lockfile + IPC), `@agent-talkie/supervisor` (lock read/liveness/fork + detach), and the `talkie` CLI. Overall design matches the local-trust model (loopback health, generation gate). The main risks are **correctness under concurrency and transient I/O**: a window exists where the relay is listening before `relay.lock` exists, and `readRelayLock` treats all read/parse failures like a corrupt lock—both can allow a second daemon for the same data directory and stress SQLite. A few smaller issues: swallowed errors on the idle-shutdown path, coarse `stopRelay` outcomes when the PID is already gone, and optional hardening for `ping`/tests.

## Critical Issues

None identified for the stated threat model (localhost relay, no remote exposure of fork/lock APIs).

## Warnings

### WR-01: Listen-before-lock window (TOCTOU) can duplicate daemons on same data dir

**File:** `packages/relay/src/daemon.ts` (ordering after `createRelayServer` resolves, ~lines 58–85)  
**Issue:** The HTTP/WebSocket server is accepting connections before `relay.lock` is written and before `relay.ready` is sent. Another OS user/process can run `ensureRelayRunning` in that window: `existsSync(lockPath)` is false (or stale), so it forks a second child with the same `AGENT_TALKIE_DATA_DIR`. Both then use the same `relay.sqlite` path → risk of SQLite corruption, split brain, and confusing health/lock state.  
**Fix:** Narrow the window, for example: acquire an **exclusive** lock file (e.g. `openSync` with `wx` or `fs.promises.open` `wx` on `relay.lock.tmp` + hold fd until shutdown) *before* binding the server, or write a provisional lock with `port: 0` then atomically update after bind—paired with supervisor rules that treat “lock present but port not ready” as spawning in progress. At minimum, document that concurrent `ensureRelayRunning` across processes is unsupported until an exclusive lock wraps startup.

### WR-02: `readRelayLock` conflates corrupt JSON with transient I/O errors

**File:** `packages/supervisor/src/lockfile.ts` (lines 42–51)  
**Issue:** The outer `try/catch` returns `undefined` for *any* failure from `readFileSync` or `JSON.parse`. In `ensureRelayRunning`, when the path exists and `parsed === undefined`, the code removes the lock (`removeRelayLock`). A transient read error (permissions blip, transient FS fault) can delete a valid lock while the relay process is still live, leading to a second spawn on the next ensure.  
**Fix:** Distinguish cases, e.g. rethrow or return a discriminated result on non-ENOENT `ErrnoException`; only remove the lock when JSON is invalid or shape fails validation after a successful read. Optionally retry reads with backoff for transient codes.

### WR-03: Idle shutdown errors are swallowed

**File:** `packages/relay/src/server.ts` (line 248)  
**Issue:** `void Promise.resolve(onIdleShutdown()).catch(() => {})` discards rejections from `onIdleShutdown` (including daemon `closeRelay` failures). The relay may stay up without observability, or lock/DB cleanup in the daemon path may fail silently.  
**Fix:** At minimum log with `console.error` or an injected logger; preferably surface failure to metrics/telemetry and avoid treating shutdown as successful when `closeRelay` rejects.

### WR-04: `stopRelay` reports `kill_failed` when the process is already gone

**File:** `packages/supervisor/src/ensure-relay.ts` (lines 159–163)  
**Issue:** `process.kill(lock.pid, signal)` throws `ESRCH` if the PID exited between liveness check and kill. Callers get `{ stopped: false, reason: "kill_failed" }` even though the desired end state (no relay) may already hold.  
**Fix:** On `ESRCH`, treat as success (e.g. `{ stopped: true, pid }` or a dedicated `already_exited` reason) after optionally re-checking health/lock.

## Info

### IN-01: `ping` assumes HTTP 200 is sufficient

**File:** `packages/cli/src/cli.ts` (lines 76–81)  
**Issue:** Unlike `classifyRelayLock`, `ping` does not parse the JSON body for `ok` / `generation`. A buggy or mismatched server on the same port could theoretically return `200` with unexpected content. Low risk on loopback with the same generation query param.  
**Fix:** Parse JSON and assert `ok === true` and `generation` matches the ensured value (mirror `liveness.ts`).

### IN-02: PID reuse between `kill(0)` and health check

**File:** `packages/supervisor/src/liveness.ts`  
**Issue:** Classic narrow window: PID recycled after `kill(0)` succeeds could point at a non-relay process; health + generation check mitigates this in practice.  
**Fix:** No change required for v1; document assumption that generation is unguessable and health is authoritative.

### IN-03: `ensureRelayRunning` does not listen for early child `exit`

**File:** `packages/supervisor/src/ensure-relay.ts` (lines 85–97)  
**Issue:** If the forked daemon exits before sending `relay.ready`, the parent waits for the full `forkTimeoutMs` before failing.  
**Fix:** Add `child.once("exit", ...)` to reject early with a clear error (still kill/cleanup as today).

---

_Reviewed: 2026-04-13_  
_Reviewer: Claude (Composer)_  
_Depth: standard_
