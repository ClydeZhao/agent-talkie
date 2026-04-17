---
phase: 07-browser-connection-session-bridge
plan: 3
subsystem: dashboard
tags: [websocket, reconnect, backoff, relaySeq, vitest, sessionStorage, health]

requires:
  - phase: "07-02"
    provides: "Connection health、generation 探测、notifyRelayGenerationStale、Lit shell"
provides:
  - "`nextReconnectDelayMs` 纯函数退避（1s 起、倍增、30s 顶、0–300ms 抖动）"
  - "`connect({ autoReconnect: true })`：join 成功后断线无限重连；重连前 generation 探测失败则 stale 并停止重连"
  - "`internalReconnect`：resume 失败清 `SESSION_ID_KEY`/`RECONNECT_SECRET_KEY` 并 `registerNewSession` + `joinSpace(slug: dashboard)`"
  - "`onTranscriptCatchup`：仅当 `relaySeq` 严格大于当前游标时更新 `maxRelaySeq` 并回调"
affects:
  - "Phase 8（CLI 注入 generation 与同源托管）"
  - "Phase 9（时间线消费 `onTranscriptCatchup` / relaySeq 语义）"

tech-stack:
  added: []
  patterns:
    - "重连：`reconnecting` → 退避定时器 → 握手 → resume/register → join；成功将退避 attempt 置 0"
    - "catch-up 尾窗重叠：以 `relaySeq` 单调游标去重，避免重复投递"

key-files:
  created:
    - "packages/dashboard/src/bridge/reconnect-schedule.ts"
    - "packages/dashboard/src/bridge/reconnect-schedule.test.ts"
    - "packages/dashboard/src/bridge/transcript-catchup-dedupe.test.ts"
  modified:
    - "packages/dashboard/src/bridge/browser-session-bridge.ts"
    - "packages/dashboard/src/bridge/browser-session-bridge.test.ts"
    - "packages/dashboard/src/demo/main.ts"
    - "packages/dashboard/src/index.ts"

key-decisions:
  - "采用 `connect({ autoReconnect?: boolean })` 默认 `false`，保持既有 Vitest 不显式传参时的行为。"
  - "重连后 `joinSpace` 的 slug 固定为 `dashboard`，与 demo 的 `DEMO_SPACE_SLUG` 及计划字面量一致。"

patterns-established:
  - "用户 `close()` 置 `_userRequestedClose`、清除退避定时器，不再自动重连。"
  - "`beginReconnectBackoff` 在存在非空 `RELAY_GENERATION_KEY` 时先 `probeRelayGenerationHealth`，失败则 `notifyRelayGenerationStale()` 并 `disconnected`。"

requirements-completed: [CONN-02]

duration: 25min
completed: 2026-04-17
---

# Phase 7 Plan 3：重连、credential 回退与 catch-up 去重摘要

**指数退避 + generation 门禁的无限自动重连、`transcript.catchup` 按 `relaySeq` 去重与 `onTranscriptCatchup` 回调，以及 `session.resume` 失败时清 sessionStorage 并回退 `registerNewSession`。**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2
- **Files modified:** 见 frontmatter `key-files`

## Accomplishments

- 新增 `reconnect-schedule.ts` 与单测，满足 D-09 数值与抖动区间验收。
- `BrowserSessionBridge`：`reconnecting` 态、断线后退避重连、generation 探测失败停止重连；`close()` 与 `beforeunload` 终止重连循环。
- `onTranscriptCatchup` 仅在 `relaySeq > maxRelaySeq` 时推进游标并通知监听者；`transcript-catchup-dedupe.test.ts` 覆盖同 seq 双帧。
- Plan 01 的 `maxRelaySeq` 测试补充「重复 seq 不抬高游标」断言。

## Task Commits

1. **Task 1：reconnect-schedule 与单元测试** — `b19ea8f`
2. **Task 2：桥接重连、credential 回退与 catch-up 去重** — `dc7ad6b`

## Files Created/Modified

- `packages/dashboard/src/bridge/reconnect-schedule.ts` — `nextReconnectDelayMs`。
- `packages/dashboard/src/bridge/reconnect-schedule.test.ts` — 退避 cap 与抖动边界。
- `packages/dashboard/src/bridge/browser-session-bridge.ts` — 自动重连、探测、resume 失败清凭证、`onTranscriptCatchup`、运输层 drop 处理。
- `packages/dashboard/src/bridge/transcript-catchup-dedupe.test.ts` — JSON 双帧同 `relaySeq` 去重。
- `packages/dashboard/src/bridge/browser-session-bridge.test.ts` — 重复 catch-up seq 断言。
- `packages/dashboard/src/demo/main.ts` — `connect({ autoReconnect: true })`、`beforeunload` 调用 `close()`。
- `packages/dashboard/src/index.ts` — 导出 `TranscriptCatchupRow`。

## Verification

- `npm run test -w @agent-talkie/dashboard` — 通过（11 tests）。
- `npm run build -w @agent-talkie/dashboard` — 通过。

## Deviations from Plan

无偏离：按计划实现 `connect` 可选参数、硬编码 `dashboard` join slug、以及 Plan 01 测试与去重语义对齐。

## Known Stubs

无。

## Threat Flags

无计划外新增信任边界；`onTranscriptCatchup` 消费者仍须将 `envelope` 视为数据（对照计划 T-07-03-02）。

## Self-Check: PASSED

- `[ -f packages/dashboard/src/bridge/reconnect-schedule.ts ]` — FOUND
- `[ -f packages/dashboard/src/bridge/transcript-catchup-dedupe.test.ts ]` — FOUND
- `git log --oneline | grep -E 'b19ea8f|dc7ad6b'` — FOUND

---
*Phase: 07-browser-connection-session-bridge*
*Completed: 2026-04-17*
