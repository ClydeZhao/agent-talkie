# Phase 2: Relay — WebSocket, validate, route - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 02-relay-websocket-validate-route
**Areas discussed:** Space lifecycle, Transcript persistence, Reconnect & session recovery

---

## Offline Delivery (pre-decided)

| Option | Description | Selected |
|--------|-------------|----------|
| Queue for reconnect | Queue messages for disconnected sessions | |
| Drop | Drop messages if target is offline | |
| No durable offline mailbox | Route to connected sessions only in v1 | ✓ |

**User's choice:** No durable offline mailbox in v1. Disconnected target sessions do not get long-term offline delivery.
**Notes:** User stated this upfront when selecting discussion areas. Prioritized space lifecycle, transcript, and reconnect instead.

---

## Space Lifecycle

### Space Creation

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit create | Must send create-space control message, get space ID, then join | |
| Implicit on first join | Join auto-creates if space doesn't exist (create-or-join) | |
| Name-based | Human-readable name, first join auto-creates, repeat name joins existing | |
| Custom | User-defined approach | ✓ |

**User's choice:** Human-readable slug as join target, backed by internal stable space ID. First join auto-creates. No mandatory create-space step. Keep room for invite/permission rules later — create-or-join must not erase ownership or authorization boundaries.
**Notes:** Combines name-based with explicit separation of slug vs internal ID.

### Space Teardown

| Option | Description | Selected |
|--------|-------------|----------|
| Persist forever | Space and transcript records stay in SQLite forever | |
| Idle cleanup | Last member leaves → timer → soft delete (archived) | ✓ |
| Explicit delete | Space persists until someone explicitly deletes it | |

**User's choice:** Archive-then-expire. Last member leaves → inactive. Retained for bounded TTL. During TTL, rejoin same slug revives space. After TTL, garbage-collectible.
**Notes:** Metadata retention and transcript retention should be treated as separate concerns.

---

## Transcript Persistence

### Storage Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full body store | Store complete envelope payload, supports replay/query | |
| Metadata + pointers | Only store sender, target, timestamp, seq — no payload | |
| Hybrid | Full control messages, metadata-only for conversations | |
| Custom | User-defined approach | ✓ |

**User's choice:** Full body storage for both control and conversation messages, with bounded retention. For timeline/replay/human oversight, not offline mailbox. Planner should include size caps, retention TTL, and export/archive policy.
**Notes:** Retention is separate from space lifecycle. Not infinite.

### Access Method

| Option | Description | Selected |
|--------|-------------|----------|
| Pull on join | Relay sends recent N messages as catch-up on join | |
| Explicit query | Client sends transcript-request with range (seq/time) | |
| Both | Auto catch-up on join + explicit query for deeper history | ✓ |
| Claude decides | | |

**User's choice:** Both. Default join auto catch-up with bounded configurable window. Clients also support explicit transcript queries for deeper history.
**Notes:** Default catch-up must be bounded, not "load everything."

---

## Reconnect & Session Recovery

### Identity Recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Session token | Relay issues token on first connect, used for resume | |
| Client presents ID | Client persists UUID v7, tells relay who it is | |
| ID + secret | Client persists ID + reconnect secret to prevent spoofing | ✓ |
| Claude decides | | |

**User's choice:** Session ID + reconnect secret. Client persists both locally. Lightweight session-resume credential, not full remote auth. Keep room for stronger trust later.
**Notes:** Handshake should stay simple now.

### State Recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Full restore | Membership + missed messages + resend unacked outbound | |
| Membership + catch-up | Membership + missed messages via catch-up, no outbound resend | ✓ |
| Membership only | Only restore membership, client queries transcript manually | |
| Claude decides | | |

**User's choice:** Membership + catch-up. Restores space membership, sends bounded catch-up for missed messages. No resend of pre-disconnect unacked outbound in v1.
**Notes:** Keep simple and transcript-based, not a reliable-delivery queue.

### Reconnect Window

| Option | Description | Selected |
|--------|-------------|----------|
| Same as space TTL | Can reconnect as long as space is alive | |
| Independent session TTL | Session has its own shorter expiry | ✓ |
| Claude decides | | |

**User's choice:** Independent session TTL, separate from space TTL. If expired, client must rejoin as new session. Planner picks bounded simple default.
**Notes:** Space may still exist after a session's resume window has expired.

---

## Claude's Discretion

- WebSocket library choice
- Exact SQLite table schemas
- Catch-up window defaults
- Session and space TTL default values
- Reconnect secret generation
- GC scheduling
- Error response format
- Heartbeat interval

## Deferred Ideas

None — discussion stayed within phase scope.
