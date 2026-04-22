# agent-talkie

## What This Is

A local-first collaboration layer that connects independently running coding-agent sessions across different runtimes (Cursor, Claude Code, Codex, etc.) into a shared space where they can talk, coordinate, and unblock each other — without forcing the human to be the transport layer. Shipped as a monorepo of 10 npm packages with a CLI, two runtime adapters, a live oversight terminal, and a real-time web dashboard as the primary oversight and control surface.

## Core Value

Sessions from different runtimes can collaborate directly through a shared space. The human supervises and guides but never acts as copy-paste middleware between tools.

## Requirements

### Validated

- ✓ Versioned message envelope with Zod validation and JSON Schema export — v1.0
- ✓ Idempotency where the protocol requires it — v1.0
- ✓ Named sessions with stable identity join a shared collaboration space — v1.0
- ✓ Direct session-to-session messaging across runtimes via relay — v1.0
- ✓ Multi-turn conversations, not just one-shot dispatch — v1.0
- ✓ Explicit opt-in participation (join/invite, not ambient discovery) — v1.0
- ✓ WebSocket-based relay as canonical core transport — v1.0
- ✓ SQLite-backed collaboration metadata and state — v1.0
- ✓ Adapter ingress patterns for connecting native runtimes — v1.0
- ✓ Automatic local relay daemon lifecycle — v1.0
- ✓ Orchestrator routing (human→orchestrator default, direct targeting, task assignment) — v1.0
- ✓ Collaboration metadata (role, focus, progress, blocked) owned by the layer — v1.0
- ✓ Human-visible oversight surface (CLI status, transcript, watch) — v1.0
- ✓ Multiple humans can participate, each bringing their own local agent sessions — v1.0
- ✓ Dashboard connects to relay via WebSocket with live health indicator — v2.0
- ✓ Dashboard auto-reconnects with gap-fill via relaySeq cursor — v2.0
- ✓ Relay serves dashboard static assets on same origin in production — v2.0
- ✓ User can open dashboard via `talkie dashboard` CLI command — v2.0
- ✓ Live session roster with runtime, workspace, and role metadata — v2.0
- ✓ Real-time scrolling transcript timeline with catch-up on connect — v2.0
- ✓ Searchable/filterable collaboration transcript (client-side) — v2.0
- ✓ Collaboration metadata at a glance (role, focus, progress, blocked) in dashboard — v2.0
- ✓ Blocked/attention lane surfaces stalled sessions — v2.0
- ✓ Legible relay error display (no_orchestrator, not_in_space, etc.) — v2.0
- ✓ Send messages from dashboard (human→orchestrator default, direct targeting) — v2.0
- ✓ Designate/clear orchestrator from dashboard — v2.0
- ✓ Idempotent send with safe retries — v2.0
- ✓ Create/destroy collaboration spaces from dashboard — v2.0
- ✓ Remove sessions from space via dashboard — v2.0
- ✓ List and switch between spaces via space picker — v2.0
- ✓ Web dashboard as primary oversight surface (CLI becomes fallback) — v2.0
- ✓ Live WebSocket feed for real-time dashboard updates — v2.0

### Active

