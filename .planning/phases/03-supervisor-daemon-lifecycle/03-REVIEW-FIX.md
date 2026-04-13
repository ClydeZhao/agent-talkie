---
phase: 03-supervisor-daemon-lifecycle
fixed_at: 2026-04-13T16:03:00Z
review_path: .planning/phases/03-supervisor-daemon-lifecycle/03-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-04-13  
**Source review:** `.planning/phases/03-supervisor-daemon-lifecycle/03-REVIEW.md`  
**Iteration:** 1

**Summary:**

- Findings in scope: 4 (Critical/Warning only; Info findings IN-01–IN-03 out of scope)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: Listen-before-lock window (TOCTOU)

**Files modified:** `packages/relay/src/daemon.ts`, `packages/supervisor/src/lockfile.ts`, `packages/supervisor/src/ensure-relay.ts`, `packages/supervisor/src/liveness.ts`  
**Commit:** `99ba816`  
**Applied fix:** Daemon writes `relay.lock` with `port: 0` before `createRelayServer`, then atomically updates to the bound port after listen; on startup failure the lock file is removed. Lock validation allows `port: 0`. Supervisor waits (poll + `forkTimeoutMs`) until the lock shows a non-zero port or the PID is gone before classifying liveness; `classifyRelayLock` treats `port === 0` as not yet live. `getRelayStatus` reports `reason: "starting"` when the lock is provisional and the PID is still alive.

### WR-02: `readRelayLock` conflates corrupt JSON with transient I/O errors

**Files modified:** `packages/supervisor/src/lockfile.ts`  
**Commit:** `42bf0fe`  
**Applied fix:** `readFileSync` failures with `ENOENT` return `undefined`; other read errors propagate. JSON parse / shape failures still return `undefined` so callers may remove corrupt locks only after a successful read path.

### WR-03: Idle shutdown errors are swallowed

**Files modified:** `packages/relay/src/server.ts`  
**Commit:** `cb3dcd4`  
**Applied fix:** Rejections from `onIdleShutdown` are logged with `console.error("onIdleShutdown failed", err)`.

### WR-04: `stopRelay` reports `kill_failed` when the process is already gone

**Files modified:** `packages/supervisor/src/ensure-relay.ts`  
**Commit:** `b37ad4e`  
**Applied fix:** If `process.kill` throws with `code === "ESRCH"`, return `{ stopped: true, pid: lock.pid }` as the relay is already not running.

---

_Fixed: 2026-04-13_  
_Fixer: Claude (Composer, gsd-code-fixer)_  
_Iteration: 1_
