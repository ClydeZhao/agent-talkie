---
phase: 08-dashboard-distribution-cli-entry
verified: 2026-04-17T09:43:20Z
status: passed
score: 13/13 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 12/13
  gaps_closed:
    - "默认 `talkie dashboard` 浏览器 UAT 已完成：页面打开无白屏，显示 `Connected`。"
    - "CLI 退出后 relay 继续监听；隔离数据目录下 delayed fetch 与 second-run 复用同一 pid/port 均通过。"
  gaps_remaining: []
  regressions: []
human_verification_completed:
  - test: "在本机安装/构建后运行 `talkie dashboard`（不传 `--no-open`）"
    observed: "系统浏览器打开 `http://127.0.0.1:18765/dashboard`，页面无白屏，显示 `Connected`。"
  - test: "在同一 relay 上打开 dashboard 后确认 WebSocket 与 HTTP 同源（浏览器地址栏 host:port 与连接目标一致）"
    observed: "浏览器地址栏为 `127.0.0.1:18765/dashboard`，页面连接建立并显示健康状态；隔离数据目录复测确认 `talkie dashboard --no-open` 返回后 relay 继续在同一 host:port 提供 `/dashboard`。"
---

# Phase 8: Dashboard distribution & CLI entry — Verification Report

**Phase Goal:** Operators install once and open the dashboard from the CLI with production same-origin static hosting.

**Verified:** 2026-04-17T09:43:20Z

**Status:** passed

**Re-verification:** Yes — closed the remaining browser UAT after fixing relay daemon persistence

## Goal Achievement

### Observable Truths（合并 ROADMAP 成功标准与三份 PLAN 的 `must_haves.truths`）

| # | Truth | Status | Evidence |
|---|--------|--------|----------|
| 1 | 对任意非 WebSocket 升级的 HTTP 请求，relay 返回 dashboard 静态内容、health JSON，或明确 404 并结束响应，不无限挂起 | ✓ VERIFIED | `packages/relay/src/server.ts` 统一 `server.on("request")` 链；`server.test.ts` 对 `/`、`/nope` 断言 404 与 body |
| 2 | `GET /dashboard` 与深层路径返回 SPA `index.html`（`text/html`，含页面标识） | ✓ VERIFIED | `server.test.ts`：`/dashboard`、`/dashboard/deep/route`；`pathname === "/dashboard" \|\| startsWith("/dashboard/")` 覆盖带尾斜杠的 `/dashboard/` |
| 3 | `GET /__agent-talkie/v1/health` 在配置 `relayGenerationToken` 时保持 200（正确 generation）/403/405 语义 | ✓ VERIFIED | `server.ts` 237–249 行实现 200/403/405；Vitest 覆盖 GET 200 + JSON；403/405 由实现与既有契约一致（未单独加测） |
| 4 | WebSocket 升级请求不写 `res`，仍由 `ws` 处理 | ✓ VERIFIED | `server.ts` 225–228 行对 `upgrade === websocket` 早退 |
| 5 | `npm run build -w @agent-talkie/dashboard` 同时产出 `dist/` 与 `dist-app/`，且 `dist-app/index.html` 中脚本/链接带 `/dashboard/` 前缀 | ✓ VERIFIED | `vite.app.config.ts` `base`/`outDir`；构建产物 `dist-app/index.html` 含 `/dashboard/assets/` |
| 6 | 生产构建下 demo 使用 `location.host` 构造 `wsUrl`，开发模式仍 `ws://127.0.0.1:18765` | ✓ VERIFIED | `packages/dashboard/src/demo/main.ts` 14–16 行 |
| 7 | 仓库根 `npm run build` 在 relay 之前构建 dashboard | ✓ VERIFIED | 根 `package.json` `scripts.build` 中 `@agent-talkie/dashboard` 出现在 `@agent-talkie/relay` 之前 |
| 8 | `talkie dashboard` 在 `ensureRelayRunning` 后向 stdout 打印 `http://127.0.0.1:<port>/dashboard` | ✓ VERIFIED | `packages/cli/src/cli.test.ts`：`dashboard --no-open` 与正则 `^http://127\.0\.0\.1:\d+/dashboard$` |
| 9 | 传入 `--no-open` 时不调用打开浏览器逻辑 | ✓ VERIFIED | `cli.ts`：`opts.open !== false` 时才 `openUrl`；Commander 将 `--no-open` 映射为 `open === false` |
| 10 | 命令非阻塞退出，relay 以 daemon 方式保持（与 `relay start`/`ping` 一致） | ✓ VERIFIED | 隔离 `AGENT_TALKIE_DATA_DIR` + ephemeral port 复测：`talkie dashboard --no-open` 退出后立即/延迟访问 `/dashboard` 均 200；第二次执行返回同一 URL，`relay.lock` 维持同一 pid/port |
| 11 | （ROADMAP）生产形态下同源：静态与 WebSocket 升级共享 relay 的 HTTP 源 | ✓ VERIFIED | 静态由 relay 同端口 `sirv`；demo 生产 `ws(s)://location.host` |
| 12 | （ROADMAP）`npm install` / workspace 下路径稳定解析到已构建 `dist-app` | ✓ VERIFIED | `resolveDashboardAppDir()` 使用 `createRequire` + `@agent-talkie/dashboard/package.json` + `dist-app`；`relay` `pretest` 构建 dashboard |
| 13 | （ROADMAP SC1）用户执行默认 `talkie dashboard`（含打开浏览器）后进入**可用** dashboard（非仅 URL 正确） | ✓ VERIFIED | 人工 UAT：真实浏览器打开 `http://127.0.0.1:18765/dashboard`，页面无白屏并显示 `Connected`；结合隔离数据目录复测，确认默认路径在 CLI 退出后仍可访问 |

