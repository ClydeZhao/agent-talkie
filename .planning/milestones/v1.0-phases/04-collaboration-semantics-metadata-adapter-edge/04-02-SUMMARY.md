---
phase: 04-collaboration-semantics-metadata-adapter-edge
plan: 02
subsystem: api
tags: [relay, websocket, orchestrator, collaboration, vitest, zod]

requires:
  - phase: 04-01
    provides: getOrchestratorSessionId, collaboration-wire Zod, metadata upserts, isHuman on sessions
provides:
  - Human undirected conversation routes to orchestrator or no_orchestrator / orchestrator_offline
  - Collaboration control handlers (designate, clear, task.assign ACL, metadata.patch, metadata.query)
  - Vitest routing matrix for orchestrator defaults and agent fan-out
affects:
  - 04-03 adapters and client
  - REQUIREMENTS.md MSG/META checkboxes

tech-stack:
  added: []
  patterns:
    - "Pre-routeEnvelope handleCollaborationControl for collaboration control types"
    - "Transcript skip list includes metadata.query alongside transcript.query"

key-files:
  created:
    - packages/relay/src/collaboration-handlers.ts
    - packages/relay/src/__tests__/router-orchestrator.test.ts
  modified:
    - packages/relay/src/router.ts
    - packages/relay/src/server.ts

key-decisions:
  - "Exported pruneTranscriptIfOverCap from router so handlers append transcript with same cap behavior."
  - "task.assign returns false from handler so routeEnvelope records transcript and delivers to envelope.to."
  - "orchestrator.clear non-human sender uses orchestrator_designate_forbidden (human-only gate shared with designate)."

patterns-established:
  - "collaboration.orchestrator fan-out excludes sender; idempotency replay for designate/clear skips duplicate transcript and fan-out when state matches."

requirements-completed:
  - MSG-04
  - MSG-05
  - MSG-06
  - META-01
  - META-02
  - META-03
  - META-04

duration: 25min
completed: 2026-04-13
---

# Phase 4 Plan 02: Relay orchestrator routing & collaboration handlers Summary

**Relay enforces human→orchestrator default routing, Zod-backed collaboration controls with ACL and idempotency, metadata snapshot query, and Vitest coverage — without a separate transport (ADAPT-03).**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-13
- **Completed:** 2026-04-13
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Extended `routeEnvelope` so human undirected `conversation` targets the space orchestrator or fails with `no_orchestrator` / `orchestrator_offline`; non-human undirected fan-out unchanged; explicit `to` unchanged (MSG-05).
- Added `handleCollaborationControl` for designate/clear (human + idempotency + `collaboration.orchestrator` fan-out + transcript), `task.assign` orchestrator ACL then normal routing, `metadata.patch` with namespace ACL and `collaboration.metadata` broadcast + transcript, and `metadata.query` snapshot response without transcript.
- Shipped `router-orchestrator.test.ts` proving routing matrix and documented optional MSG-06 payload keys `threadId` / `forHumanSummary` for clients.

## Task Commits

Each task was committed atomically:

1. **Task 1: routeEnvelope — human default + orchestrator offline** — `a06238b` (feat)
2. **Task 2: Vitest — routing matrix for orchestrator defaults** — `a0c8928` (test)
3. **Task 3: collaboration-handlers + dispatch wiring** — `acc43c0` (feat)

## Files Created/Modified

- `packages/relay/src/router.ts` — Orchestrator default branch; `getSessionById` guard; `metadata.query` in skip-transcript set; export `pruneTranscriptIfOverCap`
- `packages/relay/src/__tests__/router-orchestrator.test.ts` — Routing matrix tests
- `packages/relay/src/collaboration-handlers.ts` — Collaboration control dispatch
- `packages/relay/src/server.ts` — `handleCollaborationControl` before `routeEnvelope`

## Deviations from Plan

None — plan executed as written.

## Threat Flags

None beyond plan `threat_model` mitigations implemented in handler ACLs and Zod parsing.

## Known Stubs

None — no placeholder delivery paths for the plan’s required behaviors.

## Issues Encountered

None.

## User Setup Required

None.

## Self-Check: PASSED

- `04-02-SUMMARY.md` present at `.planning/phases/04-collaboration-semantics-metadata-adapter-edge/04-02-SUMMARY.md`
- Commits `a06238b`, `a0c8928`, `acc43c0` on branch
