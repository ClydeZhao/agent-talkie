---
phase: 07-browser-connection-session-bridge
plan: 1
subsystem: dashboard
tags: [websocket, vitest, vite, lit, zod, relay, session-bridge]

requires:
  - phase: "06"
    provides: "稳定的本地 relay / 协议基线"
provides:
  - "`@agent-talkie/dashboard` 工作区与 Vite 库构建产物"
  - "`BrowserSessionBridge`：握手 → register/resume → join → 帧分发与 `relaySeq` 游标"
affects:
  - "07-02（连接壳与健康态）"
  - "07-03（重连与去重）"

tech-stack:
  added: ["lit@3.3.2", "vite@8.0.8", "vitest@^4.1.4", "@agent-talkie/protocol（workspace）"]
  patterns:
    - "浏览器原生 WebSocket + `@agent-talkie/protocol` Zod 校验，与 Node `TalkieSessionClient` 生命周期对齐"
    - "`connect()` 完成握手后再挂 `onmessage`，`resume` 前监听器已就绪以避免 catch-up 竞态"

key-files:
  created:
    - "packages/dashboard/src/bridge/browser-session-bridge.ts"
    - "packages/dashboard/src/bridge/browser-session-bridge.test.ts"
    - "packages/dashboard/src/bridge/wire-schemas.ts"
    - "packages/dashboard/src/bridge/session-storage-keys.ts"
    - "packages/dashboard/src/bridge/derive-http-origin.ts"
  modified:
    - "package.json（workspaces + 根 test/build 串联 dashboard）"
    - "packages/dashboard/package.json / vite.config.ts / src/index.ts"

key-decisions:
  - "join 信封的 `version` 使用 `handshake.ack.negotiatedVersion`，与 relay 信封版本校验一致。"
  - "Vite 使用 `build.lib` 入口 `src/index.ts`，避免无 `index.html` 时生产构建失败。"

patterns-established:
  - "侧信道帧：`session.registered` / `session.resumed` / `space.joined` / `transcript.catchup` 用 Zod；对话与控制信封走 `safeParseEnvelope`。"
  - "`session.resumed` 成功后立即覆盖 `sessionStorage` 中的 `reconnectSecret`。"

requirements-completed: []

duration: 25min
completed: 2026-04-17
---

# Phase 7 Plan 1：浏览器会话桥接摘要

**在 monorepo 中落地 `@agent-talkie/dashboard`，并以 Vitest 覆盖与 Node 客户端等价的 WebSocket 会话生命周期（握手、register/resume、join、catch-up 序号）。**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2
- **Files modified:** 见下方列表

## Accomplishments

- 新增 workspace 包：Vite 开发端口 `5174`、`/__agent-talkie` 代理指向 `127.0.0.1:18765`，根级 `test`/`build` 已串联 dashboard。
- 实现 `BrowserSessionBridge`：`session.register` 固定 `isHuman: true`；`sessionStorage` 持久化 `sessionId` / `reconnectSecret`；`transcript.catchup` 维护 `maxRelaySeq`。
- Vitest 使用 `MockWebSocket` 覆盖握手 ack、注册、加入空间与 catch-up 序号递增。

## Task Commits

1. **Task 1：新建 @agent-talkie/dashboard 工作区包** — `f5a4e18`
2. **Task 2：BrowserSessionBridge 与 Vitest 协议序列测试** — `9afe450`

## Files Created/Modified

- `packages/dashboard/src/bridge/browser-session-bridge.ts` — 主桥：握手、register/resume、join、`dispatchPostHandshake`。
- `packages/dashboard/src/bridge/browser-session-bridge.test.ts` — Mock WebSocket 协议序列与 `maxRelaySeq` 测试。
- `packages/dashboard/src/bridge/wire-schemas.ts` — `transcript.catchup`、`session.registered`、`space.joined` 本地 Zod。
- `packages/dashboard/src/bridge/session-storage-keys.ts` — `sessionStorage` 键常量（含 `RELAY_GENERATION_KEY` 占位）。
- `packages/dashboard/src/bridge/derive-http-origin.ts` — `ws`/`wss` → `http`/`https` 原点推导。
- `packages/dashboard/vite.config.ts` — 库模式构建 + dev 代理。
- `packages/dashboard/src/index.ts` — 导出桥与存储键。
- `package.json` — workspaces 与脚本串联。

## Verification

- `npm run test -w @agent-talkie/dashboard` — 通过（含 `smoke` 与 bridge 测试）。
- `npm run build -w @agent-talkie/dashboard` — 产出 `packages/dashboard/dist/index.js`。

## Deviations from Plan

### 自动调整

1. **Task 1 `package.json` 脚本** — 增加 `pretest`：在跑 dashboard 测试前执行 `npm run build -w @agent-talkie/protocol`，保证 `protocol` 的 `dist` 存在（与 `@agent-talkie/client` 一致）。
2. **Task 1 `devDependencies`** — 计划文案未列 `uuid`；测试需要 UUID v7 以匹配信封 `sessionId` 校验，已在 dashboard 包中加入 `uuid@^13.0.0`（仅测试/类型用）。
3. **Vite 构建** — 计划仅写 `build.outDir`；默认 SPA 需 `index.html`，改为 **`build.lib`** 以 `src/index.ts` 为入口，满足「产出 `dist`」验收。

### Auto-fixed Issues

无阻塞性缺陷；catch-up 测试中曾误在收到 `space.joined` 之前 `await joinSpace`，已改为先发 join 再模拟 `space.joined` 后 `await`。

## Requirements Note

计划 frontmatter 标注 `CONN-01`；`REQUIREMENTS.md` 中 CONN-01 含 **live health indicator**，可视部分由 **07-02** 交付。本计划完成 **WebSocket 会话桥接基础**，不在此勾选 CONN-01。

## Known Stubs

- `RELAY_GENERATION_KEY` 仅导出常量；写入/比对 generation 留待 07-02 / 07-03。

## Threat Flags

无新增威胁面对照表外表面；入站 JSON 均经 Zod / `safeParseEnvelope` 过滤（见计划 `<threat_model>` T-07-01-01）。

## Self-Check: PASSED

- `[ -f packages/dashboard/src/bridge/browser-session-bridge.ts ]` — FOUND
- `[ -f packages/dashboard/dist/index.js ]` — FOUND（构建后）
- `git log --oneline -3` 含 `f5a4e18`、`9afe450` — FOUND
