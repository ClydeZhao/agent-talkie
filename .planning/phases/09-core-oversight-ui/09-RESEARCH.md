# Phase 9: Core oversight UI - Research

**Researched:** 2026-04-17  
**Domain:** Lit 仪表盘、实时 WebSocket 数据面、虚拟列表、协议错误呈现  
**Confidence:** HIGH（栈与仓库代码路径）/ MEDIUM（初始 roster 完整数据源需规划拍板）

## Summary

Phase 9 在 Phase 7/8 已交付的 `BrowserSessionBridge` 之上，把 **名册（roster）**、**虚拟化 transcript 时间线**、**协作元数据 chips** 与 **relay 协议错误的人话映射** 做成可运维的控制台 UI。技术栈与 `STACK.md` 一致：Lit 3 + Vite 8，长列表用 `@lit-labs/virtualizer`；与 CONTEXT 一致：两栏布局、暗色 token、`talkie-*` 自定义元素、集中式 store（bridge → store → 组件）。

**关键代码事实 [VERIFIED: 仓库]：** `space.join` / `space.leave` 在 `router.ts` 的 `SKIP_TRANSCRIPT_TYPES` 中，**不会写入 transcript**（`packages/relay/src/router.ts`），因此 **catch-up 的 `transcript.catchup` 载荷里通常不会出现 `space.join` 信封**，也**不会出现** `session.register` 这类非 envelope 的 wire 消息。若仅依赖 catch-up 解析「谁在当前 space」，**无法**可靠恢复其他成员的 `displayName` / `runtime` / `workspaceLabel`（这些在 persistence 的 `sessions` 表与 `getOversightSpaceSummaryBySlug` 模型中 [VERIFIED: `packages/persistence/src/repositories/oversight.ts`]）。Roadmap 09-01 已写「WS/HTTP snapshot」——规划阶段需明确：**新增 relay 只读 HTTP JSON（推荐，与 CLI oversight 同源）**，或在协议中增加成员快照 wire 消息；否则与 OVER-01 存在缺口。

**另一关键缺口 [VERIFIED: `browser-session-bridge.ts`]：** `dispatchPostHandshake` 在既非 pending 握手流程、也非 `transcript.catchup`、且 `safeParseEnvelope` 失败时，**静默丢弃** 消息。多数 `protocol.error` 帧不是合法 `Envelope`，因此 **当前 bridge 不会在稳定连接后把路由/协作错误推给 UI**。CONTEXT D-21 要求拦截 `protocol.error` 并送入 error bar——**实现上必须先扩展 bridge**（解析 `protocol.error` + 可选 `issues`），再接到 store。

**Primary recommendation：** 规划时把 **(1) bridge 的 `protocol.error` 回调** 与 **(2) 初始 roster 的 HTTP（或协议）快照** 列为硬依赖；UI 组件与 virtualizer 在依赖就绪后按 CONTEXT 的 D-01–D-23 拆分四个 plan 即可。

<user_constraints>
## User Constraints（来自 09-CONTEXT.md）

### 锁定决策（Implementation Decisions）

- **布局 D-01–D-03：** 两栏（左 roster ~280px + 主区 transcript）；顶栏全宽含 connection shell 与 space 标识；暗色主题 + `:root` CSS 变量 + 全局 `theme.css`；错误条在顶栏下、仅在有错误时显示。
- **名册 OVER-01 D-04–D-07：** 左栏紧凑卡片列表；`displayName`、runtime badge、workspace、行内 chips；人类/机器人图标区分，`isHuman`；orchestrator 图标叠加；**从 `onEnvelope` 响应 `space.joined`/`space.left`/`metadata.patch`**；**初始状态由 catch-up transcript 填充**（见下文研究：与当前 relay transcript 语义需对齐）；`<talkie-roster>` / `<talkie-roster-entry>`，roster 不用 Shoelace。
- **时间线 OVER-02 D-08–D-13：** 终端日志式单行 `[HH:MM:SS] sender (kind): preview`；`@lit-labs/virtualizer`；底部跟随滚动 + 「↓ N 新消息」；catch-up 与 live 同一渲染管道、无视觉区分；按 `kind` 上色；`metadata.patch` 等 `type` 作次要 badge；`<talkie-transcript>` / `<talkie-transcript-entry>`。
- **元数据 OVER-04 D-14–D-17：** roster 行内 chips：role、截断 focus、progress 点+标签（idle/working/blocked/done，对齐 Phase 7 健康点样式）；blocked 高亮 + tooltip/短文案 inline；blocked 排序置顶；`metadata.patch` 驱动；**200ms debounce** 合并 UI 更新。
- **错误 OVER-07 D-18–D-21：** 静态表映射全部已知 `error` 码；瞬时 vs 粘性分类、8s 自动消失、最多 3 条展示；`<talkie-error-bar>`；**`protocol.error` 在入 envelope 分发前拦截**（需 bridge 改造）。

