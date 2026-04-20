# Phase 10: Interactive human controls - Research

**Researched:** 2026-04-20  
**Domain:** Dashboard（Lit）↔ Relay（WebSocket）人机信封发送、编排者控制、幂等与 UI 反馈  
**Confidence:** MEDIUM（协议与 relay 行为以仓库源码为准；对话幂等在 relay 侧未实现，见下文「缺口」）

<user_constraints>
## User Constraints（来自 CONTEXT.md）

### 已锁定决策

**发送面板**

- **D-01：** 输入条固定在 transcript 下方，位于 Phase 9 右栏布局内；连接可用时始终可见。
- **D-02：** 多行文本框；Shift+Enter 换行；Ctrl+Enter 或独立发送按钮提交；可纵向增高。
- **D-03：** 发送面板只发 `kind: "conversation"` 信封；`orchestrator.designate` / `orchestrator.clear` / `task.assign` 仅通过名册等专用 UI 触发，不在文本框内拼控制载荷。

**目标与路由**

- **D-04：** 默认 human→orchestrator；展示「To: Orchestrator」；点击名册会话切为 `to` 直连该 session；再次点击同一条目或目标指示器上的「×」恢复默认 orchestrator 路由。
- **D-05：** 未指定 orchestrator 时禁用默认发送路径，提示指定编排者并禁用发送；名册直连仍可用。

**编排者管理**

- **D-06：** designate/clear 放在名册条目的操作菜单；当前 orchestrator 显示「Clear orchestrator」，其余显示「Designate as orchestrator」；名册上已有 orchestrator 视觉标记（Phase 9）。
- **D-07：** 非 owner 不展示 designate/clear；以 space-summary 快照中的 `owner` 门控。
- **D-08：** designate/clear 无确认框，点击即执行；成功后名册应即时反映。

**发送反馈与重试**

- **D-09：** 乐观发送：提交后清空输入；成功路径依赖 relay 正常 fan-out/回显进入 transcript；`protocol.error` 走 Phase 9 错误条。
- **D-10：** 错误条目中提供「重试」，用**同一** `idempotencyKey` 重发同一信封。
- **D-11：** `idempotencyKey` 对用户完全不可见；bridge 每次发送生成 UUID v4，失败时在内存中保留待重试信封并重用语义上的同一 key。

### Claude 裁量

发送按钮图标/文案、输入条高度与 max-height、名册菜单触发方式、重试按钮样式、除 Ctrl+Enter 外的快捷键、「To: …」指示器样式与展示名/id 前缀取舍。

### 延后想法（本阶段外）

无。
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | 描述 | 研究结论如何支撑实现 |
|----|------|----------------------|
| **CTRL-01** | Dashboard 发消息：默认 human→orchestrator，可选直连 session | `routeEnvelope` 已区分 `conversation` + 无 `to` + `isHuman` → orchestrator；`envelope.to` → 单播。[VERIFIED: `packages/relay/src/router.ts`] 需在 bridge 增加出站 `send`、组信封时带 `spaceId`/`version`/`sessionId`（人类 session）。 |
| **CTRL-02** | Dashboard 指定/清除 orchestrator | `handleCollaborationControl` 已实现 designate/clear、owner 校验、`orchestrator.designated` / `orchestrator.cleared` ack 与 `collaboration.orchestrator` fan-out。[VERIFIED: `packages/relay/src/collaboration-handlers.ts`] Dashboard **当前未**解析上述非信封 JSON，需 bridge + store 更新以实现「成功后立即」刷新名册。 |
| **CTRL-03** | 发送幂等、安全重试 | 协议字段 `idempotencyKey` 存在 [VERIFIED: `packages/protocol/src/envelope.ts`]。**对话路径**下 `routeEnvelope` **未**调用 `tryRecordIdempotencyKey`；每次路由仍会 `appendTranscriptEntry` 新行 [VERIFIED: `packages/relay/src/router.ts`、`packages/persistence/src/repositories/transcript.ts`]。满足「transcript 中单一逻辑结果」很可能需要 **relay/persistence 扩展** 或产品层明确接受「仅 UI 按 `envelope.id` 去重、持久化仍可能双行」——见 Open Questions。 |
</phase_requirements>

## Summary

