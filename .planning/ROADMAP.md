# Roadmap: agent-talkie

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-04-15)
- 🚧 **v2.0 Web Dashboard** — Phases 7–12 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-6) — SHIPPED 2026-04-15</summary>

- [x] Phase 1: Protocol & persistence foundation (4/4 plans) — completed 2026-04-11
- [x] Phase 2: Relay — WebSocket, validate, route (3/3 plans) — completed 2026-04-12
- [x] Phase 3: Supervisor & daemon lifecycle (3/3 plans) — completed 2026-04-12
- [x] Phase 4: Collaboration semantics, metadata & adapter edge (3/3 plans) — completed 2026-04-13
- [x] Phase 5: Cross-runtime proof & human oversight (5/5 plans) — completed 2026-04-14
- [x] Phase 6: Oversight CLI resilience & cleanup (2/2 plans) — completed 2026-04-15

</details>

### v2.0 Web Dashboard (Phases 7–12)

**Milestone goal:** Real-time, interactive web dashboard as the primary collaboration oversight and control surface on localhost relay (CLI becomes fallback).

- [x] **Phase 7: Browser connection & session bridge** — WebSocket session, health, reconnect, relaySeq gap-fill
- [x] **Phase 8: Dashboard distribution & CLI entry** — Same-origin static assets, `talkie dashboard`
- [x] **Phase 9: Core oversight UI** — Roster, transcript tail, metadata chips, relay errors (completed 2026-04-17)
- [x] **Phase 10: Interactive human controls** — Send, orchestrator designate/clear, idempotent retries
- [x] **Phase 11: Space & membership management** — Create/destroy spaces, invite/remove, space picker
- [ ] **Phase 12: Discovery, topology & attention** — Search/filter transcript, topology graph, attention lane

## Phase Details

### Phase 7: Browser connection & session bridge
**Goal:** The dashboard holds a canonical human WebSocket session to the relay with visible health and monotonic ordering across reconnects.
**Depends on:** Phase 6
**Requirements:** CONN-01, CONN-02
**Success Criteria** (what must be TRUE):
  1. User sees a clear connection health state (for example connected, reconnecting, or failed) while the dashboard is open.
  2. After a transient disconnect, the dashboard reconnects and applies gap-fill so newly loaded timeline content matches relay order without duplicate rows for the same logical events.
  3. User gets an explicit signal when session binding or relay generation is stale so they know to refresh or re-authenticate rather than watching a silently broken UI.
**Plans:** 3/3 plans executed
**UI hint**: yes

Plans:
- [x] 07-01-PLAN.md — `@agent-talkie/dashboard` 包与 `BrowserSessionBridge`：握手、register/resume、join、分发与 catch-up 序号跟踪（Vitest）
- [x] 07-02-PLAN.md — Lit `talkie-connection-shell`、健康四态、generation/health 探测与协议不匹配横幅；demo 联调
- [x] 07-03-PLAN.md — 自动重连退避、`relaySeq` catch-up 去重、resume 失败清凭证、generation stale 停止重连

### Phase 8: Dashboard distribution & CLI entry
**Goal:** Operators install once and open the dashboard from the CLI with production same-origin static hosting.
**Depends on:** Phase 7
**Requirements:** CONN-03, CONN-04
**Success Criteria** (what must be TRUE):
  1. User runs `talkie dashboard` and lands on a working dashboard URL for the local relay (browser opened or URL printed, documented behavior).
  2. In production-style runs, dashboard static assets are served from the same origin as the relay HTTP/WebSocket upgrade so the shell loads without a separate dev-server origin.
  3. Packaged paths (`npm install` / `npx`) resolve built assets so the initial layout and scripts load without 404s.
**Plans:** 3/3 plans executed
**UI hint**: yes

Plans:
- [x] 08-01-PLAN.md — Relay：`sirv` 托管 `@agent-talkie/dashboard` 的 `dist-app`，`/dashboard` + SPA fallback，统一 HTTP 处理链与 404（CONN-03）
- [x] 08-02-PLAN.md — Dashboard：`vite.app.config.ts`（`base: '/dashboard/'`、`outDir: dist-app`）、双构建脚本、`demo` 生产 WS 同源、根 `build` 顺序（CONN-03）
- [x] 08-03-PLAN.md — CLI：`talkie dashboard`、`open@^11.0.0`、`--no-open`、Vitest 集成（CONN-04）

### Phase 9: Core oversight UI
**Goal:** Primary oversight parity for roster, live transcript, collaboration metadata, and legible relay errors.
**Depends on:** Phase 8
**Requirements:** OVER-01, OVER-02, OVER-04, OVER-07
**Success Criteria** (what must be TRUE):
  1. User sees a live session roster with runtime, workspace, and role metadata for the active space.
  2. User sees an ordered transcript timeline that updates in real time and shows recent history on first connect (catch-up path).
  3. User sees collaboration metadata at a glance (role, focus, progress, blocked) without drilling into raw JSON.
  4. User sees human-readable messages for structured relay errors such as `no_orchestrator` and `not_in_space`.
**Plans:** 4/4 plans complete
**UI hint**: yes

