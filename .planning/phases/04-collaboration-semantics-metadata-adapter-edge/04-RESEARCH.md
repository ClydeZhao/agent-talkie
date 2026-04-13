# Phase 4: Collaboration semantics, metadata & adapter edge - Research

**Researched:** 2026-04-13  
**Domain:** Relay routing (orchestrator default), collaboration metadata (SQLite + live fan-out), shared session client + stdio adapter edge  
**Confidence:** HIGH for locked decisions and codebase fit; MEDIUM for human-session detection mechanism and exact control `type` strings (planner discretion)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Orchestrator routing**

- **D-01:** Orchestrator is designated via an explicit control action (protocol command), not metadata self-declaration. Relay stores one authoritative orchestrator session per space. Metadata may reflect role for display but is not routing source of truth. No split-brain from multiple self-declared orchestrators.
- **D-02:** Human messages without explicit `to` route to the designated orchestrator. If none designated, relay returns a clear protocol error — no silent broadcast, no queuing. Client should prompt human to designate orchestrator or choose target.
- **D-03:** Task assignment is a control message with explicit semantics (e.g. `task.assign`). Follow-up and question consolidation stay conversation-first — regular conversation messages with structured payload conventions. Not a full task engine.

**Metadata schema & propagation**

- **D-04:** Collaboration metadata: `role` (string), `focus` (short text), `progress` (enum: idle/working/blocked/done), `blockedReason` (optional text). Small, collaboration-layer-owned — no `currentFile`, no local-context-sync fields.
- **D-05:** Metadata updates broadcast to live sessions as incremental control messages. Separate query endpoint gives current-state snapshots for late joiners / reconnect / refresh. Broadcast = incremental; query = recovery — not duplicate sources of truth.
- **D-06:** Auto-refresh fields (e.g. lastActivity) in `status` namespace. Human-controlled semantic fields (role, focus, display name) in `profile` namespace. Relay enforces write rules per namespace — sessions may self-update status; cannot silently self-edit role or other semantic identity fields.

**Adapter ingress**

- **D-07:** Adapter is a pattern: standalone process (stdio/CLI) or in-process library (plugin runtimes). Both terminate in same client/envelope model and same WebSocket protocol.
- **D-08:** Adapter registers session on behalf of native runtime — visible session identity is the native agent/session; adapter invisible at product layer.
- **D-09:** Phase 4 ships shared session client library (e.g. `@agent-talkie/client`): connect, handshake, register, send, receive, metadata update. Canonical integration surface between adapter edge and relay.

**Stdio adapter**

- **D-10:** Content-Length framing on stdin/stdout — HTTP-style `Content-Length: N\r\n\r\n` then JSON body. Explicit; robust for multiline/larger payloads; familiar from LSP/DAP [CITED: LSP base protocol — see Sources].
- **D-11:** Bounded queue (configurable max) for adapter→relay direction. When full, drop oldest undelivered, log warning. Loss recoverable via transcript query/catch-up. Adapter stays responsive.
- **D-12:** Overload is adapter-edge only: structured warning to stderr, dropped-message counter. No relay protocol event for queue overflow.

**Hard constraints (from user in CONTEXT)**

- Adapters must NOT become a second transport — translate native I/O into the same envelope model.
- Metadata stays small and collaboration-owned — not backdoor for full local context sync.

### Claude's Discretion

- Exact control message types and payload schemas for orchestrator designation and task assignment
- Metadata query response format and pagination
- Shared client library API shape (class vs functional, events vs callbacks)
- Stdio adapter default queue size and configuration mechanism
- Content-Length parser implementation details
- Adapter lifecycle (reconnect, graceful shutdown)

### Deferred Ideas (OUT OF SCOPE)

