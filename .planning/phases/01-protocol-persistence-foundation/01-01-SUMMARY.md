---
phase: 01-protocol-persistence-foundation
plan: "01"
subsystem: protocol
tags: [zod, vitest, tsup, npm-workspaces, typescript, uuid]

requires: []
provides:
  - "@agent-talkie/protocol package with flat JSON envelope (Zod 4)"
  - "envelopeSchema, safeParseEnvelope, parseEnvelope, formatEnvelopeIssues"
  - "Vitest coverage for valid/invalid envelope cases"
affects:
  - "01-protocol-persistence-foundation"
  - "Phase 2 relay validation"

tech-stack:
  added: [zod ^4.3.6, uuid ^13.0.0, tsup ^8.5.1, vitest ^4.1.4, typescript ^5.9.3]
  patterns:
    - "npm workspaces monorepo with packages/protocol"
    - "sessionId enforced as UUID v7 via uuid.version + Zod superRefine"
    - "safeParse for untrusted wire input; parseEnvelope for trusted paths"

key-files:
  created:
    - package.json
    - tsconfig.base.json
    - packages/protocol/package.json
    - packages/protocol/tsconfig.json
    - packages/protocol/tsup.config.ts
    - packages/protocol/vitest.config.ts
    - packages/protocol/src/index.ts
    - packages/protocol/src/envelope.ts
    - packages/protocol/src/envelope.test.ts
  modified: []

key-decisions:
  - "Introduced exported SafeParseEnvelopeResult as ReturnType<typeof envelopeSchema.safeParse> because Zod 4’s published types do not expose z.SafeParseReturnType on the default import namespace."

patterns-established:
  - "Root scripts delegate build/test to workspace @agent-talkie/protocol."
  - "Envelope issues formatted with dot-joined paths for structured client errors."

requirements-completed: [PROTO-01, PROTO-03, PROTO-04, PROTO-05]

duration: 5min
completed: 2026-04-10
---

# Phase 1 Plan 01: Monorepo + Zod envelope Summary

**Versioned flat message envelope (Zod 4) with UUID v7 `sessionId`, control/conversation `kind`, optional idempotency key and `seq`, and `to` / `spaceId` addressing — built as `@agent-talkie/protocol` with Vitest.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-10T02:27:00Z
- **Completed:** 2026-04-10T02:32:00Z
- **Tasks:** 3
- **Files modified:** 10 (excluding lockfile counted in Task 1)

## Accomplishments

- npm workspaces root with `packages/*` and protocol-only `build` / `test` scripts.
- `envelopeSchema` matching D-01/D-03/D-09/D-11 with `formatEnvelopeIssues` for structured Zod errors.
- Five Vitest cases covering success, missing `version`, v4 `sessionId`, bad `kind`, and optional `idempotencyKey` + `seq`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Root workspace and packages/protocol package skeleton** — `a8c9696` (feat)
2. **Task 2: Zod envelope schema and parse helpers** — `f03f254` (feat)
3. **Task 3: Vitest table-driven envelope validation** — `db7d6ee` (test)
4. **Barrel export `SafeParseEnvelopeResult`** — `6f8a51e` (refactor)

**Plan metadata:** `docs(01-01): complete monorepo + Zod envelope plan` (SUMMARY + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified

- `package.json` — workspaces, engines, aggregate scripts.
- `package-lock.json` — workspace install lockfile.
- `tsconfig.base.json` — shared strict ES2022 / NodeNext options.
- `packages/protocol/package.json` — package metadata, deps, build/test scripts.
- `packages/protocol/tsconfig.json` — extends base, `src` → `dist`.
- `packages/protocol/tsup.config.ts` — ESM+CJS+dts bundle.
- `packages/protocol/vitest.config.ts` — Node test environment, `src/**/*.test.ts`.
- `packages/protocol/src/index.ts` — re-exports envelope API.
- `packages/protocol/src/envelope.ts` — schema, parsers, issue formatter.
- `packages/protocol/src/envelope.test.ts` — table-driven validation tests.

## Decisions Made

- Used `SafeParseEnvelopeResult` type alias derived from `ReturnType<typeof envelopeSchema.safeParse>` so declaration emit succeeds under Zod 4.3.6 (no `z.SafeParseReturnType` on default `z` import).

## Deviations from Plan

### Process

- Task 3 was tagged `tdd="true"` in the plan; execution kept **one commit per plan task** (tests committed with passing implementation in Task 3) rather than separate RED/GREEN commits.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Zod 4 typing for safe parse return type**

- **Found during:** Task 2 (envelope helpers)
- **Issue:** `z.SafeParseReturnType` is not available on the Zod 4 namespace used by `tsc`/`tsup` dts build; DTS build failed.
- **Fix:** Exported `SafeParseEnvelopeResult` as `ReturnType<typeof envelopeSchema.safeParse>` and typed `safeParseEnvelope` / `formatEnvelopeIssues` accordingly; annotated map callback with `z.core.$ZodIssue` to satisfy strict `noImplicitAny`.
- **Files modified:** `packages/protocol/src/envelope.ts`
- **Verification:** `npm run build -w @agent-talkie/protocol` passes.
- **Committed in:** `f03f254`

---

**Total deviations:** 1 auto-fixed (blocking typings)

**Impact on plan:** No wire-shape or behavior change; public API matches plan with an additional exported type alias for consumers.

## Issues Encountered

None beyond the Zod 4 DTS typing adjustment above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 01-02 can add JSON Schema export and handshake types on top of `envelopeSchema`.
- Relay (Phase 2) can import `@agent-talkie/protocol` for identical validation.

## Self-Check: PASSED

- `01-01-SUMMARY.md` present at `.planning/phases/01-protocol-persistence-foundation/01-01-SUMMARY.md`.
- Commits `a8c9696`, `f03f254`, `db7d6ee`, `6f8a51e` on branch history.

---
*Phase: 01-protocol-persistence-foundation*
*Completed: 2026-04-10*
