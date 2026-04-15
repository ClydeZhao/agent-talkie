# Phase 4: Collaboration semantics, metadata & adapter edge - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Orchestrator routing rules, collaboration metadata, and adapter ingress (pattern + stdio) on top of the stable client protocol, relay, and supervisor from Phases 1-3. Sessions can be designated as orchestrator; human messages default-route to the orchestrator; sessions expose small, collaboration-layer-owned metadata; adapters translate native runtime I/O into the same client/envelope model via a shared session client library; the stdio adapter is the first concrete adapter with Content-Length framing and bounded queues.

</domain>

<decisions>
## Implementation Decisions

### Orchestrator Routing
- **D-01:** Orchestrator is designated via an explicit control action (protocol command), not by metadata self-declaration. The relay stores one authoritative orchestrator session per space. Metadata may reflect the role for display but is not the source of truth for routing. No split-brain where multiple sessions independently self-declare as orchestrator.
- **D-02:** Human messages without an explicit `to` field route to the designated orchestrator. If no orchestrator is designated, the relay returns a clear protocol error — no silent broadcast, no queuing. The client should prompt the human to designate an orchestrator or choose a target.
- **D-03:** Task assignment is a control message with explicit protocol semantics (e.g. `task.assign`). Follow-up and question consolidation remain conversation-first — regular conversation messages with structured payload conventions. The product is not a full task engine.

### Metadata Schema & Propagation
- **D-04:** Collaboration metadata fields: `role` (string), `focus` (short text), `progress` (enum: idle/working/blocked/done), `blockedReason` (optional text). Small and collaboration-layer-owned — no currentFile, no fields that drift toward local-context sync.
- **D-05:** Metadata updates broadcast to live sessions in the space as incremental control messages. A separate query endpoint provides current-state snapshots for late joiners, reconnecting sessions, or clients that need a fresh view. Broadcast is incremental updates; query is current-state recovery — not duplicate sources of truth.
- **D-06:** Auto-refresh fields (e.g. lastActivity timestamp) live in a `status` namespace. Human-controlled semantic fields (role, focus, display name) live in a `profile` namespace. The relay enforces write rules per namespace — sessions may self-update status fields, but cannot silently self-edit role or other semantic identity fields.

### Adapter Ingress Pattern
- **D-07:** Adapter is defined as a pattern, not a single process shape. Two reference forms: standalone process for stdio/CLI-style runtimes; in-process library for plugin-capable runtimes. Both terminate in the same client/envelope model and connect to the relay via the same protocol.
- **D-08:** The adapter registers a session on behalf of the native runtime — the visible session identity represents the native agent/session, not the adapter process. The adapter itself is invisible at the product layer.
- **D-09:** Phase 4 ships a shared session client library (e.g. `@agent-talkie/client`) with connect, handshake, register, send, receive, metadata update. Adapters and future consumers import this instead of reimplementing WebSocket/handshake/session logic. This is the canonical integration surface between adapter edge and relay.

### Stdio Adapter
- **D-10:** Content-Length framing for stdin/stdout — HTTP-style `Content-Length: N\r\n\r\n` header followed by JSON body. Explicit, robust for multiline/larger payloads, familiar from LSP/DAP protocols.
- **D-11:** Bounded queue with configurable max size for adapter output. When full, drop oldest undelivered message and log a warning. Lost messages are recoverable via transcript query/catch-up. Adapter stays responsive — no memory blowup from one slow runtime.
- **D-12:** Overload is an adapter-edge concern, not a relay protocol event. Adapter emits structured warning to stderr and increments a dropped-message counter. No protocol-level error to the relay for queue overflow.

### Constraints (from user)
- Adapters must NOT become a second transport architecture. They translate native I/O into the same client/envelope model.
- Metadata must stay small and collaboration-layer-owned — not a backdoor for full local context sync.

### Agent's Discretion
- Exact control message types and payload schemas for orchestrator designation and task assignment
- Metadata query response format and pagination
- Shared client library API design (class vs functional, event-based vs callback)
- Stdio adapter queue size default and configuration mechanism
- Content-Length framing parser implementation details
- Adapter lifecycle management (reconnect, graceful shutdown)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product & Architecture
- `PRD.md` — Product vision, session-first design, orchestrator role, human routing defaults, explicit participation model
- `ARCHITECTURE-CONSTRAINTS.md` — Hard constraints: zero external services, SQLite default, WebSocket relay, adapter as edge concern

