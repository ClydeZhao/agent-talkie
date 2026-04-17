---
phase: 09-core-oversight-ui
plan: 02
subsystem: ui
tags: [lit, virtualizer, transcript, websocket, dashboard]

requires:
  - phase: 09-core-oversight-ui
    provides: DashboardStore, theme.css, two-column layout, HTTP roster
provides:
  - "@lit-labs/virtualizer transcript list with catch-up + live dedupe"
  - "appendTranscriptCatchup / appendTranscriptEnvelope on active space"
  - "<talkie-transcript> pin-to-bottom and ↓ N 新消息 jump control"
affects:
  - 09-03-PLAN (metadata chips on roster; transcript stable)
  - demo main assembly

tech-stack:
  added: ["@lit-labs/virtualizer@^2.1.1"]
  patterns:
    - "Immutable transcriptLines array replace on append for Lit + virtualizer updates"
    - "Dedupe Set shared by catch-up (spaceId:relaySeq) and live (spaceId|none:id)"

key-files:
  created:
    - packages/dashboard/src/transcript/talkie-transcript.ts
    - packages/dashboard/src/transcript/talkie-transcript-entry.ts
  modified:
    - packages/dashboard/package.json
    - package-lock.json
    - packages/dashboard/src/store/dashboard-store.ts
    - packages/dashboard/src/demo/main.ts
    - packages/dashboard/src/theme/theme.css

key-decisions:
  - "Import virtualizer via package root + LitVirtualizer.js subpath (Vite exports conditions)."
  - "HH:MM:SS via local pad formatter (equivalent to locale short time per D-13)."

patterns-established:
  - "Store listeners on talkie-transcript only trigger re-render when transcript length changes (roster polls do not thrash virtualizer)."

requirements-completed: [OVER-02]

duration: 25min
completed: 2026-04-17
---

# Phase 9 Plan 02: Transcript timeline Summary

**虚拟化终端式 transcript：`@lit-labs/virtualizer`、catch-up 与 `onEnvelope` 共用 store 队列、贴底阈值 48px 与「↓ N 新消息」一键回底。**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3
- **Files touched:** 7

## Accomplishments

- `DashboardStore`：`TranscriptLine[]`、`activeSpaceId`、`setActiveSpaceId`（切换 space 时清空队列与去重）、`appendTranscriptCatchup` / `appendTranscriptEnvelope` 与计划中的去重键一致；catch-up 信封经 `safeParseEnvelope` 校验。
- `<talkie-transcript>`：`lit-virtualizer` + `scroller`、`PIN_THRESHOLD_PX = 48`、非贴底时累计 `pendingNew` 并展示 **`↓ ${n} 新消息`** 按钮。
- `<talkie-transcript-entry>`：文本插值 + `JSON.stringify` 预览至多 240 字符；`kind` 上色 + `type` 含子串 `error` 时危险色覆盖；发送方标签来自 roster `displayName` 或 `sessionId` 前 8 位 + `…`。
- `main.ts`：`joinSpace` 后 `setActiveSpaceId`；注册 `onTranscriptCatchup` / `onEnvelope`；`#talkie-main-panel` 内挂载 transcript。
- `theme.css`：主栏 `display: flex; flex-direction: column; min-height: 0` 以便子组件占满并可滚动。

## Task Commits

1. **Task 1: 安装 @lit-labs/virtualizer** — `4389136` (chore)
2. **Task 2: Store 扩展 transcript 与去重** — `eb12f14` (feat)
3. **Task 3: talkie-transcript 与 demo 接线** — `8642cc2` (feat)

## Files Created/Modified

- `packages/dashboard/package.json` / `package-lock.json` — virtualizer 依赖。
- `packages/dashboard/src/store/dashboard-store.ts` — transcript 状态与 API。
- `packages/dashboard/src/transcript/talkie-transcript.ts` — 虚拟列表与贴底 / 新消息 UX。
- `packages/dashboard/src/transcript/talkie-transcript-entry.ts` — 单行渲染与安全预览。
- `packages/dashboard/src/demo/main.ts` — bridge → store → transcript。
- `packages/dashboard/src/theme/theme.css` — 主栏 flex 约束。

## Deviations from Plan

### Auto-fixed / 调整

- **导入路径 [Rule 3 — 构建阻塞]**：计划示例 `import ".../lit-virtualizer.js"` 在 Vite/Rolldown 下不满足包的 `exports` 条件；改为 `import "@lit-labs/virtualizer"` 注册元素 + `import { LitVirtualizer } from "@lit-labs/virtualizer/LitVirtualizer.js"` 供类型与 `scrollToIndex`。

### 其它

- 无功能性偏离；时间戳使用本地 `HH:MM:SS` 格式化，与 D-13「短格式」一致。

## Known Stubs

- `DashboardStore.errors` 仍为占位数组 — 留待 09-04（OVER-07）。

## Threat Flags

- 无新增威胁面；payload 仅经 `JSON.stringify` 文本绑定展示（与 plan `<threat_model>` 一致）。

## Self-Check: PASSED

- `[ -f packages/dashboard/src/transcript/talkie-transcript.ts ]` → FOUND
- `[ -f packages/dashboard/src/transcript/talkie-transcript-entry.ts ]` → FOUND
- `git log --oneline | grep -q 4389136` → FOUND
- `git log --oneline | grep -q eb12f14` → FOUND
- `git log --oneline | grep -q 8642cc2` → FOUND
- `npm run build -w @agent-talkie/dashboard` → 退出码 0（执行于本计划收尾前）
