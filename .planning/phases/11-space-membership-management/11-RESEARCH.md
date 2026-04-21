# Phase 11: Space & membership management - Research

**Researched:** 2026-04-21  
**Domain:** Relay WebSocket 控制面、SQLite oversight HTTP、Lit 仪表盘空间选择器与名册菜单  
**Confidence:** HIGH（对接现有代码路径）；MEDIUM（新控制消息的成功回包与列表 API 细节需在实现时与协议/测试对齐）

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Space Creation
- **D-01:** Reuse existing `space.join` for creation — dashboard provides a slug input, the browser session sends `space.join` with the new slug. The relay's `resolveOrCreateSpaceForSlug` already creates-if-not-exists. No new protocol needed.
- **D-02:** Creation UI lives in the space picker dropdown as a "Create new space" entry that expands an inline slug input field + confirm button.

#### Space Destruction
- **D-03:** Owner-only with confirmation dialog — only the space owner (first human to join) can destroy a space. Clicking "Destroy" shows a confirmation dialog before executing. Active sessions are forcibly removed.
- **D-04:** New WS control message `space.destroy` — the dashboard sends a `control` envelope with `type: "space.destroy"` and `payload: { slug }`. Relay validates owner identity, marks all memberships as left, closes WS connections for kicked sessions, then deletes the space row (CASCADE removes memberships and transcript). Consistent with existing `space.join`/`space.leave` control flow.
- **D-05:** Destroy action lives in the space picker dropdown (context menu on the current space entry) or in the header alongside the current space label, visible only to the owner.

#### Membership Management
- **D-06:** No invite mechanism — runtime sessions join spaces by themselves via adapter/CLI with a slug. Session IDs are internal and not exposed to dashboard users in a way that enables targeted invitation. MGMT-02 "invite" is effectively a no-op for localhost v2.0.
- **D-07:** Owner kick (remove) via roster action menu — new "Remove" option in the roster entry context menu (alongside existing "Designate as orchestrator" from Phase 10). Owner-only visibility, same pattern as orchestrator management (D-07 in Phase 10).
- **D-08:** New WS control message `membership.remove` — `control` envelope with `type: "membership.remove"` and `payload: { targetSessionId }`. Relay validates the sender is the space owner, marks `left_at` on the target's membership, and closes the target session's WS connection. No confirmation dialog — click executes immediately (consistent with Phase 10 D-08 for orchestrator actions).

#### Space Picker UX
- **D-09:** New HTTP endpoint `GET /__agent-talkie/v1/oversight/spaces` — returns list of active spaces with `slug`, `memberCount`, `ownerSessionId`, `orchestratorSessionId`. Lightweight query against the spaces table. Consistent with existing `space-summary` endpoint style.
- **D-10:** Header dropdown — header bar left side shows current space slug. Clicking expands a dropdown listing all active spaces (from the list API) plus a "Create new space" action at the bottom.
- **D-11:** New tab for space switch — clicking a different space in the dropdown opens `/dashboard?space=<slug>` in a new tab. Each tab is an independent browser session (per Phase 7 D-15: "new tab = new session" via `sessionStorage`). No leave/rejoin protocol logic needed; natural tab-level isolation.
- **D-12:** URL-driven space binding — dashboard reads `?space=<slug>` query param on load to determine which space to join. If no param, use a default slug (e.g., `default`) or show the space picker for initial selection.

### Claude's Discretion
- Slug input validation UX (inline error messages, character restrictions display)
- Confirmation dialog styling and animation
- Dropdown component implementation (custom Lit component vs Shoelace sl-dropdown)
- Space list refresh interval in the picker (on-open vs periodic polling)
- How the "Create new space" inline form is styled within the dropdown
- Whether destroying the current space auto-redirects or shows an empty state
- How the kicked session experiences disconnection (error message in their adapter)

### Deferred Ideas (OUT OF SCOPE)
- **Invite mechanism** — not feasible in localhost v2.0 because session IDs aren't exposed. Would require a session discovery/registry API. Relevant when remote relay + auth story (RSEC-01/02) lands.
- **Multi-space per session** — deferred per PROJECT.md (MSPC-01). Current v1 constraint: one session per space.
- **In-tab space switching** — leave/rejoin within a single tab. Skipped in favor of new-tab model for simplicity.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MGMT-01 | User can create and destroy collaboration spaces from dashboard | `handleSpaceJoin` + `normalizeSpaceSlug` 已支持 create-if-not-exists；`deleteSpaceById` + CASCADE 已存在；需新增 `space.destroy` 处理链与确认对话框 UI |
| MGMT-02 | User can invite/remove sessions from a space | CONTEXT 锁定「无 invite」；remove = `membership.remove` + 名册菜单；需在文案/验收中明确 invite 为 no-op 或「由运行时自行 join」 |
| MGMT-03 | User can list and switch between spaces via space picker | 新模式：`GET .../oversight/spaces` + 头部下拉；切换 = `window.open` 带 `?space=`，与 `BrowserSessionBridge` + `joinSpace` 读参一致 |
</phase_requirements>

