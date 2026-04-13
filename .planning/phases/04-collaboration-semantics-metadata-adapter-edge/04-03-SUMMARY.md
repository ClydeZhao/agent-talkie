---
phase: 04-collaboration-semantics-metadata-adapter-edge
plan: 03
subsystem: adapter-edge
tags: [websocket, stdio, envelope, supervisor, monorepo]

requires:
  - phase: 04-collaboration-semantics-metadata-adapter-edge
    provides: Relay protocol, supervisor ensure path, collaboration wire from prior plans
provides:
  - "@agent-talkie/client TalkieSessionClient (handshake, register, envelopes)"
  - "@agent-talkie/adapter-stdio Content-Length framing, bounded queue, CLI bin"
  - docs/adapter-ingress.md (ADAPT-01 / ADAPT-03)
affects:
  - Phase 5 cross-runtime adapters

tech-stack:
  added: [ws, tsup, vitest (client + adapter packages)]
  patterns:
    - "Edge adapters use shared session client; overload is stderr-only (D-12)"
    - "Stdio frames: Content-Length + UTF-8 JSON capped at 262144 bytes"

key-files:
  created:
    - packages/client/src/session-client.ts
    - packages/adapter-stdio/src/cli.ts
    - packages/adapter-stdio/src/content-length-framing.ts
    - packages/adapter-stdio/src/bounded-queue.ts
    - docs/adapter-ingress.md
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Explicit npm workspaces list includes packages/client and packages/adapter-stdio (replacing packages/* glob)."
  - "Stdio adapter registers a session with env-overridable displayName/runtime/workspaceLabel defaults."

patterns-established:
  - "TalkieSessionClient multiplexes session.register responses before envelope fan-out."
  - "createBoundedQueue drops oldest once at capacity before push (D-11)."

requirements-completed: [ADAPT-01, ADAPT-03, ADAPT-04]

duration: 25min
completed: 2026-04-13
---

# Phase 04 Plan 03: Client + stdio adapter Summary

**Shared WebSocket session client (`@agent-talkie/client`), reference stdio adapter with Content-Length framing and bounded outbound queue, plus adapter ingress documentation — no relay-core transport fork.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3
- **Files modified:** 15+ (new packages + root + doc)

## Accomplishments

- Shipped `TalkieSessionClient` with the same handshake → `session.register` → envelope path as the relay harness.
- Shipped `talkie-stdio-adapter` with 262144-byte frame cap, `safeParseEnvelope` on stdin bodies, drop-oldest queue, and stderr JSON for overflow (no relay error).
- Documented ADAPT-01 / ADAPT-03 in `docs/adapter-ingress.md`.

## Task Commits

1. **Task 1: Package @agent-talkie/client** — `bfa98a4` (feat)
2. **Task 2: Package @agent-talkie/adapter-stdio** — `05b56fb` (feat)
3. **Task 3: docs/adapter-ingress.md** — `eec49f7` (docs)

## Files Created/Modified

- `packages/client/*` — session client library and vitest handshake mock test
- `packages/adapter-stdio/*` — framing, queue, CLI, vitest unit tests
- `docs/adapter-ingress.md` — ingress pattern, same-transport rule, stdio reference, security
- `package.json` / `package-lock.json` — workspaces and root build/test chain

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Content-Length test body length**

- **Found during:** Task 2 verification
- **Issue:** Plan example `Content-Length: 11` with body `{"a":1}` is only 7 UTF-8 bytes; reader waited forever for more data and yielded nothing.
- **Fix:** Test uses an 11-byte JSON payload (`{"abcde":1}`) with asserted `Buffer.byteLength`.
- **Files modified:** `packages/adapter-stdio/src/content-length-framing.test.ts`
- **Commit:** `05b56fb`

**2. [Rule 2 — Correctness] Missing `Content-Length` / invalid headers**

- **Found during:** Task 2 implementation
- **Issue:** Plan specified oversize exit only; missing header would stall.
- **Fix:** Emit `stdio_adapter_invalid_frame_headers` and `process.exit(1)`.
- **Files modified:** `packages/adapter-stdio/src/content-length-framing.ts`
- **Commit:** `05b56fb`

None otherwise — plan executed as written.

## Known Stubs

None — CLI uses real `registerSession` with documented env overrides.

## Threat Flags

None beyond plan threat model (stdin validation + frame cap + bounded queue implemented).

## Self-Check: PASSED

- `docs/adapter-ingress.md` exists
- Commits `bfa98a4`, `05b56fb`, `eec49f7` on branch
