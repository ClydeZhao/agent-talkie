---
phase: 09-core-oversight-ui
plan: 01
subsystem: ui
tags: [lit, relay, oversight, roster, http, sqlite]

requires:
  - phase: 08-dashboard-distribution-cli-entry
    provides: same-origin `/dashboard` static hosting and demo entry
provides:
  - GET `/__agent-talkie/v1/oversight/space-summary?slug=` on relay (200/400/404 JSON)
  - `OversightMember` with `runtime` / `workspaceLabel` in persistence summary SQL
  - `DashboardStore` with roster Map, 10s polling hook, transcript/errors placeholders
  - `talkie-roster` / `talkie-roster-entry` and two-column demo layout + dark `theme.css`
affects:
  - 09-02-PLAN (transcript)
  - 09-03-PLAN (metadata chips, blocked styling)
  - CLI / MCP consumers of `getOversightSpaceSummaryBySlug` JSON shape

tech-stack:
  added: []
  patterns:
    - "HTTP roster snapshot + 10s refresh (no WS member broadcast dependency)"
    - "Bridge → DashboardStore → Lit roster (D-22/D-23 alignment)"

key-files:
  created:
    - packages/dashboard/src/theme/theme.css
    - packages/dashboard/src/store/dashboard-store.ts
    - packages/dashboard/src/roster/talkie-roster.ts
    - packages/dashboard/src/roster/talkie-roster-entry.ts
  modified:
    - packages/persistence/src/repositories/oversight.ts
    - packages/persistence/src/repositories/oversight.test.ts
    - packages/relay/src/server.ts
    - packages/relay/src/server.test.ts
    - packages/dashboard/index.html
    - packages/dashboard/src/demo/main.ts

key-decisions:
  - "Dashboard types `OversightSpaceSummary` duplicated in store (no `@agent-talkie/persistence` in browser bundle)."
  - "Lit text bindings only for roster strings (T-09-01-02)."

patterns-established:
  - "Relay read-only JSON routes before `sirv` `/dashboard` branch."
  - "Store listener pushes `roster.entries` for Lit re-render."

requirements-completed: [OVER-01]

duration: 18min
completed: 2026-04-17
---

# Phase 9 Plan 01: Roster view (HTTP snapshot + UI) Summary

**只读 `space-summary` HTTP 与 persistence 名册字段扩展，加上 Lit 左栏名册、集中 store 与暗色主题骨架；join 后拉快照并每 10s 刷新。**

## Performance

- **Duration:** ~18 min
- **Tasks:** 3
- **Files touched:** 10

## Accomplishments

- `getOversightSpaceSummaryBySlug` 的 member 行包含 `runtime` / `workspaceLabel`，与 `sessions` 表一致；单测断言与 `createSession` 写入值对齐。
- Relay 在 `/dashboard` 静态分支之前处理 `GET /__agent-talkie/v1/oversight/space-summary`：`missing_slug` → 400，`space_not_found` → 404，成功返回与类型一致的 camelCase JSON。
- Dashboard：`DashboardStore`、`talkie-roster`（280px）、`talkie-roster-entry`（人形/机器人 SVG + orchestrator 星标）、`theme.css` 与两栏布局；`joinSpace` 成功后 `fetch` 快照并 `setInterval(..., 10000)` 复拉。

## Task Commits

1. **Task 1: 扩展 OversightMember 与 SQL** — `5b62bba` (feat)
2. **Task 2: Relay 只读 GET space-summary** — `323557b` (feat)
3. **Task 3: Store、名册组件、布局与主题** — `86ed30d` (feat)

## Files Created/Modified

- `packages/persistence/src/repositories/oversight.ts` — SQL 与 `OversightMember` 扩展。
- `packages/persistence/src/repositories/oversight.test.ts` — `runtime` / `workspaceLabel` 断言。
- `packages/relay/src/server.ts` — space-summary 路由。
- `packages/relay/src/server.test.ts` — HTTP 行为测试。
- `packages/dashboard/src/store/dashboard-store.ts` — 名册与轮询 API。
- `packages/dashboard/src/roster/talkie-roster*.ts` — 名册 UI。
- `packages/dashboard/src/theme/theme.css` — `:root` token 与布局辅助类。
- `packages/dashboard/index.html` — 全局样式 link。
- `packages/dashboard/src/demo/main.ts` — 装配与 fetch 管线。

## Deviations from Plan

### 验证命令路径

- Plan 中 `vitest` 过滤路径写为 `packages/persistence/...`；在本仓库下应使用 `npm test -w @agent-talkie/persistence -- --run src/repositories/oversight.test.ts`（包内相对路径）。**测试均已通过。**

### 其它

- 无 — 按计划实现；**role** 在 JSON 与 store 中存在，行内 chip 强调留待 09-03（与 CONTEXT D-14 及 plan 说明一致）。

## Known Stubs

- `DashboardStore.transcriptRows` / `errors` 为空数组占位，供 09-02 / 09-04 接入。

## Threat Flags

- 无（与 plan `<threat_model>` 一致；名册渲染为文本插值，无 `unsafeHTML`）。

## Self-Check: PASSED

- `test -f packages/dashboard/src/store/dashboard-store.ts` → FOUND
- `test -f packages/dashboard/src/roster/talkie-roster.ts` → FOUND
- `test -f .planning/phases/09-core-oversight-ui/09-01-SUMMARY.md` → FOUND
- `git log --oneline | grep -q 5b62bba` → FOUND
- `git log --oneline | grep -q 323557b` → FOUND
- `git log --oneline | grep -q 86ed30d` → FOUND
