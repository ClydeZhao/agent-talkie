# Phase 4: Collaboration semantics, metadata & adapter edge - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 04-collaboration-semantics-metadata-adapter-edge
**Areas discussed:** Orchestrator routing, Metadata schema & propagation, Adapter ingress pattern, Stdio adapter specifics

**User constraints stated upfront:**
- Adapters must NOT become a second transport architecture — translate native I/O into the same client/envelope model
- Metadata must stay small and collaboration-layer-owned — not a backdoor for full local context sync

---

## Orchestrator Routing

| Option | Description | Selected |
|--------|-------------|----------|
| Role field on session metadata | Any session declares role: "orchestrator" via metadata | |
| First session to join | Automatic, no declaration needed | |
| Explicit CLI/protocol command | Session sends a control message to claim orchestrator role | ✓ |

**User's choice:** Explicit CLI/protocol control action — relay stores one authoritative orchestrator session per space. Metadata may reflect role for display but is not the source of truth for routing. No self-declaration split-brain.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Reject with error | Relay returns protocol error, no orchestrator assigned | ✓ |
| Fall back to space broadcast | Deliver to all space members | |
| Queue until orchestrator designated | Hold message, deliver when someone claims orchestrator | |

**User's choice:** Reject with clear protocol error. Do not silently broadcast, do not queue. Client should prompt human to designate an orchestrator or choose a target.

---

| Option | Description | Selected |
|--------|-------------|----------|
| New envelope types for all | Specific control types for assign, follow-up, consolidate | |
| Convention in conversation only | Regular conversation envelopes with structured payload | |
| Hybrid | Assignment as control message, follow-up as conversation | ✓ |

**User's choice:** Hybrid — task assignment as control message with explicit protocol semantics; follow-up and question consolidation as regular conversation messages with structured payload conventions. Avoid full task engine.

---

## Metadata Schema & Propagation

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal set | role, focus, progress (enum), blockedReason | ✓ |
| Extended set | Add lastActivity, currentFile, estimatedCompletion | |
| Custom fields | User defines | |

**User's choice:** Minimal set — role, focus, progress, blockedReason. Small and collaboration-layer-owned. No currentFile. Automatic freshness like lastActivity can exist as system-managed status but should not expand the semantic metadata contract.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Broadcast on change | Push control message on update | |
| Poll/query | Sessions request snapshot | |
| Both | Broadcast for live + query for recovery | ✓ |

**User's choice:** Both — broadcast metadata changes to live sessions, plus explicit query for late joiners/reconnecting sessions. Broadcast is incremental updates; query is current-state recovery.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Field-level classification | Each field tagged auto/human, relay enforces | |
| Convention only | All writeable, distinction documented | |
| Separate namespaces | Status object (auto) + profile object (human), relay enforces per namespace | ✓ |

**User's choice:** Separate namespaces — auto-refresh fields in `status`, human-controlled in `profile`. Relay enforces write rules per namespace. Sessions may self-update status but cannot silently self-edit role.

---

## Adapter Ingress Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone process | Separate process, reads native I/O, connects to relay | |
| Library | Imported into runtime extension, runs in-process | |
| Both documented | Pattern with two reference forms | ✓ |

**User's choice:** Both — adapter is a pattern, not a single process shape. Standalone for stdio/CLI runtimes, in-process library for plugin-capable runtimes. Both use same client/envelope model.

---

| Option | Description | Selected |
|--------|-------------|----------|
| On behalf of runtime | Session represents the native agent, adapter invisible | ✓ |
| Own session | Adapter registers as its own session | |
| Transparent proxy | Passes through native registration | |

**User's choice:** On behalf of the runtime — visible session represents the native agent, adapter is invisible plumbing at the product layer.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Shared client library | @agent-talkie/client with connect, handshake, register, send, receive | ✓ |
| Adapter-only | Each adapter implements own WebSocket logic | |
| Minimal helpers | Utility functions but not full client | |

**User's choice:** Yes — ship shared session client library as canonical integration surface. Adapters import this.

---

## Stdio Adapter Specifics

| Option | Description | Selected |
|--------|-------------|----------|
| JSON-lines | Newline-delimited JSON | |
| Length-prefix | 4-byte big-endian length + JSON | |
| Content-Length header | HTTP-style Content-Length + JSON body | ✓ |

**User's choice:** Content-Length framing — familiar from LSP/DAP, robust for multiline payloads.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Drop oldest | Bounded queue, drop oldest when full, log warning | ✓ |
| Backpressure | Stop reading WebSocket when full | |
| Drop newest | Reject incoming with overload error | |

**User's choice:** Drop oldest — bounded queue with configurable max. Lost messages recoverable via transcript. Adapter stays responsive.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Stderr warning + metric | Structured stderr warning, increment counter | ✓ |
| Protocol error to relay | Control message indicating loss | |
| Both | Stderr + protocol notification | |

**User's choice:** Stderr warning + metric — overflow is adapter-edge concern, not relay protocol event.

---

## Agent's Discretion

- Exact control message types and payload schemas for orchestrator designation and task assignment
- Metadata query response format and pagination
- Shared client library API design
- Stdio adapter queue size default and configuration mechanism
- Content-Length framing parser implementation details
- Adapter lifecycle management

## Deferred Ideas

None — discussion stayed within phase scope
