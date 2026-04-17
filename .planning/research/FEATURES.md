# Feature Landscape — v2.0 Real-Time Web Dashboard (Oversight & Control)

**Product:** agent-talkie  
**Milestone:** v2.0 Web Dashboard (localhost relay)  
**Researched:** 2026-04-17  
**Confidence:** **MEDIUM** — synthesis from collaboration/ops-dashboard UX patterns, `PROJECT.md`, and existing relay behavior; not validated by user studies for this product.

**Scope:** Features needed for the **new** interactive web dashboard only. v1.0 collaboration-layer table stakes (protocol, relay, adapters, CLI) are **assumed shipped**; this document maps **dashboard-specific** expectations, differentiators, and anti-features.

**Authority:** `/.planning/PROJECT.md` for milestone goals and out-of-scope boundaries.

---

## How real-time collaboration dashboards usually work

Most “live oversight” surfaces combine four mechanics:

1. **Authoritative store + live fan-out** — Durable state (here: SQLite) is the source for “what happened” and membership; the UI subscribes to a **live channel** (WebSocket) for append-only or patch-style updates. Initial paint often **hydrates from the DB** (or a catch-up RPC) then **tails** the stream.
2. **Presence vs content** — **Presence** (who is connected, who is “typing”, orchestrator designation) updates frequently and is loss-tolerant at the UI frame level; **content** (transcript, metadata commits) is ordered and should not silently reorder.
3. **Progressive disclosure** — At a glance: counts, blocked flags, last activity. On demand: full transcript, filters, per-session detail.
4. **Action safety** — Mutations (message send, kick, destroy space, designate orchestrator) need **clear affordances**, **permission feedback**, and **idempotent / error-shaped** responses so the UI can recover without guessing.

For agent-talkie, the relay already implements **session-bound WebSocket**, **transcript persistence with pruning**, **routing** (broadcast, `to`, human→orchestrator default), and **space join/leave** (`packages/relay/src/router.ts`, `packages/relay/src/server.ts`). The dashboard is a **new WebSocket client** (human session) plus static assets; it should reuse the same envelope protocol rather than inventing a parallel API.

---

## v2.0 dashboard — table stakes

Without these, the dashboard does not credibly replace CLI as the **primary oversight surface** (`PROJECT.md` Active requirements).

| Feature | Why table stakes | Complexity | Depends on v1.0 infrastructure |
|--------|-------------------|------------|--------------------------------|
| **Live connection health** | User must see connected vs disconnected relay and own session binding | Low–Med | WebSocket server, session register/resume path |
| **Member roster with runtime/session identity** | Same mental model as `talkie who` / watch grid | Med | SQLite memberships + session records; join/leave events |
| **Transcript timeline (ordered, readable)** | Core “what are agents saying” surface | Med | Transcript append + `transcript.query` / catch-up on connect |
| **Basic transcript find-in-page / search** | Table stakes for any log viewer at scale | Low–Med | Client-side index or incremental search over loaded window; server search only if backlog exceeds memory |
| **Filters by sender, kind, time window** | Operators need to collapse noise (control vs conversation, human vs agent) | Med | Parsed envelope fields in UI model; may need relay to expose stable `kind`/type filters in query later |
| **Collaboration metadata chips** | Role, focus, progress, blocked — “at a glance” (`PROJECT.md`) | Med | Metadata envelopes + SQLite-backed state already owned by layer |
| **Orchestrator visibility** | Who receives undirected human traffic; matches CLI semantics | Low | `getOrchestratorSessionId` routing rules in relay |
| **Send message to space / target** | Human participates from browser | Med–High | Same envelopes as CLI client; human default-to-orchestrator rule in relay |
| **Designate / clear orchestrator** | Parity with existing control | Med | Existing collaboration control handling in relay (`handleCollaborationControl`) |
| **Space lifecycle from UI (create / destroy)** | Milestone asks for dashboard-managed spaces | Med–High | Space creation + teardown must stay consistent with SQLite and active sessions |
| **Invite / remove session** | Milestone scope; parity with “explicit membership” story | Med–High | Membership mutations + policy (owner model per `PROJECT.md` Key Decisions) |
| **Real-time updates for membership + transcript** | “Live dashboard” requirement | Med | WebSocket fan-out to members; optional: debounced refetch from DB for resilience |
| **Error surfaces from relay** | `protocol.error` codes (e.g. `no_orchestrator`, `not_in_space`) must be user-legible | Low–Med | Existing JSON error responses |

---

## v2.0 dashboard — differentiators

These are not universal for all products but **fit agent-talkie’s job** (multi-runtime agent mesh, human not as paste buffer) and are worth investing in early.

| Feature | Value proposition | Complexity | Inflection / dependency |
|--------|---------------------|------------|-------------------------|
| **Session topology / conversation graph view** | Shows *mesh vs hub* at a glance: who is addressing whom, orchestrator edges, broadcast | Med–High | Derived view from envelope `to` field + role flags; may need **derived events** or client-side graph build from transcript stream |
| **“Blocked” and attention lane** | Pulls supervisors to stalled work without reading full transcript | Med | Metadata + heuristics (e.g. last activity, explicit blocked flag) |
| **Dense “operator console” layout** | Roster + transcript + graph without tab hell; keyboard-first search | Med | Front-end engineering (Lit + Vite per `PROJECT.md` reference) |
| **CLI parity toggles** | Same commands as mental model: watch-equivalent layout presets | Low–Med | Pure UX |
| **Reconnect + transcript gap fill** | After refresh, **no missed commits**: tail from last `relaySeq` | Med | `transcript.query` with `afterSeq` already in relay router |
| **Idempotency-aware UI** | Safe retries on flaky send; matches protocol discipline | Med | Client-generated keys where protocol requires |

