---
phase: 05-cross-runtime-proof-human-oversight
plan: 02
subsystem: adapters
tags: [codex, websocket, content-length, stdio, vitest, relay]

requires:
  - phase: 05-cross-runtime-proof-human-oversight
    provides: Phase 05-01 and prior relay/client/protocol stack
provides:
  - "@agent-talkie/adapter-codex workspace package with talkie-codex-adapter CLI"
  - "Bidirectional Content-Length framing between Codex child and TalkieSessionClient"
  - "TalkieSessionClient.joinSpace for slug-based space.join after registerSession"
  - "Stderr heuristic → metadata.patch progress blocked (OVER-02) with cooldown and space gating"
affects:
  - "Cross-runtime proof harnesses and human-oversight metadata surfaces"

tech-stack:
  added: ["@agent-talkie/adapter-codex (internal workspace)"]
  patterns:
    - "Injectable spawn / ensureRelay / TalkieSessionClient for adapter unit tests"
    - "Downstream framed writes with bounded queue (100) and drain backpressure"

key-files:
  created:
    - packages/adapter-codex/package.json
    - packages/adapter-codex/src/codex-bridge.ts
    - packages/adapter-codex/src/codex-bridge.test.ts
    - packages/adapter-codex/src/cli.ts
    - packages/adapter-codex/src/index.ts
    - packages/adapter-codex/README.md
    - packages/adapter-codex/tsconfig.json
    - packages/adapter-codex/tsup.config.ts
    - packages/adapter-codex/vitest.config.ts
    - packages/client/src/session-client.join.test.ts
  modified:
    - package.json
    - package-lock.json
    - packages/client/package.json
    - packages/client/src/session-client.ts

key-decisions:
  - "Reuse adapter-stdio exports (ContentLengthFrameReader, MAX_FRAME_BODY_BYTES, createBoundedQueue) for D-02 framing parity"
  - "Forward agent-destined envelopes when sessionId or to matches registered session; whitelist control types (task.*, metadata.patch/query, orchestrator.*) plus all conversation"

requirements-completed: [ADAPT-02, OVER-02]

duration: prior session (~5 min implementation spread across two commits)
completed: 2026-04-14
---

# Phase 05 Plan 02: Codex stdio adapter Summary

**Shipped `@agent-talkie/adapter-codex` with bidirectional Content-Length framing to the Codex child, `joinSpace` on the shared client, and stderr-driven `metadata.patch` blocked self-report with cooldown—verified by Vitest mocks (no Codex binary in CI).**

## Performance

- **Duration:** Recorded from git history: Task 1 ~4.5 min before Task 2 commit (2026-04-13); summary finalized 2026-04-14
- **Started:** 2026-04-13T10:02:48Z (approx., commit `721c8d8`)
- **Completed:** 2026-04-14 (SUMMARY artifact)
- **Tasks:** 2
- **Files touched (Tasks 1–2):** 14 paths (see `git diff --name-only 721c8d8^..349721c`)

## Accomplishments

- New workspace package builds and exposes `talkie-codex-adapter`; root `build` / `test` scripts include it after `@agent-talkie/adapter-stdio`.
- `runCodexAdapter` bridges child stdout frames through `safeParseEnvelope` to the relay and writes relay-originated envelopes to child stdin with `Content-Length` headers and queue/drain handling.
- `TalkieSessionClient.joinSpace` sends the relay integration `space.join` shape; tests cover join after register.
- Stderr lines matching `\b(permission|approval|confirm)\b` emit a single `metadata.patch` per cooldown when a space id is active; no-space path warns once via structured stderr JSON.

## Task Commits

Each task was committed atomically:

1. **Task 1: Monorepo package adapter-codex (build + bin)** — `721c8d8` (chore)
2. **Task 2: Codex bridge, stderr blocked heuristic, tests** — `349721c` (feat; includes `codex-bridge.test.ts` and client `joinSpace` + tests)

**Plan metadata:** separate `docs(05-02)` commit adds this SUMMARY only (see `git log --oneline -- .planning/phases/05-cross-runtime-proof-human-oversight/05-02-SUMMARY.md`).

## Files Created/Modified

- `packages/adapter-codex/**` — CLI, bridge, Vitest suite, README (trust boundary for `TALKIE_CODEX_COMMAND`).
- `packages/client/src/session-client.ts` — `joinSpace`, pending join dispatch, `registeredSessionId` guard.
- `packages/client/src/session-client.join.test.ts` — mock WebSocket asserts `space.join` wire shape.
- `package.json` / `package-lock.json` — workspaces and aggregate build/test order.

## Decisions Made

- Mirrored stdio adapter tsup dual-entry (library + CLI shebang) and dependency order in `pretest`.
- Downstream filtering uses `sessionId` / `to` match plus control whitelist aligned with collaboration control traffic.

## Deviations from Plan

None - plan executed exactly as written. Task 2 TDD RED/GREEN landed in one feat commit with tests (acceptable atomic unit for the task).

## Issues Encountered

None during verification (`npm run build -w @agent-talkie/adapter-codex`, `npm run test -w @agent-talkie/client`, `npm run test -w @agent-talkie/adapter-codex` all exit 0).

## User Setup Required

Optional manual cross-runtime proof: install Codex CLI, set `TALKIE_CODEX_SPACE_ID` or `TALKIE_CODEX_JOIN_SLUG`, run `talkie-codex-adapter` after build. See plan `user_setup` and `packages/adapter-codex/README.md`.

## Next Phase Readiness

Adapter-codex satisfies ADAPT-02 / OVER-02 wiring for stdio-side Codex proof; ready for orchestrator to update `.planning/STATE.md`, `.planning/ROADMAP.md`, and requirement checkboxes when the wave completes.

## Self-Check: PASSED

- `packages/adapter-codex/src/codex-bridge.ts` — FOUND
- `packages/adapter-codex/src/codex-bridge.test.ts` — FOUND
- `packages/client/src/session-client.join.test.ts` — FOUND
- Commits `721c8d8`, `349721c` — FOUND on branch

---
*Phase: 05-cross-runtime-proof-human-oversight*
*Completed: 2026-04-14*
