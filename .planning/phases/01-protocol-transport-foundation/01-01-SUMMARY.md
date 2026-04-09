---
phase: 01-protocol-transport-foundation
plan: "01"
subsystem: protocol
tags: [zod, vitest, typescript, json-schema, monorepo]

requires: []
provides:
  - "@agent-talkie/protocol package with parseEnvelope and idempotency guard"
  - "Committed envelope JSON Schema artifact for non-TS adapters"
  - "docs/protocol-upgrades.md for schema negotiation and payload limits"
affects:
  - "01-protocol-transport-foundation (plans 02–03)"
  - relay and adapter phases consuming the wire contract

tech-stack:
  added: "npm workspaces; TypeScript 5.9.3; Vitest 4.1.4; Zod 4.3.6; tsx 4.19.3"
  patterns: "Zod-first envelope; explicit SCHEMA_VERSION_UNSUPPORTED; sync Map idempotency guard"

key-files:
  created:
    - package.json
    - tsconfig.json
    - vitest.config.ts
    - packages/protocol/package.json
    - packages/protocol/tsconfig.json
    - packages/protocol/src/envelope.ts
    - packages/protocol/src/errors.ts
    - packages/protocol/src/idempotency.ts
    - packages/protocol/src/envelope.test.ts
    - packages/protocol/src/idempotency.test.ts
    - packages/protocol/scripts/write-envelope-json-schema.ts
    - packages/protocol/json-schema/envelope.schema.json
    - docs/protocol-upgrades.md
  modified:
    - packages/protocol/src/index.ts

key-decisions:
  - "Timestamp field validated with z.iso.datetime() (Zod 4) for ISO-8601 strings."
  - "parseEnvelope returns discriminated ok/error with VALIDATION_ERROR on Zod failure and schemaVersionUnsupported() outside 1..1."

patterns-established:
  - "Ingress: safeParse then supported integer range before accepting envelope."
  - "Idempotency: application-layer createIdempotencyGuard with documented sync-only contract."

requirements-completed:
  - PROTO-01
  - PROTO-02
  - PROTO-04

duration: 15 min
completed: 2026-04-09
---

# Phase 1 Plan 01: Protocol envelope foundation Summary

**Zod wire envelope with schema-version rejection, in-memory idempotency guard, and generated JSON Schema under `@agent-talkie/protocol`.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-09T08:33:00Z
- **Completed:** 2026-04-09T08:48:00Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

- npm workspaces monorepo with Vitest and the `@agent-talkie/protocol` package.
- `parseEnvelope` implements PROTO-01 field contract, PROTO-04 range rejection with `docs/protocol-upgrades.md` URL, and `VALIDATION_ERROR` on malformed input.
- `createIdempotencyGuard` plus unit tests for PROTO-02 handler deduplication; `npm run generate:schema` emits `envelope.schema.json`.

## Task Commits

Each task was committed atomically (Task 3 used TDD: RED then GREEN):

1. **Task 1: Root and protocol package scaffold** — `f1f7d01` (chore)
2. **Task 2: Envelope Zod schema, errors, and parser** — `d587d7d` (feat)
3. **Task 3: Tests, idempotency guard, JSON Schema artifact, upgrade doc** — `2d586e3` (test, RED) and `01bfc74` (feat, GREEN)

**Plan metadata:** `docs(01-01): complete protocol envelope plan` (SUMMARY, STATE, ROADMAP, REQUIREMENTS)

## Files Created/Modified

- `package.json` / `package-lock.json` — workspaces, test and schema scripts, devDependencies.
- `tsconfig.json`, `vitest.config.ts` — NodeNext strict TS; protocol test glob.
- `packages/protocol/*` — envelope schema, errors, idempotency, tests, JSON Schema generator and artifact.
- `docs/protocol-upgrades.md` — v1 schema scope, upgrade pointer, 256 KiB payload guidance (threat T-01-02).

## Decisions Made

- Used `z.iso.datetime()` for `timestamp` per Zod 4 API (per plan research).
- Centralized `SCHEMA_VERSION_UNSUPPORTED` shape via `schemaVersionUnsupported()` for consistent `upgrade_doc_url` substring check.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 01-02 (NATS subject builders / PROTO-03) can proceed on top of the shared protocol package and committed JSON Schema.

## Self-Check: PASSED

- `test -f packages/protocol/json-schema/envelope.schema.json` — FOUND
- `test -f docs/protocol-upgrades.md` — FOUND
- Task commits `f1f7d01`, `d587d7d`, `2d586e3`, `01bfc74` present on branch; planning metadata committed with SUMMARY

---
*Phase: 01-protocol-transport-foundation*
*Completed: 2026-04-09*
