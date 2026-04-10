# Phase 2 Research: Relay — WebSocket, validate, route

**Phase:** 02-relay-websocket-validate-route  
**Researched:** 2026-04-10  
**Audience:** Planner / implementer — what you need to know to write `PLAN.md` and execute this phase well.

**Authority chain:** Success criteria and requirement IDs come from `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md`. Product and hard constraints from `PRD.md` and `ARCHITECTURE-CONSTRAINTS.md`. User decisions from `02-CONTEXT.md`. Stack pins from `.planning/research/STACK.md` (verified against npm on 2026-04-10).

---

## 1. WebSocket server library (Node.js)

### Options evaluated

| Library | Fit for agent-talkie | Notes |
|--------|----------------------|--------|
| **`ws` (^8.20.0)** | **Recommended default** | Pure JS, excellent ecosystem, works with standard `http` upgrade, minimal opinion on framing — you own JSON envelope parsing. Aligns with STACK.md and “simple npm install” story. |
| **`uWebSockets.js`** | Defer / optional | Very fast, but **native** addon; complicates prebuild matrix, CI, and consumer machines without a compiler. Conflicts with broad `npx` / heterogeneous install base unless you accept that cost. |
| **`undici` WebSocket** | Client-first | Strong for fetch/WS **client**; server-side story is thinner than `ws` for a dedicated relay daemon. |
| **Socket.io** | Avoid as core | Extra session/room protocol; product wants **canonical WebSocket + your envelope**, not a second framing layer. |
| **`@fastify/websocket` / `express-ws`** | Optional wrapper | Fine if you later want HTTP health on same port; Phase 2 can start with raw `http` + `ws` Server for fewer moving parts. |

### Recommendation

- **Use `ws` ^8.x** for the relay server (and test clients). Pair with Node’s `http.createServer` (or `https` later) and a single upgrade path.
- **Compatibility:** Pin `engines.node` per STACK.md; `@types/ws` ^8.18.x for TypeScript. No protocol coupling — all semantics live in `@agent-talkie/protocol`.

### Pitfalls

- **Message boundaries:** WebSocket delivers **whole messages** (when you send one frame per logical message). If you ever stream, document chunking; v1 should be **one JSON object per WS message** for simplicity.
- **Backpressure:** `ws` exposes `bufferedAmount`; plan caps on outbound queue per connection to avoid unbounded memory (PITFALLS performance section).
- **CP6:** Map `WebSocket` → internal `connectionId`; never persist connection id as session identity. Session id comes from handshake + envelope `sessionId` after auth.

---

## 2. SQLite schema design (spaces, memberships, sessions, transcript)

### Current Phase 1 baseline

Migration `001_initial.sql` already defines:

- `sessions` — stable session row (UUID v7 id, display name, workspace fields).
- `spaces` — `id` + `created_at` only (minimal).
- `space_memberships` — composite PK `(space_id, session_id)` with FK cascade.
- `idempotency_keys` — dedup for mutating ops (5-minute window in repo default).

`openDatabase()` already sets **WAL** and **`timeout: 5000`** (busy handler) via `better-sqlite3` — satisfies the **spirit** of RELAY-08; planners should **name** this in ops docs as busy_timeout so reviewers can trace REQ ↔ code.

### Extensions needed for Phase 2 (recommended direction)

Planners should add a **new numbered migration** (e.g. `002_relay_spaces_transcripts.sql`) rather than editing `001`, to preserve applied migration history.

**Spaces (human slug + lifecycle — D-01, D-03, D-04)**

- Add **`slug`** — unique, normalized (lowercase, hyphenated). Index: `UNIQUE(slug)` only among *active* rows if you use soft-delete, or unique globally with “tombstone” rows — see lifecycle below.
- Add **`status`** — e.g. `active` | `archived` | `expired` (or timestamps instead of enum).
- Add **`archived_at`**, **`expires_at`** — for archive-then-expire (D-03). GC job deletes or marks `expired` when `expires_at < now` and no members.
- Optional **`owner_session_id`** or **`policy_json` NULL** — D-02 “room for invite/permission rules” without committing to auth yet.

**Memberships**

- Enforce **SPACE-02 (one space per session)** in application logic: before insert, ensure no other `space_memberships` row exists for `session_id`, or use a partial unique index if SQLite version supports the expression you need — simplest is **transaction + SELECT count** in relay.
- Add **`joined_at`**, **`left_at` NULL** — for audit and “last member left” detection.
- Consider **`role` placeholder** (nullable) for future orchestrator assignment without migration churn.

