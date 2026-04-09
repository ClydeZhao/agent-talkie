# Requirements: agent-talkie

**Defined:** 2026-04-09
**Core Value:** Running agent sessions can collaborate directly across runtime boundaries without the human acting as a copy-paste bridge.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Protocol

- **PROTO-01**: System uses a versioned JSON envelope with schema version, message ID, and thread scope
- **PROTO-02**: Messages include idempotency keys for at-least-once delivery with deduplication
- **PROTO-03**: Control messages (join, leave, metadata updates) are separated from conversation messages
- **PROTO-04**: Protocol rejects unknown schema versions with a clear upgrade path

### Session Management

- **SESS-01**: Session has a stable identity that persists across reconnects and restarts
- **SESS-02**: Session has a human-usable display name with automatic disambiguation on collision
- **SESS-03**: Session exposes runtime type (Cursor, Claude Code, Codex, etc.) as visible metadata
- **SESS-04**: Session exposes workspace context (repo, branch, root path) as collaboration metadata
- **SESS-05**: Session lifecycle states are tracked (active, idle, blocked, error)

### Collaboration Spaces

- **SPACE-01**: User can create a named collaboration space
- **SPACE-02**: Session can join a space through explicit opt-in action (slash command, invite, attach flow)
- **SPACE-03**: Session can leave a space voluntarily
- **SPACE-04**: Space owner can revoke a session's membership
- **SPACE-05**: Multiple humans can participate in the same collaboration space, each with their own local sessions
- **SPACE-06**: Space membership is durable (survives runtime restarts for the logical session)

### Messaging

- **MSG-01**: Session can send a message to a specific session by name within the same space
- **MSG-02**: Session can send a message visible to all sessions in a space
- **MSG-03**: Messages support threaded or structured conversation units for multi-turn exchanges
- **MSG-04**: Messages are addressed to sessions, not runtime brands
- **MSG-05**: Message delivery provides at-least-once guarantees within a space

### Orchestration

- **ORCH-01**: A session can be designated as orchestrator for a collaboration space
- **ORCH-02**: Human messages to the space route to the orchestrator by default
- **ORCH-03**: Orchestrator can dispatch work to specific sessions
- **ORCH-04**: Orchestrator can follow up on stalled threads and synthesize current state
- **ORCH-05**: Peer sessions attempt to resolve questions among themselves before escalating to human

### Visibility

- **VIS-01**: Human can view a timeline/transcript of collaboration activity in a space
- **VIS-02**: Human can see which sessions are participating and their current status
- **VIS-03**: Session collaboration metadata (role, progress, focus) is visible to other participants
- **VIS-04**: Human can intervene by sending messages without acting as the transport layer
- **VIS-05**: Native interruptions (permission prompts, auth) are surfaced as visible blockers, not absorbed

### Adapters

- **ADPT-01**: At least two distinct runtime adapters exist (proving cross-runtime collaboration)
- **ADPT-02**: Adapters translate between runtime-native interaction and the normalized protocol
- **ADPT-03**: Adapter logic is thin — policy and routing live in the core, not duplicated per adapter

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Delivery Polish

- **DLVR-01**: Messages provide ordering guarantees scoped per thread
- **DLVR-02**: Read receipts or delivery confirmation visible to sender
- **DLVR-03**: Reconnect continuity with session tokens and device pairing

### Team & Access Control

- **TEAM-01**: Space supports owner/member/guest roles with scoped permissions
- **TEAM-02**: Audit-friendly collaboration log exportable for compliance
- **TEAM-03**: Federated identity / SSO for enterprise teams

### Extensibility

- **EXT-01**: Harness hooks for richer artifact exchange beyond plain messages
- **EXT-02**: Optional trace capture with redaction pipeline
- **EXT-03**: Policy engine for data residency and allowlisted peers

## Out of Scope


| Feature                                     | Reason                                                         |
| ------------------------------------------- | -------------------------------------------------------------- |
| Hosted autonomous agent execution           | Violates existing-runtime-first and BYO agents principles      |
| Full workspace / codebase sync              | Violates local context stays local; huge data liability        |
| Ambient discovery (LAN/VPN auto-detect)     | Violates explicit opt-in; creates surveillance risk            |
| Replace native approval/auth/prompt UX      | Explicitly out of scope; native interruptions stay native      |
| Git conflict resolution / merge bots        | Different product category; surface branch/PR pointers instead |
| Persistent cross-session memory platform    | Out of product boundary per design principles                  |
| Omnibus harness framework in v1             | Conflicts with narrow tool-layer semantics                     |
| Full reasoning/tool trace export by default | Privacy/IP concerns; prefer decision-oriented human logs       |


## Traceability

Which phases cover which requirements. Updated during roadmap creation.


| Requirement | Phase | Status   |
| ----------- | ----- | -------- |
| PROTO-01    | 1     | Complete |
| PROTO-02    | 1     | Complete |
| PROTO-03    | 1     | Complete |
| PROTO-04    | 1     | Complete |
| SESS-01     | 2     | Pending  |
| SESS-02     | 2     | Pending  |
| SESS-03     | 2     | Pending  |
| SESS-04     | 2     | Pending  |
| SESS-05     | 2     | Pending  |
| SPACE-01    | 2     | Pending  |
| SPACE-02    | 2     | Pending  |
| SPACE-03    | 2     | Pending  |
| SPACE-04    | 2     | Pending  |
| SPACE-05    | 2     | Pending  |
| SPACE-06    | 2     | Pending  |
| MSG-01      | 3     | Pending  |
| MSG-02      | 3     | Pending  |
| MSG-03      | 3     | Pending  |
| MSG-04      | 3     | Pending  |
| MSG-05      | 3     | Pending  |
| ORCH-01     | 3     | Pending  |
| ORCH-02     | 3     | Pending  |
| ORCH-03     | 3     | Pending  |
| ORCH-04     | 3     | Pending  |
| ORCH-05     | 3     | Pending  |
| VIS-01      | 6     | Pending  |
| VIS-02      | 6     | Pending  |
| VIS-03      | 5     | Pending  |
| VIS-04      | 6     | Pending  |
| VIS-05      | 7     | Pending  |
| ADPT-01     | 5     | Pending  |
| ADPT-02     | 4     | Pending  |
| ADPT-03     | 4     | Pending  |


**Coverage:**

- v1 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0

---

*Requirements defined: 2026-04-09*
*Last updated: 2026-04-09 after roadmap creation*