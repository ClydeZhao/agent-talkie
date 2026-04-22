# Milestones

## v2.0 Web Dashboard (Shipped: 2026-04-22)

**Phases completed:** 6 phases, 18 plans, 43 tasks

**Key accomplishments:**

- 在 monorepo 中落地 `@agent-talkie/dashboard`，并以 Vitest 覆盖与 Node 客户端等价的 WebSocket 会话生命周期（握手、register/resume、join、catch-up 序号）。
- 在 `BrowserSessionBridge` 上暴露可订阅的四态连接健康与 stale UI 信号，并以 Lit 壳层 + relay generation HTTP 探测完成 CONN-01 的可视化与 D-05–D-08。
- 指数退避 + generation 门禁的无限自动重连、`transcript.catchup` 按 `relaySeq` 去重与 `onTranscriptCatchup` 回调，以及 `session.resume` 失败时清 sessionStorage 并回退 `registerNewSession`。
- Relay now serves the built dashboard from package `dist-app` under `/dashboard` using sirv with SPA fallback, while keeping health and WebSocket upgrade semantics and eliminating hung HTTP responses on unknown paths.
- Vite application build to `dist-app/` with `base: '/dashboard/'`, plus production same-origin `wsUrl` from `location` and monorepo build order dashboard-before-relay.
- `talkie dashboard` 在确保本地 relay 后向 stdout 输出 `http://127.0.0.1:<port>/dashboard`，默认用 `open` 打开系统浏览器；`--no-open` 仅打印 URL，并有 Vitest 集成测试覆盖。
- 只读 `space-summary` HTTP 与 persistence 名册字段扩展，加上 Lit 左栏名册、集中 store 与暗色主题骨架；join 后拉快照并每 10s 刷新。
- 虚拟化终端式 transcript：`@lit-labs/virtualizer`、catch-up 与 `onEnvelope` 共用 store 队列、贴底阈值 48px 与「↓ N 新消息」一键回底。
- 名册内联协作元数据：`metadata.patch` 经 Zod 归并入 store、200ms 防抖刷新 UI；progress 四态色点 + 标签、`blocked` 红框与 `title` 提示、blocked 条目置顶排序。
- `protocol.error` 在握手完成后经 `onProtocolError` 进入 `DashboardStore`，以中文 `RELAY_ERROR_COPY` 映射展示在 `talkie-error-bar`（最多 3 条、非粘性 8s 移除、粘性需关闭）。
- Human dashboard send path with relay echo: `sendEnvelope` on the bridge, Lit `talkie-send-bar` (orchestrator vs direct, D-05 gate), and `senderWs.send(wire)` for `isHuman` + `conversation` after successful routes.
- Dashboard consumes relay orchestrator fan-out wires, updates roster flags in real time, and lets space owners designate/clear via a roster menu using sendEnvelope with fresh idempotency keys.
- Relay gates `conversation` + `idempotencyKey` with SQLite `runConversationIdempotentTranscriptAppend` (fresh txn append, replay wire to sender only, mismatch error); dashboard tracks last conversation envelope for error-bar Retry with unchanged `id` and key.
- 中继实现 `space.destroy`：所有者 + 人类会话校验、幂等重放、成员 `markMembershipLeft` 后 `deleteSpaceById`，并在 `dispatchValidatedEnvelope` 中于协作控制与路由之前返回，向发送者发送 `space.destroyed` 后关闭空间内全部 WebSocket（含发送者）。
- 端到端成员剔除：`membership.remove` 中继校验（所有者、人类、幂等、`target_not_in_space`）、`membership.removed` 回包并关闭目标 WebSocket；仪表盘 bridge 发送、名册 Owner 菜单 Remove、`main.ts` 事件与 MGMT-02 invite N/A 注释。
- 交付 `GET /oversight/spaces`、Lit 头部空间选择器、URL `?space=`/`default` 首屏 join，以及 `sendSpaceDestroy` / `space.destroyed` 与 store 列表状态；重连改为按上次成功 join 的 slug 复连。
- 在 Dashboard 内接好 MiniSearch 与 AND 维筛选，主 transcript 虚拟列表与贴底/新消息差分一律基于 `getVisibleTranscriptLines()`，并公开 `scrollToDedupeKey` 供 12-02 结果跳转复用。
- 右侧 `talkie-search-panel` 与主栏分栏同屏、筛选 chip 与自訂时间窗、结果点击 `scrollToDedupeKey`；名册顶区 `Needs Attention` 仅含 blocked 且主列表去重。