**Session registry / reconnect (D-09, D-12)**

- **`reconnect_secret_hash`** — store **hash only** (e.g. SHA-256 of secret + server pepper), not plaintext. Pepper from env or derived from data-dir path + machine id (document threat model: local disk trust).
- **`reconnect_valid_until`** or **`session_resume_expires_at`** — D-12 independent TTL from space TTL.
- **`last_seen_at`** — optional, for GC of stale session rows vs “member left” semantics.

**Transcript (D-06, D-07, D-08)**

- **`transcript_entries`** (or `space_messages`) table suggested shape:
  - `id` (UUID, monotonic-friendly) or INTEGER PK + `space_id` + monotonic `seq` **per space** assigned by relay (single writer — avoids CP4 “fake global order”).
  - `space_id`, `sender_session_id`, `envelope_json` (TEXT) or normalized columns if you split later.
  - `created_at`, optional `kind` / `type` denormalized for queries.
- **Indexes:** `(space_id, created_at DESC)` or `(space_id, seq DESC)` for catch-up and tail queries.
- **Retention (D-07):** implement **prune job** by count cap (delete oldest) and/or `created_at` TTL; separate policy knobs for transcript vs space metadata (D-04).

**Transcript “pointers”**

- If REQ wording means “cursor per session for catch-up,” add **`session_transcript_cursors(session_id, space_id, last_delivered_seq)`** or persist **last acked seq** in memory only — D-11 says no outbound resend queue; **durable cursor** is still useful for idempotent catch-up after reconnect.

### SQLite operational patterns (CP5)

- Keep **write transactions short**; do not `await` I/O inside a transaction.
- Single relay process = single writer — good fit for `better-sqlite3` sync API.
- **Foreign keys ON** (already) — order deletes: memberships before spaces if not using CASCADE everywhere intentionally.

### Pitfalls

- **Slug revival (D-03):** Define whether `slug` is unique among `active` only. When space is archived, same slug join **revives** same `space` row — do not create a duplicate space id.
- **WAL + multiple processes:** Phase 3+ may add CLI touching DB — document “relay is primary writer” to avoid two writers (PITFALLS integration gotchas).

---

## 3. Message routing patterns (RELAY-03, MSG-01, MSG-02, MSG-03)

### Addressing model (Phase 1 envelope)

`envelope.ts` already has:

- **`to?: string` (UUID)** — direct session addressing.
- **`spaceId?: string` (UUID)** — space-scoped messages.

### Recommended routing rules (plan-level)

1. **After join**, sender must be a **member** of `envelope.spaceId` (if present). Reject otherwise (control error envelope or close policy — decide in PLAN).
2. **Direct (`to` set):** deliver only to connection(s) bound to that `session_id` **if** recipient is in the same space as sender; never deliver to sessions in other spaces.
3. **Space-scoped (no `to`, or explicit broadcast convention):** deliver to **all other members** of that space (or include sender — product choice; default is “others only” for fan-out notifications, “include sender” echo only if client needs it).
4. **No blind broadcast:** maintain `Map<sessionId, Set<WebSocket>>` or `Map<connectionId, { sessionId, spaceId }>` in memory; fan-out iterates **membership list for space**, not all sockets.

### Ordering and gaps (PROTO-04, success criterion 1)

- **Per-session `seq`** is on the envelope (optional in schema — relay should still validate when present).
- Relay may assign **per-space monotonic `seq`** when persisting transcript for deterministic catch-up (recommended for D-08).
- Document clearly: **no total order across sessions** without a shared log seq — CP4.

### Pitfalls (CP10)

- Orchestrator defaults (MSG-04+) are Phase 4 — Phase 2 still must **not** route all traffic through a single “orchestrator connection”; routing is purely by `to` / space membership.

---

## 4. Reconnect and session resume (D-09–D-12)

### Handshake shape (plan artifact)

Split lifecycle into:

1. **Transport connect** — WebSocket open; **no membership yet** (SPACE-04).
2. **Auth / register** — client sends **session id** (existing UUID v7) + **reconnect secret** OR “create new session” flow with fields for `createSession`.
3. **Join space** — slug + idempotency key; relay returns **canonical `spaceId`**, resolved display name, and **ack before heavy catch-up** (02-CONTEXT specifics).

### Secret generation