- [ ] Real-time session topology visualization (who's talking to whom) — deferred from v2.0
- [ ] Dashboard invite sessions into space (currently CLI `join` only)
- [ ] Server-side full-text transcript search (SQLite FTS5)
- [ ] Desktop notifications for attention-requiring events
- [ ] Dashboard keyboard shortcuts and CLI-parity layout presets

### Out of Scope

- NATS, Kafka, or any external message bus as default path — zero-external-services constraint
- Postgres or any external database — SQLite is the default store
- Hosted autonomous execution fleets — local-first product
- Full workspace sync or centralized long-term memory — local context stays local
- Git conflict resolution or worktree safety — not the product's problem
- Replacing native runtime approval, auth, or prompt UX — stay in native client
- General-purpose harness framework for agent behavior — keep boundary narrow
- Firebase or proprietary realtime databases — avoid vendor lock-in
- Explicit solo/local/team mode-switching UX — collaboration extends naturally via invite and join
- Token/TLS/tunnel authentication for non-loopback relay — deferred, v2.0 is localhost-only
- Invite-based space membership for cross-machine collaboration — deferred, requires remote relay
- Proactive orchestrator follow-ups and stalled-thread recovery — deferred to future milestone
- Multi-space per session — deferred to future milestone
- CRDT collaborative editing — not an editing tool; message-based collaboration
- In-dashboard execution/approval — stay in native client per design principles
- React/Vue/Svelte dashboard — OpenClaw-aligned: Lit Web Components
- Unbounded full-history search — client-side search over loaded window; server FTS deferred

## Context

Shipped v2.0 with ~16,900 LOC TypeScript across ~157 source files in 10 packages.

Tech stack: Node.js, TypeScript, Zod 4, better-sqlite3, ws (WebSocket), Vitest, Lit 3 + Vite 8 (dashboard).

Packages: `@agent-talkie/protocol`, `@agent-talkie/persistence`, `@agent-talkie/relay`, `@agent-talkie/supervisor`, `@agent-talkie/client`, `@agent-talkie/adapter-stdio`, `@agent-talkie/adapter-codex`, `@agent-talkie/adapter-cursor-mcp`, `@agent-talkie/cli`, `@agent-talkie/dashboard`.

Architecture: relay-based, local-first, zero-external-services. WebSocket relay on localhost as default. Adapters are edge concerns connecting native runtimes via the shared client. SQLite (WAL mode) stores spaces, sessions, memberships, transcript, and collaboration metadata. Dashboard is a Lit Web Components SPA served from the relay's same origin.

v1 simplification still in effect: one session per space. Multi-space deferred.

Known tech debt carried forward:
- Phase 5 human UAT for live adapter concurrency not operator-confirmed
- `talkie watch` still lacks an automated CLI integration test
- 5 of 6 v2.0 phases lack formal VERIFICATION.md (Phase 8 only)
- Roster membership is poll-bound at 10s intervals (not fully real-time for new members)
- Dashboard invite not implemented (remove only; sessions enter via CLI `join`)

## Constraints

- **Infrastructure**: Zero external services for default path — no NATS, no Postgres, no Kafka, no Firebase
- **Storage**: SQLite as default metadata store; JSON/Markdown/JSONL only for export/debug, not as sole durable source of truth
- **Transport**: WebSocket-based relay as canonical core transport; local and remote use one protocol
- **Architecture**: Relay-based with automatic local daemon; relay lifecycle must not depend on one participant staying alive; first session must not become permanent special host
- **Participation**: Explicit opt-in only; network presence alone must not grant membership
- **Packaging**: Installable via `npm install` or runnable via `npx`, usable without infrastructure setup
- **UI**: Lit Web Components aligned with OpenClaw reference; no React/Vue/Svelte

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| WebSocket relay as canonical transport | Unifies local and remote under one protocol; avoids divergent transport semantics | ✓ Good — validated in v1.0 |
| SQLite for collaboration metadata | Zero-external-services constraint; sufficient for local-first with natural extension | ✓ Good — WAL mode handles concurrent adapter access well |
| Zero external services as default | Product must feel lightweight and immediate; no infrastructure prerequisites | ✓ Good — npm install is all that's needed |
| One session per space (v1) | Simplify initial implementation; multi-space deferred | ✓ Good — keeps routing simple; revisit when needed |
| Relay daemon lifecycle independent of participants | First session must not be permanent host; relay must survive participant churn | ✓ Good — fork+disconnect pattern works reliably |
| Adapter ingress separate from core transport | Runtime-specific adapters (stdio bridge) are edge concerns, not core architecture | ✓ Good — Codex + Cursor MCP adapters prove the pattern |
| Versioned envelope with Zod + JSON Schema | Type safety for TypeScript consumers; JSON Schema export for non-TS consumers; schema evolution built in | ✓ Good — Zod 4 toJSONSchema works well |
| Content-Length framing for stdio adapters | Simple, HTTP-like framing for stdin/stdout bridge; bounded queues prevent memory growth | ✓ Good — adopted by both adapter-stdio and adapter-codex |
| Space owner model for multi-human | First human to join owns the space; orchestrator controls gated by ownership | ✓ Good — clear permission semantics without auth infra |
| SQLite-backed oversight reads | CLI reads directly from relay DB for who/transcript/status instead of WebSocket queries | ✓ Good — works offline; auto-migrate on fresh data dir |
| Lit Web Components for dashboard | Aligned with OpenClaw reference; vanilla web standards; no framework lock-in | ✓ Good — Lit 3 + Vite 8 fast builds, small bundles |
| Same-origin static hosting via relay | Dashboard served from relay's HTTP listener; no separate dev server in production | ✓ Good — sirv SPA fallback, single port, no CORS issues |
| BrowserSessionBridge as centralized session manager | Single bridge object owns WebSocket lifecycle, health state, reconnect, gap-fill | ✓ Good — clean separation from UI; testable with Vitest |
| DashboardStore as single reactive state tree | All UI components read from one store; bridge events → store → UI | ✓ Good — predictable data flow; easy to debug |
| New-tab model for space switching | Space picker opens new tab with `?space=` instead of in-tab rebind | ✓ Good — avoids complex teardown/rebuild; each tab is a session |
| MiniSearch for client-side transcript search | Client-side indexing over loaded transcript window; server FTS deferred | ✓ Good — fast, zero-infra, good enough for loaded history |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-22 after v2.0 milestone*
