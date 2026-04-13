# Phase 5: Cross-runtime proof & human oversight - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove v1 with two structurally different runtime adapters (Codex CLI via stdio, Cursor via MCP tool server) collaborating concurrently through the relay. Ship a CLI-based human oversight surface (static snapshot commands + live watch mode) that shows participants, activity, blocked state, and collaboration timeline. Support multiple humans in one space with an owner model for management actions. Native interruptions surface as blocked-state metadata — the collaboration layer never replaces native approval UX.

</domain>

<decisions>
## Implementation Decisions

### Second Adapter: Runtime Targets
- **D-01:** The cross-runtime proof pair is **Codex CLI** (subprocess/stdio-based, reuses existing `@agent-talkie/adapter-stdio` pattern) and **Cursor MCP** (MCP tool server, structurally different adapter shape). Two distinct transport shapes prove cross-runtime collaboration more convincingly than two stdio-based adapters.
- **D-02:** Codex CLI adapter wraps a Codex subprocess and bridges its stdin/stdout to the relay via the existing Content-Length framing and `@agent-talkie/client`.
- **D-03:** Cursor MCP adapter is an MCP tool server that exposes talkie operations as MCP tools and resources, aligned with MCP's natural split:
  - **MCP tools** for mutations/actions: `join_space`, `send_message`, `assign_orchestrator`, `update_metadata`
  - **MCP resources** for read-only state: participant list, timeline, current metadata snapshot, blocked-session view

### Human Oversight Surface
- **D-04:** CLI is the primary human oversight surface in v1 — no web app, no separate UI process. Extends the existing `talkie` CLI.
- **D-05:** Two modes: **static snapshot commands** for quick checks and scripting (`talkie space status`, `talkie transcript`, `talkie who`) and a **live watch mode** for active supervision (`talkie watch`).
- **D-06:** Live watch uses a **split view**: top section shows a participant status table (who, role, focus, progress, blocked state), bottom section shows a scrolling message timeline. Both always visible during active supervision.

### Blocked-Session Surfacing
- **D-07:** **Self-report is the primary source** for blocked state — the adapter sets `progress=blocked` and `blockedReason` via metadata update when it detects a native interruption (permission prompt, auth, destructive confirmation, etc.).
- **D-08:** **Inactivity inference is a fallback** — the layer can infer potentially-blocked state from prolonged silence after task assignment, but this is clearly distinguishable from explicitly reported blocked state (e.g., `blocked` vs `possibly-blocked` in display). Silence alone is never treated as definitive proof of a native interruption.

### Timeline Observation
- **D-09:** Human joins the space as a full session participant with `is_human=true`. Human messages follow normal protocol and routing rules (default to orchestrator unless explicitly addressed).
- **D-10:** Observing the timeline (via `talkie watch` or `talkie transcript`) does NOT auto-inject all messages into agent session context. The human reads the timeline as a separate surface. Human participates by actively sending messages, not by passively absorbing all traffic.

### Multi-Human Participation
- **D-11:** **Owner model**: one human is the space owner for management actions (orchestrator designation, session management). Other humans join as participants who can observe, watch the timeline, and send messages — but cannot perform management actions.
- **D-12:** Normal participation (observe, send messages, read timeline) is broad — any joined human can do this. Control actions (designate orchestrator, remove sessions) are owner-bounded.

### Agent's Discretion
- Exact MCP tool schemas and resource URI design for the Cursor adapter
- Codex CLI adapter subprocess management and lifecycle details
- Live watch terminal rendering approach (blessed, ink, raw ANSI, etc.)
- Static CLI command output formatting
- Inactivity inference timeout thresholds and heuristics
- Space ownership assignment mechanism (first human to create? explicit claim?)
- Exact snapshot command names and flag design

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product & Architecture
- `PRD.md` — Product vision, session-first design, human oversight principles, native UX boundary
- `ARCHITECTURE-CONSTRAINTS.md` — Zero external services, SQLite default, WebSocket relay, adapter as edge concern

