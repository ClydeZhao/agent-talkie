# Roadmap: agent-talkie

## Overview

Ship a collaboration layer where named sessions join opt-in spaces, exchange versioned messages through a relay with orchestrator semantics and peer-first escalation, connect via two thin runtime adapters, expose collaboration metadata and a human oversight surface, then harden delivery and trust boundaries. Phases follow protocol → identity & spaces → routing & orchestration → first adapter → metadata plus second adapter → human surface → hardening.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- **Phase 1: Protocol & transport foundation** - Versioned envelopes, idempotency, control vs conversation, schema rejection
- **Phase 2: Session identity, spaces & membership** - Stable session model, lifecycle, named spaces, opt-in join/leave/revoke, multi-human membership
- **Phase 3: Relay, routing & orchestration** - Session-addressed messaging, threads, at-least-once delivery, orchestrator role and peer-first escalation
- **Phase 4: First runtime adapter** - Thin translation to protocol, policy stays in core; end-to-end dogfood on one runtime
- **Phase 5: Collaboration metadata & second adapter** - Role/progress/focus visible to participants; second runtime proves cross-runtime wedge
- **Phase 6: Human oversight surface** - Transcript, participant status, intervention without being the transport layer
- **Phase 7: Hardening, security & scale** - Native blockers surfaced honestly; auth, limits, retention, redaction, recovery readiness

## Phase Details

### Phase 1: Protocol & transport foundation

**Goal**: A versioned, enforceable message contract and transport semantics exist so adapters and relay share one truth.
**Depends on**: Nothing (first phase)
**Requirements**: PROTO-01, PROTO-02, PROTO-03, PROTO-04
**Success Criteria** (what must be TRUE):

1. A sender can emit a message whose envelope includes schema version, message id, and thread scope, and receivers can interpret it consistently.
2. Duplicate submissions with the same idempotency key do not create duplicate logical effects in the collaboration layer.
3. Control traffic (join, leave, metadata updates) is distinguishable from conversation traffic on the wire or in the same documented channel split.
4. Clients sending an unsupported schema version receive a clear rejection and a documented upgrade path.

**Plans:** 2/3 plans executed

Plans:

- 01-01-PLAN.md — Monorepo, Zod envelope, idempotency guard, JSON Schema, schema rejection (PROTO-01, PROTO-02, PROTO-04)
- 01-02-PLAN.md — Relay route keys from envelope.type; TalkieTransport types; thread_id token parity with space_id (PROTO-01, PROTO-03)
- 01-03-PLAN.md — Embedded WebSocket relay + SQLite idempotency; ingress parseEnvelope + size cap; Vitest without Docker (PROTO-01–PROTO-04)

### Phase 2: Session identity, spaces & membership

**Goal**: Sessions and spaces are first-class: stable identity, explicit membership, and multi-human participation without ambient discovery.
**Depends on**: Phase 1
**Requirements**: SESS-01, SESS-02, SESS-03, SESS-04, SESS-05, SPACE-01, SPACE-02, SPACE-03, SPACE-04, SPACE-05, SPACE-06
**Success Criteria** (what must be TRUE):

1. After reconnect or runtime restart, a session is still the same logical participant (stable identity) within a space.
2. A human can give a session a readable name; if names collide, the system disambiguates so routing is unambiguous.
3. Other participants can see which runtime family a session uses and workspace pointers (repo, branch, root) as collaboration metadata.
4. A human can create a named space; sessions join only through an explicit opt-in action; they can leave; owners can revoke membership.
5. Multiple humans can participate in the same space with their own local sessions; membership survives typical runtime restarts for that session.
6. Session lifecycle states (active, idle, blocked, error) are visible for coordination.

**Plans**: TBD

### Phase 3: Relay, routing & orchestration

