# Roadmap: agent-talkie

**Version:** 1.0
**Created:** 2026-04-10
**Granularity:** Coarse
**Phases:** 5
**Requirements covered:** 43/43

## Milestone 1: agent-talkie v1

### Phase 1: Protocol & persistence foundation

**Goal:** The wire contract, session identity model, and durable session registry in SQLite are defined, validated, and consumable before any relay networking ships.

**Requirements:** PROTO-01, PROTO-02, PROTO-03, PROTO-04, PROTO-05, PROTO-06, SESS-01, SESS-02, SESS-03, SESS-04

**Plans:** 4 plans

Plans:

- [ ] 01-01-PLAN.md — Monorepo + Zod envelope (PROTO-01, PROTO-03 wire, PROTO-04, PROTO-05)
- [ ] 01-02-PLAN.md — JSON Schema export + handshake version negotiation (PROTO-02, PROTO-06)
- [ ] 01-03-PLAN.md — SQLite migrations, openDatabase, migrate runner (PROTO-03 DDL)
- [ ] 01-04-PLAN.md — Session + idempotency repositories, restart test (PROTO-03 dedup API, SESS-01–SESS-04)

**Success criteria:**

1. A consumer can serialize and parse a message envelope that passes Zod validation and carries an explicit wire version; invalid payloads fail with structured errors.
2. JSON Schema generated from the envelope (and related protocol types) is produced in the build or CI for non-TypeScript consumers.
3. Protocol operations that cause side effects accept idempotency keys; sequence numbers and control vs conversation semantics are represented in the envelope as specified.
4. Handshake or connect flow negotiates schema version per PROTO-06 so incompatible clients are rejected or degraded explicitly.
5. Session records (stable id, display name disambiguation, workspace context fields without raw paths) persist in SQLite and survive process restart in fixture or integration tests.

---

### Phase 2: Relay — WebSocket, validate, route

**Goal:** A running relay accepts WebSocket connections, authoritatively validates traffic, persists channel state, and routes messages between sessions in one space without broadcast-to-all leakage.

**Requirements:** RELAY-01, RELAY-02, RELAY-03, RELAY-08, RELAY-09, SPACE-01, SPACE-02, SPACE-03, SPACE-04, MSG-01, MSG-02, MSG-03

**Success criteria:**

1. Two (or more) test clients on WebSockets can join a space, exchange direct and channel-scoped messages, and continue multi-turn exchanges with ordering/gap signals per protocol.
2. Every inbound envelope is validated with the same Zod rules as clients; invalid messages are rejected without corrupting relay state.
3. Delivery targets explicit session ids (peer or subset); observers can verify traffic is not blindly broadcast to unrelated sessions.
4. Spaces, memberships, session registry, and transcript pointers are durable in SQLite with WAL and busy_timeout; restart preserves membership and registry.
5. Explicit join/opt-in is enforced — connection alone never implies membership; disconnect leaves other sessions and persisted state consistent.

---

### Phase 3: Supervisor & daemon lifecycle

**Goal:** The local relay daemon starts automatically when needed, enforces single instance, idles down safely, and is operable via npm/npx without separate infrastructure.

**Requirements:** RELAY-04, RELAY-05, RELAY-06, RELAY-07, CLI-01, CLI-02, CLI-03

**Success criteria:**

1. With no relay running, a normal client or CLI action brings up a local relay without the user manually starting a long-lived process first.
2. Relay keeps running across participant disconnect/reconnect; no session is required to stay connected for the relay to remain valid.
3. Only one relay instance binds locally; stale lockfiles are detectable via generation tokens and documented recovery works.
4. When no WebSockets remain and there is no pending protocol state, the relay shuts down or scales down per policy without trapping orphan state.
5. The package installs with `npm install` or runs via `npx`; CLI exposes relay start/stop/status and session-oriented commands; basic local use does not require the user to manage daemon lifecycle by hand.

---

### Phase 4: Collaboration semantics, metadata & adapter edge

**Goal:** Orchestrator routing rules, collaboration metadata, and adapter ingress (pattern + stdio) work on top of the stable client protocol — without yet requiring the full cross-runtime proof.

**Requirements:** MSG-04, MSG-05, MSG-06, META-01, META-02, META-03, META-04, ADAPT-01, ADAPT-03, ADAPT-04

**Success criteria:**

1. Human-originated messages default to the orchestrator session; humans can target a specific session; orchestrator can assign, follow up, and consolidate questions per protocol.
2. Each session exposes layer-owned metadata (role, focus, progress, blocked); others and humans see updates; automatic vs human-controlled fields behave as specified; updates propagate via relay.
3. Adapter ingress is documented and implemented: native I/O becomes valid envelopes over WebSocket; stdio adapter uses framing, bounded queues, and clear overload errors.
4. Adapters use the same session client and WebSocket path as any consumer — no special-case transport in core.

---

### Phase 5: Cross-runtime proof & human oversight

**Goal:** v1 is proven with two real runtime adapters and a human-visible oversight surface that respects native UX boundaries and timeline observation without flooding every session.

**Requirements:** ADAPT-02, OVER-01, OVER-02, OVER-03

**Success criteria:**

1. At least two distinct runtime adapters connect concurrently and collaborate through the relay (cross-runtime proof).
2. A human-facing surface (CLI and/or logs/UI as implemented) shows participants, activity, focus, and what needs attention.
3. When a session is blocked on a native prompt, the layer surfaces which session and why without replacing native approval UI.
4. Humans can read the collaboration timeline without every message being auto-injected as context into all sessions.

---

*Roadmap derived from `.planning/REQUIREMENTS.md` and `.planning/research/SUMMARY.md` (coarse five-phase structure).*