- None per CONTEXT.md
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research support |
|----|-------------|------------------|
| MSG-04 | Human messages to space route to orchestrator by default | D-01, D-02; extend routing when `to` absent + human origin; persist `orchestrator_session_id` per space [VERIFIED: codebase `router.ts` currently fans out to all members when `to` absent] |
| MSG-05 | Human can address a specific session directly | Existing `envelope.to` path in `routeEnvelope`; ensure human-originated traffic allowed to set `to` without relay rewriting [VERIFIED: `router.ts` direct branch] |
| MSG-06 | Orchestrator assigns work, follows up, consolidates questions | D-03; use control for assign; conversation + payload conventions for follow-up/consolidation; no new core transport |
| META-01 | Layer-owned metadata: role, focus, progress, blocked | D-04; SQLite persistence + in-protocol representation |
| META-02 | Metadata visible to space members and observing humans | Fan-out control (or dedicated notify type) to members; human surface is Phase 5 but data path is Phase 4 |
| META-03 | Auto status vs human-controlled semantic fields | D-06; enforce in relay on patch handlers |
| META-04 | Metadata updates propagate via relay | D-05; incremental broadcast + snapshot query |
| ADAPT-01 | Adapter ingress pattern: native I/O → valid envelopes over WebSocket | D-07–D-09; document pattern + `packages/client` |
| ADAPT-03 | Adapters use same session client and WebSocket path as any consumer | D-09; no special-case transport in relay core — only normal validated envelopes |
| ADAPT-04 | Stdio adapter: framing, bounded queues, clear overload errors | D-10–D-12; implement in `packages/adapter-stdio` (or equivalent) |
</phase_requirements>

## Summary

Phase 4 layers **product semantics** on the Phase 2 relay: today, a message without `to` is **broadcast to every other member** of the space ([`routeEnvelope`](packages/relay/src/router.ts) fan-out loop). Product and CONTEXT require **human-originated, undirected** conversation to go **only to the designated orchestrator**, with a **hard error** if no orchestrator exists. That implies: (1) **durable per-space orchestrator session id** (SQLite, updated only by designated control messages), (2) a **reliable way to classify “human-originated”** on the wire or at registration (not fully locked — see Open Questions), and (3) router changes **without** breaking explicit `to` delivery for MSG-05.

**Metadata** is new durable state plus **live propagation**: normalized SQLite (avoid one huge JSON blob per PITFALLS technical-debt table) with namespaces **`profile` vs `status`**, relay-side authorization on patches, **incremental control notifications** to connected members, and a **snapshot query** (new control type or HTTP-less WS request-response pattern mirroring `transcript.query`) for late joiners.

**Adapter edge** must not fork transport: a **`packages/client`** library wraps the same handshake and JSON envelopes as any test client, using **`ws`** as the Node client [VERIFIED: STACK.md / npm]. The **stdio adapter** reads/writes **Content-Length–framed JSON** [CITED: LSP base protocol], maps lines to envelope build/send, and uses a **bounded outbound queue** with **stderr-visible overload** per CONTEXT — not a relay error.

**Primary recommendation:** Implement orchestrator + metadata as **relay-first** (schema + `dispatchValidatedEnvelope` handlers + router branch), ship **`@agent-talkie/client`** as the only blessed WebSocket integration, then **`adapter-stdio`** consuming that client — document the pattern for Phase 5 runtime adapters.

## Project Constraints (from .cursor/rules/)

From `.cursor/rules/gsd-context.md` (mirrors project constraints):

- Zero external services on default path; SQLite default store; WebSocket canonical transport
- Explicit opt-in for participation; relay lifecycle independent of a single participant
- npm/npx installability