## Summary

本阶段在**不引入第二套传输或外部服务**的前提下，把空间生命周期与成员剔除收进仪表盘：创建沿用现有 `space.join` 与 `resolveOrCreateSpaceForSlug` [VERIFIED: `packages/relay/src/space-lifecycle.ts`]；销毁与踢人通过两条新的 WS `control` 类型，在 `dispatchValidatedEnvelope` 中于 `routeEnvelope` 之前处理，与 `space.join` / `space.leave` 同级 [VERIFIED: `packages/relay/src/server.ts`]。持久层已有 `deleteSpaceById`（FK CASCADE 清理 memberships/transcript）[VERIFIED: `packages/persistence/src/repositories/spaces.ts`]；owner 校验沿用 `getSpaceOwnerSessionId` [VERIFIED: `packages/persistence/src/repositories/space-owner.ts`]。HTTP 侧在现有 `space-summary` 旁增加 `oversight/spaces` 列表即可复用 oversight 读库模式 [VERIFIED: `packages/relay/src/server.ts` + `packages/persistence/src/repositories/oversight.ts`]。仪表盘侧在 `demo/main.ts` 将硬编码 `DEMO_SPACE_SLUG` 改为解析 `?space=` [VERIFIED: `packages/dashboard/src/demo/main.ts`]，并在 shell/头部增加空间选择器；名册条目沿用 Phase 10 的 action menu 模式 [VERIFIED: `packages/dashboard/src/roster/talkie-roster-entry.ts`]。

**Primary recommendation:** 实现顺序建议为 persistence 列表查询 → relay `space.destroy` / `membership.remove` + HTTP `spaces` → protocol payload 小 schema（若需）→ `BrowserSessionBridge` 封装 → store + header picker + roster Remove → Vitest/集成测试对齐 idempotency 与 owner 错误码。

## Project Constraints (from .cursor/rules/)

- 默认路径零外部服务；元数据以 SQLite 为准；核心传输为 WebSocket + 版本化信封。[CITED: `.cursor/rules/gsd-context.md` 内嵌 PROJECT 约束]
- GSD：计划与执行应通过 GSD 工作流入口，避免与 `.planning` 状态脱节。[CITED: `.cursor/rules/gsd-context.md` GSD Workflow Enforcement]
- `AGENTS.md`：若修改项目文档须在任务结束前通读该文档；勿将单次对话结论写入 `AGENTS.md`。[VERIFIED: `AGENTS.md`]

## Standard Stack