**Score:** 13/13

### Deferred Items

无。本阶段缺口未推迟到后续 phase（后续 phase 不负责补本阶段 CLI/静态托管契约）。

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/relay/package.json` | `sirv`、`@agent-talkie/dashboard`；`pretest` 含 dashboard build | ✓ VERIFIED | gsd-tools `verify artifacts` 通过 |
| `packages/relay/src/server.ts` | `/dashboard` + sirv + 统一 HTTP 链 | ✓ VERIFIED | 非 stub；已接线 |
| `packages/dashboard/vite.app.config.ts` | `base` / `dist-app` / `index.html` input | ✓ VERIFIED | 存在且实质内容完整 |
| `packages/dashboard/dist-app/index.html` | 构建产物、含 `/dashboard/` | ✓ VERIFIED | 构建后存在（gitignore） |
| `packages/cli/src/cli.ts` | `dashboard` 子命令 | ✓ VERIFIED | |
| `packages/cli/package.json` | `open@^11.0.0` | ✓ VERIFIED | |

### Key Link Verification

`gsd-tools verify key-links` 对以下条目报 `Target not referenced`（因 PLAN 中 `to` 为包名/描述而非源文件路径）。**手动核对结果均为已接线：**

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/relay/src/server.ts` | `@agent-talkie/dashboard` → `dist-app` | `require.resolve('@agent-talkie/dashboard/package.json')` + `join(..., 'dist-app')` | ✓ WIRED | 40–42、49 行 |
| `packages/dashboard/vite.app.config.ts` | `index.html` | `rollupOptions.input: resolve(__dirname, "index.html")` | ✓ WIRED | 13–15 行 |
| `packages/cli/src/cli.ts` | `ensureRelayRunning` | `import { ensureRelayRunning } from "@agent-talkie/supervisor"` | ✓ WIRED | 3–7、118 行 |

### Data-Flow Trace（Level 4）

| Artifact | Data / 输出 | 上游来源 | 真实数据 | Status |
|----------|-------------|----------|----------|--------|
| `GET /dashboard*` HTML | `text/html` 与打包 JS 路径 | `sirv(resolveDashboardAppDir())` 读磁盘 `dist-app/` | 构建产物非硬编码空数组 | ✓ FLOWING |
| `talkie dashboard` stdout | URL 字符串 | `ensureRelayRunning({}).port` + 固定 host/path | 测试中动态端口 | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Relay HTTP + dashboard 测试 | `npm run test -w @agent-talkie/relay` | 7 files, 26 tests passed | ✓ PASS |
| CLI dashboard 集成测试 | `npm run test -w @agent-talkie/cli` | 2 files, 8 tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description（REQUIREMENTS.md） | Status | Evidence |
|-------------|----------------|----------------------------------|--------|----------|
| **CONN-03** | 08-01, 08-02 | Relay serves dashboard static assets on same origin in production | ✓ SATISFIED（实现） | relay `sirv` + `dist-app`；demo 生产 WS 同源；根构建顺序 |
| **CONN-04** | 08-03 | User can open dashboard via `talkie dashboard` CLI command | ✓ SATISFIED（实现） | `dashboard` 命令、`open`、测试 `--no-open` URL |

**文档一致性说明：** 本次已同步更新 `.planning/REQUIREMENTS.md` 与 `.planning/ROADMAP.md` 的 Phase 8 / CONN-03 / CONN-04 状态，消除先前“实现完成但文档未勾选”的滞后。

**Orphaned（本 phase 映射但无 PLAN 声明）：** 无 — CONN-03、CONN-04 均出现在对应 PLAN frontmatter `requirements` 中。

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | 在抽样文件中未发现阻塞性 TODO/FIXME/空实现 |

### Human Verification Completed

见本文件 YAML `human_verification_completed`：默认打开浏览器、真实页面可用性、以及 CLI 退出后 daemon 持续监听均已确认。

### Gaps Summary

**闭环完成**：静态托管、CLI 入口、构建产物、自动化测试与浏览器人工 UAT 均与 PLAN 一致；Phase 8 剩余的人工作业项已关闭。

---

_Verified: 2026-04-17T09:43:20Z_

_Verifier: Claude (gsd-verifier)_
