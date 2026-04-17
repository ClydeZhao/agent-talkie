---
phase: 08-dashboard-distribution-cli-entry
plan: 03
subsystem: cli
tags: [commander, open, relay, supervisor, vitest]

requires:
  - phase: 08-dashboard-distribution-cli-entry
    provides: Relay ensure/start (08-01) and dashboard static path `/dashboard`
provides:
  - "`talkie dashboard` 子命令：`ensureRelayRunning`、打印 `http://127.0.0.1:<port>/dashboard`、默认用 `open` 打开浏览器"
  - "`--no-open` 仅打印 URL，便于自动化与 CI"
  - "`cli.test.ts` 在隔离 data dir 与 ephemeral 端口下的回归"
affects:
  - 用户从 CLI 进入 web dashboard 的入口
  - CONN-04 验收与后续 Phase 文档

tech-stack:
  added:
    - open@^11.0.0（CLI 依赖）
  patterns:
    - "与 `ping` 一致使用字面量主机 `127.0.0.1` 拼接 URL"

key-files:
  created: []
  modified:
    - packages/cli/package.json
    - packages/cli/src/cli.ts
    - packages/cli/src/cli.test.ts
    - package-lock.json

key-decisions:
  - "将 `open` 的默认导入命名为 `openUrl`，避免与 Commander 解析出的布尔字段 `open`（对应 `--no-open`）同名冲突。"

patterns-established:
  - "`--no-open` 在 Commander 中映射为 `opts.open === false`；默认打开浏览器使用 `opts.open !== false`。"

requirements-completed: [CONN-04]

duration: ~12min
completed: 2026-04-17
---

# Phase 08 Plan 03: `talkie dashboard` CLI 入口 Summary

**`talkie dashboard` 在确保本地 relay 后向 stdout 输出 `http://127.0.0.1:<port>/dashboard`，默认用 `open` 打开系统浏览器；`--no-open` 仅打印 URL，并有 Vitest 集成测试覆盖。**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-17T08:52:00Z（约）
- **Completed:** 2026-04-17T09:04:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- 新增 `dashboard` 子命令，复用 `ensureRelayRunning({})`，与 `relay start` / `ping` 一致的 daemon 生命周期。
- 增加 `open@^11.0.0`，默认打开浏览器；`--no-open` 跳过打开逻辑，满足非阻塞脚本场景。
- 集成测试在 `AGENT_TALKIE_RELAY_PORT=0` 下校验 stdout 符合 `^http://127.0.0.1:\d+/dashboard$`。

## Task Commits

每个任务单独提交：

1. **Task 1: open 依赖与 dashboard 子命令** — `db0f602` (feat)
2. **Task 2: CLI 集成测试 dashboard --no-open** — `2f0fb66` (test)

**说明：** 本 `08-03-SUMMARY.md` 由执行器写入；按编排要求 **未** 修改 `.planning/STATE.md` 与 `.planning/ROADMAP.md`（由 orchestrator 维护）。

## Files Created/Modified

- `packages/cli/package.json` — 增加 `open` 依赖。
- `packages/cli/src/cli.ts` — `dashboard` 命令、URL 拼接、`openUrl` 条件调用。
- `packages/cli/src/cli.test.ts` — `dashboard --no-open` 场景断言。
- `package-lock.json` — 工作区锁文件同步。

## Decisions Made

- 使用 `import openUrl from "open"` 与 `opts.open !== false` 配合 Commander 对 `--no-open` 的布尔语义，避免命名冲突并保证未传参时仍尝试打开浏览器。

## Deviations from Plan

### 计划文本与 Commander 选项形状

**1. [Rule 3 - Blocking] 计划示例使用 `opts.noOpen`，Commander 将 `--no-open` 解析为属性 `open`（默认 true）**

- **Found during:** Task 1（实现 `dashboard` action）
- **Issue：** 若按 `opts.noOpen` 编写，运行时该字段始终为 `undefined`，会导致永远不调用 `open`。
- **Fix：** 使用 `opts: { open?: boolean }` 与 `if (opts.open !== false) { await openUrl(url); }`；默认导入重命名为 `openUrl`。
- **Files modified：** `packages/cli/src/cli.ts`
- **Verification：** `npm run build -w @agent-talkie/cli` 与 `npm run test -w @agent-talkie/cli` 通过。
- **Committed in：** `db0f602`（Task 1）

---

**Total deviations:** 1 auto-fixed（1 blocking）
**Impact on plan：** 行为与计划意图一致（默认打开、`--no-open` 跳过）；仅选项对象字段名与计划片段不同。

## Issues Encountered

None

## User Setup Required

None - 无新增外部服务或手工配置要求。

## Next Phase Readiness

- Phase 08 三个计划均有 SUMMARY 时，可由 orchestrator 做阶段收尾与 ROADMAP/STATE 更新。
- `talkie dashboard`（无 `--no-open`）在自动化环境中可能触发系统打开浏览器；CI 应继续使用 `--no-open`。

## Self-Check: PASSED

- `[ -f .planning/phases/08-dashboard-distribution-cli-entry/08-03-SUMMARY.md ]` — FOUND
- `[ -f packages/cli/src/cli.ts ]` 且含 `.command("dashboard")` — FOUND
- `git rev-parse db0f602` / `git rev-parse 2f0fb66` — FOUND（对象存在）

---
*Phase: 08-dashboard-distribution-cli-entry*
*Completed: 2026-04-17*