### Core（本阶段直接沿用，不引入替代库）

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ws` | 工作区 lockfile 为准 | Relay WebSocket | 与现有 relay 一致 [VERIFIED: `packages/relay/package.json`] |
| `better-sqlite3` | 工作区 lockfile 为准 | 空间/成员/转写持久化 | 与 persistence 包一致 |
| `@agent-talkie/protocol`（Zod envelope） | workspace | 控制消息校验 | `envelopeSchema` 对 `type` 为开放 string，新 control 类型主要靠 relay 分支 + 可选 payload schema [VERIFIED: `packages/protocol/src/envelope.ts`] |
| Lit | dashboard 包 | 头部/下拉/名册 | Phase 7–10 已采用 [VERIFIED: `packages/dashboard`] |

**Version verification:** 本阶段无新标准 npm 依赖；新功能使用现有 monorepo 包即可。[ASSUMED: 若引入 Shoelace 等 UI 库需单独走版本 pin — 当前 CONTEXT 列为 discretion，默认不增加依赖。]

**Installation:** 无需额外 `npm install`（除非 discretion 选择 Shoelace）。

## Architecture Patterns

### Recommended touchpoints（与 CONTEXT canonical_refs 一致）

```
packages/relay/src/space-lifecycle.ts    # 新增 handleSpaceDestroy, handleMembershipRemove, envelope guards
packages/relay/src/server.ts             # dispatch + HTTP GET .../oversight/spaces
packages/relay/src/session-registry.ts    # get(sessionId) → close 被踢会话
packages/persistence/src/repositories/oversight.ts  # listOversightSpaces（新函数）
packages/dashboard/src/bridge/browser-session-bridge.ts  # sendSpaceDestroy, sendMembershipRemove（sendEnvelope 包装）
packages/dashboard/src/store/dashboard-store.ts   # 可选：spaces 列表缓存
packages/dashboard/src/shell/connection-shell.ts  # 或新建 header 子组件：空间下拉
packages/dashboard/src/demo/main.ts      # ?space= 解析、join slug、打开新 tab 的 base URL
packages/dashboard/src/roster/talkie-roster-entry.ts  # Owner-only Remove 菜单项
```

### Pattern 1: `space.join` 即创建

**What:** `normalizeSpaceSlug` 校验 slug；`resolveOrCreateSpaceForSlug` 在无行时 `insertSpaceWithSlug`，归档空间在 TTL 内可 `revive`，否则删旧建新。[VERIFIED: `space-lifecycle.ts`]

**When to use:** 仪表盘「创建空间」仅收集 slug 并调用现有 `joinSpace`。[VERIFIED: `browser-session-bridge.ts` `joinSpace` 发送的 envelope 无 `spaceId` 字段，与 join 处理一致]

### Pattern 2: Owner-only 控制消息（对齐 orchestrator）

**What:** `getSpaceOwnerSessionId(db, spaceId)` 与发送者 `sessionId` 比较；人类专属 gate 参考 `orchestrator.designate` 使用 `getSessionById` 的 `isHuman`。[VERIFIED: `collaboration-handlers.ts`]

**When to use:** `space.destroy`、`membership.remove` 必须在 relay 侧做相同语义校验；**注意** owner 为 `null` 时 orchestrator 会尝试 `tryAssignSpaceOwnerIfUnsetForHuman`，销毁/踢人应明确是否允许「首人类认领前」操作 — 建议与产品一致：**仅当 owner 已绑定且等于发送者** [ASSUMED: 若 owner 为 null 应返回 `not_space_owner`，需实现时写死，避免误删空 owner 空间]

### Pattern 3: SessionRegistry 踢线

**What:** `registry.get(sessionId)` 返回 `WebSocket`，可 `close()`；新连接绑定同一 `sessionId` 时会关闭旧 socket。[VERIFIED: `session-registry.ts`]

**When to use:** `membership.remove` 与 `space.destroy` 在更新 DB 后对所有受影响 `sessionId` 关闭连接。

### Anti-Patterns to Avoid

- **Hand-rolling slug 规则：** 必须与 `normalizeSpaceSlug` 一致（`^[a-z0-9]+(?:-[a-z0-9]+)*$`，最长 64）。[VERIFIED: `spaces.ts`]
- **把 destroy/kick 放进 `routeEnvelope` 默认转写路径：** 它们在 `dispatchValidatedEnvelope` 提前返回，避免误 append transcript；若需审计可在 handler 内显式 `appendTranscriptEntry`（与 orchestrator 控制消息一致）。[VERIFIED: `server.ts` 调度顺序]
- **在单 tab 内 silent 切换空间：** 与 D-11/D-12 冲突；切换应新开 tab 或至少完整新会话 + `joinSpace`（CONTEXT 已排除 in-tab 方案）。

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slug 规范化/校验 | 自定义 regex 与 DB 不一致 | `normalizeSpaceSlug` | 单一真相；否则 CLI/仪表盘/replay 行为分叉 [VERIFIED: `spaces.ts`] |
| 空间列表查询 | 仪表盘直接读 SQLite 文件 | Relay HTTP oversight | 与 Phase 9 `space-summary` 一致；零外部服务下由 relay 统一读库 [VERIFIED: `server.ts`] |
| Owner 判定 | 客户端仅根据名册推断 | `getSpaceOwnerSessionId` | 服务端权威；名册来自 snapshot 可能有延迟 [VERIFIED: `space-owner.ts`] |
| WS 连接查找 | 平行 Map | `SessionRegistry` | 已与 bind/remove 集成 [VERIFIED: `session-registry.ts`] |

**Key insight:** 本阶段主要是**编排现有原语**（join、deleteSpaceById、markMembershipLeft、registry close），而非新存储模型。

## Common Pitfalls

### Pitfall 1: `space.join` 与「已在另一空间」冲突

**What goes wrong:** `handleSpaceJoin` 在会话已有 `activeSpaceId` 且目标不同时返回 `already_in_space`。[VERIFIED: `space-lifecycle.ts`]

**Why it happens:** v1 约束一 session 一 space。

**How to avoid:** CONTEXT D-11：新空间用新 tab 新 session，不在同一 bridge 上链式 join。

**Warning signs:** 创建空间后 protocol.error `already_in_space`。

### Pitfall 2: 销毁/踢人未关 WS

**What goes wrong:** DB 已无 membership，但旧连接仍存活，客户端以为仍在空间。

**Why it happens:** 仅改表行不关闭 socket。

**How to avoid:** 成功更新 DB 后对 `SessionRegistry` 中所有受影响 session 执行 `close`（destroy 应对空间内全部 active session）。

### Pitfall 3: Idempotency 重放语义

**What goes wrong:** destroy/remove 第二次重放若处理不当会 `idempotency_replay_mismatch` 或错误关闭连接。

**Why it happens:** `tryRecordIdempotencyKey` 与 join/leave/orchestrator 同一套逻辑。[VERIFIED: `handleSpaceJoin` / `collaboration-handlers.ts`]

**How to avoid:** 为 `space.destroy` / `membership.remove` 定义清晰重放规则（例如 space 已删除则向发送者返回成功 noop 或明确错误）；与产品确认。[ASSUMED: 精确行为需 PLAN 阶段写死]

### Pitfall 4: 列表包含 archived 空间

**What goes wrong:** 操作者看到已归档空间，点击后 404 或 join 行为怪异。

**Why it happens:** `getSpaceBySlug` 不区分状态时仍返回行。

**How to avoid:** `listOversightSpaces` 仅 `status = 'active'`（或等价条件）。[VERIFIED: `spaces` 表有 `status` 列 — `migrations/002_relay_spaces_transcripts.sql`]

## Code Examples

### 现有 `space.join` 调度（relay）

```81:115:packages/relay/src/server.ts
  if (isSpaceJoinEnvelope(envelope)) {
    const idempotencyKey = envelope.idempotencyKey;
    if (!idempotencyKey) {
      sendJson(ctx.ws, { type: "protocol.error", error: "invalid_envelope" });
      return;
    }
    const slug = envelope.payload.slug;
    if (typeof slug !== "string") {
      sendJson(ctx.ws, { type: "protocol.error", error: "invalid_envelope" });
      return;
    }
    const out = handleSpaceJoin(ctx.db, {
      sessionId: ctx.boundSessionId,
      idempotencyKey,
      slugRaw: slug,
      nowMs: Date.now(),
    });
    if (out.kind === "error") {
      sendJson(ctx.ws, { type: "protocol.error", error: out.error });
      if (out.closeConnection) {
        ctx.ws.close();
      }
      return;
    }
    sendJson(ctx.ws, {
      type: "space.joined",
      spaceId: out.spaceId,
      slug: out.slug,
    });
    void sendTranscriptCatchUp({
      db: ctx.db,
      ws: ctx.ws,
      spaceId: out.spaceId,
    });
    return;
  }