- **架构 D-22–D-23：** Bridge → 集中 store → 组件；store 含 roster Map、transcript 有序列表、errors、space 元数据；**从 catch-up 重建 roster**（与 relay 行为对齐责任在规划/实现）。

### Agent's Discretion（Claude 自由裁量）

- 具体 CSS token 数值（对齐 OpenClaw 暗色惯例即可）
- Virtualizer overscan、项高度策略
- Store 实现形态（reactive controller vs 独立 class + 事件）
- 图标集（inline SVG / Shoelace / Lucide）
- Error bar 是否用 Shoelace 做 dismiss
- Transcript payload 截断长度
- 响应式断点（本地控制台以桌面为主）

### Deferred Ideas（范围外）

- 无 — 讨论未超出本 phase。
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | 描述 | 研究支撑 |
|----|------|----------|
| OVER-01 | 实时 session 名册 + runtime/workspace/role 元数据 | `metadataPatchPayloadSchema`（`packages/protocol/src/collaboration-wire.ts`）；`OversightMember` 字段对齐（`oversight.ts`）；**初始完整名册需 HTTP/协议快照或 relay 行为变更**（见 Summary / Open Questions） |
| OVER-02 | 实时滚动 transcript + 首次连接 catch-up | `BrowserSessionBridge.onTranscriptCatchup` / `onEnvelope`（`browser-session-bridge.ts`）；`transcriptCatchupMessageSchema`（`wire-schemas.ts`）；`sendTranscriptCatchUp` 默认 100 条（`catch-up.ts`）；virtualizer（`STACK.md`） |
| OVER-04 | 一眼看到 role、focus、progress、blocked | `metadataPatchPayloadSchema` + `progressSchema`；与 connection-shell 健康点模式对齐（`connection-shell.ts`） |
| OVER-07 | 结构化 relay 错误可读文案 | `router.ts` / `collaboration-handlers.ts` / `server.ts` / `space-lifecycle.ts` 汇总的 `protocol.error` 码；**bridge 必须先暴露 error 帧** |
</phase_requirements>

## Project Constraints（来自 .cursor/rules/ 与 PROJECT）

- **零默认外部服务**；核心传输为 **WebSocket + 规范 envelope**；仪表盘仍为 **Lit**，不用 React/Vue [CITED: `.cursor/rules/gsd-context.md` + `PROJECT.md`]
- 工作流：重大改动宜经 GSD 命令，与用户「仅写 research」任务不冲突 [CITED: `gsd-context.md`]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `lit` | **3.3.2**（`packages/dashboard/package.json`；registry 同） | Web Components + 响应式属性 | 与 Phase 7/8 已实现 shell/bridge 一致 [VERIFIED: package.json + npm] |
| `@lit-labs/virtualizer` | **2.1.1**（registry） | 大历史 transcript 虚拟列表 | CONTEXT D-09；`STACK.md` §7 [VERIFIED: npm registry] |
| `zod` | ^4.3.6 | wire / payload 解析 | 与 protocol、dashboard 现有 `wire-schemas` 一致 [VERIFIED: package.json] |
| `@agent-talkie/protocol` | workspace | `Envelope`、`safeParseEnvelope`、`metadataPatchPayloadSchema` | 单一真相 [VERIFIED: 依赖] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@shoelace-style/shoelace` | 未列入 dashboard 依赖 | 表单/对话框（Phase 10+） | Phase 9 roster **明确不用**；error dismiss 可选 [CITED: STACK.md + CONTEXT D-07] |
| Browser `WebSocket` | — | 传输 | 无第二协议层 [CITED: STACK.md] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@lit-labs/virtualizer` | 自写 windowing | 易错、可及性与滚动条行为成本高 — **不要手搓** |
| catch-up-only roster | HTTP snapshot | 当前 transcript **不含** join 控制消息时，catch-up-only **不足以** OVER-01 |

