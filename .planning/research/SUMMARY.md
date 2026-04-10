# Project Research Summary

**Project:** agent-talkie  
**Domain:** Local-first, WebSocket-relay-based cross-runtime collaboration layer for coding-agent sessions (npm package + automatic relay daemon)  
**Researched:** 2026-04-10  
**Confidence:** MEDIUM

## Executive Summary

agent-talkie is an **interop layer**, not a hosted orchestration platform: it wires **already-running** sessions (Cursor, Claude Code, Codex, etc.) into a shared collaboration space via a **small relay daemon**, **SQLite** for durable metadata, and a **versioned WebSocket message envelope** validated with **Zod** (with JSON Schema export for non-TypeScript consumers). Research across stack, features, architecture, and pitfalls converges on a **supervisor-owned relay** (never “first connected session is host”), **star transport topology with mesh collaboration semantics** (direct session↔session routing; orchestrator as a **role**, not the only path), and **adapter-edge ingress** (stdio or runtime hooks) that always terminates in the same session client speaking WebSockets to the relay.

The recommended build path is **dependency-ordered**: ship **protocol + persistence** first, then **relay networking and routing**, then **supervisor lifecycle** (spawn, single-instance lock, idle shutdown, reconnect), then **adapters** against a stable client API. Local and remote differ only by **URL and trust policy**, not by a second protocol stack.

The main risks are **lifecycle and ordering**: treating the first session as relay owner, **idle shutdown racing** quiet but connected sessions, **SQLite write contention** and `database is locked` under concurrent use, assuming **global message order** from WebSocket delivery, and funneling all traffic through the **orchestrator** as a bottleneck. Mitigations are explicit in PITFALLS.md: supervisor + lockfile/generation tokens, idle policy keyed on **open connections and pending state**, WAL + `busy_timeout` + short transactions + single-writer discipline in the relay, **protocol-level sequences and idempotency**, and relay-side **peer routing** by stable `session_id` (not connection handle).

## Key Findings

### Recommended Stack

See [STACK.md](./STACK.md) for version pins and alternatives.

Build on **Node.js** (≥20 LTS; **24.x Active LTS** preferred for `better-sqlite3` ABI stability), **TypeScript** (**^5.9.x** recommended for a library until consumers validate **6.x**), **`ws`** for canonical WebSocket server/client, **`better-sqlite3`** for synchronous SQLite in a single relay process (WAL + busy_timeout), and **Zod 4** for runtime validation with **native `z.toJSONSchema()`** as the default schema-export path (optional `zod-to-json-schema` only for gaps). **CLI:** `commander`; **daemon spawn:** `execa`; **single relay instance:** `proper-lockfile` (document NFS caveats); **ids:** `uuid` (or `nanoid` with a consistent policy). **Bundling:** `tsup`; **tests:** `vitest`; **logging:** `pino` (decouple from protocol if the package is consumed as an SDK).

Explicitly **avoid** as defaults: NATS/Kafka/Postgres/Firebase, Socket.io as core transport, Prisma’s default Postgres story, JSON/JSONL as sole source of truth, and stdio as canonical transport (stdio stays in adapters only).

**Core technologies:**

- **Node.js + TypeScript** — runtime and types for npm/npx CLI and library consumers; LTS reduces native-addon friction.
- **`ws` + WebSocket relay** — thin, standard framing; matches ARCHITECTURE-CONSTRAINTS (core transport ≠ adapter stdio).
- **`better-sqlite3` + SQLite** — durable metadata and protocol state without external services; sync API fits single-process relay.
- **Zod 4 + JSON Schema export** — versioned envelope validation and cross-language contract; avoid non-representable Zod constructs in the wire envelope or document fallbacks.

### Expected Features

See [FEATURES.md](./FEATURES.md) for the full landscape, MVP slice, and competitor positioning.

**Must have (table stakes):**

