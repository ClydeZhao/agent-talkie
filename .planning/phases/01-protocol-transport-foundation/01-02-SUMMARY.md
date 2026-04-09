---
phase: 01-protocol-transport-foundation
plan: "02"
subsystem: api
tags: [zod, vitest, websocket, relay, protocol]

requires:
  - phase: 01-protocol-transport-foundation
    provides: Zod MessageEnvelope, parseEnvelope, PROTO-01 baseline from plan 01-01
provides:
  - Relay route key helpers (talkie:v1:control / conversation) derived from envelope.type
  - TalkieTransport / inbound/outbound frame types for JSON WebSocket relays
  - thread_id token rule aligned with space_id for injection-safe route segments
affects:
  - 01-protocol-transport-foundation plan 03 (embedded relay)
  - future adapters using the protocol package barrel

tech-stack:
  added: []
  patterns:
    - "Colon-separated relay route keys with fixed talkie:v1 prefix"
    - "Semantic control vs conversation split via envelope.type (D-06-transport)"

key-files:
  created:
    - packages/protocol/src/relay_routing.ts
    - packages/protocol/src/relay_routing.test.ts
    - packages/protocol/src/transport.ts
    - packages/protocol/README.md
  modified:
    - packages/protocol/src/envelope.ts
    - packages/protocol/src/envelope.test.ts
    - packages/protocol/src/index.ts

key-decisions:
  - "Explicit named exports from protocol index for relay_routing (and transport types) so the public API and plan acceptance checks name relayRouteKeyFromEnvelope in index.ts."
  - "Route family detection uses only constant literal prefixes; unknown keys return null (T-01-07)."

patterns-established:
  - "Relay keys: talkie:v1:control:${space_id} vs talkie:v1:conversation:${space_id}:${thread_id}"
  - "TalkieTransport frames: envelope out; ack (duplicate) or error in"

requirements-completed: [PROTO-01, PROTO-03]

duration: 12min
completed: 2026-04-10
---

# Phase 01 Plan 02: Relay routing and transport contract Summary

**Relay-oriented route keys (`talkie:v1`) from `envelope.type`, `thread_id` token parity with `space_id`, and a thin `TalkieTransport` TypeScript contract for JSON WebSocket relays—no NATS or `ws` imports.**

## Performance

- **Duration:** 12 min (approximate)
- **Started:** 2026-04-10T00:20:00Z
- **Completed:** 2026-04-10T00:22:30Z
- **Tasks:** 2
- **Files touched:** 8

## Accomplishments

- Envelope `thread_id` uses the same `[a-zA-Z0-9_-]{1,128}` rule as `space_id`, blocking dots and path-like tokens in conversation route segments.
- `relayRouteKeyFromEnvelope` and `relayRouteFamilyFromKey` implement the documented control vs conversation key shapes with prefix-only classification.
- `TalkieOutboundFrame` / `TalkieInboundFrame` / `TalkieTransport` give relay implementations a minimal send/receive/close contract.

## Task Commits

Each task was committed atomically:

1. **Task 1: Align thread_id token rule and add relay route helpers** — `33b067a` (feat)
2. **Task 2: Relay routing and transport contract tests** — `40b78d4` (feat)
3. **Plan metadata (SUMMARY, STATE, ROADMAP, REQUIREMENTS)** — `docs(01-02)` commit on this branch (final hash in `git log`)

_Note: Task 2 was marked TDD in the plan; routing behavior was implemented in Task 1, so tests were added in Task 2 against the existing module (tests passed on first run)._

## Files Created/Modified

- `packages/protocol/src/envelope.ts` — `thread_id` regex aligned with `space_id`
- `packages/protocol/src/envelope.test.ts` — rejection test for `bad.thread`
- `packages/protocol/src/relay_routing.ts` — route key constants and helpers
- `packages/protocol/src/relay_routing.test.ts` — Vitest coverage for keys and family
- `packages/protocol/src/transport.ts` — `TalkieTransport` frame types
- `packages/protocol/src/index.ts` — barrel exports for routing and transport
- `packages/protocol/README.md` — "## Relay routing" wire contract summary

## Decisions Made

- Used explicit named exports from `index.ts` for relay and transport symbols so acceptance checks (and readers) can see `relayRouteKeyFromEnvelope` without relying on `export *` text matching.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Barrel export visibility for acceptance criteria**

- **Found during:** Task 1 (index exports)
- **Issue:** Plan acceptance runs `grep -q relayRouteKeyFromEnvelope packages/protocol/src/index.ts`; `export * from "./relay_routing.js"` does not contain that substring, so the check failed.
- **Fix:** Replaced star export with an explicit named export list for relay symbols (and added explicit type re-exports for transport in Task 2).
- **Files modified:** `packages/protocol/src/index.ts`
- **Verification:** Acceptance grep chain exits 0; `npx vitest run packages/protocol` passes.
- **Committed in:** `33b067a` / `40b78d4` (index updates)

---

**Total deviations:** 1 auto-fixed (1 blocking)

**Impact on plan:** No behavior change vs intended public API; only export style adjusted for tooling and grep-based acceptance.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 can implement the embedded WebSocket relay against `relayRouteKeyFromEnvelope`, `relayRouteFamilyFromKey`, and `TalkieTransport`.
- Full protocol test suite green: `npx vitest run packages/protocol`.

## Self-Check: PASSED

- Verified paths exist: `packages/protocol/src/relay_routing.ts`, `relay_routing.test.ts`, `transport.ts`, `README.md`, `01-02-SUMMARY.md`
- Verified commits: `33b067a`, `40b78d4` (tasks); planning artifacts in latest `docs(01-02)` commit on branch

---
*Phase: 01-protocol-transport-foundation*
*Completed: 2026-04-10*
