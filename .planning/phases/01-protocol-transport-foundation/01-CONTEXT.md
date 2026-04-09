# Phase 1: Protocol & transport foundation - Context

**Gathered:** 2026-04-09 (revised)
**Status:** Ready for planning
**Revision note:** Architectural pivot — replaced NATS + Postgres default with zero-external-services, relay-based local-first architecture.

<domain>
## Phase Boundary

Establish the versioned, enforceable message contract (envelope schema) and transport semantics that all adapters, the relay, and the collaboration core share as a single source of truth. This phase produces the wire format, transport abstraction layer, and relay protocol — no session management, no routing logic, no adapters yet.

</domain>

<decisions>
## Implementation Decisions

### Hard Constraints (architectural pivot)

- **D-00a:** Default mode = zero external services. A user must be able to run the system via `npm install` or `npx` with nothing else installed.
- **D-00b:** NATS and Postgres are NOT default dependencies. They may only appear as optional plugins for team/remote deployments.
- **D-00c:** SQLite is the default metadata store. JSON/MD/JSONL may serve as export, mirror, or debug artifacts but are not the primary source of truth.
- **D-00d:** No explicit solo/local/team mode switching. Default is local-first; multi-participant collaboration emerges naturally through invite/join, not mode selection.

### Envelope Design (retained from prior context)

- **D-01:** Comprehensive envelope from day one — include `schema_version`, `message_id`, `thread_id`, `sender_session_id`, `space_id`, `type` (control vs conversation), `timestamp`, and `payload`.
- **D-02:** Use Zod for TypeScript envelope validation and export JSON Schema for non-TS adapter implementations.

### Transport Architecture (replaces D-03, D-04, D-07, D-08)

- **D-03:** Core transport = relay-based WebSocket protocol. Localhost and remote use the same protocol; the only difference is the relay address (`ws://localhost:PORT` vs `wss://relay.example.com`).
- **D-04:** Relay runs as an independent daemon process. Auto-spawned on first need (first session that requires it), auto-shutdown when all sessions disconnect. Similar to Docker daemon lifecycle.
- **D-05-transport:** Adapter ingress is a separate concern from core transport. WebSocket client is the default ingress. stdio bridge is available for CLI-based runtimes. These two layers (core relay protocol vs adapter ingress mechanism) are architecturally distinct and must not be conflated.
- **D-06-transport:** Control vs conversation separation is handled at the protocol/semantic layer via the envelope `type` field, not at the transport layer. The relay routes and filters based on envelope semantics, not transport-level channel partitioning.

### Schema Evolution Strategy (retained from prior context)

- **D-05:** Strict rejection of unknown schema versions — the receiver responds with a clear error indicating the expected version range and an upgrade path.
- **D-06:** Schema versions are integer-based and monotonically increasing.

### Claude's Discretion

- Exact Zod schema field types and validation rules
- WebSocket frame format (JSON text frames vs binary)
- Relay daemon port selection strategy
- SQLite schema for metadata (Drizzle vs raw SQL)
- Test harness and conformance tooling approach

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Protocol

- `.planning/REQUIREMENTS.md` — PROTO-01 through PROTO-04 acceptance criteria
- `PRD.md` — Product pattern, design principles, and non-goals

### Architecture (read with caveats)

- `.planning/research/ARCHITECTURE.md` — Component boundaries and data flow remain valid; NATS-specific transport details are superseded by this context
- `.planning/research/PITFALLS.md` — CP-2 (protocol semantics), CP-3 (control vs data plane separation) remain relevant

### Project Context

- `.planning/PROJECT.md` — Design principles (session-first, conversation-first, tool layer first)

### Superseded (reference only for optional team/remote mode)

- `.planning/research/STACK.md` — NATS/Postgres stack. No longer normative for default mode. May inform optional NATS transport plugin in future phases.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from Plan 01-01, already executed)

- `packages/protocol/src/envelope.ts` — Zod envelope schema, transport-agnostic. Fully reusable.
- `packages/protocol/src/idempotency.ts` — In-memory idempotency guard. Fully reusable.
- `packages/protocol/src/errors.ts` — Protocol error types. Fully reusable.
- `packages/protocol/scripts/write-envelope-json-schema.ts` — JSON Schema generation. Fully reusable.

### Established Patterns

- Monorepo with `packages/*` workspaces
- Zod for validation, Vitest for testing
- snake_case JSON keys in envelope

### Integration Points

- Protocol envelope will be imported by all future phases (relay, adapters, core)
- Relay protocol builds on envelope schema — relay is the first consumer of the transport abstraction

### Invalidated Plans (must be rewritten during re-planning)

- `01-02-PLAN.md` — NATS subject builders → replace with relay topic routing / envelope-based dispatch
- `01-03-PLAN.md` — Docker Compose NATS/Postgres + JetStream dedup → replace with embedded relay + SQLite verification

</code_context>

<specifics>
## Specific Ideas

- Transport abstraction must be a clean interface (e.g. `TalkieTransport`) with relay-WebSocket as default implementation and NATS as an optional alternative — but this is an interface design question for research/planning, not a locked specific.
- The relay daemon pattern should feel invisible: the user runs their session, the relay starts automatically if needed, and shuts down when no one is connected.

</specifics>

<deferred>
## Deferred Ideas

- NATS transport plugin (optional team/remote mode) — future phase or backlog
- Postgres as alternative metadata store — future phase or backlog
- Relay clustering / horizontal scaling — Phase 7 (hardening)
- Binary protocol (protobuf) — only if JSON proves insufficient

</deferred>

---

*Phase: 01-protocol-transport-foundation*
*Context gathered: 2026-04-09 (revised)*