### Adapter Pattern
- `docs/adapter-ingress.md` — Adapter ingress pattern, stdio reference adapter, TalkieSessionClient usage, security notes

### Upstream Phase Decisions
- `.planning/phases/04-collaboration-semantics-metadata-adapter-edge/04-CONTEXT.md` — Adapter pattern (D-07–D-09), shared client library (D-09), metadata schema (D-04–D-06), orchestrator routing (D-01–D-03), stdio adapter (D-10–D-12)
- `.planning/phases/03-supervisor-daemon-lifecycle/03-CONTEXT.md` — Daemon spawn (D-01–D-04), ensureRelayRunning for adapters to import
- `.planning/phases/02-relay-websocket-validate-route/02-CONTEXT.md` — Transcript persistence (D-06–D-08), reconnect (D-09–D-12)

### Existing Code
- `packages/client/src/session-client.ts` — TalkieSessionClient: connect, register, send, receive, onEnvelope
- `packages/adapter-stdio/` — Content-Length framing, bounded queue, CLI binary (reference for Codex adapter)
- `packages/cli/src/cli.ts` — Existing talkie CLI (relay start/stop/status/ensure, ping) — oversight commands extend this
- `packages/relay/src/collaboration-handlers.ts` — Orchestrator routing, designation, task.assign, metadata.patch/query
- `packages/relay/src/server.ts` — createRelayServer, dispatchValidatedEnvelope, session registration
- `packages/relay/src/session-registry.ts` — Session-to-WebSocket mapping
- `packages/persistence/` — SQLite with WAL, migration runner, is_human flag (migration 003)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TalkieSessionClient` in `packages/client/` — Both adapters import this for connect/register/send/receive. The Codex adapter uses it the same way stdio does. The Cursor MCP adapter wraps it behind MCP tool/resource handlers.
- `ContentLengthFrameReader` and `createBoundedQueue` in `packages/adapter-stdio/` — Codex CLI adapter can reuse the stdio framing directly or import these utilities.
- `collaboration-handlers.ts` — Already handles orchestrator designation, task.assign, metadata.patch/query. Oversight commands query the same data these handlers manage.
- Existing `talkie` CLI in `packages/cli/` — Oversight commands (space status, transcript, who, watch) extend this CLI. Commander.js is already set up.

### Established Patterns
- Monorepo with `packages/*` workspaces — new packages: `packages/adapter-codex/`, `packages/adapter-cursor-mcp/`
- Zod schemas for all protocol messages
- Control messages use `kind: "control"` with specific `type` strings
- SQLite with WAL mode, better-sqlite3, numbered migrations
- tsup for building, vitest for testing, ESM modules

### Integration Points
- New `packages/adapter-codex/` imports from `@agent-talkie/client` and `@agent-talkie/adapter-stdio`
- New `packages/adapter-cursor-mcp/` imports from `@agent-talkie/client`, exposes MCP tool server
- `packages/cli/` extended with oversight subcommands (space, transcript, who, watch)
- Relay may need a query endpoint for snapshot commands (or commands query SQLite directly)
- `is_human` flag in persistence already supports multi-human — owner semantics may need a new column or space-level metadata

</code_context>

<specifics>
## Specific Ideas

- The proof pair (Codex CLI + Cursor MCP) is deliberately chosen: one stdio-based, one tool-server-based. Two similar adapters would weaken the cross-runtime proof.
- The MCP adapter should feel natural to Cursor users — tools for actions, resources for reads, aligned with MCP conventions.
- The live watch split view should be the "mission control" during active collaboration — participant table on top, timeline scroll on bottom.
- Blocked state display must clearly distinguish self-reported blocked (adapter confirmed) from inferred possibly-blocked (silence heuristic). The human should never have false confidence about what's actually happening.
- Phase 5 proves the product, it does not expand it into a web app platform. CLI-first, minimal surface.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-cross-runtime-proof-human-oversight*
*Context gathered: 2026-04-13*