- **32+ bytes cryptographic random** (Node `crypto.randomBytes`), base64url to client; server stores **hash** only.
- On reconnect, **constant-time compare** (e.g. `crypto.timingSafeEqual` on buffers) on hash.

### TTL semantics

- **Session resume TTL (D-12):** if expired, treat as unknown session — client must re-register as new session row or full re-join (product: new session id).
- **Space archive TTL (D-03):** independent — space may exist in archived state while session TTL expired.

### D-11

- **No resend** of pre-disconnect outbound client queue from relay — catch-up is **transcript-based** (D-08, D-10). Clients must tolerate gaps and use `seq` for detection.

### Pitfalls

- **Duplicate connection:** same `sessionId` connects twice — define policy: **second wins** (first disconnected) or **reject second**; must be deterministic and tested.

---

## 5. Transcript persistence: format, catch-up, queries (D-06–D-08)

### Storage format

- **Full envelope JSON** in SQLite TEXT (D-06) keeps one source of truth with Zod-validated shape; compress or normalize later if needed.
- Validate **before** append (same `safeParseEnvelope` as routing path).

### Catch-up on join (D-08)

- After successful join ack, relay sends **N recent transcript rows** ordered by `seq` ascending (bounded default, e.g. last 100–500 messages or last T minutes — values are planner discretion per CONTEXT).
- **Do not block join ack** on full catch-up — stream in follow-up WS messages (02-CONTEXT).

### Explicit queries

- Control message type (Phase 2) e.g. `transcript.query` with cursor/limit — relay reads DB and responds. Cap **max limit** server-side.

### Pitfalls

- **Large payloads:** cap `payload` size at validation or routing layer to protect SQLite and memory (PITFALLS “large message payloads”).

---

## 6. Space lifecycle: create-on-join, archive, GC (D-01–D-03)

### Create-on-join

- **Resolve slug → space:** if active space exists, join it. If none, `INSERT space` + membership in one transaction.
- If **archived** and within TTL, **revive** (`status = active`, clear `archived_at` / `expires_at` as per rules).

### Last member leave

- On leave or disconnect handling: if member count → 0, set **`archived_at = now`**, **`expires_at = now + space_ttl`**.

### Garbage collection

- Periodic timer or “on next operation” sweep: delete expired spaces (and cascade transcript per policy) or mark `expired` for lazy delete.
- **Transcript retention (D-04 vs D-07)** may delete transcript rows **before** space row is deleted — independent policies.

### Pitfalls

- **Race:** two clients create same slug simultaneously — **UNIQUE(slug)** + retry or transaction serialization.
- **Disconnect vs leave:** TCP drop may not send leave — use **heartbeat timeout** to mark session disconnected but distinguish **membership** (persist until explicit leave or session eviction policy). Planner must decide: does zombie membership linger until TTL? (D-05: no offline mailbox — **routing** stops, but **membership** may remain for reconnect — D-10.)

---

## 7. Envelope validation integration (RELAY-02, success criterion 2)

### Phase 1 artifacts to import

From `@agent-talkie/protocol`:

- **`safeParseEnvelope`**, **`formatEnvelopeIssues`**, **`envelopeSchema`**
- **`agreeProtocolVersion`**, **`versionRangesOverlap`**, **`buildVersionMismatchFailure`** for handshake (PROTO-06)

From `@agent-talkie/persistence`:

- **`openDatabase`**, **`migrate`**, session helpers **`createSession`**, **`getSessionById`**, idempotency **`tryRecordIdempotencyKey`**, **`pruneExpiredIdempotencyKeys`**

### Relay validation pipeline (recommended)

1. **Binary → UTF-8 JSON parse** — catch `SyntaxError`, respond with structured error, **no state mutation**.
2. **`safeParseEnvelope`** — if fail, send **protocol error** (type + `formatEnvelopeIssues` payload), return.
3. **Handshake / auth messages** may use **separate Zod schemas** (not necessarily full envelope) for the first frames — if so, still export from `protocol` package to avoid drift.
4. **Authorize** — session belongs to space, `to` target is member, etc.
5. **Idempotency** — for join/leave (and other mutating control types per Phase 1 D-11), call `tryRecordIdempotencyKey`; if duplicate, return **same ack** without double-insert.

### Pitfalls (CP7)

- **Never** branch on unvalidated JSON; **never** trust `sessionId` in envelope until bound to authenticated connection.
- **Version field:** envelope `version` must match negotiated version or acceptable set — relay should reject mismatch early.

