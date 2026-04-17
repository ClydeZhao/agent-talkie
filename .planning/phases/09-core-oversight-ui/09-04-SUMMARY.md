---
phase: 09-core-oversight-ui
plan: 04
subsystem: ui
tags: [lit, websocket, protocol.error, dashboard, i18n-zh]

requires:
  - phase: 09-core-oversight-ui
    provides: DashboardStore, bridge post-handshake dispatch, demo layout
provides:
  - "protocolErrorWireSchema + onProtocolError before catchup/safeParseEnvelope"
  - "RELAY_ERROR_COPY (19 codes) + getRelayErrorCopy fallback"
  - "talkie-error-bar: max 3, sticky vs 8s dismiss, zh-CN title/hint"
affects:
  - "Phase 10+ error surfacing patterns"

tech-stack:
  added: []
  patterns:
    - "Bridge protocol.error branch after pending handshake blocks, before transcript.catchup"
    - "Store-owned error timers; slice(0,3) evicts oldest and clears orphaned timeouts"

key-files:
  created:
    - packages/dashboard/src/errors/relay-error-copy.ts
    - packages/dashboard/src/errors/talkie-error-bar.ts
  modified:
    - packages/dashboard/src/bridge/wire-schemas.ts
    - packages/dashboard/src/bridge/browser-session-bridge.ts
    - packages/dashboard/src/bridge/browser-session-bridge.test.ts
    - packages/dashboard/src/store/dashboard-store.ts
    - packages/dashboard/src/demo/main.ts

key-decisions:
  - "envelope_version_mismatch keeps early setStaleReason; protocol.error branch duplicates for post-handshake frames"
  - "Unknown error codes use neutral 未知错误 template (threat model T-09-04-02)"

patterns-established:
  - "Operator errors: static map + Lit strip; no unsafeHTML; no persistence"

requirements-completed: [OVER-07]

duration: 25min
completed: 2026-04-17
---

# Phase 9 Plan 04: Error UX Summary

**`protocol.error` 在握手完成后经 `onProtocolError` 进入 `DashboardStore`，以中文 `RELAY_ERROR_COPY` 映射展示在 `talkie-error-bar`（最多 3 条、非粘性 8s 移除、粘性需关闭）。**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3
- **Files modified:** 7 (+1 test)

## Accomplishments

- Bridge：`protocolErrorWireSchema` 在 `dispatchPostHandshake` 中位于 `transcriptCatchupMessageSchema` 之前；`envelope_version_mismatch` 仍触发 `protocol_version` stale；新增 Vitest 覆盖稳定连接后的 `no_orchestrator` 投递。
- 文案：`RELAY_ERROR_COPY` 含 19 个 relay 码；粘性集合与计划一致；`getRelayErrorCopy` 对未知码返回中性模板。
- UI / Store：`pushProtocolError` / `dismissError`、非粘性 `setTimeout(8000)`；demo 中 `#app` 顺序为 connection-shell → error-bar → 两栏 body；`bridge.onProtocolError` 接线。

## Task Commits

1. **Task 1: wire-schema 与 bridge 回调** — `f07f30d` (feat)
2. **Task 2: RELAY_ERROR_COPY 与中文文案** — `2a9b11a` (feat)
3. **Task 3: talkie-error-bar、store 与 demo** — `1493b3d` (feat)

## Files Created/Modified

- `packages/dashboard/src/bridge/wire-schemas.ts` — `protocolErrorWireSchema` / `ProtocolErrorWire`
- `packages/dashboard/src/bridge/browser-session-bridge.ts` — `onProtocolError`、post-handshake 分支
- `packages/dashboard/src/bridge/browser-session-bridge.test.ts` — 稳定态 `protocol.error` 测试
- `packages/dashboard/src/errors/relay-error-copy.ts` — 错误码表与 `getRelayErrorCopy`
- `packages/dashboard/src/errors/talkie-error-bar.ts` — `<talkie-error-bar>` 堆叠条
- `packages/dashboard/src/store/dashboard-store.ts` — `errors`、`pushProtocolError`、`dismissError`
- `packages/dashboard/src/demo/main.ts` — 布局顺序与 `onProtocolError`

## Deviations from Plan

无 — 按计划实现；`envelope_version_mismatch` 保留原有前置 `setStaleReason`，并在 `protocol.error` 分支内再次处理 post-handshake 帧（与计划「仍执行」一致）。

## Known Stubs

无 — `DashboardStore.errors` 已接入协议错误流。

## Threat Flags

无计划外威胁面；错误展示为静态表或中性模板字符串，Lit 文本绑定（与 plan `<threat_model>` 一致）。

## Self-Check: PASSED

- `[ -f packages/dashboard/src/errors/talkie-error-bar.ts ]` → FOUND
- `[ -f packages/dashboard/src/errors/relay-error-copy.ts ]` → FOUND
- `git log --oneline --all | grep -q f07f30d` → FOUND
- `git log --oneline --all | grep -q 2a9b11a` → FOUND
- `git log --oneline --all | grep -q 1493b3d` → FOUND
- `npm test -w @agent-talkie/dashboard` 与 `npm run build -w @agent-talkie/dashboard` → 退出码 0（执行于 Task 3 收尾）