**Installation（Phase 9 需新增）：**

```bash
npm install @lit-labs/virtualizer@^2.1.1 -w @agent-talkie/dashboard
```

**Version verification:** `npm view @lit-labs/virtualizer version` → 2.1.1；`npm view lit version` → 3.3.2（2026-04-17）[VERIFIED: npm registry]

## Architecture Patterns

### 推荐目录（在现有 `packages/dashboard/src` 上扩展）

```
packages/dashboard/src/
├── bridge/           # 已有 BrowserSessionBridge
├── shell/            # 已有 connection-shell
├── demo/main.ts      # 装配入口
├── store/            # 新建：集中状态 + debounce
├── roster/           # 新建：talkie-roster*
├── transcript/       # 新建：talkie-transcript* + virtualizer
└── errors/           # 新建：talkie-error-bar + 错误码表
```

### Pattern 1：Bridge → Store → Lit

**What：** bridge 仅负责 IO；store 聚合 roster/transcript/errors；组件 `requestUpdate` 或订阅 store。  
**When：** 任何多组件共享的实时数据。  
**Example（概念，对齐现有回调风格）：**

```typescript
// 伪代码 — 模式对齐 Phase 7 main.ts 的 health 绑定
bridge.onEnvelope((env) => store.applyEnvelope(env));
bridge.onTranscriptCatchup((row) => store.applyCatchupRow(row));
// 规划需新增：bridge.onProtocolError?.((frame) => store.pushError(frame));
```

### Pattern 2：Virtualized transcript

**What：** 使用 `<lit-virtualizer>`（或文档推荐包装）绑定 **固定或估算行高** 的数据源，live tail 时更新数组引用或 patch 以触发重渲染。  
**When：** catch-up 默认 100 条起步，长期运行后列表增长 [CITED: `CATCH_UP_DEFAULT_LIMIT` in `catch-up.ts`]。  
**Example：** 以官方 `@lit-labs/virtualizer` 文档为准配置 `items` / `renderItem`（实现前用 Context7 或官网核对 Lit 3 API）[ASSUMED: 具体属性名以当前 major 文档为准]。

### Pattern 3：安全展示 envelope payload

**What：** 使用 Lit `html` 的文本插值展示 `displayName`、payload 预览，避免 `unsafeHTML`。  
**When：** 任意会话内容视为不可信字符串。  
**Why：** 降低 XSS 面（localhost 仍可能被粘贴恶意 payload）[CITED: Lit 默认转义文本绑定 — 见 Lit 文档 “text expressions”]。

### Anti-Patterns

- **假设 catch-up 里一定有 `space.join` 信封：** 与 `SKIP_TRANSCRIPT_TYPES` 矛盾 [VERIFIED: `router.ts`]。
- **不处理 post-handshake `protocol.error`：** 错误永远进不了 UI [VERIFIED: `browser-session-bridge.ts` `dispatchPostHandshake`]。
- **把 Shoelace 拉进 roster：** 与 CONTEXT D-07 冲突。

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 万行 DOM 列表 | 全量渲染 `<div>` | `@lit-labs/virtualizer` | 滚动性能与内存 |
| 错误码散落 if/else | 各处字符串拼接 | 单文件 `ERROR_COPY: Record<string, {title, hint, sticky}>` | 可测试、可枚举审计 |
| 元数据合并 | 每个组件各自 debounce | store 内统一 200ms coalesce | 避免 UI 抖动与重复排序 |

