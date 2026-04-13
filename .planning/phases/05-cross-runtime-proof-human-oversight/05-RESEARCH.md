# Phase 5: Cross-runtime proof & human oversight - Research

**Researched:** 2026-04-13  
**Domain:** Multi-adapter edge (stdio subprocess + MCP server), CLI oversight UX, collaboration protocol/metadata, SQLite observation path  
**Confidence:** MEDIUM-HIGH (codebase + npm/registry verified; Codex CLI wire-to-adapter mapping needs implementation-time verification)

## Summary

Phase 5 closes **ADAPT-02** by shipping two **structurally different** adapters—**Codex via subprocess/stdio** (reusing Content-Length framing utilities from `@agent-talkie/adapter-stdio`) and **Cursor via an MCP tool/resource server** wrapping `TalkieSessionClient`—both talking to the same localhost relay. **OVER-01–OVER-03** and **MHUM-01** are satisfied by extending the existing **Commander.js** `talkie` CLI with snapshot commands plus a **live watch** mode, and by enforcing **human-as-participant** semantics already sketched in Phase 4 CONTEXT (timeline is a **separate read surface**, not auto-injected context).

**Gap to close in implementation:** CONTEXT locks an **owner model** for management actions (D-11/D-12), but the **relay today allows any `isHuman` session** to run `orchestrator.designate` / `orchestrator.clear` ([VERIFIED: codebase] `collaboration-handlers.ts`). The planner must add **persistent owner identity** (new column or space metadata) and **authorization checks** on those control types (and any future “remove session” APIs).

**Primary recommendation:** Implement `packages/adapter-codex/` and `packages/adapter-cursor-mcp/` on `@agent-talkie/client` + supervisor `ensureRelayRunning`, extend CLI with **SQLite-backed snapshots** (same DB path as relay via `resolveAgentTalkieDataDir`) and optional **WebSocket client** for `talkie watch` live updates; use **`@modelcontextprotocol/sdk` v1.x** for MCP until v2 split packages leave alpha [VERIFIED: npm registry + official server guide on GitHub].

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Second Adapter: Runtime Targets**

- **D-01:** Cross-runtime proof pair is **Codex CLI** (subprocess/stdio, reuses `@agent-talkie/adapter-stdio` pattern) and **Cursor MCP** (MCP tool server, structurally different adapter shape).
- **D-02:** Codex CLI adapter wraps a Codex subprocess and bridges stdin/stdout to the relay via Content-Length framing and `@agent-talkie/client`.
- **D-03:** Cursor MCP adapter is an MCP tool server: **tools** for mutations (`join_space`, `send_message`, `assign_orchestrator`, `update_metadata`); **resources** for reads (participants, timeline, metadata snapshot, blocked-session view).

**Human Oversight Surface**

- **D-04:** CLI is primary human oversight surface in v1 — no web app, no separate UI process; extends existing `talkie` CLI.
- **D-05:** **Static snapshot commands** (`talkie space status`, `talkie transcript`, `talkie who`) + **live watch** (`talkie watch`).
- **D-06:** Live watch **split view**: top = participant table (who, role, focus, progress, blocked); bottom = scrolling message timeline.

**Blocked-Session Surfacing**

- **D-07:** **Self-report primary** — adapter sets `progress=blocked` and `blockedReason` via metadata update when native interruption detected.
- **D-08:** **Inactivity inference fallback** — distinguish **explicit blocked** vs **possibly-blocked** in display; silence alone is never definitive.

**Timeline Observation**

- **D-09:** Human joins as full participant with `is_human=true`; messages follow normal routing (default orchestrator unless addressed).
- **D-10:** Observing timeline via CLI does **not** auto-inject all messages into agent session context; humans participate by **sending** messages.

**Multi-Human Participation**

- **D-11:** **Owner model** — one human owns management actions (orchestrator designation, session management).
- **D-12:** Any joined human may observe, watch timeline, send messages; **control actions** are owner-bounded.

### Claude's Discretion

