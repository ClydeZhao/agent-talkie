---
phase: 11-space-membership-management
plan: "01"
subsystem: relay
tags: [websocket, space-lifecycle, idempotency, sqlite]

requires:
  - phase: 10-interactive-human-controls
    provides: dispatchValidatedEnvelope patterns, SessionRegistry close, owner-gated control
provides:
  - Relay `space.destroy` control handling with owner + human gate
  - `space.destroyed` wire message and registry kick for all members
  - Vitest coverage for destroy domain logic and idempotent replay
affects:
  - 11-02 (membership.remove)
  - 11-03 (dashboard sendSpaceDestroy, confirmation UI)

tech-stack:
  added: []
  patterns:
    - "Destroy branches before handleCollaborationControl to avoid transcript append"
    - "normalizeSpaceSlug before tryRecordIdempotencyKey to avoid consuming keys on invalid slug"

key-files:
  created:
    - packages/relay/src/__tests__/space-destroy.test.ts
  modified:
    - packages/relay/src/space-lifecycle.ts
    - packages/relay/src/server.ts

key-decisions:
  - "Idempotent replay when space row is gone returns destroyed with empty closeSessionIds (no second deleteSpaceById)"
  - "Replay while space still exists yields idempotency_replay_mismatch (key reused for another operation)"
  - "server always ctx.ws.close() after success so replay path still drops the sender"

patterns-established:
  - "space.destroy mirrors space.join/leave idempotency and protocol.error shape"

requirements-completed: []

duration: 8min
completed: 2026-04-21
---

# Phase 11 Plan 01: Relay space.destroy Summary

**中继实现 `space.destroy`：所有者 + 人类会话校验、幂等重放、成员 `markMembershipLeft` 后 `deleteSpaceById`，并在 `dispatchValidatedEnvelope` 中于协作控制与路由之前返回，向发送者发送 `space.destroyed` 后关闭空间内全部 WebSocket（含发送者）。**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-21 (session)
- **Completed:** 2026-04-21
- **Tasks:** 2
- **Files modified:** 3 (2 code + 1 test file new)

## Accomplishments

- `handleSpaceDestroy` / `isSpaceDestroyEnvelope` 与 `SpaceDestroyOutcome` 类型落地，错误码与 join/leave 一致（`invalid_slug`、`not_in_space`、`not_space_owner`、`idempotency_replay_mismatch`）。
- `server.ts` 集成：`protocol.error` 缺 key / 非 string slug；成功路径 `space.destroyed` + `SessionRegistry` 逐 `close` + 最终 `ctx.ws.close()`。
- Vitest：所有者删除、非所有者、`invalid_slug`、销毁后同 key 重放。

## Task Commits

1. **Task 1: space.destroy 领域逻辑与守卫** — `82373c3` (feat)
2. **Task 2: server 调度、踢线与 space.destroyed 回包** — `5be75c5` (feat)

**Plan metadata:** Single docs commit after tasks (SUMMARY + STATE + ROADMAP); see `git log` on branch.

## Files Created/Modified

- `packages/relay/src/space-lifecycle.ts` — `handleSpaceDestroy`、`isSpaceDestroyEnvelope`、事务内成员清理与删除。
- `packages/relay/src/server.ts` — `isSpaceDestroyEnvelope` 分支，早于 `handleCollaborationControl`。
- `packages/relay/src/__tests__/space-destroy.test.ts` — 领域层单测。

## Deviations from Plan

None — plan executed as written.

## Known Stubs

None identified in modified files.

## Threat Flags

None beyond plan `threat_model` mitigations (owner + `isHuman` in `handleSpaceDestroy`).

## Requirements note

Plan frontmatter lists **MGMT-01**; this plan delivers **relay-side destroy only**. Dashboard confirmation + `sendSpaceDestroy` remain in **11-03**; **MGMT-01** checkbox in `REQUIREMENTS.md` stays pending until UI path is complete.

## Self-Check: PASSED

- `[ -f packages/relay/src/__tests__/space-destroy.test.ts ]` — FOUND
- `git log --oneline -5` includes `82373c3`, `5be75c5`, and docs commit — FOUND