**Key insight：** 数据语义以 **relay + persistence** 为准；UI 只是投影层，**缺口在 bridge 与快照 API 时用协议/HTTP 补，不要靠臆造 envelope**。

## Runtime State Inventory

**本 phase 非 rename/refactor/migration — 本节不适用。** 无「改名后残留运行时状态」类任务。

## Common Pitfalls

### Pitfall 1：名册初始不完整

**What goes wrong：** 只看到近期发过消息的 session，或缺少 runtime/workspace。  
**Why：** transcript 不包含 `space.join`/`space.leave`；成员画像在 DB。  
**How to avoid：** 规划 **GET JSON 快照**（例如按 slug 返回 `OversightSpaceSummary` 形状）或由 relay 在 `space.joined` 后推送成员列表事件（需协议变更）。  
**Warning signs：** catch-up 后 roster 空或缺列。

### Pitfall 2：`protocol.error` 静默丢失

**What goes wrong：** `no_orchestrator` 等永远不显示。  
**Why：** 错误帧不是 `Envelope`，`safeParseEnvelope` 失败即 return。  
**How to avoid：** 在 `dispatchPostHandshake` 中 **在** `safeParseEnvelope` **之前** `protocolErrorSchema.safeParse(parsed)` 并回调。  
**Warning signs：** 网络面板能看到 error 帧，UI 无反应。

### Pitfall 3：Virtualizer + 自动滚底冲突

**What goes wrong：** 用户上翻阅读时被强制拉回底部。  
**Why：** 每条 live 消息都 `scrollIntoView`。  
**How to avoid：** CONTEXT D-10：仅在「已在底部」时自动跟随；否则显示 N 新消息按钮。  
**Warning signs：** 上翻时视图跳动。

### Pitfall 4：`relaySeq` / 重复 catch-up

**What goes wrong：** 重复行或乱序。  
**Why：** 重连会再次 catch-up。  
**How to avoid：** 复用 Phase 7 的 `maxRelaySeq` 与去重逻辑（`browser-session-bridge.ts` 已对 catch-up 做 `seq > prev`）[VERIFIED: 代码]。

## Code Examples

### 从协作 wire 解析 metadata patch（类型来源）

```typescript
// Source: packages/protocol/src/collaboration-wire.ts
import { metadataPatchPayloadSchema } from "@agent-talkie/protocol";

const parsed = metadataPatchPayloadSchema.safeParse(envelope.payload);
// namespace === "profile" → role, focus; "status" → progress, blockedReason
```

### Catch-up 行形状（UI 与 envelope 管道共享）

```typescript
// Source: packages/dashboard/src/bridge/browser-session-bridge.ts
export type TranscriptCatchupRow = {
  spaceId: string;
  relaySeq: number;
  envelope: unknown;
};
```

## State of the Art

| Old Approach | Current Approach | When | Impact |
|--------------|------------------|------|--------|
| CLI-only oversight | WebSocket + 可选 HTTP 快照 | v2.0 | 主控制台迁移 |
| 全量列表 | Lit Labs virtualizer | Phase 9 | 可扩展 transcript |