- Exact MCP tool schemas and resource URI design for Cursor adapter  
- Codex CLI adapter subprocess management and lifecycle details  
- Live watch terminal rendering (blessed, ink, raw ANSI, etc.)  
- Static CLI command output formatting  
- Inactivity inference timeout thresholds and heuristics  
- Space ownership assignment mechanism (first human to create? explicit claim?)  
- Exact snapshot command names and flag design  

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope  
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **ADAPT-02** | At least two runtime adapters proving cross-runtime collaboration | Codex stdio adapter + Cursor MCP adapter on shared `TalkieSessionClient` / WebSocket path [VERIFIED: CONTEXT + `docs/adapter-ingress.md`] |
| **OVER-01** | Human-visible surface: participants, activity, focus, what needs attention | CLI snapshots + watch; data from SQLite (`collaboration_profile`, `collaboration_status`, memberships, sessions) and/or live relay messages [VERIFIED: persistence migrations 003, relay handlers] |
| **OVER-02** | Native prompts stay native; layer surfaces which session blocked and why | `metadata.patch` namespace `status` already supports `progress: "blocked"` and `blockedReason` [VERIFIED: `collaboration-wire.ts`]; adapters must self-report [CONTEXT D-07] |
| **OVER-03** | Observe timeline without injecting all messages into every session | Transcript in SQLite + CLI read path; do not add relay behavior that pushes full history into agent context [CONTEXT D-10; VERIFIED: separate transcript store] |
| **MHUM-01** | Multiple humans, each with local agent sessions | `sessions.is_human` + routing rules exist [VERIFIED: migration 003, `router.ts`]; owner authorization still required [GAP vs relay] |
</phase_requirements>

## Project Constraints (from .cursor/rules/)

From `.cursor/rules/gsd-context.md` (mirrors `PROJECT.md` / architecture constraints):

- **Zero external services** on the default path — no NATS, Postgres, Kafka, Firebase.  
- **SQLite** is the default durable metadata store; JSON/JSONL only for export/debug, not sole source of truth.  
- **WebSocket relay** is canonical core transport; local and remote share one protocol.  
- **Explicit opt-in** participation only; network presence must not grant membership.  
- **Relay lifecycle** must not depend on one participant staying alive.  
- **Packaging:** `npm install` / `npx` friendly.  

`AGENTS.md` (repo root) imposes **documentation discipline** for agents editing docs (full re-read, authority/mirror rules) — relevant if Phase 5 adds or changes product docs alongside code.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **@agent-talkie/client** | workspace | WebSocket session client for adapters + optional CLI watch | Same transport as ADAPT-03 [VERIFIED: `packages/client`] |
| **@agent-talkie/supervisor** | workspace | `ensureRelayRunning`, data dir resolution | Matches stdio adapter + CLI pattern [VERIFIED: `docs/adapter-ingress.md`] |
| **@agent-talkie/adapter-stdio** | workspace | `ContentLengthFrameReader`, `MAX_FRAME_BODY_BYTES`, bounded queue | Reuse for Codex bridge [VERIFIED: package exports] |
| **@modelcontextprotocol/sdk** | **1.29.0** (verify pin at implementation) | MCP server (tools/resources) for Cursor | Official TS implementation; high adoption [VERIFIED: `npm view @modelcontextprotocol/sdk version`] |
| **commander** | **14.0.3** (already in CLI) | CLI subcommands | Already used by `talkie` [VERIFIED: `packages/cli/package.json`] |
| **better-sqlite3** (via persistence) | workspace | Snapshot queries from CLI | Same DB file as relay; WAL + busy_timeout already in project story [VERIFIED: migrations] |
| **zod** | workspace | Tool args, envelope safety | Matches protocol package [VERIFIED: monorepo] |

### Supporting (discretion — pick one for watch UI)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **ink** + React | 7.0.0 [VERIFIED: npm] | Composable TUI for split-pane watch | When you want structured layout and incremental updates |
| **blessed** / **neo-blessed** | 0.1.81 classic [VERIFIED: npm] | Low-level terminal layouts | When minimizing deps or needing fine screen control |
| Raw **node:tty** + ANSI | built-in | Minimal watch | Fastest path; more manual resize/redraw |

**Alternatives considered**

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| MCP SDK v1 unified package | `@modelcontextprotocol/server` 2.x alpha | v2 is evolving; pin only if Cursor/docs require it [VERIFIED: `npm view @modelcontextprotocol/server` → 2.0.0-alpha.2] |
| CLI reads SQLite directly | New relay HTTP/WS “admin query” API | Extra attack surface and duplication; SQLite read is simpler for local-first if file path and WAL readers are handled |