**Goal**: Messages flow between sessions in a space with orchestrator defaults and peer-first resolution paths.
**Depends on**: Phase 2
**Requirements**: MSG-01, MSG-02, MSG-03, MSG-04, MSG-05, ORCH-01, ORCH-02, ORCH-03, ORCH-04, ORCH-05
**Success Criteria** (what must be TRUE):

1. A session can send a message to another named session in the same space, and it reaches intended recipients—not “the Cursor runtime” as an opaque target.
2. A session can broadcast to all sessions in a space.
3. Multi-turn exchanges use structured/threaded units so conversation context does not collapse into a flat firehose.
4. Within a space, delivery is at-least-once with deduplication behavior consistent with the protocol.
5. A designated orchestrator receives human-to-space input by default, can dispatch work to specific sessions, and can follow up on stalled threads with an understandable summary of state.
6. Peers attempt to resolve questions among themselves before escalating to a human.

**Plans**: TBD

### Phase 4: First runtime adapter

**Goal**: One real runtime is connected end-to-end with thin adapter logic and core-owned policy.
**Depends on**: Phase 3
**Requirements**: ADPT-02, ADPT-03
**Success Criteria** (what must be TRUE):

1. From the chosen runtime, a user can perform join/send/receive flows that map to the normalized protocol without hand-copying payloads.
2. Runtime-specific quirks are translated at the edge; routing, orchestration, and membership rules are not reimplemented inside the adapter.

**Plans**: TBD

### Phase 5: Collaboration metadata & second adapter

**Goal**: Collaboration metadata is legible across participants, and two distinct runtimes prove cross-runtime collaboration.
**Depends on**: Phase 4
**Requirements**: ADPT-01, VIS-03
**Success Criteria** (what must be TRUE):

1. At least two distinct runtime adapters are in use and can participate in the same space scenarios.
2. Role, progress, and focus for sessions are stored and exposed by the collaboration layer so other sessions (and oversight tools) can see them.

**Plans**: TBD

### Phase 6: Human oversight surface

**Goal**: Humans can supervise and intervene without becoming the message bus.
**Depends on**: Phase 5
**Requirements**: VIS-01, VIS-02, VIS-04
**Success Criteria** (what must be TRUE):

1. A human can open a view of collaboration activity in a space as a timeline or transcript suitable for understanding what happened.
2. A human can see which sessions are in the space and their current status at a glance.
3. A human can send messages into the space (e.g., to the orchestrator path) without manually shuttling peer content between tools.

**Plans**: TBD
**UI hint**: yes

### Phase 7: Hardening, security & scale

**Goal**: Trust, operations, and UX honesty meet team-scale expectations; native runtime interruptions stay visible.
**Depends on**: Phase 6
**Requirements**: VIS-05
**Success Criteria** (what must be TRUE):

1. Permission prompts, auth flows, and other native interruptions in connected runtimes show up as visible blockers in the oversight model—not silently absorbed by the collaboration layer.
2. Access between relay/adapters and control plane reflects explicit authentication (no permanent anonymous bearer join).
3. Abuse and overload are bounded by documented rate limits or backpressure behavior appropriate for v1.
4. Retention, redaction defaults, and recovery expectations for collaboration logs are documented and reflected in behavior where applicable.

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 2 → 2.1 → 2.2 → 3 → 3.1 → 4


| Phase                                      | Plans Complete | Status      | Completed |
| ------------------------------------------ | -------------- | ----------- | --------- |
| 1. Protocol & transport foundation         | 2/3 | In Progress|  |
| 2. Session identity, spaces & membership   | 0/TBD          | Not started | -         |
| 3. Relay, routing & orchestration          | 0/TBD          | Not started | -         |
| 4. First runtime adapter                   | 0/TBD          | Not started | -         |
| 5. Collaboration metadata & second adapter | 0/TBD          | Not started | -         |
| 6. Human oversight surface                 | 0/TBD          | Not started | -         |
| 7. Hardening, security & scale             | 0/TBD          | Not started | -         |
