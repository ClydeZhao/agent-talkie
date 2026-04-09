# Project Research Summary

**Project:** agent-talkie  
**Domain:** Cross-runtime real-time collaboration layer for coding-agent sessions (messaging, collaboration metadata, thin adapters)  
**Researched:** 2026-04-09  
**Confidence:** **MEDIUM-HIGH** overall — stack and pitfalls grounded in established infra patterns; features and architecture extrapolate from adjacent products and need user validation

## Executive Summary

agent-talkie is a **collaboration layer**, not a hosted agent platform: independently running sessions (Cursor, Claude Code, Codex, etc.) join shared **spaces**, exchange messages and **collaboration metadata** (role, progress, focus) through a normalized protocol, and route **peer-first** before escalating to an **orchestrator** or human. Experts in this shape of system converge on a **thin core** (routing, ACL, session registry) plus **runtime-specific adapters**, with **physical relay/broker** delivery even when the product narrative is “sessions talk directly.” Research recommends **NATS Server + JetStream** as the primary message plane (subject routing, request/reply for orchestrator-style calls, durable mailboxes without Kafka-scale ops), **Hono** for an HTTP control plane, and **PostgreSQL + Drizzle** as the system of record for spaces, memberships, and audit-friendly metadata—aligned with PROJECT.md’s “metadata belongs to the collaboration layer” and local-first posture.

The **MVP path** is explicit: named stable **session identity**, opt-in space membership, **session-to-session messaging** across at least two runtime adapters, **threaded / multi-turn** structure, orchestrator role with clear routing, human-visible transcript and basic status, collaboration metadata in the layer, and **workspace pointers** (repo/branch/root)—manual in v1 is acceptable. Anti-features are equally clear: hosted execution fleets, full workspace sync, ambient discovery, replacing native approval UX, omnibus harness frameworks in v1, and scope creep into git merge bots or global memory platforms.

**Primary risks** are integration and semantics, not picking a trendy framework: **ambiguous primitives** (runtime brand vs session id), **happy-path-only protocols** (no versioning, idempotency, or scoped ordering), **orchestrator split-brain**, **adapter complexity explosion** (logic duplicated per runtime), and **trust mistakes** (ambient membership, secret leakage in logs). Mitigations are spelled out in PITFALLS.md: first-class session lifecycle, envelope contract from day one, persisted orchestrator with atomic handoff, core/runtime-agnostic discipline with capability negotiation, and join flows plus redaction as non-negotiables—not late hardening.

## Key Findings

### Recommended Stack

Prefer a **NATS-centric** data plane: **NATS Server 2.12.6** (pin; track patches) with **JetStream** for durability where needed; **@nats-io/transport-node** + **@nats-io/jetstream** (~3.3.1) for Node/TS—not legacy `nats@2.x`. Use **Hono** (~4.12.x) for HTTP (auth, space/session admin, health). Persist collaboration metadata in **PostgreSQL 16+** via **Drizzle** (~0.45.x) and **postgres** driver (~3.4.x). Validate application JSON with **Zod** (~4.3.x). Optional: **ioredis** for TTL/ephemeral state or Socket.IO scale-out; **Socket.IO** or **ws** at the edge for browser-heavy clients—**do not** make Socket.IO the sole cross-runtime truth; keep **one** envelope schema behind transports. **JSON + Zod** default; Protobuf only if cross-language strict IDL justifies cost. Refresh exact patch pins before implementation.

**Core technologies:**

- **NATS + JetStream** — routing, fan-out, request/reply, optional durable mailboxes; fits spaces/sessions and heterogeneous runtimes.
- **Hono** — web-standards HTTP control plane; multi-runtime hosting options.
- **PostgreSQL + Drizzle** — ACID metadata (spaces, roles, audit); JSONB for evolution.
- **Zod** — versioned envelopes and config; JSON Schema export for non-TS adapters.

### Expected Features

See [FEATURES.md](./FEATURES.md) for full tables and dependency graph.

**Must have (table stakes):**

- Stable **session identity**, join/leave/revoke, durable space membership — without these, routing and trust fail.
- **Delivered** session-to-session messaging with threading/structure — flat firehose breaks “conversation first.”
- **Addressing by session**, not brand alone — core to the product and to correctness.
- **Orchestrator** semantics plus peer → orchestrator → human escalation — avoids humans as middleware.
- Human-visible **transcript** and **status** (active, idle, blocked); collaboration **metadata** (role, progress, focus) owned by the layer.
- **Workspace pointers** and **explicit opt-in**; **multi-human, multi-session** same space — stated team scenario.

**Should have (competitive):**

- **Cross-runtime linking** (the wedge), **multi-turn negotiation**, **BYO execution**, **local-first** positioning with clear disclosure of what left the machine.
- **Peer-first resolution** and a **human-optimized timeline** (decisions, blockers, handoffs)—not full trace export by default.

**Defer (v2+):**

- Rich delivery polish (read receipts, etc.) until pain appears; **minimal RBAC/audit** after first team traction; **federated identity / policy engine / redacted trace pipelines** only with pulled demand.

