# Requirements: agent-talkie

**Defined:** 2026-04-10
**Core Value:** Sessions from different runtimes can collaborate directly through a shared space without the human acting as copy-paste middleware.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Protocol

- [x] **PROTO-01**: Versioned message envelope with explicit wire version field validated by Zod at runtime
- [x] **PROTO-02**: JSON Schema export generated from Zod schemas for non-TypeScript consumers
- [x] **PROTO-03**: Idempotency keys on protocol operations that produce side effects, enabling safe retries on reconnect
- [x] **PROTO-04**: Message sequence numbers per session for ordering and gap detection
- [x] **PROTO-05**: Control messages and conversation messages distinguished as protocol-level semantics within the same envelope
- [x] **PROTO-06**: Schema evolution strategy with version negotiation during handshake

### Session Identity

- [x] **SESS-01**: Each session has a stable unique identity that survives reconnects and relay restarts
- [x] **SESS-02**: Sessions have human-usable display names with automatic disambiguation when collisions exist
- [x] **SESS-03**: Sessions expose minimal workspace context (runtime type, workspace label, branch, current focus) without revealing full local paths
- [x] **SESS-04**: Session identity persists in SQLite and is recoverable after adapter or relay restart

### Relay & Transport

- [x] **RELAY-01**: WebSocket relay server accepts connections, validates envelopes, and routes messages to addressed recipients
- [x] **RELAY-02**: Relay performs authoritative Zod validation on all inbound envelopes before routing
- [x] **RELAY-03**: Messages are routed by explicit session addressing, not broadcast to all connected sessions
- [x] **RELAY-04**: Relay daemon auto-spawns on first use when no relay is running locally
- [x] **RELAY-05**: Relay daemon lifecycle is independent of any participant — relay survives session disconnects and reconnects
- [x] **RELAY-06**: Single-instance relay enforcement via lockfile with generation tokens for stale lock detection
- [x] **RELAY-07**: Relay idle shutdown when no connections remain and no pending protocol state exists
- [x] **RELAY-08**: SQLite-backed durable state for spaces, memberships, session registry, and transcript pointers (WAL mode, busy_timeout)
- [x] **RELAY-09**: Graceful disconnect handling — session departure does not corrupt relay state or other sessions

### Collaboration Space

- [x] **SPACE-01**: Sessions can create, join, and leave a collaboration space
- [x] **SPACE-02**: A session can belong to at most one space at a time (v1 simplification)
- [x] **SPACE-03**: Space membership is persisted in SQLite and survives relay restarts
- [x] **SPACE-04**: Participation requires explicit opt-in (join action or invitation) — network presence alone never grants membership

### Messaging

- [x] **MSG-01**: Sessions can send messages directly to another session in the same space
- [x] **MSG-02**: Sessions can send messages addressed to all sessions in the same space
- [x] **MSG-03**: Multi-turn conversations are supported — sessions can continue back-and-forth exchanges, not just one-shot dispatch
- [x] **MSG-04**: Human messages to the space route to the orchestrator session by default
- [x] **MSG-05**: Human can address a specific session directly, bypassing orchestrator default
- [x] **MSG-06**: Orchestrator can assign work to sessions, follow up on progress, and consolidate questions for the human

### Collaboration Metadata

- [x] **META-01**: Each session has layer-owned collaboration metadata: role, focus, progress status, and blocked state
- [x] **META-02**: Metadata is visible to other sessions in the same space and to observing humans
- [x] **META-03**: Status-like fields (activity, blocked state, last update) can refresh automatically; semantic fields (role, display name, focus) are human-controlled
- [x] **META-04**: Metadata updates are propagated to space participants via the relay

### Multi-Human

- [x] **MHUM-01**: Multiple humans can participate in the same collaboration space, each bringing their own local agent sessions

### Adapters

- [x] **ADAPT-01**: Adapter ingress pattern defined — adapters translate runtime-native I/O into valid protocol envelopes sent to the relay via WebSocket
- [x] **ADAPT-02**: At least two runtime adapters implemented to prove cross-runtime collaboration (exact runtimes are implementation choices)
- [x] **ADAPT-03**: Adapters are edge concerns — they connect to the relay using the same session client and WebSocket protocol as any other consumer
- [x] **ADAPT-04**: Stdio-based adapter with framed messages, bounded queues, and clear overload errors for runtimes that communicate via stdin/stdout

### Human Oversight

- [x] **OVER-01**: Human-visible surface showing who is participating, what each session is doing, and what needs attention
- [x] **OVER-02**: Native interruptions (permission prompts, auth, destructive confirmations) stay in the native client — the collaboration layer surfaces which session is blocked and why, without replacing native UX
- [x] **OVER-03**: Human can observe the collaboration timeline without automatically injecting all messages as context into every session