Phase 10 在 **不引入新传输栈** 的前提下，把 Phase 7–9 已具备的「只读 + 错误展示」补全为与 CLI/Node 客户端等价的 **出站信封能力**：`BrowserSessionBridge` 需增加类似 `TalkieSessionClient.sendEnvelope` 的出站路径；UI 层实现发送条、目标选择与名册控制菜单；`DashboardStore` 扩展发送目标、待重试状态及 orchestrator 位图更新。

Relay 侧 **human→orchestrator** 与 **带 `to` 的直连** 规则已在 `routeEnvelope` 中实现；**orchestrate designate/clear** 在 `handleCollaborationControl` 中实现且带 SQLite 幂等表。**关键缺口**：普通 `conversation` 信封的持久化 transcript **不**根据 `idempotencyKey` 去重，与 CONTEXT 中「依赖 relay 去重保证 exactly-once」的表述存在偏差——规划阶段必须决定是改 relay 还是收紧成功标准/验收方式。

**首要建议：** 规划时把 **CTRL-03** 拆成「客户端：固定 key + 重试 UI」与「服务端：可选/必选 transcript 幂等」两条可验证任务，并在 `router`/`appendTranscriptEntry` 或独立去重层上写明行为，避免与 roadmap 成功标准第 3 条冲突。

## Standard Stack

### Core

| 库 | 版本 | 用途 | 说明 |
|----|------|------|------|
| `lit` | **3.3.2**（`@agent-talkie/dashboard` 已钉） | Web Components + 模板 | 与 Phase 9 一致；继续 shadow DOM + `css` 模板。[VERIFIED: `packages/dashboard/package.json` + `npm view lit version` → 3.3.2] |
| `@agent-talkie/protocol` | workspace | `Envelope`、`safeParseEnvelope`、协作载荷 Zod | 出站前 `safeParseEnvelope`；控制载荷用 `orchestratorDesignatePayloadSchema` 等。[VERIFIED: 源码] |
| `zod` | **^4.3.6** | 与 protocol 一致 | [VERIFIED: `npm view zod version` → 4.3.6] |
| 浏览器 `crypto.randomUUID()` | 内置 | `idempotencyKey`、信封 `id` | 与现有 `joinSpace` 一致；无需为 key 再引 `uuid` 运行时依赖。[VERIFIED: `browser-session-bridge.ts` joinSpace] |

### Supporting

| 库 | 版本 | 用途 | 何时用 |
|----|------|------|--------|
| `uuid`（dev） | dashboard devDependency ^13 | 测试或 Node 侧脚本 | 浏览器路径优先 `crypto.randomUUID()`。[VERIFIED: package.json；`npm view uuid` 最新为 14.x，非必须升级] |

### 不建议引入

| 类别 | 避免 | 原因 |
|------|------|------|
| 第二套实时协议 | Socket.io 等 | 项目约束：原生 WebSocket + 信封 [CITED: `.cursor/rules/gsd-context.md` → PROJECT 约束] |
| React/Vue 重写 dashboard | — | REQUIREMENTS 明确排除 [VERIFIED: `.planning/REQUIREMENTS.md`] |

**安装：** 本阶段默认 **无新生产依赖**；若仅测试需要可保持现状。

## Architecture Patterns

### 推荐数据流

```
talkie-send-bar / roster menu
    → DashboardStore（目标 session、owner 门控、pending retry）
    → BrowserSessionBridge.sendEnvelope(Envelope)
    → WebSocket JSON
    → dispatchValidatedEnvelope → handleCollaborationControl | routeEnvelope
    → protocol.error | transcript.catchup | collaboration.* | Envelope fan-out
    → bridge 回调 → store（transcript / errors / roster）
```

### Pattern 1：出站信封（对齐 Node 客户端）

**含义：** handshake 完成且 `negotiatedVersion`、`registeredSessionId` 可用后，发送 **完整** `Envelope` JSON（与 `joinSpace` 相同通道）。

**参考实现：**

```336:340:packages/client/src/session-client.ts
  sendEnvelope(envelope: Envelope): void {
    const ws = this.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(envelope));
    }
  }
```

Bridge 应在 `pendingRegister` / `pendingResume` / `pendingJoin` 之外的路径调用；若 socket 未 OPEN 应拒绝或入队（建议拒绝并提示，避免静默丢失）。