Planner must also honor `ARCHITECTURE-CONSTRAINTS.md`: core transport vs adapter ingress separation; orchestrator not mandatory bottleneck for all peer traffic (peer messages still use `to`); Zod validation on relay.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ws` | **8.20.0** [VERIFIED: `npm view ws version` 2026-04-13] | WebSocket server **and** client in Node | Same stack as relay; no second protocol layer |
| `better-sqlite3` | **12.9.0** [VERIFIED: `npm view better-sqlite3 version` 2026-04-13] | Durable orchestrator + metadata | Project default; single-writer relay process fits sync API |
| `zod` | **4.3.6** [VERIFIED: `npm view zod version` 2026-04-13] | Schemas for new control payloads + metadata patches | Matches `envelopeSchema` and relay validation |
| `uuid` | per STACK.md | UUID v7 session/envelope ids | Already enforced for `sessionId` in protocol |

### New packages (architectural, not npm deps)

| Package | Purpose |
|---------|---------|
| `@agent-talkie/client` | Session client: connect, handshake, register/resume, send/receive loop, optional helpers for metadata |
| `@agent-talkie/adapter-stdio` (name illustrative) | Framed stdio ↔ client; bounded queue; stderr diagnostics |

### Supporting

| Mechanism | When |
|-----------|------|
| `tsup` + `vitest` | Same as monorepo; client and adapter are publishable or internal workspaces |
| Existing `ensureRelayRunning()` | Adapters import before connect [VERIFIED: `packages/supervisor/src/ensure-relay.ts`, CONTEXT canonical refs] |

**Installation (illustrative):**

```bash
# Inside workspace: add workspace packages; runtime deps for client mirror relay
npm install ws zod uuid
```

**Do not add** as default: Socket.io, alternate IPC as canonical transport, Postgres.

## Architecture Patterns

### Recommended layout (extends CONTEXT)

```text
packages/
  protocol/     # extend Zod: new control types, metadata patch schema, optional envelope fields
  persistence/  # migrations: spaces.orchestrator_session_id; session_metadata tables or keyed rows
  relay/        # handlers + router branch + metadata broadcast + snapshot query
  client/       # NEW: thin ws client, handshake parity with server
  adapter-stdio/ # NEW: framing + queue + process entry
  supervisor/   # unchanged contract for adapters
```

### Pattern 1: Orchestrator designation (authoritative state)

**What:** `spaces` (or companion table) stores **at most one** `orchestrator_session_id` per space, nullable until set; only specific **control** messages mutate it (idempotency key per product rules).

**When to use:** Always for MSG-04/D-01/D-02.

**Example (illustrative):**

```typescript
// Pseudocode — actual types from Zod in protocol package
// Source: CONTEXT D-01, D-02
function resolveTargetSessionId(
  envelope: Envelope,
  space: { orchestratorSessionId: string | null },
  senderIsHuman: boolean,
): { to: string } | { error: "no_orchestrator" } | { broadcast: true } {
  if (envelope.to) return { to: envelope.to };
  if (envelope.kind === "conversation" && senderIsHuman) {
    if (!space.orchestratorSessionId) return { error: "no_orchestrator" };
    return { to: space.orchestratorSessionId };
  }
  // Non-human undirected: product decision — likely broadcast or error; planner must fix per PRD peer messaging
  return { broadcast: true };
}
```

**Note:** Non-human undirected messages currently broadcast; planner must confirm whether agent-originated “to everyone” remains valid (PRD: sessions talk directly; MSG-02 space-wide exists). Research assumption: **only human-originated undirected conversation** is re-targeted to orchestrator [ASSUMED] — validate against PRD/Phase 2 tests.

### Pattern 2: Metadata — `profile` vs `status`

**What:** Separate keys or column groups; relay validates **writer** rules: session may PATCH `status.*` freely; `profile.*` changes require human-authorized session or dedicated control from a human-bound session [ASSUMED: exact ACL in discretion].

**When to use:** META-01–META-04, D-06.

**Example:**

```typescript
// Source: CONTEXT D-06
type ProfilePatch = { role?: string; focus?: string };
type StatusPatch = { progress?: "idle"|"working"|"blocked"|"done"; blockedReason?: string; lastActivityMs?: number };
```

### Pattern 3: Stdio Content-Length framing

**What:** Read headers until `\r\n\r\n`; parse `Content-Length: <n>`; read `n` bytes UTF-8; `JSON.parse` → map to envelope fields.

**When to use:** ADAPT-04, D-10.

**Reference:** LSP base protocol specifies header + content shape with mandatory Content-Length [CITED: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/ — Base Protocol].

### Pattern 4: Bounded queue (drop-oldest)

**What:** Before `ws.send`, enqueue; if length > max, `shift()` one pending item, increment counter, `console.warn` or structured stderr line.

**When to use:** D-11, D-12, CP8 mitigation.

### Anti-patterns

- **Orchestrator as WS hub for all peer messages:** Violates ARCHITECTURE-CONSTRAINTS and CP10 — keep direct `to` routing.
- **Metadata as giant unversioned JSON blob:** Complicates migrations and partial updates (PITFALLS technical debt).
- **Silent fallback when orchestrator missing:** Forbidden by D-02.
- **Relay-specific “adapter socket”:** Forbidden by ADAPT-03 and D-07–D-09.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket session client | Custom raw WS in every adapter | `ws` + shared `@agent-talkie/client` | Handshake, version, resume parity; one place to fix bugs |
| Envelope validation at edge | Trust adapter JSON | `safeParseEnvelope` / protocol builders | Relay remains authoritative; edge pre-validation optional |
| Unbounded stdio read buffer | Load whole stdin | Streaming parser + max frame size | CP8 — memory blowups, parse errors |
| Global cross-connection message order | Assume delivery order = causal order | Per-session `seq`, idempotency, transcript replay | CP4 |

**Key insight:** The “hard part” of Phase 4 is **authorization and state** (who may set orchestrator, profile fields), not WebSocket mechanics.

## Common Pitfalls

### CP4 / ordering (from PITFALLS.md)

**What goes wrong:** After reconnect, metadata patches appear out of order; duplicate assignments.  
**How to avoid:** Idempotency keys on orchestrator designation and profile mutations; monotonic versioning per session or per metadata row; include `seq` on envelopes where already defined.

### CP5 / SQLite locking

**What goes wrong:** Metadata hot path blocks relay event loop.  
**How to avoid:** Short transactions; WAL + `busy_timeout` (already project direction); batch broadcasts after commit.

### CP8 / stdio framing

**What goes wrong:** Chunk splits mid-JSON; deadlocks when blocking both ends.  
**How to avoid:** Content-Length framing [D-10]; max frame size; async pumps; bounded queues [D-11].

### CP10 / orchestrator bottleneck

**What goes wrong:** Every peer message forced through orchestrator.  
**How to avoid:** Only apply orchestrator default to **human undirected** messages; preserve `to` routing for session↔session.

### Ambiguous “human session”

**What goes wrong:** Wrong routing if any session can impersonate human traffic.  
**How to avoid:** Bind human capability at **registration** or **handshake** with relay-persisted flag; do not rely on self-reported envelope field alone without auth story [OPEN — see Open Questions].

## Code Examples

### Current router fan-out (integration point)

```150:165:packages/relay/src/router.ts
  const members = db
    .prepare(
      `SELECT session_id FROM space_memberships
       WHERE space_id = ? AND left_at IS NULL`,
    )
    .all(spaceId) as Array<{ session_id: string }>;

  for (const { session_id: sid } of members) {
    if (sid === envelope.sessionId) {
      continue;
    }
    const sock = getSocketForSession(sid);
    if (sock?.readyState === sock.OPEN) {
      sock.send(wire);
    }
  }