- Named **session identity** (stable id, disambiguated display names) and **join/leave** one collaboration space per session (v1).
- **WebSocket relay**, **automatic local relay daemon**, **SQLite** as durable store — not JSON/Markdown as sole SoT.
- **Versioned envelope + validation**; **idempotency** where the protocol defines side effects.
- **Routed delivery** (not “visibility = inject everywhere”); **session↔session messaging** plus **orchestrator role** (default human routing, assignment, consolidation).
- **Multi-turn** threads; **collaboration metadata** (role, focus, progress, blocked) owned by the layer; **explicit opt-in** (invite/token), not ambient LAN membership.
- **Adapter ingress** to real runtimes without hosted execution; minimal **workspace/runtime awareness** for meaningful collaboration.

**Should have (competitive):**

- **Session-as-unit across vendor runtimes**; **local-first zero external services**; **conversation-first** semantics vs DAG-only orchestrators.
- **Orchestrator + direct peer mesh**; **narrow core** (messages + metadata; rich artifacts via harnesses later).
- **Same protocol local and remote**; **v1 one-space discipline** for speed and clarity.

**Defer (v2+):**

- Polished multi-human invitation UX, deep proactive orchestrator automation, rich core artifact exchange, session finder / Web UI (PROJECT.md “idea for later”), multi-space per session.

### Architecture Approach

See [ARCHITECTURE.md](./ARCHITECTURE.md) for diagrams, join/message paths, and anti-patterns.

The system is a **relay daemon** (WebSocket listener, validate, authorize, route, SQLite persistence) plus a **protocol module** (envelope, Zod, schema build), **session client** (connect, queue, reconnect with seq/cursor), **supervisor/launcher** (ensure relay, port, lock, idle policy), and **per-runtime adapters** (map native I/O → valid envelopes; relay remains authoritative validator). **Control vs conversation** are envelope kinds or nested payloads, not separate transports. **Local vs remote** is deployment only (`localhost` vs reachable relay + trust).

**Major components:**

1. **Relay daemon** — WS lifecycle, routing, authz, SQLite for metadata and required durability; must not become the “task brain” for agent semantics.
2. **Protocol module** — versioned types, validation, idempotency helpers, evolution rules; no transport-specific framing as source of truth.
3. **Session client + supervisor** — stable session identity across reconnects; ensure relay exists and survives participant churn per constraints.

### Critical Pitfalls

See [PITFALLS.md](./PITFALLS.md) for the full catalog (CP1–CP10), technical-debt patterns, and checklists.

1. **First session as relay host (CP1)** — Use a **supervisor** and OS-level single instance (lock/generation); clients never own relay lifetime beyond bounded grace.
2. **Idle shutdown vs quiet connections (CP2)** — Base idle on **open WebSockets**, heartbeats, and **pending protocol state**; prefer soft idle before hard shutdown.
3. **Orphan relays / stale locks (CP3)** — Generation tokens, stale lock detection, documented `relay stop --force`; avoid relying solely on parent heartbeat for liveness semantics.
4. **Assuming global order from WebSocket (CP4)** — Per-connection ordering only; use **sequences**, idempotency, and explicit ordering rules for metadata/side effects.
5. **SQLite `database is locked` (CP5)** — WAL, `busy_timeout`, **short write transactions**, single-writer discipline in relay; avoid DB locks across I/O.
6. **Session id = connection id (CP6)** — Stable `session_id` in SQLite and adapter-local persistence; collision policy per PRODUCT/PRD.
7. **Versioning only in TS types (CP7)** — Mandatory wire version + handshake negotiation; CI JSON Schema gate; compatibility matrix relay × adapter.
8. **Blocking stdio bridges (CP8)** — Framed messages, caps, bounded queues, clear overload errors at adapter edge.
9. **Remote without auth model (CP9)** — Default loopback bind; non-loopback requires token/TLS/tunnel story and separation of admin vs session ops.
10. **Orchestrator as mandatory hub (CP10)** — Relay routes peer traffic by session id; orchestrator filters role-relevant traffic only.

## Implications for Roadmap

Suggested **coarse** phase structure (5 phases); adjust naming when `ROADMAP.md` exists.

### Phase 1: Protocol & persistence foundation

