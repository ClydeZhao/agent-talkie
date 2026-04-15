---
phase: 02-relay-websocket-validate-route
reviewed: 2026-04-10T12:00:00Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - packages/persistence/migrations/002_relay_spaces_transcripts.sql
  - packages/persistence/src/repositories/spaces.ts
  - packages/persistence/src/repositories/transcript.ts
  - packages/persistence/src/repositories/spaces.test.ts
  - packages/persistence/src/repositories/transcript.test.ts
  - packages/persistence/src/index.ts
  - packages/persistence/RELAY-08.md
  - packages/protocol/src/relay-wire.ts
  - packages/protocol/src/relay-wire.test.ts
  - packages/protocol/src/index.ts
  - packages/relay/package.json
  - packages/relay/tsconfig.json
  - packages/relay/tsup.config.ts
  - packages/relay/vitest.config.ts
  - packages/relay/src/index.ts
  - packages/relay/src/server.ts
  - packages/relay/src/session-registry.ts
  - packages/relay/src/validation.ts
  - packages/relay/src/reconnect-secret.ts
  - packages/relay/src/server.test.ts
  - packages/relay/src/space-lifecycle.ts
  - packages/relay/src/router.ts
  - packages/relay/src/catch-up.ts
  - packages/relay/src/integration.test.ts
  - package.json
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-10T12:00:00Z  
**Depth:** standard  
**Files reviewed:** 25  
**Status:** issues_found

## Summary

Phase 02 adds SQLite migration 002, persistence helpers for spaces/transcripts, protocol relay-wire messages, and a WebSocket relay with handshake, session bind/resume, space join/leave, routing, transcript persistence, and catch-up. Overall structure is clear and SQL uses parameters (no string-built SQL injection). The most serious issue is incorrect handling of reconnect secret rotation on `session.resume`, which breaks any second resume with the same client-held secret. Secondary concerns are lack of error isolation around the message handler (DB errors can surface as uncaught exceptions) and silent no-op updates when archiving spaces. Operational default for the reconnect pepper is noted as info. Test files were skimmed for reliability signals only, per review scope.

## Critical Issues

### CR-01: `session.resume` rotates stored secret without sending a new secret to the client

**File:** `packages/relay/src/server.ts:333-344`

**Issue:** After a successful resume, the server generates `newSecret`, stores `hashReconnectSecret(newSecret, pepper)` in the database, then sends `session.resumed` with only `sessionId`. The client still holds the **old** plaintext secret. The next resume attempt verifies against the **new** hash, so `verifyReconnectSecret(oldSecret, ...)` fails and the client receives `resume_rejected`. Multi-resume (disconnect → resume → disconnect → resume) is therefore broken unless the protocol is extended to return a fresh `reconnectSecret` on resume, or resume stops rotating the secret (only extending TTL).

**Fix (pick one consistent with product intent):**

```typescript
// Option A: return the new secret (client must update local storage)
sendJson(ws, {
  type: "session.resumed",
  sessionId: res.data.sessionId,
  reconnectSecret: newSecret,
});

// Option B: do not rotate on resume — only extend validity
db.prepare(
  "UPDATE sessions SET reconnect_valid_until=? WHERE id=?",
).run(newValid, res.data.sessionId);
// omit newSecret/newHash update
```

Add an integration test that closes the resumed socket and resumes again with the secret the client is expected to use after the first resume.

## Warnings

### WR-01: WebSocket `message` handler has no guard around persistence / routing errors

**File:** `packages/relay/src/server.ts:203-397`

**Issue:** `handleMessage` does not wrap `handleSpaceJoin`, `handleSpaceLeave`, `dispatchValidatedEnvelope`, or `routeEnvelope` in `try/catch`. Unexpected SQLite errors (constraint failures, I/O, corruption) or future thrown errors in those paths can become uncaught exceptions in the `ws` message callback, which is risky for process stability and error reporting.

**Fix:** Wrap the post-parse dispatch path in `try/catch`, send a generic `protocol.error` (or close with a reason), and log the underlying error server-side. Re-throw only if you intentionally want the process to exit.

### WR-02: `setSpaceArchived` does not verify that a row was updated

**File:** `packages/persistence/src/repositories/spaces.ts:81-93`

**Issue:** `UPDATE ... WHERE id = ?` silently no-ops if `spaceId` is wrong or the row was deleted. Callers in `handleSpaceLeave` assume the space was archived when the last member left; a typo or race could leave an empty space in `active` state without surfacing an error.

**Fix:** Use `UPDATE ... RETURNING` (if SQLite version supports) or `changes` from `run()` and assert `changes === 1` in debug builds, or return a boolean and let `handleSpaceLeave` react.

## Info

### IN-01: Default reconnect pepper is hardcoded in source

**File:** `packages/relay/src/server.ts:184-187`

**Issue:** Falling back to `"dev-reconnect-pepper"` when `opts.pepper` and `AGENT_TALKIE_RECONNECT_PEPPER` are unset is fine for local dev but easy to misconfigure in deployment. Document that production must set a strong, instance-specific pepper via env or options.

**Fix:** Fail fast in production builds if pepper is missing, or log a high-severity warning at startup when using the default.

### IN-02: `findActiveMembershipForSession` uses `LIMIT 1` under a “at most one” assumption

**File:** `packages/persistence/src/repositories/spaces.ts:166-182`

**Issue:** If the database ever contained more than one active membership for a session (constraint bug or manual edit), behavior would be nondeterministic. v1 comment documents the assumption; consider a unique partial index if SQLite schema evolves.

---

_Reviewed: 2026-04-10T12:00:00Z_  
_Reviewer: Claude (gsd-code-reviewer)_  
_Depth: standard_
