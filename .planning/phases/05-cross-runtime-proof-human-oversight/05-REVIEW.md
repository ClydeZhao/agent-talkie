---
phase: 05-cross-runtime-proof-human-oversight
reviewed: 2026-04-14T12:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - packages/persistence/migrations/004_space_owner.sql
  - packages/persistence/src/repositories/space-owner.ts
  - packages/persistence/src/repositories/space-owner.test.ts
  - packages/persistence/src/repositories/oversight.ts
  - packages/persistence/src/repositories/oversight.test.ts
  - packages/persistence/src/index.ts
  - packages/relay/src/space-lifecycle.ts
  - packages/relay/src/collaboration-handlers.ts
  - packages/relay/src/__tests__/router-orchestrator.test.ts
  - packages/relay/src/__tests__/collaboration-handlers.owner.test.ts
  - packages/relay/src/__tests__/phase5-concurrent-adapters.test.ts
  - packages/adapter-codex/src/codex-bridge.ts
  - packages/adapter-codex/src/codex-bridge.test.ts
  - packages/adapter-codex/src/cli.ts
  - packages/adapter-codex/src/index.ts
  - packages/client/src/session-client.ts
  - packages/client/src/session-client.join.test.ts
  - packages/adapter-cursor-mcp/src/mcp-server.ts
  - packages/adapter-cursor-mcp/src/mcp-server.test.ts
  - packages/adapter-cursor-mcp/src/index.ts
  - packages/cli/src/oversight/db.ts
  - packages/cli/src/oversight/format.ts
  - packages/cli/src/oversight/possibly-blocked.ts
  - packages/cli/src/oversight/static-commands.ts
  - packages/cli/src/oversight/possibly-blocked.test.ts
  - packages/cli/src/oversight/watch.ts
  - packages/cli/src/cli.ts
  - packages/cli/src/cli.test.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-04-14T12:00:00Z  
**Depth:** standard  
**Files reviewed:** 27  
**Status:** issues_found

## Summary

Phase 05 adds space ownership (MHUM-01), the Codex stdio adapter, the Cursor MCP adapter with read-only SQLite resources, CLI static/live oversight, and relay concurrency tests. Persistence and relay owner gating are consistent and parameterized SQL is used throughout oversight reads. MCP tool inputs are validated with Zod and protocol schemas; DB path is fixed to `relay.sqlite` under the supervisor data dir. The main concerns are **process lifecycle** in `adapter-codex` when the child fails to spawn, and **fatal `process.exit` inside `ContentLengthFrameReader`** when the Codex child emits bad framing—both affect robustness and trust-boundary handling for untrusted child stdout. One relay error-code mismatch on `orchestrator.clear` is a small API/UX inconsistency.

## Warnings

### WR-01: Adapter can hang if Codex child fails to spawn

**File:** `packages/adapter-codex/src/codex-bridge.ts:131-132`, `253-257`  
**Issue:** `waitChildExit` only listens for the child `exit` event. Per Node’s `child_process` behavior, if spawning fails (for example missing executable, `ENOENT`), the process emits `error` and **does not** emit `exit`. `Promise.all([stdoutLoop(), stderrLoop(), waitChildExit(child)])` then never completes, so the adapter hangs and may not run cleanup (`client.close()`).

**Fix:** Treat spawn failure explicitly, for example:

```ts
function waitChildExit(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("error", () => resolve()); // or reject with err
    child.once("exit", () => resolve());
  });
}
```

Alternatively resolve `waitChildExit` on `error` and tear down streams so `stdoutLoop` / `stderrLoop` end. Ensure `client.close()` still runs in a `finally`.

### WR-02: Malformed Content-Length frames from child call `process.exit(1)`

**File:** `packages/adapter-codex/src/codex-bridge.ts:240-241` (uses `ContentLengthFrameReader`)  
**Issue:** `ContentLengthFrameReader` in `@agent-talkie/adapter-stdio` calls `process.exit(1)` on invalid headers or over-max declared length (see `packages/adapter-stdio/src/content-length-framing.ts:39-56`). The Codex bridge reads **untrusted child stdout** through this reader. A buggy or hostile child can therefore terminate the entire adapter process abruptly instead of logging, skipping the frame, or surfacing a controlled error—harder to operate and weaker than “drop bad frame + continue” for this trust boundary.

**Fix (preferred):** Refactor framing so callers can supply an error policy (throw, log+skip, or exit), or add a `ContentLengthFrameReader` variant without `process.exit` for subprocess use. Minimal mitigation in the bridge: wrap iteration in a subprocess-local reader that parses headers and skips bad frames without exiting the Node process.

## Info

### IN-01: Wrong protocol error string for non-human `orchestrator.clear`

**File:** `packages/relay/src/collaboration-handlers.ts:215-221`  
**Issue:** For `orchestrator.clear`, when the sender is not human, the code returns `error: "orchestrator_designate_forbidden"` (copy-pasted from designate). Clients distinguishing errors by code may mis-handle clear vs designate.

**Fix:** Use a distinct code, e.g. `orchestrator_clear_forbidden`, and update any tests that assert the old string.

### IN-02: `talkie watch` only installs a SIGINT handler

**File:** `packages/cli/src/oversight/watch.ts:127-135`  
**Issue:** Shutdown is tied to SIGINT only. SIGTERM (common from process managers) leaves the interval and WebSocket running until forced kill.

**Fix:** Register the same cleanup for `SIGTERM` (and optionally `beforeExit`), reusing one teardown function.

---

_Reviewed: 2026-04-14T12:00:00Z_  
_Reviewer: Claude (Composer)_  
_Depth: standard_
