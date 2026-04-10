# Phase 2: Relay — WebSocket, validate, route - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a running relay server that accepts WebSocket connections, performs authoritative Zod validation on every inbound envelope, manages collaboration spaces (create/join/leave with durable SQLite state), and routes messages between sessions in the same space by explicit addressing — without broadcast-to-all leakage. This phase consumes the protocol types, envelope validation, and SQLite schema skeleton from Phase 1.

</domain>

<decisions>
## Implementation Decisions

### Space Lifecycle
- **D-01:** Human-readable space slug as the user-facing join target (e.g. `review-auth`). Relay maintains an internal stable space ID (UUID) separate from the slug. First successful join to a slug that doesn't exist auto-creates the space. Later joins to the same slug join the existing space. No mandatory separate create-space step in normal UX.
- **D-02:** Keep room for invite/permission rules in later phases — create-or-join must not erase ownership or authorization boundaries. The data model should support attaching access policy later without schema migration.
- **D-03:** Archive-then-expire on last member leave. When the last session leaves, the space becomes inactive. Inactive spaces are retained for a bounded TTL. During that TTL, a later join to the same slug revives the same space. After TTL expiry, the space can be garbage-collected.
- **D-04:** Metadata retention and transcript retention are separate concerns with independent policies — they must not be assumed to live exactly as long as each other.

### Offline Delivery
- **D-05:** No durable offline mailbox in v1. If the target session is disconnected, messages are not queued for long-term offline delivery. The relay routes to currently-connected sessions only.

### Transcript Persistence
- **D-06:** Full body storage for both control and conversation messages in the collaboration transcript. This is for timeline replay and human oversight, not for durable offline mailbox semantics.
- **D-07:** Retention must be bounded, not infinite. The planner should include size caps, retention TTL, and a later export/archive policy.
- **D-08:** Auto catch-up on join — when a session joins a space, the relay sends a bounded configurable window of recent messages. Clients can also issue explicit transcript queries for deeper history. The default catch-up window is bounded, not "load everything."

### Reconnect & Session Recovery
- **D-09:** Session ID + reconnect secret for resume. Client persists a stable session ID (UUID v7, from Phase 1) and a reconnect secret locally. Reconnect requires both. This is a lightweight session-resume credential, not the full remote auth/invite system. Keep room for stronger remote trust later.
- **D-10:** Reconnect restores space membership and sends bounded catch-up for messages missed during disconnect. Clients can use explicit transcript queries for deeper history if needed.
- **D-11:** No resend of pre-disconnect unacked outbound messages in v1. Replay/catch-up is simple and transcript-based, not a full reliable-delivery queue.
- **D-12:** Independent session TTL for reconnect, separate from space TTL. A space may still exist after a session's resume window has expired. If session TTL has expired, the client must rejoin as a new session. Planner picks a bounded simple default.

### Claude's Discretion
- WebSocket library choice (ws, uWebSockets.js, etc.)
- Exact SQLite table schemas for spaces, memberships, transcript storage
- Exact catch-up window size default and max
- Exact session TTL and space TTL default values
- Reconnect secret generation mechanism
- Garbage collection scheduling strategy
- Error response format for rejected envelopes
- Heartbeat/keepalive interval

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product & Architecture
- `PRD.md` — Product vision, session-first design, orchestrator role, human routing defaults, explicit participation model
- `ARCHITECTURE-CONSTRAINTS.md` — Hard constraints: zero external services, SQLite default, WebSocket relay, relay lifecycle independence

### Research
- `.planning/research/ARCHITECTURE.md` — Component boundaries, relay responsibilities, data flow (join path, message path), recommended project structure, build order
- `.planning/research/STACK.md` — Recommended library versions (better-sqlite3, uuid, ws/uws options)
- `.planning/research/PITFALLS.md` — CP4 (message ordering), CP5 (SQLite locking/WAL), CP6 (session id != connection id), CP7 (wire versioning)

### Phase 1 Decisions (upstream)
- `.planning/phases/01-protocol-persistence-foundation/01-CONTEXT.md` — Envelope structure (D-01–D-03), session identity model (D-04–D-06), SQLite schema approach (D-07–D-08), versioning strategy (D-09–D-10), idempotency scope (D-11–D-12)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
None — greenfield project, no code exists yet. Phase 1 artifacts (protocol types, Zod schemas, SQLite migration runner) will be the primary inputs.

### Established Patterns
- Phase 1 establishes: flat envelope structure, better-sqlite3 with numbered migration files, UUID v7 for session IDs, `kind` field for control vs conversation messages
- Phase 1 defines space and membership table schemas that this phase will populate and use

### Integration Points
- Phase 2 consumes envelope types and Zod validation from `packages/protocol/`
- Phase 2 extends the SQLite schema with space, membership, and transcript tables using the migration runner from Phase 1
- Phase 2 builds the relay server in `packages/relay/` per the recommended project structure
- Phase 3 (Supervisor) will manage the relay daemon lifecycle built here
- Phase 4 (Adapters) will connect to the WebSocket server built here

</code_context>

<specifics>
## Specific Ideas

- Space slugs should feel like Slack channel names — short, lowercase, hyphenated, human-typeable
- The relay should be a clean server process that can be started independently for testing, even without the supervisor from Phase 3
- Transcript catch-up on join should not block the join acknowledgment — the session becomes a member immediately, catch-up streams after

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-relay-websocket-validate-route*
*Context gathered: 2026-04-10*