**Rationale:** FEATURES dependency graph: identity + envelope before join; fixing protocol/persistence late is expensive (ARCHITECTURE build order). Establishes contracts for all consumers.

**Delivers:** Versioned envelope schemas (Zod), JSON Schema export in CI, idempotency key surfaces for defined ops, SQLite schema skeleton for spaces/memberships/session registry (and message/transcript pointers per design).

**Addresses:** Table stakes — envelope, validation, SQLite SoT, idempotency design.

**Avoids:** CP7 (wire versioning), CP4 (define ordering/idempotency early), technical debt “idempotency later.”

### Phase 2: Relay — WebSocket accept, validate, route

**Rationale:** Canonical transport and authoritative validation must exist before adapters multiply failure modes.

**Delivers:** `ws` server, handshake hook for token/space/session, relay-side Zod parse, routing to one or many recipients by membership and explicit addressing, persistence hooks for required metadata/transcript pointers.

**Addresses:** WebSocket relay, routed messaging, join/leave persistence path (with auth policy TBD).

**Avoids:** CP10 (peer routing in relay), CP4 (implement sequences as protocol is defined), CP6 (persist stable session id, not conn id).

### Phase 3: Supervisor & daemon lifecycle

**Rationale:** PRODUCT/ARCHITECTURE require relay **independent of any participant**; this is the main guard against CP1–CP3.

**Delivers:** `execa`-based spawn, `proper-lockfile` (or equivalent) + generation/reconciliation, health probe, idle shutdown policy (aligned with open connections + pending state), orphan/stale listener handling, CLI entrypoints (`talkie`, `talkie relay`, etc.).

**Addresses:** Automatic local relay daemon, operational usability, packaging expectations (on-demand start — no postinstall daemons per PITFALLS).

**Avoids:** CP1, CP2, CP3; integration gotchas around npm/IDE parent exit.

### Phase 4: Collaboration semantics, metadata & adapters

**Rationale:** Adapters are highest variance; they should consume a **stable client API** and proven relay behavior (ARCHITECTURE).

**Delivers:** Session client (reconnect, backoff, queue), stdio (or first) adapter with **framed** IPC, one or two runtime-specific adapters for cross-runtime proof, orchestrator role at **routing/protocol** level, collaboration metadata v0, minimal human oversight (CLI/logs acceptable early).

**Addresses:** MVP slice in FEATURES.md; direct session↔session + orchestrator defaults; adapter table stakes.

**Avoids:** CP8 (stdio framing/backpressure), CP6 (adapter-local session persistence).

### Phase 5: Trust, remote extension & hardening

**Rationale:** Same protocol for remote; trust and binding must be explicit before encouraging non-loopback use (CP9).

**Delivers:** Invite/token handshake design implementation, loopback-default binding and documented remote paths (TLS/tunnel), structured logging without PII leakage, diagnostics (relay generation/version), orchestrator failover policy (PRD open question — **needs phase-local design**), performance guards (fan-out, payload caps).

**Addresses:** Explicit opt-in for cross-machine, security checklist, “looks done” verification items from PITFALLS.

**Avoids:** CP9, security mistakes (0.0.0.0 + no auth), ambiguous orchestrator recovery (UX + protocol).

### Phase Ordering Rationale

- **Protocol + SQLite before relay networking** — Unblocks contract tests and avoids retrofitting versioning and persistence.
- **Relay routing before heavy adapter work** — Adapters should not reimplement validation or routing.
- **Supervisor after relay skeleton** — You need something worth supervising; but **design** supervisor constraints alongside Phase 2 to avoid CP1-shaped shortcuts.
- **Adapters after client + relay** — Stable surface reduces per-runtime thrash.
- **Remote/trust last among core phases** — Local-first MVP validates protocol and lifecycle without opening the full threat surface.

### Research Flags

Phases likely needing **deeper research or design during planning:**