### Architecture Approach

See [ARCHITECTURE.md](./ARCHITECTURE.md) for diagrams and data flows.

Build a **collaboration core** (spaces, session registry, routing, metadata schema, ACL) with a **transport/relay**, **metadata store**, and **runtime adapters** that only translate to/from a **normalized envelope**. **Logical** peer addressing with **physical relay** (on-device or team-owned). **Orchestrator** is a **role** on a normal session plus routing policy—not the only message path. Suggested repo shape: `packages/core`, `protocol`, `relay`, `adapters/*`, `human-app`; **adapters must not import each other**. Recommended build order: **protocol + envelope model** → **core routing/ACL** (in-memory first) → **minimal relay** → **first adapter** → **metadata patches** → **second adapter** → **human surface** → hardening. **Critical path:** protocol → relay → first adapter.

**Major components:**

1. **Human surface** — spaces, membership, transcript, intervention; does not replace native runtime approval UX.
2. **Collaboration core** — lifecycle, identity, routing, orchestrator binding; does not absorb full workspace by default.
3. **Transport / relay** — fan-out, reconnect, optional persistence; no runtime-specific tool protocols inside.
4. **Metadata store** — roles, progress, focus, pointers; no raw secrets or full trees without explicit share.
5. **Runtime adapters** — opt-in, auth, local UX hooks; thin translation to `TalkieTransport`-style interface.

### Critical Pitfalls

See [PITFALLS.md](./PITFALLS.md) for full CP list, technical debt patterns, and checklists.

1. **Session vs runtime vs workspace ambiguity** — route on **`session_id` + space membership** only; define lifecycle and fork semantics; never “send to Cursor” as identity.
2. **Protocol without versioning, idempotency, or delivery semantics** — ship a narrow envelope early (`schema_version`, `message_id`, scoped ordering per thread); at-least-once + dedupe; reject unknown versions with upgrade path.
3. **Control vs conversation vs fat payloads on one channel** — separate control from conversation; cap inline size; references for blobs; optional telemetry separation.
4. **Orchestrator ambiguity / split brain** — persist `orchestrator_session_id` with atomic handoff; define behavior when orchestrator leaves; UIs read from layer state, not local guesses.
5. **Adapter complexity explosion** — keep policy in core; capability negotiation; second adapter early to kill Cursor-isms in shared code.
6. **Trust mistakes** — invite/join as explicit capability; redaction defaults; audit what left the machine; ongoing scope gates vs hosted execution and centralized memory.

## Implications for Roadmap

Suggested phases align PITFALLS “phase buckets” with ARCHITECTURE build order and FEATURES MVP. Renumber when writing `ROADMAP.md`.

### Phase 1: Protocol & transport foundation

**Rationale:** Nothing else is safe without an explicit envelope and transport semantics (CP-2, CP-3; technical debt: stringly-typed payloads, migrations).  
**Delivers:** Versioned JSON protocol (Zod + optional JSON Schema), NATS subject layout, JetStream where durability is required, separation of control vs conversation channels.  
**Addresses:** Reliable delivery + threading prerequisites; adapter-facing `TalkieTransport` abstraction.  
**Avoids:** Happy-path-only JSON; global ordering obsession—scope order per thread/space partition.

### Phase 2: Session identity, membership & core model

**Rationale:** Opt-in and RBAC attach to stable identity (CP-1, CP-6 partial).  
**Delivers:** Session registry, lifecycle states, space membership, join/invite/revoke; Postgres schema via Drizzle.  
**Addresses:** Table stakes from FEATURES (identity, membership, explicit opt-in).  
**Avoids:** Ambiguous routing keys; ambient discovery.

### Phase 3: Minimal relay + routing + orchestrator binding

**Rationale:** Core routing and single-writer orchestrator state before scaling adapters (CP-4, performance: fan-out, partitioning).  
**Delivers:** Message submit → resolve recipients → fan-out; persisted `orchestrator_session_id`; peer-first escalation rules; timeouts / nudge paths.  
**Addresses:** Orchestrator role, peer-first policy, structured messaging paths.  
**Avoids:** Orchestrator-only bottleneck for all peer clarification (keep peer paths open).

### Phase 4: First runtime adapter (end-to-end dogfood)

**Rationale:** Critical path validation; forces real envelope and auth (CP-5, integration gotchas).  
**Delivers:** One deep adapter (deepest engagement runtime) + conformance checklist.  
**Addresses:** Cross-runtime messaging MVP across one runtime to the relay/core.  
**Avoids:** Business logic duplicated in adapter; undocumented vendor API reliance without a plan.

### Phase 5: Metadata patches + second adapter

**Rationale:** Legibility for humans/peers and generalization away from first runtime (ARCHITECTURE ordering).  
**Delivers:** Metadata patch pipeline; second adapter with parity scenarios.  
**Addresses:** Collaboration metadata in layer; true “two distinct runtimes” wedge.  
**Avoids:** Second adapter as demo-only path (see “Looks Done But Isn’t” checklist).