**Installation (illustrative):**

```bash
npm install @modelcontextprotocol/sdk@^1.29.0
# Optional for watch UI:
npm install ink react
```

**Version verification:** `npm view @modelcontextprotocol/sdk version` → **1.29.0** (2026-04-13). `npm view ink version` → **7.0.0**.

## Architecture Patterns

### Recommended package layout

```
packages/
├── adapter-codex/       # spawn Codex, frame I/O, TalkieSessionClient
├── adapter-cursor-mcp/  # MCP server: tools + resources → client
├── cli/                 # talkie space|transcript|who|watch (extends cli.ts)
├── client/              # (unchanged contract, maybe small helpers)
├── persistence/         # optional: exported read-only helpers for CLI
└── relay/               # owner checks + any watch-friendly notifications (if needed)
```

### Pattern 1: MCP tools vs resources (Cursor)

**What:** Mutations that change relay state = **tools**; read-only snapshots = **resources** (or tool calls that only read — resources are more idiomatic for “subscribe/read”).  
**When to use:** Aligns with CONTEXT D-03 and MCP product model [CITED: [MCP overview — server concepts](https://modelcontextprotocol.io/docs/learn/server-concepts#tools), [Building MCP servers](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)].  
**Example (conceptual — v1 SDK API names may differ; follow installed SDK typings):**

```typescript
// Source pattern: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
// Tools: registerTool(name, { inputSchema: z.object({...}) }, handler)
// Transport: StdioServerTransport for Cursor-spawned process
// Connect: await server.connect(transport)
```

### Pattern 2: CLI snapshot reads via shared SQLite

**What:** Open the same database file the relay uses (`resolveAgentTalkieDataDir()` + known filename — same as relay bootstrap), **read-only** connections acceptable for snapshots; set `busy_timeout` for CLI concurrent to relay [ASSUMED: same as relay PRAGMAs — verify in `openDatabase`].  
**When to use:** `talkie space status`, `talkie transcript` without keeping a WebSocket open.  
**Pitfall:** Path mismatch (wrong `AGENT_TALKIE_DATA_DIR`) shows empty or stale data — CLI must resolve dir identically to supervisor.

### Pattern 3: Live watch

**What:** Prefer `TalkieSessionClient` connected as a **human** session (or a dedicated **observer** session type — only if protocol extended; CONTEXT says human participant, not a new role) and render incoming envelopes + periodic metadata refresh. Alternative: poll SQLite on an interval for simpler MVP at cost of latency.  
**When to use:** WebSocket path gives real-time `collaboration.metadata` fan-out already implemented in relay [VERIFIED: `collaboration-handlers.ts` broadcast].

### Anti-patterns to avoid

- **Second stdio-only adapter** for “two adapters” — weakens ADAPT-02 proof [CONTEXT D-01].  
- **Embedding full transcript into MCP resources** on every model turn — blows context; use resource **templates** / pagination [CITED: MCP server guide ResourceTemplate patterns].  
- **Writing `progress: "blocked"` from relay** on silence — violates D-08; keep inference **display-only** or a **separate non-protocol flag** in CLI.  
- **Replacing native approval UI** — out of product scope [REQUIREMENTS Out of Scope].

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP JSON-RPC framing | Custom stdin parser | `@modelcontextprotocol/sdk` transport | Spec + edge cases (capabilities, pings) handled [CITED: official SDK] |
| WebSocket + handshake | Adapter-only socket stack | `TalkieSessionClient` | Single validated path to relay [VERIFIED: ADAPT-03] |
| Content-Length framing | Duplicate parser in Codex package | Import from `@agent-talkie/adapter-stdio` | One cap, one validation story [VERIFIED: exports] |
| Process spawn ergonomics | Raw `spawn` only | `execa` (already in stack guidance) | Cross-platform signals, windowsHide [CITED: `.cursor/rules/gsd-context.md` stack table] |

**Key insight:** Adapters stay **thin**: translate I/O → envelopes + call shared client; business rules remain in relay/protocol.

## Common Pitfalls

### Pitfall 1: Owner model not enforced server-side

**What goes wrong:** Any human designates orchestrator, violating D-11/D-12.  
**Why it happens:** Current handlers only check `isHuman` [VERIFIED: `orchestrator.designate` branch].  
**How to avoid:** Add `spaces.owner_session_id` (or similar) at space creation / first human join; check `envelope.sessionId === owner` for designate/clear and future admin ops.  
**Warning signs:** UAT finds “non-owner changed orchestrator.”

### Pitfall 2: “Possibly blocked” encoded as real protocol state

**What goes wrong:** Other sessions treat inferred state as authoritative.  
**Why it happens:** Overloading `progress` or `blockedReason` without adapter confirmation.  
**How to avoid:** CLI/watch computes **UI-only** badge from timestamps + last `task.assign` + silence threshold [CONTEXT D-08].  
**Warning signs:** False escalations when agent is merely slow.

### Pitfall 3: SQLite reader locks / “database is locked”

**What goes wrong:** CLI heavy polling contends with relay writes.  
**Why it happens:** Missing WAL + busy_timeout on CLI connections or overly aggressive poll interval.  
**How to avoid:** Align PRAGMAs with relay open; use WebSocket for watch, SQLite for snapshots only; backoff polling.  
**Warning signs:** Intermittent CLI errors under load.

### Pitfall 4: MCP server lifecycle vs Cursor

**What goes wrong:** Double stdio use (MCP uses stdin/stdout; accidental logging to stdout breaks JSON-RPC).  
**Why it happens:** `console.log` in MCP process.  
**How to avoid:** Log to stderr only; structured logging behind flag [ASSUMED: common MCP server practice].  
**Warning signs:** Cursor disconnects or “parse error” on MCP channel.

### Pitfall 5: Timeline observation accidentally becomes broadcast context

**What goes wrong:** Relay pushes transcript to all agent sessions.  
**Why it happens:** Feature creep on “sync visibility.”  
**How to avoid:** Keep transcript consumption **human/CLI** or explicit pull via tools/resources; agents only see routed envelopes as today [CONTEXT D-10].

## Code Examples

### Metadata status patch (already protocol-standard)

```typescript
// Source: packages/protocol/src/collaboration-wire.ts
// progress: "idle" | "working" | "blocked" | "done"
// blockedReason optional when blocked
```

Adapter calls existing `metadata.patch` with `namespace: "status"` and `patch: { progress: "blocked", blockedReason: "..." }` [VERIFIED: schema].

### Human default route to orchestrator (relay behavior)

```147:170:packages/relay/src/router.ts
  if (
    envelope.kind === "conversation" &&
    envelope.to === undefined &&
    senderSession.isHuman
  ) {
    const orch = getOrchestratorSessionId(db, spaceId);
    // ... routes to orchestrator WebSocket when online
```

New humans automatically fit **MHUM-01** routing once registered with `is_human` [VERIFIED: pattern exists].

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single stdio adapter only | Stdio + MCP second surface | Phase 5 | Proves ADAPT-02 |
| MCP TS “monolithic” sdk | v2 split packages (`@modelcontextprotocol/server`) in development | 2025–2026 | Stay on sdk **1.x** unless you explicitly need v2 [VERIFIED: npm dist-tags / alpha] |

**Deprecated/outdated:** Relying on “any human can orchestrate” — superseded by CONTEXT owner model for Phase 5.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Codex subprocess can be bridged with existing Content-Length framing without conflicting with Codex’s own stdout | Standard Stack / Pattern | Adapter may need a side channel or different spawn mode; verify against live Codex CLI [ASSUMED] |
| A2 | Cursor accepts MCP server over **stdio** with `@modelcontextprotocol/sdk` same as other hosts | Standard Stack | If Cursor requires Streamable HTTP only, transport choice changes [ASSUMED — verify Cursor MCP docs at implementation] |
| A3 | CLI opening SQLite read-only with same PRAGMAs as relay avoids lock stalls | Pattern 2 | May need read-uncommitted or shorter transactions [ASSUMED] |

## Open Questions

1. **Codex CLI I/O contract for a sidecar adapter**  
   - What we know: OpenAI documents Codex App Server JSON-RPC / JSONL and MCP integration at high level [CITED: [Codex MCP](https://developers.openai.com/codex/mcp), [App Server](https://developers.openai.com/codex/app-server)].  
   - What’s unclear: Exact subprocess flags and event stream for “blocked on permission” detection.  
   - Recommendation: Spike subprocess in `adapter-codex` and map events → `metadata.patch`; mock in tests if CLI unavailable in CI.

2. **Owner assignment moment**  
   - What we know: CONTEXT leaves discretion (first creator vs explicit claim).  
   - What’s unclear: Product preference for multi-human edge cases.  
   - Recommendation: Default **first human to join empty space** becomes owner; transfer tool deferred.

3. **Watch mode transport**  
   - What we know: WebSocket gives live `collaboration.metadata` events.  
   - What’s unclear: Whether transcript tail should stream over WS or poll DB.  
   - Recommendation: WS client for control/metadata + transcript polling or catch-up API already used post-join [VERIFIED: `sendTranscriptCatchUp` in server] — mirror for CLI session.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | All packages | ✓ (dev) | engines >=20 [VERIFIED: root package.json] | — |
| **Codex CLI** | ADAPT-02 proof / manual UAT | varies | — | Integration tests with **mock child process**; document `codex` install for human proof |
| **Cursor** | MCP adapter UAT | varies | — | Run MCP server standalone + MCP inspector / mock client where possible |
| SQLite file access | CLI snapshots | ✓ | relay data dir | Require relay initialized or migrate-only empty DB |

**Missing dependencies with no fallback:** None for **compilation** — runtime proof needs at least one of Codex or Cursor installed for real-world demo.

**Missing dependencies with fallback:** CI uses mocks; humans validate on real machines.

## Security Domain

> `security_enforcement` not disabled in `.planning/config.json` — include lightweight threat notes.

### Applicable ASVS-style categories

| Category | Applies | Standard Control |
|----------|---------|-------------------|
| V5 Input Validation | yes | Zod on MCP tool inputs; same envelope validation as relay for adapter-originated traffic [VERIFIED: protocol] |
| V4 Access Control | yes | **Owner checks** for orchestrator designation; MCP tools must not bypass relay authorization [GAP: implement owner] |
| V2 Authentication | local-only default | Loopback relay; no new internet-facing admin API in Phase 5 [CONTEXT: local-first] |

### Known threat patterns

| Pattern | Mitigation |
|---------|------------|
| Malicious MCP client calls destructive tools | Tool design: only talkie protocol ops; no arbitrary shell; validate space membership server-side on relay |
| SQLite opened from world-writable dir | Document data dir permissions; keep default user-owned path |

## Sources

### Primary (HIGH confidence)

- [VERIFIED: codebase] `packages/relay/src/collaboration-handlers.ts`, `packages/relay/src/router.ts`, `packages/protocol/src/collaboration-wire.ts`, `packages/persistence/migrations/003_collaboration_orchestrator_metadata.sql`, `packages/cli/src/cli.ts`, `docs/adapter-ingress.md`  
- [VERIFIED: npm registry] `npm view @modelcontextprotocol/sdk version` → 1.29.0; `npm view ink version` → 7.0.0  
- [CITED: GitHub `modelcontextprotocol/typescript-sdk` docs/server.md] MCP server construction, tools, stdio transport — https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md  
- [CITED: OpenAI Codex docs] https://developers.openai.com/codex/mcp and App Server overview — high-level integration options (verify details at implementation)

### Secondary (MEDIUM confidence)

- `.cursor/rules/gsd-context.md` — stack versions and constraints aligned with project research

### Tertiary (LOW confidence / validate in implementation)

- Codex subprocess event shapes for permission blocking — requires live CLI or official reference beyond overview pages

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** for monorepo pieces; **MEDIUM** for Codex bridge details  
- Architecture: **HIGH** (CONTEXT + existing relay/client)  
- Pitfalls: **HIGH** for owner/SQLite/MCP stdout issues  

**Research date:** 2026-04-13  
**Valid until:** ~30 days (MCP SDK and Codex docs evolve quickly)

---

*Phase: 05-cross-runtime-proof-human-oversight*
