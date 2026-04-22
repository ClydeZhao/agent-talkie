---
phase: 12-discovery-topology-attention
plan: "01"
subsystem: dashboard-store-search
tags: [minisearch, lit, transcript, vitest]

requires:
  - phase: 11-space-membership-management
    provides: Multi-space + store patterns
provides:
  - minisearch dependency + `transcript-search-index` (docs + factory)
  - Filter state, `getVisibleTranscriptLines` (AND + search hits)
  - `TalkieTranscript` binds visible lines; `scrollToDedupeKey`; pin-to-bottom uses visible count
affects:
  - 12-02-PLAN (search panel UI, attention lane)

tech-stack:
  added:
    - minisearch@^7.2.0
  patterns:
    - "Index only on successful append; removeAll on setActiveSpaceId (no cross-space leakage)"
    - "Shared payload preview (PREVIEW_MAX) for index + entry row text"

key-files:
  created:
    - packages/dashboard/src/search/transcript-search-index.ts
    - packages/dashboard/src/transcript/payload-preview.ts
  modified:
    - packages/dashboard/package.json
    - package-lock.json
    - packages/dashboard/src/store/dashboard-store.ts
    - packages/dashboard/src/store/dashboard-store.test.ts
    - packages/dashboard/src/transcript/talkie-transcript.ts
    - packages/dashboard/src/transcript/talkie-transcript-entry.ts

key-decisions:
  - "New transcript lines call MiniSearch add(buildTranscriptSearchDoc(…, roster)); space switch calls removeAll on the same index instance"
  - "getVisibleTranscriptLines: array filter (AND) first; non-empty query intersects with search hit ids; order preserved as in transcriptLines"
  - "lit-virtualizer .items = this.store.getVisibleTranscriptLines() each render; pendingNew and scroll use visible length (12-01 plan)"

patterns-established:
  - "TranscriptTimeFilter: all | preset 5m/30m (Date.now) | custom [startMs,endMs] on receivedAtMs"

requirements-completed: []

duration: 25min
completed: 2026-04-22
---

# Phase 12 Plan 01: MiniSearch, filters, visible transcript lines Summary

**在 Dashboard 内接好 MiniSearch 与 AND 维筛选，主 transcript 虚拟列表与贴底/新消息差分一律基于 `getVisibleTranscriptLines()`，并公开 `scrollToDedupeKey` 供 12-02 结果跳转复用。**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-04-22
- **Tasks:** 3
- **Files modified:** 8（2 新建 + 6 变更 + 根锁文件）

## Accomplishments

- **Task 1:** 依赖 `minisearch@^7.2.0`；`transcript-search-index.ts`（`TranscriptSearchDoc`、`buildTranscriptSearchDoc`、`createTranscriptMiniSearch` 与 12-RESEARCH 一致的 `fields` / `searchOptions`）；`payload-preview.ts` 与 `talkie-transcript-entry` 共享 `PREVIEW_MAX` / `previewPayload`。
- **Task 2:** `DashboardStore` 增加 `transcriptSearchQuery`、按寄件人/kind/时间的筛选状态与 `setTranscriptSearchQuery` / `setTranscriptFilters`；私有 `lineMatchesTranscriptFilters` + `getVisibleTranscriptLines`；`appendTranscriptCatchup` / `appendTranscriptEnvelope` 追加索引，`setActiveSpaceId` 清空 transcript 时 `removeAll`；Vitest 覆盖 kind 过滤、换 space 后无命中、MiniSearch+kind 的 AND 与顺序。
- **Task 3:** `TalkieTranscript` 的 `.items` 与贴底/notify 使用 `getVisibleTranscriptLines()`；新增 `scrollToDedupeKey`（`scrollToIndex(..., "end")`）。

## Task Commits

本仓库按用户要求使用**单次**提交合并三个任务与 SUMMARY/规划元数据（非逐任务多 commit）。

- **feat(12-01):** `packages/dashboard` 搜索与可见行、规划汇总（见下方 git log）

## Files Created/Modified

- `packages/dashboard/src/search/transcript-search-index.ts` — MiniSearch 工厂与行→文档
- `packages/dashboard/src/transcript/payload-preview.ts` — 与 transcript 行一致的 payload 摘要
- `packages/dashboard/src/store/dashboard-store.ts` — 索引、筛选、可见行
- `packages/dashboard/src/transcript/talkie-transcript.ts` — 可见行绑定 + `scrollToDedupeKey`
- `packages/dashboard/src/transcript/talkie-transcript-entry.ts` — 引用 `payload-preview`
- `packages/dashboard/src/store/dashboard-store.test.ts` — 筛选与索引测试
- `packages/dashboard/package.json` / `package-lock.json` — minisearch 依赖

## Deviations from Plan

**无** — 按 12-01-PLAN 实现与验收用例通过。

## Known Stubs

无阻碍本数据层交付的占位（右栏 UI 在 12-02）。

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| (none) | — | 查询不经由 `innerHTML`；高亮留待 12-02 |

## Self-Check: PASSED

- `12-01-SUMMARY.md` 与所列源码路径存在
- 测试：`npm test -w @agent-talkie/dashboard` exit 0
- 提交：消息为 `feat(12-01): MiniSearch index, store filters, transcript visible lines`；可用 `git log -1 --oneline` 核对