---

## v2.0 dashboard — anti-features

Explicit **non-goals** for this milestone (some echo `PROJECT.md` Out of Scope).

| Anti-feature | Why avoid in v2.0 | Do instead |
|--------------|-------------------|------------|
| **Second transport or shadow protocol** | Splits truth; doubles auth story | One WebSocket + versioned envelopes end-to-end |
| **General CRDT / shared document editing** | Not the product wedge | Transcript is append-only; metadata is small structured patches |
| **Heavy analytics / BI charts** | Noise vs shipping oversight | Simple counters, last-N activity |
| **Cross-machine dashboard without relay hardening** | Token/TLS deferred (`PROJECT.md`) | Localhost-only dashboard binding |
| **In-dashboard agent execution or approvals** | Violates “runtime first” boundary | Deep-link or instruct user to native client |
| **Full-text search over entire retained history in-browser** | Transcript cap + prune in relay — unbounded search is misleading | Bounded search, “load more”, optional server-side search phase later |
| **Over-automating orchestrator** | Proactive follow-ups out of scope | Clear manual designate/clear only |

---

## Category notes (for roadmap / design)

### Session topology visualization

| Approach | Good for | Complexity | Notes |
|----------|----------|------------|-------|
| **Force-directed or DAG graph** | Eye-catching “mesh” story | High | Needs stable layout tuning; performance watch |
| **Adjacency list / “last edges” panel** | Cheap, accurate | Low–Med | Show recent `(from → to)` derived from envelopes |
| **Sankey-style message volume** | Spot hot paths | Med | Better with aggregation windows |
| **Radial with orchestrator center** | Communicates default human path | Med | Matches human→orchestrator rule |

**Dependency:** Topology is **derived** from persisted or live envelopes (`to`, `kind`, `sessionId`); relay does not need a new message type for a minimal “recent edges” view if the UI processes the same stream humans already receive.

### Transcript filtering & search UX

| Pattern | Complexity | Dependency |
|---------|------------|--------------|
| **Sticky search bar + highlight matches** | Low–Med | Client only |
| **Facet filters (sender, kind, time)** | Med | Envelope schema fields in UI model |
| **Virtualized list** | Med | Large catch-up windows |
| **Server-assisted query** (`afterSeq`, `limit` already) | Med (mostly done) | `transcript.query` in `router.ts` |

### Metadata display

| Pattern | Complexity | Dependency |
|---------|------------|------------|
| **Per-session row: role, focus, progress, blocked** | Med | Collaboration metadata patches in DB |
| **Global summary strip** | Low | Aggregate query |
| **Edit metadata from dashboard** | Med–High | Same control envelopes as adapters/CLI; permission model |

### Interactive controls

| Control | Complexity | Dependency |
|---------|------------|------------|
| **Compose + send (direct / broadcast)** | Med–High | Human session on WS; routing rules for `to` undefined |
| **Designate / clear orchestrator** | Med | Existing control path |
| **Remove session / destroy space** | Med–High | Owner policy, in-flight sockets, error handling |

### Space management UI

| Area | Complexity | Dependency |
|------|------------|------------|
| **Create space + slug** | Med | Align with join flow and idempotency keys |
| **List spaces (localhost)** | Low–Med | SQLite read API or envelope |
| **Danger zone (destroy)** | Med | Session eviction semantics |

### Real-time update patterns

| Pattern | Use when | Complexity |
|---------|----------|------------|
| **Push-only from relay** | Happy path | Low–Med |
| **Push + periodic DB reconcile** | Missed messages / tab sleep | Med |
| **Cursor by `relaySeq`** | Guaranteed ordering | Med — aligns with existing transcript query |

### Notifications & attention

| Mechanism | Complexity | Notes |
|-----------|------------|-------|
| **Browser tab title / badge** | Low | Table stakes for background tabs |
| **Desktop Notification API** | Med | Permission UX; rate-limit |
| **In-app toasts for errors** | Low | Map `protocol.error` codes |
| **Highlight “blocked” or @human** | Med | Rule set must stay simple to avoid false alarms |

---

## Feature dependencies (v1.0 → v2.0)

```text
WebSocket relay + session registry
  → dashboard WebSocket client (human session)

appendTranscript + transcript.query(afterSeq, limit)
  → live transcript + reconnect catch-up

routeEnvelope (broadcast | to | human→orchestrator)
  → send UI + topology derivation

handleCollaborationControl + SQLite orchestrator field
  → orchestrator designate/clear in UI

Space join/leave + membership + owner model
  → roster + invite/remove + destroy space

SKIP_TRANSCRIPT_TYPES / prune cap
  → UI must not promise infinite scroll without “load older” strategy
```

---

## MVP vs later (within v2.0 milestone framing)

**MVP dashboard (credibility):** connected state, roster, live transcript with search-in-loaded-window, metadata chips, send + orchestrator controls, `relaySeq` catch-up.

**Stretch / phase-2 within milestone:** topology graph, desktop notifications, richer filters, server-side transcript search.

---

## Sources

- `/.planning/PROJECT.md` — milestone goals, constraints, validated stack (HIGH).
- `packages/relay/src/router.ts` — `transcript.query`, routing, transcript append (HIGH).
- `packages/relay/src/server.ts` — join/leave dispatch, catch-up on connect (HIGH).
- General collaboration-dashboard patterns (ops consoles, team chat admin, live logs): **MEDIUM** — industry synthesis, not one cited standard.