### Phase 6: Human surface & oversight UX

**Rationale:** Oversight and intervention without being the message bus; surfaces orchestrator and delivery honestly (UX pitfalls).  
**Delivers:** Transcript, status, membership UI/TUI; intervention to orchestrator; clear “what left the machine.”  
**Addresses:** Human-visible transcript, basic status, multi-human visibility.  
**Avoids:** False “delivered” semantics; notification overload without controls.

### Phase 7: Hardening, security & scale

**Rationale:** CP-6 logging/redaction, security table, recovery strategies, performance traps.  
**Delivers:** Auth between relay and adapters, rate limits, retention, redaction, recovery playbooks; optional Redis/Socket.IO scale pieces if needed.  
**Addresses:** Team-scale readiness triggers (RBAC/audit when justified).  
**Avoids:** Permanent bearer invites; trusting client-supplied `sender_session_id` without server attestation.

### Phase Ordering Rationale

- **Protocol and identity before adapters** — avoids rewrites when delivery or session semantics change (CP-2, CP-1).  
- **Relay + routing before “second runtime”** — proves fan-out, orchestrator persistence, and partitioning assumptions (CP-3, CP-4, performance).  
- **Two adapters before heavy polish** — prevents core drift toward a single vendor (CP-5).  
- **Human surface after first vertical slice** — early dogfood can be developer-driven, but shipping “collaboration layer” without oversight risks trust UX debt (CP-6, UX pitfalls).

### Research Flags

**Likely need `/gsd-research-phase` or dedicated spike during planning:**

- **Per-runtime adapter phases** — Cursor / Claude Code / Codex APIs and limits change often; PITFALLS notes **adapter research** before parity promises.
- **Human surface + delivery UX** — align UI claims with actual semantics (server accepted vs displayed in peer).
- **Optional MCP alignment** — STACK marks MCP-as-profile **MEDIUM** confidence; validate against current spec/host behavior if adapters expose MCP.

**Standard patterns (lighter research):**

- **NATS + JetStream** basics, **Postgres + Drizzle** CRUD/migrations, **Hono** HTTP routes — well-documented; refresh versions at scaffold time.
- **Distributed messaging hygiene** (idempotency, per-thread ordering) — textbook patterns; encode in protocol reviews rather than greenfield research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** (NATS path) | Verified server release, npm pins, Context7/docs; refresh patches before lockfile. |
| Features | **MEDIUM** | Strong adjacent-industry grounding; sparse direct “multi-IDE agent bridge” comparables—validate with users. |
| Architecture | **MEDIUM** | Consistent with MCP-style layering and common relay patterns; not validated against shipped agent-talkie. |
| Pitfalls | **MEDIUM-HIGH** | Messaging/integration patterns are well-trodden; runtime-specific failure modes remain vendor-dependent. |

**Overall confidence:** **MEDIUM-HIGH** for engineering direction; **MEDIUM** for product feature prioritization until validated.

### Gaps to Address

- **User research** — confirm MVP feature set and escalation/orchestrator UX (FEATURES confidence note).
- **Runtime API drift** — per-adapter research pass before roadmap commitments on parity.
- **MCP / spec fetch reliability** — treat optional alignment as validated during adapter design, not as blocking v1 wire format.
- **Six-month version pins** — STACK recommends refreshing minor/patch pins at implementation time.

## Sources

Aggregated from research artifacts and their citations. See each file for full bibliographies.

### Primary (stack & infra)

- [STACK.md](./STACK.md) — Context7 `/nats-io/nats.js`, `/websites/hono_dev`; [NATS Server releases](https://github.com/nats-io/nats-server/releases/latest); [Socket.IO v4 install](https://socket.io/docs/v4/server-installation); npm `npm view` on 2026-04-09.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — [MCP architecture overview](https://modelcontextprotocol.io/docs/concepts/architecture); PROJECT.md as product authority.

### Primary / secondary (features & product boundary)

- [FEATURES.md](./FEATURES.md) — LangGraph/LangSmith, AutoGen, CrewAI, GitHub enterprise AI controls, industry orchestration summaries; used for expectations, not feature parity.
- [.planning/PROJECT.md](../PROJECT.md) — requirements, principles, out-of-scope (authoritative for boundaries).

### Secondary / tertiary (pitfalls & patterns)

- [PITFALLS.md](./PITFALLS.md) — distributed messaging practice; [OneUptime ordering blog](https://oneuptime.com/blog/post/2026-01-24-message-ordering-event-driven/view); [Ably chat architecture](https://ably.com/blog/chat-architecture-reliable-message-ordering); [Fazm handoff bottleneck](https://fazm.ai/blog/agent-handoff-coordination-bottleneck); [Swarm Signal coordination failures](https://swarmsignal.net/multi-agent-coordination-failure-modes-and-mitigation/).

---
*Research completed: 2026-04-09*  
*Ready for roadmap: yes*
