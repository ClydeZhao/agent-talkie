# Phase 1: Protocol & transport foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 01-protocol-transport-foundation
**Areas discussed:** Default transport mechanism, Relay lifecycle, Architectural hard constraints
**Trigger:** User-initiated architectural pivot — removing NATS + Postgres as default dependencies

---

## Architectural Hard Constraints (user-provided, pre-decided)

User entered the discussion with locked constraints, not as gray areas:

- Default = zero external services
- `npm install` / `npx` must work immediately
- NATS and Postgres cannot be default dependencies
- SQLite as default metadata store
- JSON/MD/JSONL as export/debug artifacts only
- No explicit solo/local/team mode switching — local-first, multi-participant via invite/join

These were accepted as hard constraints, not discussed as options.

---

## Default Transport Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Embedded localhost WebSocket relay | First session starts relay, same protocol for local/remote | |
| WebSocket relay + stdio bridge (layered) | Core = relay-based WS; stdio as adapter edge concern | ✓ |
| Unix domain socket / IPC | Pure local, no remote support | |

**User's choice:** Layered architecture — core transport is relay-based WebSocket (same protocol for localhost and remote, only address differs). stdio bridge is a separate adapter ingress concern, not the system's transport model. These two layers must be architecturally distinct.

**Notes:** User explicitly rejected mixing transport model with adapter ingress mechanism. The relay protocol is the canonical transport; adapter ingress (WS client, stdio, etc.) is how each adapter connects to the relay.

---

## Relay Process Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Embedded in first session | Relay inside session process, migrates or dies with it | |
| Independent daemon | Auto-spawn on first need, auto-shutdown when all sessions exit | ✓ |
| Explicit CLI start | User manually starts relay via command | |
| Claude decides | Defer to researcher/planner | |

**User's choice:** Independent daemon process — Docker daemon-style lifecycle.

**Notes:** None.

---

## Control vs Conversation Separation

Not explicitly selected as a gray area, but resolved as consequence of transport decisions: separation happens at protocol/semantic layer via envelope `type` field, not at transport layer (no NATS subject hierarchy needed).

---

## Impact Assessment

### Preserved from prior context
- D-01, D-02 (envelope design)
- D-05, D-06 (schema evolution)
- All Plan 01-01 code (envelope.ts, idempotency.ts, errors.ts)

### Invalidated
- D-03, D-04, D-07, D-08 (NATS-specific transport decisions)
- Plan 01-02 (NATS subject builders)
- Plan 01-03 (Docker Compose NATS/Postgres + JetStream dedup)
- STACK.md as normative reference (demoted to optional team/remote reference)

---

## Claude's Discretion

- WebSocket frame format
- Relay daemon port selection
- SQLite schema design
- Test harness approach

## Deferred Ideas

- NATS transport plugin for team/remote mode
- Postgres as alternative metadata store
- Relay clustering
- Binary protocol (protobuf)