Plans:
- [x] 09-01-PLAN.md — HTTP 名册快照（`GET /__agent-talkie/v1/oversight/space-summary`）+ `OversightMember` 含 runtime/workspace + `talkie-roster` 与两栏布局（OVER-01）
- [x] 09-02-PLAN.md — `@lit-labs/virtualizer` transcript + catch-up/live 统一管道 + 贴底与「新消息」提示（OVER-02）
- [x] 09-03-PLAN.md — `metadata.patch` 合并、200ms debounce、progress 点与 blocked 置顶/红框（OVER-04）
- [x] 09-04-PLAN.md — `protocol.error` bridge 回调 + `RELAY_ERROR_COPY` + `talkie-error-bar`（OVER-07）

### Phase 10: Interactive human controls
**Goal:** Human can steer traffic and orchestration from the dashboard with CLI-equivalent routing and safe retries.
**Depends on:** Phase 9
**Requirements:** CTRL-01, CTRL-02, CTRL-03
**Success Criteria** (what must be TRUE):
  1. User can send messages from the dashboard with human→orchestrator default and optional direct session targeting.
  2. Space owner can designate or clear the orchestrator; roster or header reflects the current orchestrator immediately after success.
  3. User can retry a failed send using the same idempotency key and observe a single logical outcome in the transcript (no duplicate deliveries).
**Plans:** 3/3 plans complete
**UI hint**: yes

Plans:
- [x] 10-01-PLAN.md — Bridge `sendEnvelope`、底栏 `talkie-send-bar`、send 目标 store、relay 人类 conversation sender echo（CTRL-01）
- [x] 10-02-PLAN.md — orchestrator wire 解析、名册菜单 designate/clear、实时刷新 orchestrator 位（CTRL-02）
- [x] 10-03-PLAN.md — `runConversationIdempotentTranscriptAppend` + routeEnvelope 集成、错误条「重试」、同一信封/key 重放（CTRL-03，relay Option A）

### Phase 11: Space & membership management
**Goal:** Operators manage spaces and memberships from the UI without CLI fallback for these flows.
**Depends on:** Phase 10
**Requirements:** MGMT-01, MGMT-02, MGMT-03
**Success Criteria** (what must be TRUE):
  1. User can create a new collaboration space and destroy a space per relay rules, with clear confirmation and outcomes.
  2. User can invite sessions into the current space and remove sessions with policy-consistent success or error feedback.
  3. User can list spaces and switch the dashboard context via a space picker (session rebind or navigation as designed) without restarting the relay.
**Plans:** 3/3 plans complete
**UI hint**: yes

Plans:
- [x] 11-01-PLAN.md — Relay `space.destroy`：`handleSpaceDestroy`、调度、`space.destroyed`、SessionRegistry 踢线、Vitest（MGMT-01 服务端）
- [x] 11-02-PLAN.md — Relay `membership.remove` + 仪表盘 `sendMembershipRemove`、名册 Owner-only Remove、MGMT-02 invite N/A 注释（MGMT-02）
- [x] 11-03-PLAN.md — `listOversightSpaces` + `GET /oversight/spaces`、`talkie-space-picker`、`?space=`/`default`、`sendSpaceDestroy` 与创建 join（MGMT-01 UI + MGMT-03）

### Phase 12: Discovery, topology & attention
**Goal:** Dense operator console: find messages quickly, visualize conversation mesh, surface stalled work.
**Depends on:** Phase 11
**Requirements:** OVER-03, OVER-05, OVER-06
**Success Criteria** (what must be TRUE):
  1. User can search and filter the transcript by sender, message kind, and time window within the loaded or batched history window.
  2. User sees a live topology graph that reflects message flow relationships (for example hub vs direct edges) as the session evolves.
  3. User sees a blocked or attention lane that highlights sessions needing human attention, consistent with collaboration metadata and relay signals.
**Plans**: TBD (target 3 plans: client index + filters; Cytoscape graph; attention lane)
**UI hint**: yes

Plans:
- [ ] 12-01: Transcript discovery — client index (e.g. MiniSearch), filters, virtualized results
- [ ] 12-02: Topology — graph model from envelopes + roles, Cytoscape layout updates from live events
- [ ] 12-03: Attention lane — stalled/blocked surfacing, alignment with metadata and possibly-blocked style semantics

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Protocol & persistence foundation | v1.0 | 4/4 | Complete | 2026-04-11 |
| 2. Relay — WebSocket, validate, route | v1.0 | 3/3 | Complete | 2026-04-12 |
| 3. Supervisor & daemon lifecycle | v1.0 | 3/3 | Complete | 2026-04-12 |
| 4. Collaboration semantics, metadata & adapter edge | v1.0 | 3/3 | Complete | 2026-04-13 |
| 5. Cross-runtime proof & human oversight | v1.0 | 5/5 | Complete | 2026-04-14 |
| 6. Oversight CLI resilience & cleanup | v1.0 | 2/2 | Complete | 2026-04-15 |
| 7. Browser connection & session bridge | v2.0 | 3/3 | Complete | - |
| 8. Dashboard distribution & CLI entry | v2.0 | 3/3 | Complete | 2026-04-17 |
| 9. Core oversight UI | v2.0 | 4/4 | Complete   | 2026-04-17 |
| 10. Interactive human controls | v2.0 | 3/3 | Complete | 2026-04-20 |
| 11. Space & membership management | v2.0 | 3/3 | Complete   | 2026-04-21 |
| 12. Discovery, topology & attention | v2.0 | 0/3 | Not started | - |

---
*Full v1.0 phase details archived to `.planning/milestones/v1.0-ROADMAP.md`*