### Research
- `.planning/research/ARCHITECTURE.md` — Component boundaries, relay responsibilities, recommended project structure
- `.planning/research/STACK.md` — Recommended library versions (ws, better-sqlite3, uuid)
- `.planning/research/PITFALLS.md` — CP4 (message ordering), CP5 (SQLite locking), CP6 (session id != connection id)

### Upstream Phase Decisions
- `.planning/phases/01-protocol-persistence-foundation/01-CONTEXT.md` — Envelope structure (D-01–D-03: flat envelope, kind field, addressing fields), session identity (D-04–D-06: UUID v7, disambiguation, workspace context), idempotency (D-11–D-12)
- `.planning/phases/02-relay-websocket-validate-route/02-CONTEXT.md` — Space lifecycle (D-01–D-04: slugs, auto-create, archive-then-expire), no offline mailbox (D-05), transcript persistence (D-06–D-08), reconnect (D-09–D-12)
- `.planning/phases/03-supervisor-daemon-lifecycle/03-CONTEXT.md` — Daemon spawn (D-01–D-04: fork+IPC, ensureRelayRunning for adapters to import), lockfile (D-07–D-08), idle shutdown (D-09–D-11)

### Existing Code
- `packages/protocol/src/envelope.ts` — Envelope schema with `to`, `spaceId`, `kind`, `type` fields
- `packages/relay/src/router.ts` — Current routing logic (direct via `to`, fan-out to space members)
- `packages/relay/src/server.ts` — `createRelayServer()`, `dispatchValidatedEnvelope()`, session registration flow
- `packages/relay/src/session-registry.ts` — In-memory session-to-WebSocket mapping
- `packages/relay/src/space-lifecycle.ts` — Space join/leave with idempotency, archive-then-expire
- `packages/supervisor/src/ensure-relay.ts` — `ensureRelayRunning()` for adapters to import

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `envelopeSchema` and `safeParseEnvelope()` in `packages/protocol/` — adapters and client library will use these for envelope construction/validation
- `routeEnvelope()` in `packages/relay/src/router.ts` — needs extension for orchestrator default routing
- `SessionRegistry` in `packages/relay/src/session-registry.ts` — may need to track orchestrator designation per space
- `dispatchValidatedEnvelope()` in `packages/relay/src/server.ts` — handles space join/leave, will need new control message handlers for orchestrator designation, metadata updates, task assignment
- `ensureRelayRunning()` in `packages/supervisor/` — adapters import this before connecting

### Established Patterns
- Monorepo with `packages/*` workspaces (protocol, persistence, relay, supervisor, cli)
- Zod schemas for all protocol messages with `safeParse` validation
- Control messages use `kind: "control"` with specific `type` strings (space.join, space.leave)
- Idempotency keys on state-changing operations
- SQLite with WAL mode, better-sqlite3, numbered migration files
- tsup for building, vitest for testing, ESM modules

### Integration Points
- New `packages/client/` for shared session client library
- New adapter packages (e.g. `packages/adapter-stdio/`) import from `@agent-talkie/client`
- Relay router.ts extended with orchestrator default routing logic
- Relay server.ts extended with metadata update and orchestrator designation control message handlers
- Persistence layer extended with metadata storage tables (status + profile namespaces)
- Phase 5 will use the adapter pattern and client library to build two runtime-specific adapters

</code_context>

<specifics>
## Specific Ideas

- Content-Length framing is deliberately chosen for LSP/DAP familiarity — runtime integration authors will recognize the pattern
- The shared client library is the main Phase 4 deliverable beyond the protocol extensions — it's the canonical integration surface
- Orchestrator designation as an explicit control action prevents the "who is the orchestrator?" ambiguity that self-declaration would create
- Metadata namespaces (status vs profile) with relay-enforced write rules prevent sessions from silently changing their own role

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-collaboration-semantics-metadata-adapter-edge*
*Context gathered: 2026-04-13*