---

## v1.0 MVP (Shipped: 2026-04-15, Stabilized: 2026-04-17)

**Phases completed:** 6 phases, 20 plans, 51 tasks

**Key accomplishments:**

- Versioned flat message envelope (Zod 4) with UUID v7 `sessionId`, control/conversation `kind`, optional idempotency key and `seq`, and `to` / `spaceId` addressing — built as `@agent-talkie/protocol` with Vitest.
- Envelope JSON Schema generated from Zod via `z.toJSONSchema()` (draft-2020-12), plus pure handshake range overlap, agreed version, and structured `version_mismatch` failures including relay-supported ranges.
- `@agent-talkie/persistence` with better-sqlite3 `openDatabase` (WAL, foreign keys, 5s busy timeout), a transactional `migrate()` runner over numbered SQL files, and `001_initial.sql` defining sessions, spaces, memberships, and `idempotency_keys` for durable PROTO-03 dedup.
- SQLite session CRUD with UUID v7, D-05 numeric suffix disambiguation, validated workspace metadata caps, plus idempotency try-record and 5-minute-window prune — verified with in-memory tests and a temp-file reopen integration for SESS-04.
- SQLite migration 002 plus spaces/transcript repositories with per-space `relay_seq`, membership survive file reopen, and RELAY-08 WAL/busy_timeout trace line in-repo.
- Local `@agent-talkie/relay` WebSocket server with version handshake, explicit session bind via persistence `createSession` or resume with hashed secret, strict inbound size and Zod envelope validation, in-memory disconnect cleanup only, and a no-op `dispatchValidatedEnvelope` stub for plan 02-03.
- SQLite-backed join/leave with idempotency, membership-gated WebSocket routing, transcript append with row-cap prune, bounded catch-up on join/resume, and Vitest integration coverage for isolation, direct, multi-turn, and restart.
- Relay gains a forkable daemon, generation-token health checks, idle shutdown after the last WebSocket closes, and bounded signal shutdown — enabling supervisor lockfile liveness without orphaning SQLite.
- New `@agent-talkie/supervisor` package:
- `@agent-talkie/cli`
- SQLite migration 003 plus Zod collaboration payloads and persistence snapshot/upsert helpers, with `isHuman` on session registration, ready for relay enforcement in Plan 02.
- Relay enforces human→orchestrator default routing, Zod-backed collaboration controls with ACL and idempotency, metadata snapshot query, and Vitest coverage — without a separate transport (ADAPT-03).
- Shared WebSocket session client (`@agent-talkie/client`), reference stdio adapter with Content-Length framing and bounded outbound queue, plus adapter ingress documentation — no relay-core transport fork.
- SQLite `owner_session_id` on spaces, persistence helpers with Vitest coverage, join-time owner assignment, and `not_space_owner` enforcement on `orchestrator.designate` / `orchestrator.clear` with a dedicated relay regression test.
- Shipped `@agent-talkie/adapter-codex` with bidirectional Content-Length framing to the Codex child, `joinSpace` on the shared client, and stderr-driven `metadata.patch` blocked self-report with cooldown—verified by Vitest mocks (no Codex binary in CI).
- MCP stdio server (`talkie-cursor-mcp`) on SDK ^1.29.0 with four named tools and `talkie://space/{slug}/…` resources backed by new SQLite oversight helpers; relay integration test proves two runtimes in one space.
- SQLite-backed `talkie space status`, `transcript`, and `who` plus 120s possibly-blocked inference, with OVER-03 non-injection called out in help — prerequisite for live `talkie watch`.
- `talkie watch` delivers a split-pane terminal supervisor: eight-row participant grid with attention labels (blocked vs possibly-blocked) and a scrolling timeline tail parsed from SQLite, driven by a human TalkieSessionClient on the local relay.
- openRelayDatabase now creates data directory and runs migrations before queries, with regression test for fresh-dir scenario
- Removed unused @agent-talkie/protocol from CLI dependencies, tsup externals, and pretest script
- Post-ship baseline alignment added Phase 4 formal verification, surfaced `session.resume` in the shared client, and wired persisted adapter resume for Codex and Cursor MCP

---
