---
phase: 10-interactive-human-controls
plan: "01"
subsystem: ui
tags: [lit, websocket, relay, envelope, vitest]

requires:
  - phase: 09-core-oversight-ui
    provides: roster, transcript, error bar, BrowserSessionBridge inbound path
provides:
  - Relay sender echo for human `conversation` on orchestrator, direct, and broadcast paths
  - `BrowserSessionBridge.sendEnvelope` with `safeParseEnvelope` and readiness gates
  - `talkie-send-bar` + `DashboardStore` send-target state + roster-driven direct target (D-04)
affects:
  - 10-02-PLAN (orchestrator designate/clear can reuse bridge patterns)
  - 10-03-PLAN (idempotency replay; envelopes already carry `idempotencyKey`)

tech-stack:
  added: []
  patterns:
    - "Outbound envelopes: same fields as joinSpace (`version`, `id`, `sessionId`, `idempotencyKey`, `spaceId`)"
    - "UI send target: `sendTargetSessionId` null = orchestrator branch; UUID = `chat.direct` + `to`"

key-files:
  created:
    - packages/relay/src/__tests__/router-human-conversation-echo.test.ts
    - packages/dashboard/src/shell/talkie-send-bar.ts
  modified:
    - packages/relay/src/router.ts
    - packages/relay/src/__tests__/router-orchestrator.test.ts
    - packages/dashboard/src/bridge/browser-session-bridge.ts
    - packages/dashboard/src/bridge/browser-session-bridge.test.ts
    - packages/dashboard/src/store/dashboard-store.ts
    - packages/dashboard/src/demo/main.ts
    - packages/dashboard/src/roster/talkie-roster-entry.ts

key-decisions:
  - "Reused existing `getNegotiatedEnvelopeVersion()` instead of adding `getNegotiatedVersion()` alias."
  - "Roster rows emit `talkie-toggle-send-target` (bubbles/composed) so demo wires `toggleSendTargetSession` without coupling roster to the store type."

patterns-established:
  - "Human `conversation` echo uses the same serialized `wire` as delivery after successful routing (T-10-01-02)."

requirements-completed: [CTRL-01]

duration: 25min
completed: 2026-04-20
---

# Phase 10 Plan 01: Interactive send path (CTRL-01) Summary

**Human dashboard send path with relay echo: `sendEnvelope` on the bridge, Lit `talkie-send-bar` (orchestrator vs direct, D-05 gate), and `senderWs.send(wire)` for `isHuman` + `conversation` after successful routes.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-04-20
- **Tasks:** 3
- **Files touched:** 9 (2 new)

## Accomplishments

- Relay mirrors validated JSON to the human sender on orchestrator success, direct `conversation` (including offline target), and post-broadcast loop for human senders only.
- Bridge `sendEnvelope` enforces handshake/session/socket readiness and rejects invalid envelopes before `ws.send`.
- Dashboard store tracks `sendTargetSessionId` with `toggleSendTargetSession` / `setSendTargetOrchestratorDefault` and `isDefaultOrchestratorSendBlocked` for D-05.

## Task Commits

1. **Task 1: Relay — human conversation sender echo** — `2dee370` (feat)
2. **Task 2: BrowserSessionBridge — sendEnvelope** — `76ffbb0` (feat)
3. **Task 3: Send bar, store, demo wiring** — `3b0eca9` (feat)

## Files Created/Modified

- `packages/relay/src/router.ts` — `senderWs.send(wire)` on guarded success paths.
- `packages/relay/src/__tests__/router-human-conversation-echo.test.ts` — echo + non-human control + offline direct echo.
- `packages/relay/src/__tests__/router-orchestrator.test.ts` — human sender now receives one echo frame.
- `packages/dashboard/src/bridge/browser-session-bridge.ts` — `sendEnvelope`, `getRegisteredSessionId`.
- `packages/dashboard/src/bridge/browser-session-bridge.test.ts` — `not_ready`, `socket_not_open`, invalid envelope, happy path.
- `packages/dashboard/src/store/dashboard-store.ts` — send target state and D-05 predicate.
- `packages/dashboard/src/shell/talkie-send-bar.ts` — bottom composer, Ctrl+Enter, D-05 copy, dismiss for direct target.
- `packages/dashboard/src/demo/main.ts` — mounts send bar; listens for roster target toggle.
- `packages/dashboard/src/roster/talkie-roster-entry.ts` — row click / keyboard fires `talkie-toggle-send-target`.

## Decisions Made

- Used `getNegotiatedEnvelopeVersion()` for UI envelope `version` (plan-optional alias not added).
- Wired D-04 roster selection via a bubbling custom event so the roster component stays free of `DashboardStore` imports.

## Deviations from Plan

### Scope adjustment (D-04 wiring)

- **Task 3 file list** named `dashboard-store.ts`, `talkie-send-bar.ts`, `demo/main.ts`, `package.json` only. **`talkie-roster-entry.ts` was updated** so clicking a roster row toggles the send target (required by D-04 / plan must-haves). `package.json` needed no changes.

Otherwise none — plan executed as specified.

## Issues Encountered

None.

## Threat Flags

None beyond the plan’s `<threat_model>` (client validation + echo uses existing `wire`).

## Known Stubs

None for CTRL-01 scope (retry UI / server idempotency remain 10-03).

## User Setup Required

None.

## Next Phase Readiness

- 10-02 can add orchestrator designate/clear consumption; send path and echo are in place.
- 10-03 can attach conversation idempotency handling; outbound keys are already generated per send.

## Self-Check: PASSED

- `packages/relay/src/router.ts` exists; `senderWs.send(wire)` appears only after `senderSession.isHuman` + `envelope.kind === "conversation"` guards (orchestrator branch inherently human-only).
- `packages/relay/src/__tests__/router-human-conversation-echo.test.ts` exists.
- `packages/dashboard/src/shell/talkie-send-bar.ts` exists with `@customElement("talkie-send-bar")` and substring `Designate an orchestrator to send messages`.
- Commits `2dee370`, `76ffbb0`, `3b0eca9` present on branch.

---
*Phase: 10-interactive-human-controls*
*Completed: 2026-04-20*
