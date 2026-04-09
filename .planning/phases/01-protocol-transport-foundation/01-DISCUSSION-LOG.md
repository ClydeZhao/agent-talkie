# Phase 1: Protocol & transport foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 1-protocol-transport-foundation
**Areas discussed:** Envelope design, Transport selection, Schema evolution strategy, Channel topology
**Mode:** --auto (all choices are recommended defaults)

---

## Envelope Design


| Option                     | Description                                                                                | Selected |
| -------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| Comprehensive from day one | Include all metadata fields (version, id, thread, sender, space, type, timestamp, payload) | ✓        |
| Minimal starter            | Start with version + id + type only, add fields as needed                                  |          |


**User's choice:** [auto] Comprehensive from day one (recommended default)
**Notes:** Research warns against stringly-typed payloads as tech debt (PITFALLS.md). Starting comprehensive avoids costly envelope migrations later.

---

## Transport Selection


| Option           | Description                                                         | Selected |
| ---------------- | ------------------------------------------------------------------- | -------- |
| NATS + JetStream | Subject routing, request/reply, durable mailboxes, polyglot clients | ✓        |
| WebSocket-direct | Simpler setup, limited to browser-friendly runtimes                 |          |
| Redis Pub/Sub    | Familiar, but weaker routing and durability semantics               |          |


**User's choice:** [auto] NATS + JetStream (recommended default)
**Notes:** STACK.md research recommends NATS 2.12.x. Subject-based routing maps naturally to spaces/sessions. JetStream provides durability.

---

## Schema Evolution Strategy


| Option                             | Description                                                           | Selected |
| ---------------------------------- | --------------------------------------------------------------------- | -------- |
| Strict rejection with upgrade path | Reject unknown versions with clear error and documented upgrade       | ✓        |
| Graceful degradation               | Best-effort interpretation of unknown fields, ignore unknown versions |          |


**User's choice:** [auto] Strict rejection with upgrade path (recommended default)
**Notes:** Research pitfall CP-2 warns against happy-path-only protocols. Strict rejection catches mismatches early.

---

## Channel Topology


| Option                            | Description                                                        | Selected |
| --------------------------------- | ------------------------------------------------------------------ | -------- |
| Separate NATS subject hierarchies | Different subjects for control vs conversation traffic             | ✓        |
| Single channel with type field    | All traffic on same subjects, distinguished by envelope type field |          |


**User's choice:** [auto] Separate NATS subject hierarchies (recommended default)
**Notes:** Research recommends separating control from conversation (CP-3). Enables independent scaling and monitoring.

---

## Claude's Discretion

- Exact Zod schema field types and validation rules
- NATS subject naming details beyond the convention
- JetStream stream configuration
- Test harness approach

## Deferred Ideas

None — discussion stayed within phase scope.