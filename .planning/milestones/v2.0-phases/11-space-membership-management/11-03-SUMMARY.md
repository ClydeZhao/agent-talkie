---
phase: 11-space-membership-management
plan: "03"
subsystem: relay-dashboard-persistence
tags: [oversight-http, space-picker, lit, websocket]

requires:
  - phase: 11-space-membership-management
    provides: Plan 11-01 space.destroy / space.destroyed; Plan 11-02 bridge patterns
provides:
  - listOversightSpaces + GET /__agent-talkie/v1/oversight/spaces
  - talkie-space-picker (list, new-tab switch/create, owner Destroy + confirm)
  - URL ?space= with default slug; sendSpaceDestroy / space.destroyed / store list state
affects: []

tech-stack:
  added: []
  patterns:
    - "Active spaces only; memberCount = memberships with left_at IS NULL; ORDER BY slug ASC"
    - "New tab for other space / create (avoids already_in_space on same bridge)"
    - "Reconnect rejoins _lastJoinedSlug from last successful join"

key-files:
  created:
    - packages/dashboard/src/shell/talkie-space-picker.ts
  modified:
    - packages/persistence/src/repositories/oversight.ts
    - packages/persistence/src/index.ts
    - packages/persistence/src/repositories/oversight.test.ts
    - packages/relay/src/server.ts
    - packages/relay/src/server.test.ts
    - packages/dashboard/src/bridge/browser-session-bridge.ts
    - packages/dashboard/src/bridge/wire-schemas.ts
    - packages/dashboard/src/store/dashboard-store.ts
    - packages/dashboard/src/demo/main.ts

key-decisions:
  - "Create new space uses window.open to /dashboard?space=<slug> (new session) because v1 one-session-one-space makes in-tab joinSpace to a second slug fail with already_in_space"
  - "hydrateFromSpaceSummary sets currentSpaceSlug so HTTP snapshot and picker stay aligned"

patterns-established:
  - "OversightSpaceListRow / SpaceListRow mirror without dashboard depending on persistence package"

requirements-completed:
  - MGMT-01
  - MGMT-03

duration: 18min
completed: 2026-04-21
---

# Phase 11 Plan 03: Space list API & picker Summary

**交付 `GET /oversight/spaces`、Lit 头部空间选择器、URL `?space=`/`default` 首屏 join，以及 `sendSpaceDestroy` / `space.destroyed` 与 store 列表状态；重连改为按上次成功 join 的 slug 复连。**

## Performance

- **Duration:** ~18 min
- **Completed:** 2026-04-21
- **Tasks:** 3
- **Files modified:** 10（1 个新建 picker + 9 个变更）

## Accomplishments

- Persistence：`listOversightSpaces` 仅 `active` 空间、`slug` 升序、`memberCount` 仅统计未离开成员；Vitest 覆盖排序/计数/归档排除。
- Relay：HTTP `GET /__agent-talkie/v1/oversight/spaces` 返回 JSON 数组；`server.test` 集成断言。
- Dashboard：`spaceDestroyedWireSchema`、`onSpaceDestroyedWire`、`sendSpaceDestroy`；store 增加 `spacesList`、`setSpacesList`、`currentSpaceSlug`、`spaceDestroyedSlug` / `noteSpaceDestroyed`；`hydrateFromSpaceSummary` 同步 `currentSpaceSlug`。
- `talkie-space-picker`：打开下拉拉列表、非当前项 `window.open` 新标签、`Create new space` 内联校验（与 `spaces.ts` 规则一致的 documented regex）、所有者 `Destroy` + confirm 文案含 **Destroy** 与 slug；销毁横幅读 `store.spaceDestroyedSlug`。
- `main.ts`：`URLSearchParams.get("space")` 与 `"default"` fallback、`joinSpace({ slug: initialSlug })`、`pullSpaceSummary` 使用 `store.currentSpaceSlug`；头部 flex 挂载 picker + `talkie-connection-shell`。

## Task Commits

1. **Task 1: listOversightSpaces 与 GET /oversight/spaces** — `5aa5dd6` (feat)
2. **Task 2: sendSpaceDestroy、space.destroyed wire、store 列表状态** — `8b75fcd` (feat)
3. **Task 3: talkie-space-picker、main.ts URL 与集成** — `f8f658e` (feat)

## Files Created/Modified

- `packages/persistence/src/repositories/oversight.ts` — `OversightSpaceListRow`、`listOversightSpaces`
- `packages/persistence/src/index.ts` — 导出
- `packages/persistence/src/repositories/oversight.test.ts` — 列表用例
- `packages/relay/src/server.ts` — `oversight/spaces` 路由
- `packages/relay/src/server.test.ts` — GET 列表测试
- `packages/dashboard/src/bridge/wire-schemas.ts` — `spaceDestroyedWireSchema`
- `packages/dashboard/src/bridge/browser-session-bridge.ts` — `sendSpaceDestroy`、分发、`onSpaceDestroyedWire`、`_lastJoinedSlug` 重连
- `packages/dashboard/src/store/dashboard-store.ts` — 列表与 slug / 销毁状态、`hydrateFromSpaceSummary` 写 `currentSpaceSlug`
- `packages/dashboard/src/shell/talkie-space-picker.ts` — 新建组件
- `packages/dashboard/src/demo/main.ts` — URL join、header、事件接线

## Deviations from Plan

1. **Task 3「创建」路径** — 计划写明在当前 tab 对新建 slug 调用 `joinSpace` 并 `replaceState`。在 v1「一会话一空间」下，已加入当前空间后再 `joinSpace` 其他 slug 会得到 `already_in_space`。实现改为与切换一致：校验后对 `new URL(\"/dashboard\", location.origin)` 附加 `?space=` 并 `window.open`（新标签新会话），由新 tab 的 `main.ts` 执行 join/create-if-not-exists。符合 CONTEXT D-11 与 11-RESEARCH Pitfall 1 的规避方式。
2. **验收 grep `customElement(\"talkie-space-picker\")`** — 源码使用 Lit `@customElement(\"talkie-space-picker\")`，与仓库内其他 shell 组件一致，未改为 `customElement(...)` 字面量。

## Known Stubs

未发现阻碍本计划目标的占位实现。

## Threat Flags

无计划 `threat_model` 之外的新增对外攻击面；列表 API 仍为 localhost 调试元数据（T-11-06 accept）。

## Self-Check: PASSED

- `[ -f packages/dashboard/src/shell/talkie-space-picker.ts ]` — FOUND
- `git log --oneline --all | grep -q 5aa5dd6` — FOUND
- `git log --oneline --all | grep -q 8b75fcd` — FOUND
- `git log --oneline --all | grep -q f8f658e` — FOUND
