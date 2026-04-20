---
status: awaiting_human_verify
trigger: "Phase 9 dashboard: roster missing role/focus for agents; metadata.patch crashes relay (OPEN on undefined)"
created: 2026-04-20T00:00:00Z
updated: 2026-04-20T00:00:00Z
---

## Current Focus

hypothesis: (verified) Optional chaining bug + profile ACL + dashboard ignored `collaboration.metadata`.
test: Full `npm test`; relay integration tests for fan-out + ACL.
expecting: Human confirms browser roster + no disconnect under live metadata.
next_action: User confirms in real `/dashboard` walkthrough.

## Symptoms

expected:
1. Dashboard roster shows runtime, workspace, role, focus, progress, blocked for all sessions.
2. Live metadata.patch must not crash relay.

actual:
1. Role/focus missing for agent sessions in oversight summary / roster.
2. metadata.patch fan-out crashes relay with TypeError reading 'OPEN' of undefined.

errors:
- `TypeError: Cannot read properties of undefined (reading 'OPEN')` in collaboration-handlers.ts (fan-out loops).

reproduction:
1. Relay + /dashboard, human + 2 agents in space.
2. Agents send profile metadata.patch.
3. Observe empty role/focus; later crash on broadcast.

started: 2026-04-17 browser walkthrough

## Eliminated

- hypothesis: oversight SQL omitted role/focus for agents
  evidence: `getOversightSpaceSummaryBySlug` already LEFT JOINs `collaboration_profile`; empty values were from patches never persisted.
  timestamp: 2026-04-20

## Evidence

- collaboration-handlers.ts L78, L364: `sock?.readyState === sock.OPEN` — RHS uses sock when sock may be undefined.
- router.ts L179, L197: same anti-pattern.
- collaboration-handlers.ts L309-317: profile namespace requires sender `isHuman`, blocking agent self-profile.

## Resolution

root_cause: |
  (1) `sock?.readyState === sock.OPEN` evaluates `sock.OPEN` when `sock` is undefined (JavaScript does not short-circuit the RHS), throwing in metadata/orchestrator fan-out and broadcast loops.
  (2) Relay rejected all non-human `metadata.patch` with namespace `profile`, so agent role/focus never reached `collaboration_profile` or HTTP space-summary.
  (3) Dashboard only applied `metadata.patch` envelopes; live peer updates arrive as `collaboration.metadata`, so roster chips did not update until HTTP refresh.

fix: |
  Use `WebSocket.OPEN` for optional socket checks in relay.
  Allow agents to patch own profile only; humans may still target other members with membership check.
  Parse `collaboration.metadata` in `BrowserSessionBridge`, `applyCollaborationMetadataWire` on `DashboardStore`, wire in `demo/main.ts`.

verification: |
  `npm test` (all workspaces) passed. New relay tests: fan-out with absent socket + agent cross-profile forbidden. New dashboard tests: store merge + bridge delivery.

files_changed:
  - packages/relay/src/collaboration-handlers.ts
  - packages/relay/src/router.ts
  - packages/relay/src/server.test.ts
  - packages/protocol/src/collaboration-wire.ts
  - packages/dashboard/src/bridge/wire-schemas.ts
  - packages/dashboard/src/bridge/browser-session-bridge.ts
  - packages/dashboard/src/bridge/browser-session-bridge.test.ts
  - packages/dashboard/src/store/dashboard-store.ts
  - packages/dashboard/src/store/dashboard-store.test.ts
  - packages/dashboard/src/demo/main.ts