**Deprecated/outdated：** 无（本 phase 为增量能力）。

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@lit-labs/virtualizer` 在 Lit 3 下以 `<lit-virtualizer>` + `renderItem` 为主流集成方式 | Code Examples / Patterns | API 差异导致小量查文档成本 |
| A2 | OpenClaw PR #23345 的 token 命名可直接借鉴 | Standard Stack | 仅影响视觉，不影响功能 |

## Open Questions

1. **初始名册数据源选 HTTP 还是新 wire？**  
   - 已知：`getOversightSpaceSummaryBySlug` 已具备服务端模型 [VERIFIED: oversight.ts]。  
   - 未知：relay 是否已有/愿意新增只读路由。  
   - 建议：优先 **只读 HTTP**（与 CLI 同源、易缓存）；若坚持纯 WS，则定义 `oversight.snapshot` 类消息并版本化。

2. **其他客户端能否收到「某人加入 space」的 wire 通知？**  
   - 当前 [VERIFIED: `server.ts` `dispatchValidatedEnvelope`]：`space.joined` / `space.left` **仅 `sendJson(ctx.ws, …)` 到发起方连接**，**不向空间内其他 socket 广播**。  
   - 影响：已打开的 dashboard **不会**仅靠 WS 自动得知新成员加入，除非后续有 **fan-out 的 envelope**（例如某会话发消息经 `routeEnvelope` 广播）触发「见到新 sessionId」。  
   - 建议：**初始 + 周期性 HTTP 快照**、或 **Phase 9/relay 小改动：成员变更广播**（需协议评审）二选一写入 PLAN。

3. **Orchestrator 标记的数据来源？**  
   - 已知：`OversightSpaceSummary.orchestratorSessionId` [VERIFIED: oversight.ts]。  
   - 建议：与名册快照一并下发，或在 store 中监听 `orchestrator.designate` / `orchestrator.clear` 控制消息（若进 transcript）。

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node + npm | 构建 dashboard | ✓ | 以本机为准 | — |
| 本地 relay | WS + 可选 HTTP | ✓（开发假设） | `LISTEN_HOST` 127.0.0.1 | 无 relay 则仅静态 UI |
| 现代浏览器 | WebSocket、CSS | ✓ | — | — |

**Missing dependencies with no fallback：** 无（功能降级为「无数据」而非构建失败）。

## Validation Architecture

`.planning/config.json` 中 `workflow.nyquist_validation` 为 **false** — **本 phase 不强制 Nyquist 测试架构表**。仍建议在 `packages/dashboard` 用 Vitest 为 **error 映射表**、**store 归约**、**debounce** 补纯逻辑单测（可选，非门禁）。

## Security Domain

| ASVS 类别 | 适用 | 标准控制 |
|-----------|------|----------|
| V5 输入校验 / 输出编码 | 是 | 展示 transcript 与 metadata 时用 **文本绑定**，不信任 HTML；JSON 预览用 `JSON.stringify` + 文本或受控长度截断 |
| V4 访问控制 | 低（localhost v2.0） | 不引入全局 `innerHTML` 执行用户内容 |
| V8 数据保护 | 低 | 敏感 token 已在 Phase 7 sessionStorage 模式；错误条勿记录完整 secret |

| 威胁 | STRIDE | 缓解 |
|------|--------|------|
| 恶意会话名 / payload 中的 HTML | 欺骗 | Lit 默认转义；避免 `unsafeHTML` |
| 错误条点击劫持（若加外链） | 欺骗 | Phase 9 仅文案 + 本地 refresh |

## Sources

### Primary（HIGH）

- `packages/dashboard/src/bridge/browser-session-bridge.ts` — catch-up、envelope 分发、缺口分析  
- `packages/relay/src/router.ts` — `SKIP_TRANSCRIPT_TYPES`、`protocol.error`  
- `packages/relay/src/server.ts` — `space.joined`、会话绑定、`protocol.error`  
- `packages/relay/src/catch-up.ts` — catch-up 条数与形状  
- `packages/persistence/src/repositories/oversight.ts` — `OversightMember` / summary  
- `packages/protocol/src/collaboration-wire.ts` — metadata / progress  
- `.planning/research/STACK.md` — virtualizer、Lit、主题策略  
- npm registry — `lit`、`@lit-labs/virtualizer` 版本  

### Secondary（MEDIUM）

- `.planning/phases/09-core-oversight-ui/09-CONTEXT.md` — 产品/UX 锁定决策  
- Lit 官方文档 — XSS / 文本插值行为（实现前核对当前版本页）  

## Metadata

**Confidence breakdown：**

- Standard stack：**HIGH** — 与 lockfile/仓库一致  
- Architecture：**HIGH** — 代码路径已核对；**初始 roster 与成员广播** 为 **MEDIUM** 待规划  
- Pitfalls：**HIGH** — 由代码直接推出  

**Research date：** 2026-04-17  
**Valid until：** ~30 天（仅当 relay/dashboard 协议无大变）
