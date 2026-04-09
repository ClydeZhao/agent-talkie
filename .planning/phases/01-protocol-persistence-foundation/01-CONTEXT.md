# Phase 1: Protocol & persistence foundation - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Define the wire contract (versioned message envelope with Zod validation and JSON Schema export), the session identity model (stable IDs, human-usable names, minimal workspace context), and the durable SQLite persistence layer (session registry, schema skeleton) — all consumable before any relay networking ships in Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Envelope Structure
- **D-01:** Flat top-level envelope — fields at the wire level include `version` (integer), `id` (message UUID), `sessionId` (sender), `kind` (control | conversation), `type` (specific message type string), `payload` (generic object), plus optional `idempotencyKey` and `seq` (sequence number). No deep nesting of envelope metadata.
- **D-02:** `kind` field distinguishes control messages (join, leave, metadata updates, heartbeat) from conversation messages (session-to-session, human-to-orchestrator). Both use the same envelope shape.
- **D-03:** Addressing fields (`to` for direct session, or channel-scoped broadcast) are part of the envelope, not buried in payload.

### Session Identity Model
- **D-04:** Session IDs use UUID v7 (time-sortable, globally unique, no coordination needed). Display names are human-chosen strings.
- **D-05:** Disambiguation on name collision: relay appends a short numeric suffix (e.g., "impl-1", "impl-2") when multiple sessions share the same display name in a channel. The suffix is relay-managed, not user-chosen.
- **D-06:** Minimal workspace context fields: `runtime` (string, e.g. "cursor", "claude-code", "codex"), `workspaceLabel` (human-readable, not full path), `branch` (optional), `focus` (optional, free text). These are declared by the session, not extracted by the relay.

### SQLite Schema Approach
- **D-07:** Use raw `better-sqlite3` with manual migration files for v1. No ORM (Drizzle/Kysely deferred unless schema complexity grows). Migrations are numbered SQL files in a `migrations/` directory with a `schema_version` tracking table.
- **D-08:** Phase 1 tables: `sessions` (id, display_name, runtime, workspace_label, branch, focus, created_at, updated_at), `schema_version` (version, applied_at). Space and membership tables are defined here as schema but primarily used in Phase 2.

### Versioning Strategy
- **D-09:** Single integer `version` field in the envelope (starting at 1). No major/minor split for v1 — the integer is sufficient until the protocol stabilizes.
- **D-10:** Handshake includes a `supportedVersions` range. Relay rejects connections whose version range has no overlap with the relay's supported range. Explicit rejection message with expected version info.

### Idempotency Scope
- **D-11:** Idempotency keys are UUID-based, attached to state-changing operations only: join, leave, metadata updates, and any protocol operation that mutates SQLite state. Conversation messages do not require idempotency keys.
- **D-12:** Relay deduplicates by idempotency key within a configurable time window (default 5 minutes). After the window, the key is evicted. This is simple and sufficient for reconnect scenarios.

### Claude's Discretion
- Exact Zod schema field naming conventions (camelCase vs snake_case) — follow TypeScript ecosystem convention (camelCase)
- JSON Schema export build integration details (CI script vs build step)
- Exact migration file naming convention
- Test fixture design for envelope validation

### Folded Todos
None.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product & Architecture
- `PRD.md` — Product vision, design principles, session-first and conversation-first semantics
- `ARCHITECTURE-CONSTRAINTS.md` — Hard constraints: zero external services, SQLite default, WebSocket relay, Zod + JSON Schema

### Research
- `.planning/research/STACK.md` — Recommended library versions (Zod 4 native JSON Schema, better-sqlite3, uuid)
- `.planning/research/ARCHITECTURE.md` — Component boundaries, build order, protocol module design
- `.planning/research/PITFALLS.md` — CP4 (message ordering), CP5 (SQLite locking), CP6 (session id != connection id), CP7 (wire versioning)
- `.planning/research/SUMMARY.md` — Phase 1 research flags: transcript vs metadata durability split, migration strategy

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
None — greenfield project, no existing code.

### Established Patterns
None — this phase establishes the foundational patterns.

### Integration Points
- Phase 2 (Relay) will consume the envelope types, validation functions, and SQLite schema from this phase
- Phase 3 (Supervisor) will use session identity persistence
- Phase 4 (Adapters) will construct valid envelopes using exported types

</code_context>

<specifics>
## Specific Ideas

- Envelope should stay JSON-Schema-friendly — avoid Zod constructs that don't export cleanly to JSON Schema (per research/STACK.md guidance on Zod 4 `z.toJSONSchema()`)
- The SCRATCHPAD.md "one session per channel" simplification is already reflected in SPACE-02 requirement — schema should support this constraint naturally
- Protocol module should be a separate package/directory that can be consumed independently of relay or client code

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-protocol-persistence-foundation*
*Context gathered: 2026-04-10*
