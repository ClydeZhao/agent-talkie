---
phase: 07-browser-connection-session-bridge
plan: 2
subsystem: dashboard
tags: [lit, websocket, health-ui, relay-generation, vitest, happy-dom]

requires:
  - phase: "07-01"
    provides: "BrowserSessionBridge、Vite `/__agent-talkie` 代理、deriveHttpOrigin"
provides:
  - "`ConnectionHealthUiState` 与 `onConnectionHealthChange` / join 成功后 `connected`"
  - "`getStaleUiReason` / `onStaleUiChange` / `notifyRelayGenerationStale` / `clearStaleUi`（握手 nack、`envelope_version_mismatch`、generation 探测失败）"
  - "`readBootstrapRelayGeneration` + `probeRelayGenerationHealth` + `persistRelayGenerationIfMissing`"
  - "Lit `talkie-connection-shell`（四态色点 + 固定顶栏刷新提示）"
  - "`index.html` + `src/demo/main.ts` 本地联调入口"
affects:
  - "07-03（重连时 `reconnecting` 与健康探测编排）"
  - "Phase 8 CLI 注入 `?generation=` 或 `VITE_RELAY_GENERATION`"

tech-stack:
  added: ["happy-dom@20.9.0"]
  patterns:
    - "连接健康：`connecting` 直至 `space.joined`，之后 `connected`；socket 关闭或 `close()` → `disconnected`"
    - "Stale UI：协议侧写 `protocol_version`，代际侧由 demo/上层调用 `notifyRelayGenerationStale()`"

key-files:
  created:
    - "packages/dashboard/src/bridge/relay-generation.ts"
    - "packages/dashboard/src/shell/connection-shell.ts"
    - "packages/dashboard/src/demo/main.ts"
    - "packages/dashboard/index.html"
    - "packages/dashboard/src/vite-env.d.ts"
    - "packages/dashboard/src/bridge/relay-generation.test.ts"
    - "packages/dashboard/src/shell/connection-shell.test.ts"
  modified:
    - "packages/dashboard/src/bridge/browser-session-bridge.ts"
    - "packages/dashboard/src/index.ts"
    - "packages/dashboard/package.json"
    - "packages/dashboard/tsconfig.json"

key-decisions:
  - "Lit 装饰器通过 `tsconfig` 的 `experimentalDecorators` + `useDefineForClassFields: false` 支持（Vitest 4 / oxc 读项目 tsconfig）。"
  - "刷新横幅默认文案包含 `Please refresh the page`，满足 D-07 与验收 grep。"

patterns-established:
  - "代际 bootstrap：`?generation=` 优先于 `import.meta.env.VITE_RELAY_GENERATION`；非空 bootstrap 写入 `sessionStorage`（demo 覆写策略）。"
  - "HTTP 探测走 `deriveHttpOriginFromWsUrl` + `/__agent-talkie/v1/health?generation=`，与 Plan 01 代理一致。"

requirements-completed: [CONN-01]

duration: 20min
completed: 2026-04-17
---

# Phase 7 Plan 2：连接壳与健康态摘要

**在 `BrowserSessionBridge` 上暴露可订阅的四态连接健康与 stale UI 信号，并以 Lit 壳层 + relay generation HTTP 探测完成 CONN-01 的可视化与 D-05–D-08。**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2
- **Files modified:** 见 frontmatter `key-files`

## Accomplishments

- 桥接：`connecting`（含握手后至 join 前）、`connected`（`space.joined` 后）、`disconnected`（关闭或错误路径）；`reconnecting` 类型已预留供 07-03。
- Stale：`handshake.nack` 与 `protocol.error` / `envelope_version_mismatch` → `protocol_version`；relay generation 403/探测失败由 `notifyRelayGenerationStale()` 标记。
- `relay-generation` 模块与 Vite 开发代理上的 `GET /__agent-talkie/v1/health?generation=…` 对齐；`index.html` + demo 串联壳层与桥。

## Task Commits

1. **Task 1：桥接健康、generation 探测与 Lit connection-shell** — `f34ca2b`
2. **Task 2：Vitest — generation 探测与 connection-shell 渲染** — `c7d365a`

## Files Created/Modified

- `packages/dashboard/src/bridge/browser-session-bridge.ts` — 健康与 stale API、join 成功置 `connected`、错误路径 `disconnected`。
- `packages/dashboard/src/bridge/relay-generation.ts` — bootstrap generation、health `fetch`、条件写入 `RELAY_GENERATION_KEY`。
- `packages/dashboard/src/shell/connection-shell.ts` — `talkie-connection-shell` 色点、英文标签、非 dialog 顶栏。
- `packages/dashboard/src/demo/main.ts` — 探测失败则横幅 + stale，不 `connect()`；否则 connect → resume/register → join。
- `packages/dashboard/index.html` — `#app` + demo 入口脚本。
- `packages/dashboard/src/index.ts` — 导出类型与探测函数；侧向加载 shell 以注册自定义元素。

## Verification

- `npm run test -w @agent-talkie/dashboard` — 通过（8 tests）。
- `npm run build -w @agent-talkie/dashboard` — 通过。

## Deviations from Plan

### Auto-fixed Issues

无偏离：按计划在首条提交中纳入 `happy-dom` 依赖；Vitest 4 忽略 `vitest.config` 内 `esbuild.tsconfigRaw`，改为在 `tsconfig.json` 启用 Lit 所需装饰器选项以使 `connection-shell` 测试可解析。

## Known Stubs

无。`reconnecting` 状态尚未由桥在断线重连路径中驱动（归属 07-03）。

## Threat Flags

无计划外新增信任边界；`probeRelayGenerationHealth` 仅使用 `response.ok`，不把响应体写入 DOM（对照 `<threat_model>`）。

## Self-Check: PASSED

- `[ -f packages/dashboard/src/shell/connection-shell.ts ]` — FOUND
- `[ -f packages/dashboard/src/bridge/relay-generation.ts ]` — FOUND
- `[ -f .planning/phases/07-browser-connection-session-bridge/07-02-SUMMARY.md ]` — FOUND
- `git log --oneline -2` 含 `f34ca2b`、`c7d365a` — FOUND
