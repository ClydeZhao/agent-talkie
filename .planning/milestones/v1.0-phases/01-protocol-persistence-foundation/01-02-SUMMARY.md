---
phase: 01-protocol-persistence-foundation
plan: "02"
subsystem: protocol
tags: [zod, json-schema, vitest, handshake, version-negotiation]

requires:
  - phase: 01-protocol-persistence-foundation
    provides: Plan 01-01 envelope Zod schema and package layout
provides:
  - draft-2020-12 JSON Schema artifact for the message envelope
  - Pure handshake helpers (range overlap, agreed version, version_mismatch failure shape)
affects:
  - Phase 2 relay (handshake and schema pinning)
  - Non-TypeScript consumers of the wire contract

tech-stack:
  added: [tsx]
  patterns:
    - "npm script build:schema runs tsx export script against the same Zod source as runtime"
    - "Handshake negotiation as pure functions + Zod schemas for wire payloads"

key-files:
  created:
    - packages/protocol/scripts/export-envelope-schema.ts
    - packages/protocol/schemas/envelope.schema.json
    - packages/protocol/schemas/.gitkeep
    - packages/protocol/src/handshake.ts
    - packages/protocol/src/handshake.test.ts
  modified:
    - packages/protocol/package.json
    - packages/protocol/src/index.ts
    - package-lock.json

key-decisions:
  - "Agreed protocol version when ranges overlap is Math.min(relay.maxVersion, client.maxVersion) per plan normative rule (aligns with D-10 / PROTO-06)."
  - "version_mismatch failures include relay supportedVersions so clients can adjust without guessing (D-10)."

patterns-established:
  - "Schema export: z.toJSONSchema(envelopeSchema, { target: 'draft-2020-12' }) committed as schemas/envelope.schema.json"

requirements-completed: [PROTO-02, PROTO-06]

duration: 12min
completed: 2026-04-10
---

# Phase 1 Plan 02: JSON Schema export and handshake negotiation Summary

**Envelope JSON Schema generated from Zod via `z.toJSONSchema()` (draft-2020-12), plus pure handshake range overlap, agreed version, and structured `version_mismatch` failures including relay-supported ranges.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-10T02:24:00Z
- **Completed:** 2026-04-10T02:36:11Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- `npm run build:schema -w @agent-talkie/protocol` writes `schemas/envelope.schema.json` from `envelopeSchema`.
- `handshake.ts` exposes `supportedVersionsSchema`, overlap and agreement helpers, and `buildVersionMismatchFailure` for D-10-style rejections.
- Vitest covers overlap success, non-overlap throw, and Zod validation of the mismatch payload.

## Task Commits

Each task was committed atomically:

1. **Task 1: JSON Schema export script and npm script** — `a62bce8` (feat)
2. **Task 2: Handshake Zod schemas and version negotiation helpers** — `35c0e3d` (feat)
3. **Task 3: Handshake unit tests** — `21ba9dd` (test)

**Plan metadata:** Planning files committed together with message `docs(01-02): complete JSON Schema export and handshake plan` (see `git log --oneline -1 -- .planning/phases/01-protocol-persistence-foundation/01-02-SUMMARY.md`).

_Note: TDD was not required for this plan._

## Files Created/Modified

- `packages/protocol/scripts/export-envelope-schema.ts` — ESM script: `z.toJSONSchema` + `writeFileSync` under `schemas/`.
- `packages/protocol/schemas/envelope.schema.json` — Generated draft-2020-12 schema for the envelope.
- `packages/protocol/schemas/.gitkeep` — Ensures `schemas/` is tracked before first generation.
- `packages/protocol/package.json` — `tsx` devDependency, `build:schema` script.
- `package-lock.json` — Lockfile for new dev dependency.
- `packages/protocol/src/handshake.ts` — Negotiation helpers and Zod types.
- `packages/protocol/src/index.ts` — Re-exports handshake API.
- `packages/protocol/src/handshake.test.ts` — Unit tests for overlap, agree, and mismatch payload.

## Decisions Made

- Followed plan normative rule: when client and relay ranges overlap, agreed version is `Math.min(relay.maxVersion, client.maxVersion)`.
- Structured rejection uses `error: 'version_mismatch'`, full `relay` supported range, and a non-empty `message` (default string in `buildVersionMismatchFailure`).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PROTO-02 and PROTO-06 requirements for this slice are satisfied in `@agent-talkie/protocol`.
- Ready for `01-03-PLAN.md` (SQLite migrations and DB open path) without blocking on schema or handshake math.

---
*Phase: 01-protocol-persistence-foundation*
*Completed: 2026-04-10*

## Self-Check: PASSED

- `packages/protocol/schemas/envelope.schema.json` — FOUND
- `packages/protocol/scripts/export-envelope-schema.ts` — FOUND
- `packages/protocol/src/handshake.ts` — FOUND
- `packages/protocol/src/handshake.test.ts` — FOUND
- Task commits `a62bce8`, `35c0e3d`, `21ba9dd` present on branch; planning closure commit includes this file with message `docs(01-02): complete JSON Schema export and handshake plan`