### Pattern 2：Human 默认 orchestrator 路由条件

**含义：** 同时满足：`kind === "conversation"`、`to === undefined`、发送者在 DB 中 `isHuman === true` → 解析 orchestrator 并单播；无 orchestrator → `no_orchestrator`；离线 → `orchestrator_offline`。

```147:170:packages/relay/src/router.ts
  if (
    envelope.kind === "conversation" &&
    envelope.to === undefined &&
    senderSession.isHuman
  ) {
    const orch = getOrchestratorSessionId(db, spaceId);
    if (orch === null) {
      sendJson(senderWs, { type: "protocol.error", error: "no_orchestrator" });
      return;
    }
    const orchWs = getSocketForSession(orch);
    if (!orchWs || orchWs.readyState !== WebSocket.OPEN) {
      sendJson(senderWs, {
        type: "protocol.error",
        error: "orchestrator_offline",
      });
      return;
    }
    // ...
    orchWs.send(wire);
    return;
  }
```

直连：设置 `to` 为对方 `sessionId`（UUID），**不**走 orchestrator 分支。

### Pattern 3：Designate / Clear 与控制幂等

**含义：** `kind: "control"`，`type` 为 `orchestrator.designate` / `orchestrator.clear`，**必须**带 `idempotencyKey`；服务端 `tryRecordIdempotencyKey`；重复且状态一致则 ack，否则 `idempotency_replay_mismatch`。

[VERIFIED: `packages/relay/src/collaboration-handlers.ts`]

### Pattern 4：名册即时反映 orchestrator

**现状：** `hydrateFromSpaceSummary` 根据 HTTP 快照设置 `orchestrator` 位；定时 `scheduleSnapshotRefresh(..., 10000)`。[VERIFIED: `dashboard-store.ts`、`demo/main.ts`]

**为满足 D-08 / CTRL-02：** 需在 `dispatchPostHandshake` 中增加对 `orchestrator.designated`、`orchestrator.cleared`、`collaboration.orchestrator` 的解析（类似 `collaboration.metadata`），并调用 store 方法更新 `RosterRow.orchestrator`（及必要时拉一次 summary 作一致性校验）。

### Anti-Patterns

- **在 transcript 文本框拼接控制 JSON：** 违反 D-03。
- **未带 `spaceId` 发业务信封：** `routeEnvelope` 直接 `not_in_space`。
- **重试时生成新 `idempotencyKey`：** 违反 D-10/D-11 与 CTRL-03 意图。
- **假设对话 relay 已按 key 去重：** 当前实现未保证 [VERIFIED: `router.ts`]。

## Don't Hand-Roll

| 问题 | 不要自己做 | 应使用 | 原因 |
|------|------------|--------|------|
| 信封形状校验 | 手写类型断言 | `safeParseEnvelope` + Zod 载荷 schema | 与 relay `parseAndValidateEnvelope` 对齐，避免静默不兼容 |
| orchestrator 载荷 | 手写对象 | `orchestratorDesignatePayloadSchema` 等 | 与 relay 校验一致 |
| 错误文案 | 硬编码散落 | `RELAY_ERROR_COPY` / `getRelayErrorCopy` | OVER-07 已统一；新 code 再增量映射 |
| WebSocket 重连状态机 | 重写 | 沿用 `BrowserSessionBridge` 既有 health / pending 状态 | 降低与 Phase 7 行为分叉风险 |

**要点：** 控制面幂等表与 fan-out 已在 relay；dashboard 应 **消费** 协议消息而非复制业务规则。

## Common Pitfalls

### 1. 直连目标离线时无 `protocol.error`

**现象：** `envelope.to` 有值且成员仍在空间内，但目标 WebSocket 未连接时，`routeEnvelope` 仍 `appendTranscriptEntry`，**不**向发送者返回错误。[VERIFIED: `router.ts` 173–182]

**规划影响：** 与 orchestrator 路径不对称；若需 UX 对等，可能需后续 relay 改动或产品说明「直连仅尽力投递」。

### 2. Transcript 双行与成功标准第 3 条

**现象：** 重试若产生两次 `appendTranscriptEntry`，DB 中两条 `relay_seq`；catch-up 与虚拟列表会显示两行，除非客户端按额外键去重。