```

### 现有 `deleteSpaceById`（CASCADE）

```185:188:packages/persistence/src/repositories/spaces.ts
/** Removes space row; FK CASCADE deletes memberships and transcript rows. */
export function deleteSpaceById(db: Database.Database, spaceId: string): void {
  db.prepare(`DELETE FROM spaces WHERE id = ?`).run(spaceId);
}
```

### 仪表盘 join 与 oversight 拉取（当前硬编码 slug）

```177:208:packages/dashboard/src/demo/main.ts
  try {
    await bridge.connect({ autoReconnect: true });
    let selfSessionId: string;
    const resumed = await bridge.resumeFromStorage();
    if (!resumed) {
      const reg = await bridge.registerNewSession({
        displayName: "Human",
        runtime: "browser",
        workspaceLabel: "dashboard",
      });
      selfSessionId = reg.sessionId;
    } else {
      selfSessionId = resumed.sessionId;
    }
    const joined = await bridge.joinSpace({
      slug: DEMO_SPACE_SLUG,
      idempotencyKey: crypto.randomUUID(),
    });
    store.setActiveSpaceId(joined.spaceId);

    const pullSpaceSummary = async (): Promise<void> => {
      const res = await fetch(
        `${httpOrigin}/__agent-talkie/v1/oversight/space-summary?slug=${encodeURIComponent(DEMO_SPACE_SLUG)}`,
      );
      if (res.status === 200) {
        const summary = (await res.json()) as OversightSpaceSummary;
        store.hydrateFromSpaceSummary(summary, selfSessionId);
      }
    };

    await pullSpaceSummary();
    store.scheduleSnapshotRefresh(pullSpaceSummary, 10000);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CLI / adapter 隐式创建空间 | `space.join` + slug 显式 create-if-not-exists | v1 relay | 仪表盘创建无需新协议 |
| 仅 space-summary 单空间 | + `oversight/spaces` 列表 | Phase 11（计划） | 支持 picker |

**Deprecated/outdated:** 无 — 本阶段扩展而非替换。

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `space.destroy` / `membership.remove` 的成功路径以 `protocol.error` 以外的 JSON 回包（或仅关闭连接）即可；未在 CONTEXT 锁定具体 wire 类型 | Code Examples / Pitfalls | 仪表盘需额外监听类型时需返工 |
| A2 | `membership.remove` 不允许移除 owner 自身；若允许需新错误码 | Architecture | 误踢 owner 导致空间无主 |
| A3 | 列表 API 仅返回 `active` 空间 | Pitfall 4 | UI 展示幽灵空间 |

## Open Questions

1. **`space.destroy` 成功后是否发送类似 `space.destroyed` 的 wire 消息以便当前 tab 清空 UI？**
   - What we know: `space.join` 有 `space.joined`。[VERIFIED: `server.ts`]
   - What's unclear: 销毁后 sender 连接是否关闭、是否需客户端 redirect。
   - Recommendation: PLAN 中二选一写死（例如发送 `space.destroyed` + 关闭所有成员连接，或仅 `protocol.error`/`ok` JSON）。

2. **`GET /oversight/spaces` 排序与分页？**
   - What we know: 「轻量查询」、字段已列。[CITED: `11-CONTEXT.md` D-09]
   - What's unclear: 空间数量极大时的上限（localhost 通常小）。
   - Recommendation: v2.0 可按 `slug` 排序、无分页；文档注明。

3. **MGMT-02 验收文案是否显式写「Invite：N/A（运行时自行 join）」？**
   - What we know: REQUIREMENTS 仍写 invite/remove。[VERIFIED: `REQUIREMENTS.md`]
   - What's unclear: UAT 是否必须演示 invite。
   - Recommendation: PLAN/VERIFY 与 REQUIREMENTS 追溯表同步一句，避免审查缺口。

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | relay + vitest | ✓ | v22.14.0（本机探测） | — |
| npm | 脚本 | ✓ | 10.9.2 | — |
| 本地 relay + SQLite | E2E / 手动验证 | — | — | 开发时 `talkie relay` / 测试套件自启 [ASSUMED: 与 Phase 10 相同] |

**Missing dependencies with no fallback:** 无（本阶段不新增系统级工具）。

**Missing dependencies with fallback:** 无。

## Security Domain

> v2.0 localhost-only；无 RSEC-01/02。以下为满足 ASVS 思路的轻量映射。

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no（无独立登录） | loopback + 会话注册 |
| V3 Session Management | partial | reconnect secret + `SessionRegistry` 单连接绑定 [VERIFIED: `session-registry.ts`] |
| V4 Access Control | yes（产品级） | space owner / human-only 控制消息 [VERIFIED: `collaboration-handlers.ts` 模式] |
| V5 Input Validation | yes | Zod envelope + payload schema；slug `normalizeSpaceSlug` |
| V6 Cryptography | no | — |

### Known Threat Patterns（本栈）

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 非 owner 销毁/踢人 | Elevation of privilege | relay 侧 `getSpaceOwnerSessionId` + human check |
| 超大 WS 帧 | DoS | `MAX_INBOUND_WS_BYTES` 已存在 [VERIFIED: `server.ts`] |
| slug 注入/畸形 | Tampering | 服务端规范化与 400/`invalid_slug` |

## Sources

### Primary（HIGH confidence）
- [VERIFIED: codebase] `packages/relay/src/space-lifecycle.ts`, `server.ts`, `session-registry.ts`, `collaboration-handlers.ts`
- [VERIFIED: codebase] `packages/persistence/src/repositories/spaces.ts`, `space-owner.ts`, `oversight.ts`, `migrations/002_relay_spaces_transcripts.sql`
- [VERIFIED: codebase] `packages/dashboard/src/bridge/browser-session-bridge.ts`, `demo/main.ts`, `store/dashboard-store.ts`, `errors/relay-error-copy.ts`
- [VERIFIED: codebase] `packages/protocol/src/envelope.ts`
- [CITED: `.planning/phases/11-space-membership-management/11-CONTEXT.md`] 锁定决策与 canonical refs

### Secondary
- [CITED: `.planning/REQUIREMENTS.md`] MGMT-* 条目与 Phase 11 映射

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — monorepo 现状已验证
- Architecture: **HIGH** — 路径与 Phase 9–10 一致
- Pitfalls: **MEDIUM** — idempotency/owner-null 细节待 PLAN 锁死

**Research date:** 2026-04-21  
**Valid until:** ~30 days（协议未变前提下）