```

Planner: insert orchestrator resolution **before** this block for the subset of envelopes matching D-02.

### Envelope addressing fields (existing)

```4:25:packages/protocol/src/envelope.ts
export const envelopeSchema = z.object({
  version: z.number().int().positive(),
  id: z.string().uuid(),
  sessionId: z
    .string()
    .uuid()
    ...
  kind: z.enum(["control", "conversation"]),
  type: z.string().min(1).max(256),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().uuid().optional(),
  seq: z.number().int().nonnegative().optional(),
  to: z.string().uuid().optional(),
  spaceId: z.string().uuid().optional(),
});
```

## State of the Art

| Old approach | Current approach | Notes |
|--------------|------------------|-------|
| Line-delimited JSON only for adapters | Content-Length framed JSON | Multiline-safe; LSP/DAP familiarity [CITED] |
| Inline WS in each tool | Shared session client package | Reduces drift vs relay handshake |
| Implicit “leader” session | Explicit control designation + SQLite authority | Prevents split-brain [CONTEXT D-01] |

**Deprecated/outdated:** Treating undirected messages as always broadcast for humans — contradicted by MSG-04 and CONTEXT D-02.

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|----------------|
| A1 | Only **human-originated** undirected **conversation** messages get orchestrator routing; other undirected messages keep broadcast or follow MSG-02 | Architecture Pattern 1 | Wrong recipients or broken space-wide agent messaging |
| A2 | Human capability is representable as a persistent per-session flag set at register/handshake | Pitfalls | Spoofing or mis-routing |
| A3 | Metadata snapshot can use the same WS request/response style as `transcript.query` | Summary | May need separate HTTP if payload grows — conflicts with constraints |

**If A1–A3 are wrong:** Adjust router rules and session model in PLAN.md after product confirmation.

## Open Questions

1. **How is “human-originated” determined on the wire?**  
   - What we know: D-02 applies to human messages; discretion allows schema design.  
   - Gap: No field in current `envelopeSchema` marks human vs agent.  
   - Recommendation: Add `sessions.is_human` (or `participant_kind`) at registration time; relay trusts only server-side state.

2. **Behavior of undirected non-human conversation**  
   - What we know: MSG-02 expects addressed-to-space semantics; Phase 2 router broadcasts.  
   - Gap: Whether orchestrator routing coexists with “to all” for agents.  
   - Recommendation: Keep broadcast for non-human undirected **or** require explicit `to`/space subset; document choice in PLAN.

3. **Orchestrator clears on disconnect?**  
   - What we know: v2 ORCH-02 deferred; Phase 4 may leave stale orchestrator id until reassigned.  
   - Gap: Error surface when designated session offline.  
   - Recommendation: Return `orchestrator_offline` or similar; optional clear on leave — planner decision.

4. **Pagination for metadata snapshot**  
   - What we know: Small schema D-04.  
   - Recommendation: Single page for v1; cursor if spaces scale.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | relay, client, adapter | ✓ (dev) | verify local `node --version` | — |
| `ws` / `better-sqlite3` | relay parity, tests | ✓ | see Standard Stack | — |
| Native build chain | `better-sqlite3` | ✓ typical on dev machines | — | prebuild or document `node-gyp` |

**Step 2.6:** No unusual external CLIs beyond existing monorepo.

## Security Domain

Applicable to Phase 4 (security enforcement not disabled in config):

### ASVS-oriented controls

| ASVS area | Applies | Control |
|-----------|---------|---------|
| V5 Input validation | Yes | Zod for all new control payloads; max stdio frame size |
| V4 Access control | Yes | Relay enforces namespace write rules D-06; orchestrator mutation restricted |
| V2 Authentication | Partial | Localhost default; no new trust model in Phase 4 — do not add `0.0.0.0` without token story [CP9] |

### Threat notes

- **Spoofing human role:** Mitigate with server-side session flags, not client-only claims.
- **Large payloads:** Reuse `MAX_INBOUND_WS_BYTES` pattern from relay for adapter max body size alignment [VERIFIED: `server.ts` constant].

## Sources

### Primary (HIGH)

- `.planning/phases/04-collaboration-semantics-metadata-adapter-edge/04-CONTEXT.md` — locked decisions D-01–D-12
- `packages/relay/src/router.ts`, `packages/relay/src/server.ts` — current routing and dispatch extension points
- `packages/protocol/src/envelope.ts` — envelope fields
- `ARCHITECTURE-CONSTRAINTS.md`, `PRD.md` — orchestrator role, metadata ownership, human default routing
- `.planning/research/ARCHITECTURE.md`, `STACK.md`, `PITFALLS.md`
- npm registry: `npm view ws|zod|better-sqlite3 version` (2026-04-13)

### Secondary (MEDIUM)

- [LSP 3.17 Specification — Base Protocol / Content-Length](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/) — framing precedent for D-10

### Tertiary (LOW)

- Web search synthesis for LSP header details — cross-check with official spec above

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — same as project; versions verified 2026-04-13
- Architecture: **HIGH** — aligned with CONTEXT + existing code paths
- Pitfalls: **HIGH** — PITFALLS.md + concrete router citation
- Human detection: **MEDIUM** — requires planner choice

**Research date:** 2026-04-13  
**Valid until:** ~30 days or until Phase 2 routing/orchestrator semantics change

---

*Nyquist validation section omitted: `workflow.nyquist_validation` is `false` in `.planning/config.json`.*

*Runtime State Inventory omitted: greenfield semantics extension, not rename/migration phase.*