**根因：** 对话未走 `idempotency_keys`。

**规避选项：** （a）relay 在 `conversation` 且带 `idempotencyKey` 时先 `tryRecordIdempotencyKey`，重复则短路 append+fabric（需精确定义与 fan-out 关系）；（b）接受仅「在线 envelope 流」按 `envelope.id` 去重（`appendTranscriptEnvelope` 已用 `spaceId:id`）[VERIFIED: `dashboard-store.ts`]，并明确 catch-up 仍可能重复。

### 3. 发送时序

**现象：** `joinSpace` 未完成或 `negotiatedVersion === null` 时发信封会失败或不符合协议。

**规避：** `send` 与 UI 启用条件绑定：`registeredSessionId`、`negotiatedVersion`、`activeSpaceId`、连接 health。

### 4. Owner 门控与 relay 错误码

**现象：** 非 owner 调用 designate → `not_space_owner` 或 `orchestrator_designate_forbidden`（非 human）。

**规避：** UI 侧隐藏菜单项；仍应处理错误条以防 race。

### 5. 乐观清空输入与失败

**现象：** D-09 要求失败时用户需能从错误条重试；若未在 store/bridge 保留「最后一次失败信封 + key」，重试无法实现。

**规避：** bridge 或 store 维护 `lastFailedOutbound`（含 `idempotencyKey` 与完整 `Envelope`）。

## Code Examples

### 最小 `conversation` 信封字段（示意）

```typescript
// 规划/实现时需使用真实 sessionId（v7）、activeSpaceId、negotiatedVersion
const envelope = {
  version: negotiatedVersion,
  id: crypto.randomUUID(),
  sessionId: registeredSessionId,
  kind: "conversation" as const,
  type: "message.user", // 或项目约定的对话 type 字符串
  payload: { text: "..." },
  spaceId: activeSpaceId,
  idempotencyKey: crypto.randomUUID(),
  // 直连时设置 to: targetSessionId；默认 orchestrator 则不设置 to
};
```

（具体 `type` / `payload` 形状须与现有 CLI/adapter 与 relay 期望对齐——请在计划中 grep `conversation` 发送方。）[需实现时 VERIFIED]

### Join 信封模式（已有）

```742:754:packages/dashboard/src/bridge/browser-session-bridge.ts
    return new Promise((resolve, reject) => {
      this.pendingJoin = { resolve, reject, slug: args.slug };
      ws.send(
        JSON.stringify({
          version: this.negotiatedVersion,
          id: crypto.randomUUID(),
          sessionId: this.registeredSessionId,
          kind: "control",
          type: "space.join",
          payload: { slug: args.slug },
          idempotencyKey: args.idempotencyKey,
        }),
      );
    });
```

出站业务信封建议同样使用 `negotiatedVersion` 与 `registeredSessionId`。

## State of the Art

| 旧认知风险 | 当前代码事实 | 影响 |
|------------|--------------|------|
| 「relay 对发送去重」泛指所有 kind | 仅 join/leave/designate/clear 等路径使用 `tryRecordIdempotencyKey` | CTRL-03 可能要加 relay 任务 |
| 名册仅靠 HTTP 刷新即可 | 10s 轮询不足以满足「立即」 | 必须订阅 WS ack / `collaboration.orchestrator` |

## Assumptions Log

| # | 假设 | 章节 | 若错误的影响 |
|---|------|------|----------------|
| A1 | 存在已约定的 `conversation` `type` + `payload`（与 watch/CLI 一致） | Code Examples | 若各客户端不一致，需先统一协议或兼容多种 type |
| A2 | Phase 10 UAT 以「当前单机 relay + 浏览器」为主 | Environment | 远程/wss 非 v2.0 范围 |

## Open Questions

1. **CTRL-03 与 transcript 单一事实来源**  
   - **已知：** UI 可按 `envelope.id` 去重；持久化 transcript 无 key 去重。  
   - **未定：** 是否在 Phase 10 内修改 `routeEnvelope`（或 transcript 写入层）实现 `idempotencyKey` 幂等。  
   - **建议：** 规划会议二选一并写清验收步骤（含重连后 catch-up）。

