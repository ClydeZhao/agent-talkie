---
phase: 09-core-oversight-ui
plan: 03
subsystem: ui
tags: [lit, metadata, debounce, roster, websocket, dashboard]

requires:
  - phase: 09-core-oversight-ui
    provides: DashboardStore, talkie-roster, HTTP snapshot, transcript
provides:
  - "applyMetadataPatchFromEnvelope + METADATA_UI_DEBOUNCE_MS=200 coalesced notify"
  - "Roster chips (role:, truncated focus), progress dot+label, blocked border + title tooltip"
  - "Blocked-first roster sort; demo onEnvelope wires metadata patches"
affects:
  - 09-04-PLAN (error bar; store.errors still stub)

tech-stack:
  added: []
  patterns:
    - "Immutable RosterRow spread on patch so Lit children receive new object refs"
    - "metadata UI notify debounced separately from transcript append notify"

key-files:
  created: []
  modified:
    - packages/dashboard/src/store/dashboard-store.ts
    - packages/dashboard/src/roster/talkie-roster-entry.ts
    - packages/dashboard/src/roster/talkie-roster.ts
    - packages/dashboard/src/demo/main.ts

key-decisions:
  - "占位名册行 blockedReason 用空串以匹配 RosterRow 类型（协议 optional 清除仍写入 string）"
  - "blocked 红框落在 `.row.row--blocked`（根容器），`title` 绑定完整 blockedReason"

patterns-established:
  - "hydrateFromSpaceSummary 开头清除 metadata debounce 定时器，避免快照后陈旧 flush"

requirements-completed: [OVER-04]

duration: 20min
completed: 2026-04-17
---

# Phase 9 Plan 03: Metadata strip Summary

**名册内联协作元数据：`metadata.patch` 经 Zod 归并入 store、200ms 防抖刷新 UI；progress 四态色点 + 标签、`blocked` 红框与 `title` 提示、blocked 条目置顶排序。**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `DashboardStore`：`applyMetadataPatchFromEnvelope`（`metadataPatchPayloadSchema`）、`targetSessionId` 与协议一致；缺失行时创建占位行；profile/status patch 仅合并出现的键；`scheduleMetadataUiNotify` 防抖；`hydrateFromSpaceSummary` 清除挂起定时器。
- `<talkie-roster-entry>`：`role:` chip、focus 48 字截断、`talkie-pulse-opacity` + `#16a34a` working 点、idle/blocked/done 色值、`1px solid #dc2626` 阻塞态边框、非空 `blockedReason` 的 `title`。
- `<talkie-roster>`：`progress === "blocked"` 优先，其余按 `sessionId` 稳定排序。
- `demo/main.ts`：`onEnvelope` 在 `appendTranscriptEnvelope` 后调用 `applyMetadataPatchFromEnvelope`。

## Task Commits

1. **Task 1: Store 中 debounce 与 metadata 合并** — `61566bc` (feat)
2. **Task 2: Roster 行 chips、排序与样式** — `cfc0939` (feat)

## Files Created/Modified

- `packages/dashboard/src/store/dashboard-store.ts` — `METADATA_UI_DEBOUNCE_MS`、`applyMetadataPatchFromEnvelope`、防抖与快照清理。
- `packages/dashboard/src/roster/talkie-roster-entry.ts` — chips、progress UI、阻塞样式与 tooltip。
- `packages/dashboard/src/roster/talkie-roster.ts` — blocked 置顶排序。
- `packages/dashboard/src/demo/main.ts` — 元数据 patch 接线。

## Deviations from Plan

### Auto-fixed / 微调

- **占位行 `blockedReason` [Rule 2 — 类型一致]**：计划文案写 `null`，现有 `RosterRow.blockedReason` 为 `string`，占位与清除均用 `""`，与 `hydrateFromSpaceSummary` 一致。
- **Lit 对象引用 [Rule 1 — UI 不刷新]**：patch 合并后用展开生成新 `RosterRow` 再 `Map.set`，避免仅改字段引用不变导致子组件不更新。

### 其它

- `METADATA_UI_DEBOUNCE_MS` 导出为 `export const`，便于验收与测试引用。

## Known Stubs

- `DashboardStore.errors` 仍为占位 — 09-04（OVER-07）。

## Threat Flags

- 无计划外威胁面；`blockedReason` / `role` / `focus` 均为 Lit 文本绑定（与 plan `<threat_model>` 一致）。

## Self-Check: PASSED

- `[ -f packages/dashboard/src/store/dashboard-store.ts ]` → FOUND
- `git log --oneline --all | grep -q 61566bc` → FOUND
- `git log --oneline --all | grep -q cfc0939` → FOUND
- `npm run build -w @agent-talkie/dashboard` → 退出码 0（计划收尾前执行）
