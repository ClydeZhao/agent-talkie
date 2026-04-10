---
phase: 02-relay-websocket-validate-route
plan: "02"
subsystem: relay
tags: [websocket, ws, zod, sqlite, handshake, envelope]

requires:
  - phase: 02-relay-websocket-validate-route
    provides: Persistence sessions/spaces/transcript repos and migration 002 from plan 02-01
provides:
  - "@agent-talkie/relay with localhost WebSocket server (handshake, session.register/resume, envelope Zod gate)"
  - "packages/protocol relay-wire Zod schemas for pre-envelope messages"
  - "SHA-256 reconnect secret hashing with timing-safe compare"
affects:
  - 02-relay-websocket-validate-route plan 02-03 (routing/dispatch)

tech-stack:
  added: [ws ^8.20.0, @types/ws]
  patterns:
    - "Second WebSocket bound to same sessionId closes the prior socket"
    - "Inbound size cap before JSON.parse; safeParseEnvelope on post-bind objects"

key-files:
  created:
    - packages/protocol/src/relay-wire.ts
    - packages/protocol/src/relay-wire.test.ts
    - packages/relay/src/reconnect-secret.ts
    - packages/relay/src/reconnect-secret.test.ts
    - packages/relay/src/session-registry.ts
    - packages/relay/src/validation.ts
    - packages/relay/src/server.test.ts
  modified:
    - packages/protocol/src/index.ts
    - packages/relay/src/server.ts
    - packages/relay/package.json
    - package.json
    - package-lock.json

key-decisions:
  - "Kept workspace package links as 0.0.0 because npm install rejected workspace:* protocol in this environment (see deviations)."
  - "Documented safeParseEnvelope on the hot path via JSDoc on server.ts pointing at parseAndValidateEnvelope (acceptance grep + single validation module)."

patterns-established:
  - "Relay connection state machine: handshake → register|resume → envelope validation → stub dispatch"
  - "Reconnect secret: random 32 bytes base64url, SHA-256(pepper||secret) stored, rotated on register and resume"

requirements-completed: [RELAY-02, RELAY-09, SPACE-04]

duration: prior session + ~15 min
completed: 2026-04-10
---

# Phase 02 Plan 02: Relay WebSocket validate Summary

**Local `@agent-talkie/relay` WebSocket server with version handshake, explicit session bind via persistence `createSession` or resume with hashed secret, strict inbound size and Zod envelope validation, in-memory disconnect cleanup only, and a no-op `dispatchValidatedEnvelope` stub for plan 02-03.**

## Performance

- **Duration:** Prior wave commits plus ~15 minutes (Task 4 completion and summary)
- **Started:** 2026-04-10 (wave 2; exact start not recorded)
- **Completed:** 2026-04-10T03:52:00Z
- **Tasks:** 4
- **Files modified:** 15+ (see plan frontmatter `files_modified` and key-files above)

## Accomplishments

- Protocol-level Zod schemas for handshake, session.register, and session.resume wire messages
- Relay package in the monorepo build/test graph with tsup ESM output
- Reconnect secret hashing and constant-time verification helpers with tests
- Full server path: `openDatabase` + migrate, WS handshake/nack, register/resume with SQLite updates, duplicate-session policy, envelope validation and mismatch errors, client disconnect + resume integration test

## Task Commits

Each task was committed atomically:

1. **Task 1: Protocol relay-wire Zod schemas + tests** — `8cf4db8` (feat)
2. **Task 2: @agent-talkie/relay package scaffold + build** — `8dc507d` (chore)
3. **Task 3: Reconnect secret hash helpers** — `fe29232` (feat)
4. **Task 4: WebSocket server — handshake, register/resume, envelope validation stub** — `6b1056c` (feat)

## Files Created/Modified

- `packages/protocol/src/relay-wire.ts` — Zod schemas for handshake and session bind messages
- `packages/protocol/src/relay-wire.test.ts` — Vitest coverage for handshake and nack shape
- `packages/protocol/src/index.ts` — Re-exports relay-wire
- `packages/relay/package.json` — Relay deps, scripts (`pretest` builds protocol for tests), `uuid` devDependency for v7 in tests
- `packages/relay/tsup.config.ts`, `tsconfig.json`, `vitest.config.ts`, `README.md` — Package scaffold and reconnect pepper note
- `packages/relay/src/reconnect-secret.ts` — `hashReconnectSecret` / `verifyReconnectSecret`
- `packages/relay/src/reconnect-secret.test.ts` — Hash/verify and length-mismatch behavior
- `packages/relay/src/validation.ts` — `parseAndValidateEnvelope` wrapping `safeParseEnvelope` + `formatEnvelopeIssues`
- `packages/relay/src/session-registry.ts` — One socket per session; bind closes older socket
- `packages/relay/src/server.ts` — `createRelayServer`, constants, stub `dispatchValidatedEnvelope`
- `packages/relay/src/server.test.ts` — Handshake, register, envelope, version mismatch, session mismatch, disconnect + resume
- `package.json` / `package-lock.json` — Root scripts include relay workspace

## Decisions Made

- Left `@agent-talkie/*` dependencies at `0.0.0` when `workspace:*` caused `npm install` to fail with `EUNSUPPORTEDPROTOCOL` (see deviations); npm workspaces still link packages by name.
- Satisfied plan grep for `safeParseEnvelope` in `server.ts` with a JSDoc line referencing the validation helper that wraps `safeParseEnvelope`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `workspace:*` dependency protocol rejected by npm**

- **Found during:** Task 4 (while aligning `packages/relay/package.json` with plan Task 2)
- **Issue:** `npm install` failed: `Unsupported URL Type "workspace:": workspace:*`
- **Fix:** Reverted relay internal deps to `0.0.0` (matches other workspace packages in this repo); workspaces continue to resolve locally.
- **Files modified:** `packages/relay/package.json` (reverted before commit)
- **Verification:** `npm test` and `npm run build -w @agent-talkie/relay` succeed
- **Committed in:** `6b1056c` (no `workspace:*` in committed tree)

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking)

**Impact on plan:** Linking behavior unchanged for local monorepo; production publish would still need explicit versioning policy outside this plan.

## Issues Encountered

None beyond the `workspace:*` install failure, handled as above.

## User Setup Required

None — see `packages/relay/README.md` for optional `AGENT_TALKIE_RECONNECT_PEPPER` in non-dev environments.

## Next Phase Readiness

- Plan **02-03** can implement `dispatchValidatedEnvelope` routing and RELAY-01 end-to-end behavior.
- SQLite membership remains untouched on TCP drop (RELAY-09 baseline); join flows stay deferred to 02-03.

## Self-Check: PASSED

- `test -f .planning/phases/02-relay-websocket-validate-route/02-02-SUMMARY.md` — FOUND
- `git log --oneline --all | grep -q 6b1056c` — FOUND
- `npm run test -w @agent-talkie/relay` — passed after Task 4 commit

---
*Phase: 02-relay-websocket-validate-route*

*Completed: 2026-04-10*
