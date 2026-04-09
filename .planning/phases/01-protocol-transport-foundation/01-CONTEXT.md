# Phase 1: Protocol & transport foundation - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the versioned, enforceable message contract (envelope schema) and transport semantics that all adapters, the relay, and the collaboration core share as a single source of truth. This phase produces the wire format, transport setup, and channel layout — no session management, no routing logic, no adapters yet.

</domain>

<decisions>
## Implementation Decisions

### Envelope Design
- **D-01:** Comprehensive envelope from day one — include `schema_version`, `message_id`, `thread_id`, `sender_session_id`, `space_id`, `type` (control vs conversation), `timestamp`, and `payload`. Research warns against stringly-typed payloads evolving into tech debt (PITFALLS.md technical debt table).
- **D-02:** Use Zod for TypeScript envelope validation and export JSON Schema for non-TS adapter implementations. This gives type safety in the core and interoperability for polyglot adapters.

### Transport Selection
- **D-03:** NATS Server + JetStream as the primary message transport. Subject-based routing maps naturally to spaces and sessions, request/reply supports orchestrator-style calls, and JetStream provides durability where needed. Research (STACK.md) recommends NATS 2.12.x with `@nats-io/transport-node` and `@nats-io/jetstream` (~3.3.x).
- **D-04:** Start with Docker Compose for local development (NATS + Postgres). No Kubernetes or cloud-native infrastructure in v1.

### Schema Evolution Strategy
- **D-05:** Strict rejection of unknown schema versions — the receiver responds with a clear error indicating the expected version range and an upgrade path. This follows research pitfall CP-2 (happy-path-only protocols cause hard-to-diagnose failures).
- **D-06:** Schema versions are integer-based and monotonically increasing. The envelope includes a `schema_version` field; receivers reject messages with versions they cannot handle.

### Channel Topology
- **D-07:** Separate NATS subject hierarchies for control traffic (join, leave, metadata updates) vs conversation traffic. This allows independent scaling, monitoring, and rate-limiting of each channel type.
- **D-08:** Subject naming convention follows `talkie.{space_id}.control.{event_type}` and `talkie.{space_id}.conversation.{thread_id}` patterns.

### Claude's Discretion
- Exact Zod schema field types and validation rules
- NATS subject naming details beyond the convention above
- JetStream stream configuration (retention, max age, replicas)
- Test harness and conformance tooling approach

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Protocol & Transport
- `.planning/research/STACK.md` — Recommended stack with version pins, NATS configuration, Zod setup
- `.planning/research/ARCHITECTURE.md` — Component boundaries, data flow, protocol → relay → adapter build order
- `.planning/research/PITFALLS.md` — CP-2 (protocol semantics), CP-3 (control vs data plane separation), technical debt patterns
- `.planning/research/SUMMARY.md` — Executive summary and Phase 1 rationale

### Project Context
- `.planning/PROJECT.md` — Design principles (session-first, conversation-first, tool layer first)
- `.planning/REQUIREMENTS.md` — PROTO-01 through PROTO-04 acceptance criteria
- `PRD.md` — Product pattern, design principles, and non-goals

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project

### Established Patterns
- None yet — this phase establishes the foundational patterns

### Integration Points
- Protocol envelope will be imported by all future phases (relay, adapters, core)
- NATS subject conventions will be used by relay (Phase 3) and adapters (Phase 4+)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-protocol-transport-foundation*
*Context gathered: 2026-04-09*