- **Phase 1:** Transcript vs metadata durability split (ARCHITECTURE-CONSTRAINTS / FEATURES gaps); exact tables and migration strategy (optional Drizzle/Kysely only if complexity warrants).
- **Phase 2:** Handshake auth details; orchestrator-only message types vs peer paths (product rules).
- **Phase 3:** Idle timeout constants and “pending state” definition; Windows vs Unix signal/orphan behavior — verify with implementation tests.
- **Phase 4:** Per-runtime adapter APIs and constraints (Node version, cwd, multiplexers) — integration-heavy.
- **Phase 5:** Orchestrator failover / election vs human reassignment (PRD open question); enterprise auth — **dedicated design**, not stack research only.

Phases with **relatively standard patterns** (lighter research):

- **Phase 1 (subset):** Zod 4 + `z.toJSONSchema()`, Vitest/tsup toolchain — well-documented.
- **Phase 2 (subset):** `ws` echo → validate → route pattern, SQLite WAL basics — established practice if CP5 mitigations are applied.

## Confidence Assessment

| Area        | Confidence | Notes |
|------------|------------|--------|
| Stack      | HIGH       | npm-verified pins (2026-04-10); core pairing `ws` + `better-sqlite3` + Zod 4 is standard for this shape; TS 6.0 as default for libs is MEDIUM — 5.9.x safer until consumer matrix is tested. |
| Features   | MEDIUM     | Strong alignment with PRD / PROJECT / ARCHITECTURE-CONSTRAINTS; competitive landscape (A2A, MCP, orchestration frameworks) moves quickly — positioning is sound, details evolve. |
| Architecture | MEDIUM   | Patterns match constraints; exact schemas, handshake auth, idle T, reconnect cursor policy flagged as phase work in research. |
| Pitfalls   | MEDIUM     | Grounded in project docs + SQLite/WebSocket/daemon practice; orchestrator failover and transcript split need explicit design. |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Invite/token UX and orchestrator failover** — PRD open questions; capture in phase plans, not only research.
- **Adapter priority** — Which two runtimes first is a roadmap/product choice (FEATURES.md).
- **Transcript durability** — SQLite vs export mirror; affects persistence load and CP5/backup strategy.
- **Remote auth / compliance** — Beyond local-first defaults; Phase 5 scope and threat model.
- **Zod ↔ JSON Schema** — Some constructs may not export cleanly; envelope design should stay JSON-Schema-friendly per Zod 4 docs.

## Sources

### Primary (HIGH confidence for project alignment)

- [.planning/PROJECT.md](../PROJECT.md) — Requirements, constraints, simplifications (one space v1), key decisions.
- [PRD.md](../../PRD.md) (cited in research) — Session-first principles, orchestrator, non-goals.
- [ARCHITECTURE-CONSTRAINTS.md](../../ARCHITECTURE-CONSTRAINTS.md) (cited in research) — Hard constraints, default architecture.
- [STACK.md](./STACK.md), [FEATURES.md](./FEATURES.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [PITFALLS.md](./PITFALLS.md) — This synthesis.

### Secondary (MEDIUM confidence)

- npm registry (`npm view`) — Package versions as of 2026-04-10 ([STACK.md](./STACK.md)).
- [Node.js Releases](https://nodejs.org/en/about/previous-releases) — LTS cadence.
- [Zod 4 — JSON Schema](https://v4.zod.dev/json-schema) — Native schema export.
- [Google Developers Blog — A2A](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability) — Adjacent protocol positioning ([FEATURES.md](./FEATURES.md)).
- [Anthropic — Model Context Protocol](https://www.anthropic.com/research/model-context-protocol) — MCP vs collaboration layer ([FEATURES.md](./FEATURES.md)).
- [SQLite WAL documentation](https://www.sqlite.org/wal.html) — Locking model basis for CP5 ([PITFALLS.md](./PITFALLS.md)).
- IETF RFC 6455 — WebSocket per-connection ordering ([PITFALLS.md](./PITFALLS.md)).

### Tertiary (LOW–MEDIUM; validate in implementation)

- Web search / ecosystem synthesis for orchestration trends ([FEATURES.md](./FEATURES.md)).
- Stack Overflow / community patterns for multi-process SQLite ([PITFALLS.md](./PITFALLS.md)).

---
*Research completed: 2026-04-10*  
*Ready for roadmap: yes*
