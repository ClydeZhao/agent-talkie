# agent-talkie

## What This Is

A local-first collaboration layer that connects independently running coding-agent sessions across different runtimes (Cursor, Claude Code, Codex, etc.) into a shared space where they can talk, coordinate, and unblock each other — without forcing the human to be the transport layer.

## Core Value

Sessions from different runtimes can collaborate directly through a shared space. The human supervises and guides but never acts as copy-paste middleware between tools.

## Requirements

### Validated

- [x] Versioned message envelope with Zod validation and JSON Schema export — Validated in Phase 1
- [x] Idempotency where the protocol requires it — Validated in Phase 1
- [x] Named sessions with stable identity join a shared collaboration space — Identity model validated in Phase 1 (joining space deferred to Phase 2)

### Active

- [ ] Direct session-to-session messaging across runtimes via relay
- [ ] Orchestrator role that coordinates work, follows up, and escalates to humans
- [ ] Multi-turn conversations, not just one-shot dispatch
- [ ] Collaboration metadata (role, focus, progress) owned by the collaboration layer
- [ ] Human-visible surface for oversight and intervention
- [ ] Explicit opt-in participation (join/invite, not ambient discovery)
- [ ] Local context stays local unless deliberately shared
- [ ] Peer-first question resolution before human escalation
- [ ] Multiple humans can participate, each bringing their own local agent sessions
- [ ] WebSocket-based relay as canonical core transport
- [ ] SQLite-backed collaboration metadata and state
- [ ] Automatic local relay daemon lifecycle
- [ ] Adapter ingress patterns for connecting native runtimes

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

## Context

The problem is not agent quality. Each runtime (Cursor, Claude Code, Codex) is strong inside its own product but isolated outside of it. The human becomes the bridge — copying requests, pasting answers, relaying follow-ups, repeating context, tracking who is blocked. This is wasted work.

agent-talkie takes a different approach: connect running sessions into a shared collaboration layer. Sessions keep their native runtime and local context but can talk directly. One session can coordinate. The human observes and intervenes without becoming the transport layer.

This is not another same-runtime subagent system. It is an interoperability layer across independently running native sessions. The pattern works for one person using several tools and extends naturally to a team.

The default architecture is relay-based, local-first, zero-external-services. The canonical core transport is WebSocket. Local default is relay on localhost. Remote extension uses the same protocol with relay deployed elsewhere. Adapter-specific ingress (stdio bridge, etc.) is an adapter-edge concern.

**Simplification note:** A session can only join one space at a time. Multi-space support is deferred.

**Product idea for later:** Web UI with session finder — locate a session and its hosting terminal highlights or rings, similar to Apple Watch finding iPhone.

## Constraints

- **Infrastructure**: Zero external services for default path — no NATS, no Postgres, no Kafka, no Firebase
- **Storage**: SQLite as default metadata store; JSON/Markdown/JSONL only for export/debug, not as sole durable source of truth
- **Transport**: WebSocket-based relay as canonical core transport; local and remote use one protocol
- **Architecture**: Relay-based with automatic local daemon; relay lifecycle must not depend on one participant staying alive; first session must not become permanent special host
- **Participation**: Explicit opt-in only; network presence alone must not grant membership
- **Packaging**: Installable via `npm install` or runnable via `npx`, usable without infrastructure setup

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| WebSocket relay as canonical transport | Unifies local and remote under one protocol; avoids divergent transport semantics | — Pending |
| SQLite for collaboration metadata | Zero-external-services constraint; sufficient for local-first with natural extension | Foundation validated in Phase 1 (DDL + session/idempotency repos) |
| Zero external services as default | Product must feel lightweight and immediate; no infrastructure prerequisites | — Pending |
| One session per space (v1) | Simplify initial implementation; multi-space deferred | — Pending |
| Relay daemon lifecycle independent of participants | First session must not be permanent host; relay must survive participant churn | — Pending |
| Adapter ingress separate from core transport | Runtime-specific adapters (stdio bridge) are edge concerns, not core architecture | — Pending |
| Versioned envelope with Zod + JSON Schema | Type safety for TypeScript consumers; JSON Schema export for non-TS consumers; schema evolution built in | Validated in Phase 1 |

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
*Last updated: 2026-04-10 after Phase 1 completion*