### CLI & Packaging

- [x] **CLI-01**: Product is installable via `npm install` or runnable via `npx` without separately installing infrastructure
- [x] **CLI-02**: CLI entrypoints for relay management (start, stop, status) and session operations
- [x] **CLI-03**: Relay auto-start is transparent — the user does not need to manually manage daemon lifecycle for basic local use

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Trust & Remote

- **TRUST-01**: Token/TLS/tunnel authentication story for non-loopback relay connections
- **TRUST-02**: Invite-based space membership for cross-machine collaboration
- **TRUST-03**: Loopback-only binding by default; non-loopback requires explicit trust configuration

### Multi-Human

- **MHUM-02**: Cross-user invitation and approval flow for joining collaboration spaces

### Advanced Orchestration

- **ORCH-01**: Proactive orchestrator follow-ups — orchestrator autonomously checks stalled threads and drives momentum
- **ORCH-02**: Orchestrator failover — when orchestrator session disconnects, recovery or reassignment mechanism

### Extended UX

- **UX-01**: Session finder / "ring my terminal" — locate a session from the web UI and highlight its hosting terminal
- **UX-02**: Web-based collaboration dashboard with richer oversight than CLI
- **UX-03**: Multi-space per session — a session can participate in multiple spaces simultaneously

## Out of Scope

| Feature | Reason |
|---------|--------|
| NATS, Kafka, or external message bus as default | Zero-external-services constraint — SQLite + WebSocket relay is the default path |
| Postgres or external database as default | SQLite is sufficient for local-first; external DB is an optional extension, not default |
| Hosted autonomous execution / agent sandboxes | Product connects existing sessions, does not host or execute them |
| Full workspace sync or repo mirroring | Local context stays local unless deliberately shared — security and scope |
| Centralized long-term memory platform | Violates local-first trust model; not the product's problem |
| Git conflict resolution / worktree management | Belongs to development workflows, not the collaboration layer |
| Replacing native runtime approval / auth / prompt UX | Wrong trust boundary — native interruptions stay native |
| General-purpose agent harness framework | Keep boundary narrow — messages + metadata, not a LangGraph competitor |
| Firebase or proprietary realtime databases | Vendor lock-in; conflicts with zero-external-services default |
| Ambient discovery = membership | Explicit participation only — presence on network never grants access |
| Solo/local/team mode-switching UX | Artificial modes; collaboration extends naturally via invite and join |
| Runtime brand as identity | Sessions are the unit, not runtime brands |
| JSON/Markdown as sole source of truth | SQLite is durable store; JSON/JSONL for export/debug only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROTO-01 | 1 | Complete |
| PROTO-02 | 1 | Complete |
| PROTO-03 | 1 | Complete |
| PROTO-04 | 1 | Complete |
| PROTO-05 | 1 | Complete |
| PROTO-06 | 1 | Complete |
| SESS-01 | 1 | Complete |
| SESS-02 | 1 | Complete |
| SESS-03 | 1 | Complete |
| SESS-04 | 1 | Complete |
| RELAY-01 | 2 | Complete |
| RELAY-02 | 2 | Complete |
| RELAY-03 | 2 | Complete |
| RELAY-04 | 3 | Complete |
| RELAY-05 | 3 | Complete |
| RELAY-06 | 3 | Complete |
| RELAY-07 | 3 | Complete |
| RELAY-08 | 2 | Complete |
| RELAY-09 | 2 | Complete |
| SPACE-01 | 2 | Complete |
| SPACE-02 | 2 | Complete |
| SPACE-03 | 2 | Complete |
| SPACE-04 | 2 | Complete |
| MSG-01 | 2 | Complete |
| MSG-02 | 2 | Complete |
| MSG-03 | 2 | Complete |
| MSG-04 | 4 | Complete |
| MSG-05 | 4 | Complete |
| MSG-06 | 4 | Complete |
| META-01 | 4 | Complete |
| META-02 | 4 | Complete |
| META-03 | 4 | Complete |
| META-04 | 4 | Complete |
| ADAPT-01 | 4 | Complete |
| ADAPT-02 | 5 | Complete |
| ADAPT-03 | 4 | Complete |
| ADAPT-04 | 4 | Complete |
| OVER-01 | 5, 6 | Complete (gap closure in Phase 6) |
| OVER-02 | 5 | Complete |
| OVER-03 | 5 | Complete |
| MHUM-01 | 5 | Complete |
| CLI-01 | 3 | Complete |
| CLI-02 | 3 | Complete |
| CLI-03 | 3, 6 | Complete (gap closure in Phase 6) |

**Coverage:**
- v1 requirements: 44 total
- Mapped to phases: 44
- Unmapped: 0

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-04-15 after v1.0 milestone audit gap closure*