---

## 8. Graceful disconnect handling (RELAY-09, SPACE-04)

### On socket `close` / `error`

1. **Remove socket** from in-memory routing map.
2. **Do not** automatically remove `space_memberships` unless product says “disconnect = leave” — D-10 implies **reconnect restores membership**, so default is: **keep membership**, mark connection absent only.
3. **Optional:** broadcast `session.disconnected` control to space (helps oversight later).
4. **Prune:** if policy says non-reconnectable after TTL, delete membership and run “last member” check.

### Consistency

- Other sessions continue; SQLite remains authoritative; no partial writes on failed validation paths (use transactions for join = membership + session upsert + idempotency).

### Pitfalls

- **Partial join:** if client receives ack but server crashes before commit — idempotency key on retry must converge to consistent state (already Phase 1 pattern).

---

## 9. Integration testing patterns (success criteria 1 & 3)

### Tooling

- **`vitest`** + **`ws`** client in tests (STACK.md).
- Spin relay with **ephemeral SQLite path** (`:memory:` only if you avoid WAL quirks — temp file often safer for WAL + restart tests).

### Test cases to plan explicitly

| Test | Proves |
|------|--------|
| Two WS clients, join same slug | MSG-03 multi-turn, SPACE-01 |
| Direct `to` message | MSG-01, RELAY-03 |
| Space-scoped message | MSG-02 |
| Third client in **different** space never receives | No leakage (success criterion 3) |
| Invalid JSON / invalid envelope | RELAY-02, state unchanged |
| Restart relay process | RELAY-08, SPACE-03 — membership + session rows survive |
| Reconnect with secret before TTL | D-09, D-10 |
| Reconnect after session TTL | D-12 — forced new session |
| Idempotent join retry | PROTO-03, Phase 1 idempotency |

### Patterns

- Use **deterministic UUIDs** (`createSession` `opts.id`) and fixed clocks where needed.
- **Assert on delivered message list** per client array, not stdout logs.
- Run **`why-is-node-running`** in dev if tests hang (open WS or timers).

---

## Pitfalls and risks summary (phase-specific)

| Risk | Mitigation |
|------|------------|
| CP4 ordering confusion | Per-space relay seq for transcript; per-session `seq` in envelope for clients |
| CP5 SQLite locks | WAL + busy timeout (already); short transactions |
| CP6 connection ≠ session | Explicit connection registry; bind after handshake |
| CP7 version drift | Handshake + envelope version check |
| CP10 orchestrator bottleneck | Direct `to` routing in Phase 2 — no orchestrator requirement |
| Broadcast leakage | Route only over membership closure for `spaceId` |
| Reconnect secret storage | Hash + timing-safe compare |
| Slug / archive races | Transactions + unique constraints |

---

## Integration points with Phase 1 (checklist)

- [ ] Import **`safeParseEnvelope`** / **`formatEnvelopeIssues`** for every inbound WS JSON message.
- [ ] Use **`sessions`** table + **`createSession`** / **`getSessionById`** for registry.
- [ ] Extend **`spaces` / `space_memberships`** via new migration (slug, lifecycle, indexes).
- [ ] Use **`idempotency_keys`** for join/leave and other mutating control ops.
- [ ] **`openDatabase`** — confirm **WAL** + **timeout** documented as RELAY-08 compliance.
- [ ] Handshake uses **`agreeProtocolVersion`** / **`buildVersionMismatchFailure`** shapes.
- [ ] Envelope fields **`to`**, **`spaceId`**, **`kind`**, **`seq`** align with routing and persistence design.

---

## Library versions (compatibility)

| Package | Pin (per STACK.md) | Phase 2 relevance |
|---------|--------------------|-------------------|
| `ws` | ^8.20.0 | Server + test client |
| `better-sqlite3` | ^12.8.0 | Persistence; Node ABI |
| `zod` | ^4.3.6 | Same schemas as clients |
| `uuid` | ^13.0.0 | v7 session/message ids |
| `typescript` | ^5.9.3 (lib) | Shared packages |
| `vitest` | ^4.1.4 | Integration tests |

Node **>=20** (or tighter per repo `engines`); native addon prebuilds for CI matrix.

---

## RESEARCH COMPLETE

This document is research input for **planning** Phase 2. Implementation details (exact control message types, default TTL numbers, error envelope shape) remain planner discretion where captured under “Claude's Discretion” in `02-CONTEXT.md`.