2. **`conversation` 的规范 type/payload**  
   - **建议：** grep `kind: "conversation"` / `sendEnvelope` 调用点，锁定单一规范写入 PLAN。

3. **直连离线是否要在本阶段修 relay**  
   - 若产品要求与 `orchestrator_offline` 一致，需新增错误码或行为变更。

## Environment Availability

| 依赖 | 用途 | 可用性 | 版本 | 回退 |
|------|------|--------|------|------|
| Node.js | 构建 / Vitest / relay | ✓ | v22.14.0（本机探测） | 项目建议 LTS 20+ [CITED: `.cursor/rules/gsd-context.md`] |
| npm | workspaces | ✓ | 10.9.2 | — |
| 本地 relay | 联调 | ✓（开发假设） | — | 无 relay 则无法 E2E |
| 浏览器 `sessionStorage` / `crypto` | 会话与 UUID | ✓（dashboard 目标环境） | — | 非浏览器环境不适用本包 |

**无依赖且阻塞：** 无（纯实现阶段默认开发者已能启动 relay）。

## Security Domain

（`workflow.nyquist_validation` 为 false，仍做轻量 STRIDE 对齐。）

### 适用 OWASP ASVS 思路

| 类别 | 是否相关 | 控制手段 |
|------|----------|----------|
| V5 输入验证 | 是 | 出站前 `safeParseEnvelope`；控制载荷用 Zod schema |
| V4 访问控制 | 是 | Owner/human 由 relay 权威裁决；UI 仅隐藏入口不视为安全边界 |
| V13 通信 | 是 | v2.0 默认 localhost；信封不夹带可执行代码 |

### 本栈威胁简表

| 模式 | STRIDE | 缓解 |
|------|--------|------|
| 恶意/畸形 JSON | 篡改 | relay `parseAndValidateEnvelope`；客户端也用 `safeParseEnvelope` |
| 非 owner 指定 orchestrator | 越权 | relay 返回错误；UI 门控减少误操作 |

## Project Constraints（来自 .cursor/rules/ 与 PROJECT）

摘自 `.cursor/rules/gsd-context.md` 嵌入的 PROJECT 约束，规划须兼容：

- 默认路径 **零外部服务**；元数据 **SQLite**；核心传输 **WebSocket + 信封**。
- **不显式引入** Socket.io / 第二套实时协议作为核心。
- 包形态：**npm install / npx** 可用。
- GSD：重大实现工作宜通过 `/gsd-execute-phase` 等与 `.planning` 同步（规则原文要求经 GSD 入口再改仓库）。

## Sources

### Primary（HIGH）

- `packages/protocol/src/envelope.ts` — 信封与 `idempotencyKey` 可选 UUID  
- `packages/relay/src/router.ts` — human→orchestrator、直连、`appendTranscriptEntry` 时机  
- `packages/relay/src/collaboration-handlers.ts` — designate/clear、幂等、fan-out  
- `packages/relay/src/server.ts` — `dispatchValidatedEnvelope` 管道顺序  
- `packages/persistence/src/repositories/transcript.ts` — transcript 行独立 `id`、无 envelope 级唯一约束  
- `packages/dashboard/src/bridge/browser-session-bridge.ts` — 入站分发、缺出站 send  
- `packages/dashboard/src/store/dashboard-store.ts` — roster/transcript/error、去重键  
- `.planning/phases/10-interactive-human-controls/10-CONTEXT.md` — 产品决策  

### Secondary（MEDIUM）

- `packages/client/src/session-client.ts` — `sendEnvelope` 参考实现  
- `.planning/REQUIREMENTS.md` — CTRL-01..03 定义  
- `.planning/ROADMAP.md` — Phase 10 三计划粗粒度拆分  

## Metadata

**置信度说明：**

| 区域 | 级别 | 原因 |
|------|------|------|
| Standard stack | HIGH | 与 lockfile / 源码一致 |
| Relay 路由与协作控制 | HIGH | 直接读实现 |
| 对话幂等与 transcript 唯一性 | MEDIUM — 存在产品与实现差距 | CONTEXT 与 `router` 行为不一致已标出 |
| conversation payload 约定 | LOW — 需 grep 锁定 | 见 Open Questions |

**Research date:** 2026-04-20  
**建议复审：** 30 天内或变更 `router`/信封 schema 后
