---
phase: 08-dashboard-distribution-cli-entry
plan: 02
subsystem: ui
tags: [vite, dashboard, monorepo, websocket, spa]

requires:
  - phase: 08-dashboard-distribution-cli-entry
    provides: Phase 08 context for relay-hosted static dashboard (CONN-03)
provides:
  - Second Vite pipeline (`vite.app.config.ts`) emitting SPA to `dist-app/` with `base: '/dashboard/'`
  - `build:lib` + `build:app` npm scripts and combined `build`
  - Demo entry using same-host WebSocket in production builds
  - Root `npm run build` ordering dashboard before relay
affects:
  - relay static hosting of dashboard assets
  - future dashboard distribution plans

tech-stack:
  added: []
  patterns:
    - "Dual Vite targets: library `dist/` vs application `dist-app/` to avoid emptyOutDir collisions"
    - "Production WebSocket URL derived from `location` for same-origin deployment"

key-files:
  created:
    - packages/dashboard/vite.app.config.ts
  modified:
    - packages/dashboard/package.json
    - packages/dashboard/src/demo/main.ts
    - package.json
    - .gitignore

key-decisions:
  - "Ignore `dist-app/` in repo `.gitignore` like `dist/`, since both are build outputs (plan listed only package files)."

patterns-established:
  - "Dashboard SPA build: `vite build --config vite.app.config.ts` → `dist-app/` with asset prefix `/dashboard/`."

requirements-completed: [CONN-03]

duration: 5min
completed: 2026-04-17
---

# Phase 08 Plan 02: Dashboard dual build & prod WebSocket Summary

**Vite application build to `dist-app/` with `base: '/dashboard/'`, plus production same-origin `wsUrl` from `location` and monorepo build order dashboard-before-relay.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-17T08:50:00Z (approx.)
- **Completed:** 2026-04-17T08:54:53Z
- **Tasks:** 2
- **Files modified:** 5 (including `.gitignore`)

## Accomplishments

- Added `vite.app.config.ts` mirroring dev proxy from lib config while targeting `index.html` and `dist-app/`.
- Split dashboard `build` into lib + app so `dist/` and `dist-app/` are both produced without wiping each other.
- Demo connects to `ws://127.0.0.1:18765` in dev and to `ws(s)://{location.host}` in production builds.
- Root `scripts.build` builds `@agent-talkie/dashboard` immediately before `@agent-talkie/relay`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Vite app 配置与 npm scripts** — `7a9f4a1` (feat)
2. **Task 2: demo WebSocket 同源与根构建顺序** — `b5678b3` (feat)

**Plan summary:** 本 `08-02-SUMMARY.md` 以独立 `docs(08-02)` 提交落库；`STATE.md` / `ROADMAP.md` / 需求勾选由 orchestrator 维护，本次执行未修改。

## Files Created/Modified

- `packages/dashboard/vite.app.config.ts` — SPA build: `base: '/dashboard/'`, `outDir: 'dist-app'`, Rollup input `index.html`.
- `packages/dashboard/package.json` — `build:lib` / `build:app` / `build`; `files` includes `dist` and `dist-app`.
- `packages/dashboard/src/demo/main.ts` — `wsUrl` branches on `import.meta.env.DEV` vs `location`.
- `package.json` (root) — `build` chain runs dashboard before relay.
- `.gitignore` — `dist-app/` ignored (build artifact, analogous to `dist/`).

## Decisions Made

- Added root `.gitignore` entry for `dist-app/` so local builds do not leave untracked trees; npm `files` still publishes both directories from a clean publish workflow.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ignore `dist-app/` build output in git**

- **Found during:** Task 1 (post-build verification / `git status`)
- **Issue:** `dist-app/` is generated but not matched by existing `dist/` ignore rule, leaving persistent untracked files.
- **Fix:** Append `dist-app/` to repository `.gitignore`.
- **Files modified:** `.gitignore`
- **Verification:** `git status` clean for `dist-app/` after build (ignored).
- **Committed in:** `7a9f4a1` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)

**Impact on plan:** No change to shipped behavior; keeps working tree clean without committing build artifacts.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Relay can depend on pre-built `dist-app` during root `npm run build`.
- Verify relay integration in the next plan that wires static file serving.

---

## Self-Check: PASSED

- `packages/dashboard/vite.app.config.ts` exists on disk.
- `packages/dashboard/dist-app/index.html` exists after `npm run build -w @agent-talkie/dashboard` (ignored by git).
- Task commits `7a9f4a1` and `b5678b3` exist on current branch.

---

_Phase: 08-dashboard-distribution-cli-entry_

_Completed: 2026-04-17_
