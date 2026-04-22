---
phase: 12-discovery-topology-attention
plan: "02"
subsystem: dashboard-search-ui-roster-attention
tags: [lit, minisearch, transcript, roster]

requires:
  - phase: 12-discovery-topology-attention
    provides: MiniSearch, getVisibleTranscriptLines, scrollToDedupeKey (12-01)
provides:
  - custom element `talkie-search-panel` with split-pane behavior
  - Filter chips, sender/kind/time + custom datetime-local range (D-06)
  - Roster Needs Attention lane for progress === blocked (D-10..D-13)
affects:
  - demo operator console layout

tech-stack:
  added: []
  patterns:
    - "Panel lists only store.getVisibleTranscriptLines() — no duplicate search logic"
    - "talkie-jump-to-dedupe bubbles to app; main calls TalkieTranscript.scrollToDedupeKey"

key-files:
  created:
    - packages/dashboard/src/shell/talkie-search-panel.ts
  modified:
    - packages/dashboard/src/store/dashboard-store.ts
    - packages/dashboard/src/transcript/talkie-transcript.ts
    - packages/dashboard/src/demo/main.ts
    - packages/dashboard/src/theme/theme.css
    - packages/dashboard/src/roster/talkie-roster.ts

key-decisions:
  - "Search column width 360px (within 320–400px); panel host display toggled from main when store.transcriptSearchPanelOpen"
  - "Transcript store listener issues requestUpdate when visible line count unchanged so filter-only changes refresh the virtualizer (D-09)"

patterns-established:
  - "CustomEvent talkie-jump-to-dedupe with detail.dedupeKey for result → transcript scroll"

requirements-completed: [OVER-03, OVER-06]

duration: 20min
completed: 2026-04-22
---

# Phase 12 Plan 02: Search panel & attention lane Summary

**右侧 `talkie-search-panel` 与主栏分栏同屏、筛选 chip 与自訂时间窗、结果点击 `scrollToDedupeKey`；名册顶区 `Needs Attention` 仅含 blocked 且主列表去重。**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-04-22
- **Tasks:** 3
- **Files modified:** 6（1 新建 + 5 变更）

## Accomplishments

- **Task 1:** `DashboardStore.transcriptSearchPanelOpen` / `setTranscriptSearchPanelOpen`；`talkie-search-panel.ts`（500ms debounce 查询、sender/kind/时间含 `datetime-local` 自订起迄、chip 移除、`getVisibleTranscriptLines` 结果表、点击派发 `talkie-jump-to-dedupe`）。
- **Task 2:** Transcript 标题「搜索」切换面板；`main` 中 `talkie-transcript-workspace` 包裹 transcript + panel；`theme.css` 布局类；`talkie-jump-to-dedupe` → `scrollToDedupeKey`；`TalkieTranscript` 在可见行条数不变时仍 `requestUpdate` 以刷新筛选后的虚拟列表。
- **Task 3:** Roster 拆分 `blocked` / `rest`，`rest` 仅 `sessionId` 升序；`Needs Attention` + `.talkie-roster-attention` 样式；无 blocked 时不渲染关注区。

## Task Commits

本计划以**单次**提交合并实现与 SUMMARY（未逐任务拆分 commit）。

## Files Created/Modified

- `packages/dashboard/src/shell/talkie-search-panel.ts` — 搜索/筛选侧栏与结果列表
- `packages/dashboard/src/store/dashboard-store.ts` — 面板开闭状态
- `packages/dashboard/src/transcript/talkie-transcript.ts` — 搜索按钮、notify 行为
- `packages/dashboard/src/demo/main.ts` — 分栏、`TalkieTranscript` 命名 import、跳转事件
- `packages/dashboard/src/theme/theme.css` — `.talkie-transcript-workspace`
- `packages/dashboard/src/roster/talkie-roster.ts` — Needs Attention 段

## Deviations from Plan

**无** — 按 12-02-PLAN 验收项实现；摘要高亮未做（与 12-01 一致为纯文本摘要，威胁模型 T-12-02 以转义模板为满足）。

## Known Stubs

无。

## Threat Flags

| Flag | File | Description |
|------|------|---------------|
| (none) | — | 结果摘要使用 `previewPayload` 文本节点，无 innerHTML |

## Self-Check: PASSED

- `12-02-SUMMARY.md` 与所列源码路径存在
- `npm test -w @agent-talkie/dashboard` exit 0
- `npm run build:app -w @agent-talkie/dashboard` exit 0
