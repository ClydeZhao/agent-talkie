---
phase: 11-space-membership-management
plan: "02"
subsystem: relay-dashboard
tags: [websocket, membership, roster, vitest]

requires:
  - phase: 11-space-membership-management
    provides: Plan 11-01 `space.destroy` dispatch patterns and SessionRegistry close
provides:
  - Relay `membership.remove` / `membership.removed` + `handleMembershipRemove` with idempotency
  - Dashboard `sendMembershipRemove`, roster Owner-only Remove, wire parse, error copy
affects:
  - 11-03 (space picker / destroy UI may reuse bridge patterns)

tech-stack:
  added: []
  patterns:
    - "Lifecycle controls before handleCollaborationControl; close target socket after success JSON"
    - "Roster action menu: selfSessionId + !r.owner gate for Remove (aligns with must_haves)"

key-files:
  created:
    - packages/relay/src/__tests__/membership-remove.test.ts
  modified:
    - packages/relay/src/space-lifecycle.ts
    - packages/relay/src/server.ts
    - packages/dashboard/src/bridge/browser-session-bridge.ts
    - packages/dashboard/src/bridge/wire-schemas.ts
    - packages/dashboard/src/errors/relay-error-copy.ts
    - packages/dashboard/src/roster/talkie-roster-entry.ts
    - packages/dashboard/src/roster/talkie-roster.ts
    - packages/dashboard/src/demo/main.ts

key-decisions:
  - "Replay path returns removed when target already has no active membership in space"
  - "HTTP snapshot refresh on membership.removed via pullSpaceSummary hook"
  - "Remove menu hidden for roster rows with owner:true (non-self, non-owner targets per product truth)"

patterns-established:
  - "membership.remove mirrors leave idempotency + last-member archive"

requirements-completed:
  - MGMT-02

duration: 12min
completed: 2026-04-21
---

# Phase 11 Plan 02: membership.remove Summary

**端到端成员剔除：`membership.remove` 中继校验（所有者、人类、幂等、`target_not_in_space`）、`membership.removed` 回包并关闭目标 WebSocket；仪表盘 bridge 发送、名册 Owner 菜单 Remove、`main.ts` 事件与 MGMT-02 invite N/A 注释。**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-04-21
- **Tasks:** 2
- **Files modified:** 9 (1 new test file)

## Accomplishments

- `handleMembershipRemove` / `isMembershipRemoveEnvelope`：事务内 `tryRecordIdempotencyKey`、`markMembershipLeft`、空空间 `setSpaceArchived`（与 leave 一致）；错误码含 `membership_remove_self`、`cannot_remove_space_owner`、`target_not_in_space`。
- `server.ts`：`dispatchValidatedEnvelope` 在 `space.destroy` 与协作控制之间处理 remove，成功发 `membership.removed` 并 `registry.get(target)?.close()`。
- 仪表盘：`sendMembershipRemove`、`membershipRemovedWireSchema`、`onMembershipRemovedWire` 触发名册 HTTP 刷新；名册 Remove 仅在 owner 菜单且非自身、非 owner 行显示。

## Task Commits

1. **Task 1: membership.remove 中继逻辑与测试** — `7fd7dc8` (feat)
2. **Task 2: Bridge、wire、错误文案与名册 Remove** — `540e192` (feat)

## Files Created/Modified

- `packages/relay/src/space-lifecycle.ts` — `handleMembershipRemove`、`isMembershipRemoveEnvelope`、`MembershipRemoveOutcome`。
- `packages/relay/src/server.ts` — `isMembershipRemoveEnvelope` 分支。
- `packages/relay/src/__tests__/membership-remove.test.ts` — 成功、非 owner、`target_not_in_space`、自移除失败。
- `packages/dashboard/src/bridge/browser-session-bridge.ts` — `sendMembershipRemove`、入站 `membership.removed`。
- `packages/dashboard/src/bridge/wire-schemas.ts` — `membershipRemovedWireSchema`。
- `packages/dashboard/src/errors/relay-error-copy.ts` — `cannot_remove_space_owner`、`membership_remove_self`、`target_not_in_space`。
- `packages/dashboard/src/roster/talkie-roster.ts` / `talkie-roster-entry.ts` — `selfSessionId`、`Remove` 菜单项。
- `packages/dashboard/src/demo/main.ts` — `talkie-membership-remove`、MGMT-02 注释、`pullSpaceSummary` 重连。

## Deviations from Plan

1. **Remove 菜单门控** — 计划正文仅写 `selfSessionId` 与「非自身」；`must_haves` 要求同时**非 owner**。实现增加 `!r.owner`，避免对所有者行显示 Remove（与 orchestrator 门控一致）。
2. **Vitest 覆盖面** — 计划示例三类断言；实现增加 `target_not_in_space` 与非所有者 `not_space_owner`，以固定服务端行为。
3. **`cannot_remove_space_owner` 可达性** — 在「先校验 `membership_remove_self`」顺序下，所有者踢自己已走 `membership_remove_self`；`cannot_remove_space_owner` 分支保留以满足协议/文案并在将来所有权模型扩展时可用。

## Known Stubs

None identified.

## Threat Flags

None beyond plan `threat_model`（服务端 owner + human 校验、仅关闭 DB 中活跃成员的 registry socket）。

## Self-Check: PASSED

- `packages/relay/src/__tests__/membership-remove.test.ts` — FOUND
- `git log --oneline -3` 含 `7fd7dc8`、`540e192` — FOUND
