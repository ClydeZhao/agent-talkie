---
phase: 08-dashboard-distribution-cli-entry
plan: "01"
subsystem: infra
tags: [relay, sirv, dashboard, vitest, http, spa]

requires:
  - phase: 08-02
    provides: "Plan metadata lists depends_on; relay work aligns with distribution context"
provides:
  - "/dashboard static hosting from @agent-talkie/dashboard dist-app via sirv (SPA single fallback)"
  - "Unified HTTP handler: WebSocket passthrough, conditional health, 404 for unmatched paths"
affects:
  - "08-dashboard-distribution-cli-entry (later CLI dashboard command)"
  - "CONN-03 production same-origin static hosting"

tech-stack:
  added: ["sirv@^3.0.2", "@agent-talkie/dashboard workspace dependency in relay"]
  patterns:
    - "createRequire(import.meta.url).resolve('@agent-talkie/dashboard/package.json') + dist-app"
    - "Module-scoped cached sirv instance with single:true for SPA fallback"

key-files:
  created: []
  modified:
    - "packages/relay/src/server.ts"
    - "packages/relay/src/server.test.ts"
    - "packages/relay/package.json"
    - "package-lock.json"

key-decisions:
  - "Followed D-01/D-03: /dashboard prefix with sirv single:true fallback to index.html"
  - "Followed D-02: health and WebSocket upgrade behavior unchanged for guarded paths"

patterns-established:
  - "One server.on('request') chain ordered: upgrade → health (if token) → /dashboard* → 404"

requirements-completed: [CONN-03]

duration: ~12min
completed: 2026-04-17
---

# Phase 08 Plan 01: Relay /dashboard static hosting Summary

**Relay now serves the built dashboard from package `dist-app` under `/dashboard` using sirv with SPA fallback, while keeping health and WebSocket upgrade semantics and eliminating hung HTTP responses on unknown paths.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-17T08:58:00Z (approx.)
- **Completed:** 2026-04-17T09:01:00Z (approx.)
- **Tasks:** 1 (TDD: test commit + implementation commit)
- **Files modified:** 4

## Accomplishments

- Added Vitest coverage for health JSON, `/dashboard` HTML shell, and `404` for `/` and unknown paths.
- Wired `sirv` to `resolveDashboardAppDir()` and a single HTTP request pipeline after `http.createServer()`.
- Extended relay `pretest` to build `@agent-talkie/dashboard` so `dist-app` exists before relay tests.

## Task Commits

Each task was committed atomically (TDD RED then GREEN):

1. **Task 1: relay 依赖与 /dashboard sirv 挂载** — `22b242b` (test)
2. **Task 1 (implementation)** — `043227a` (feat)

**Documentation:** This summary is committed separately with message `docs(08-01): add plan completion summary for relay /dashboard hosting`.

## Files Created/Modified

- `packages/relay/src/server.ts` — Unified HTTP handler; cached sirv for `/dashboard*`; health when `relayGenerationToken` set; plain 404 otherwise.
- `packages/relay/src/server.test.ts` — HTTP integration tests for health, dashboard HTML marker, and 404 paths.
- `packages/relay/package.json` — `sirv`, `@agent-talkie/dashboard`, extended `pretest`.
- `package-lock.json` — Lockfile for new relay dependencies.

## Decisions Made

- Used module-level cached `sirv(..., { single: true, dev: false })` per plan.
- Restored `req.url` on `finish`/`close` and in sirv fallback to avoid leaking rewritten URLs on the request object.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — `npm run test -w @agent-talkie/relay` passed after implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Relay-side static hosting for CONN-03 is in place; follow-on work (e.g. `talkie dashboard` CLI) can assume `/dashboard` on the relay HTTP origin.

---

*Phase: 08-dashboard-distribution-cli-entry*  
*Completed: 2026-04-17*

## Self-Check: PASSED

- `packages/relay/src/server.ts` — FOUND
- `packages/relay/src/server.test.ts` — FOUND
- Commits `22b242b`, `043227a` — FOUND on branch; docs commit findable via `git log --oneline --grep 'docs(08-01)'`
