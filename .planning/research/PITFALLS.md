# Domain Pitfalls: Cross-Runtime Agent Collaboration Layer

**Product:** agent-talkie  
**Domain:** Independent coding-agent sessions (Cursor, Claude Code, Codex, …) in shared collaboration spaces with orchestration, peer messaging, and local-first trust  
**Researched:** 2026-04-09  
**Confidence:** **MEDIUM-HIGH** for distributed-messaging and integration patterns (well-established); **MEDIUM** for runtime-specific failure modes (varies by vendor behavior and undocumented limits)

This document is **pitfalls research** for roadmap planning. Phase names below are **suggested pre-roadmap buckets** until `ROADMAP.md` exists; remap when phases are numbered.

---

## Critical Pitfalls

Mistakes that tend to cause rewrites, security incidents, or abandonment of the narrow product boundary.

### CP-1: Ambiguous collaboration primitive (session vs runtime vs workspace)

**What goes wrong:** Addressing participants by *runtime brand* or *IDE window* instead of a stable **session identity** collides when one human runs multiple agents, or when the same repo is open in two contexts. Messages land on the wrong participant; orchestrator targets drift after reconnect.

**Why it happens:** Runtimes expose different concepts (thread, task, subagent, “chat”); it is tempting to map 1:1 to vendor APIs.

**Consequences:** Mis-routed replies, duplicate work, broken audit (“who said what”), impossible multi-human scenarios.

**Warning signs**

- Specs say “send to Cursor” or “the Codex session” without a session UUID.
- Reconnect changes who receives without an explicit “session ended / forked” event.
- Two tabs same runtime receive duplicates or neither receives.

**Prevention**

- Define **session** as first-class: immutable id, optional display name, runtime adapter type, workspace key (repo + root path hash or user-declared), and lifecycle states (`invited`, `active`, `idle`, `left`, `zombie`).
- Never route on brand alone; always `session_id` + space membership.
- Document **fork semantics** when a human clones a conversation or spawns a second session.

**Suggested phase:** **P1 — Identity & session model** (before any cross-runtime demo).

---

### CP-2: Protocol designed for happy-path only (no versioning, idempotency, or delivery semantics)

**What goes wrong:** “JSON over WebSocket” works in a two-client demo, then fails under retries, mobile sleep, partial writes, or adapter reconnects. Double delivery creates duplicate tool calls; lost acks create ghost tasks.

**Why it happens:** Agent UIs feel synchronous; teams defer “messaging semantics” as infrastructure detail.

**Consequences:** Nondeterministic collaboration, agents arguing from different message sets, debugging nightmares.

**Warning signs**

- No message `id` or idempotency key; dedup is “hope the UI ignores duplicates.”
- No schema version field on envelopes.
- “Ordering” is undefined globally vs per-thread vs per-space.

**Prevention**

- Publish a **narrow envelope contract** early: `schema_version`, `message_id`, `space_id`, `sender_session_id`, `causal_parent_id` (optional), `created_at`, `payload_type`, `payload`.
- Choose explicit **delivery** for v1 (e.g. at-least-once + idempotent handlers + client-side dedup window).
- Scope **ordering**: e.g. total order per `thread_id` / conversation key, not global across all spaces.
- Treat handoffs like **API contracts**: validate payloads; reject unknown `schema_version` with a clear upgrade path.

**Suggested phase:** **P0 — Protocol foundation** (same pass as first end-to-end message).

---

### CP-3: Collapsing control plane, data plane, and “agent content” into one channel

**What goes wrong:** Control messages (join/leave, role changes) interleave with large payloads (logs, file excerpts) on one topic. Head-of-line blocking delays membership updates; one fat message stalls orchestration.

**Why it happens:** Single socket simplicity; copying chat-app patterns without separation.

**Consequences:** Brittle orchestration, timeouts on “who is orchestrator,” operational inability to prioritize control traffic.

**Warning signs**

- Join/role events wait behind bulk transcripts.
- No prioritization or size limits on “user-visible” vs “machine” payloads.

**Prevention**

- Separate **control** (membership, roles, presence intent, caps) from **conversation** (turns, questions).
- Cap inline payload size; use **references** (URI, object store key, hash) for large blobs; keep collaboration layer metadata small.
- Optionally separate **telemetry** (latency, adapter health) so it never contends with user messages.

**Suggested phase:** **P0–P1** (protocol + first transport).

---

### CP-4: Orchestrator ambiguity and split brain

**What goes wrong:** Two sessions believe they orchestrate; or none does after reconnect; humans override without the layer knowing. Peer resolution rules deadlock because no one owns escalation.

**Why it happens:** “Orchestrator” is a product role, not automatically enforced by runtimes; adapters may each implement different defaults.

**Consequences:** Conflicting instructions to workers, duplicated planning, or stalled spaces.

**Warning signs**

- “Whoever got the last human message is orchestrator” without persistence.
- No single-writer rule for `orchestrator_session_id` in space state.
- UI shows orchestrator A while another session still receives “orchestrate” tools.

**Prevention**

- Persist **orchestrator_session_id** in collaboration-layer state with **atomic transfer** (explicit handoff message or human action).
- Define behavior when orchestrator leaves: promote by rule (e.g. human picks; or first peer; document it).
- Adapters surface **current orchestrator** from layer state, not from local heuristics.

**Suggested phase:** **P2 — Spaces & roles** (before multi-session “real” workflows).

---

### CP-5: Adapter complexity explosion (N×M semantics leakage)

**What goes wrong:** Each adapter reimplements routing, retries, and policy; subtle differences mean “works in Cursor, fails in Codex.” Maintenance cost dominates; every new feature becomes N patches.

**Why it happens:** Pressure to “feel native” leads to deep hooks into each runtime instead of a thin **capability surface**.

**Consequences:** Velocity collapse; security review surface multiplies; impossible parity.

**Warning signs**

- Business logic lives in adapter repos duplicated across runtimes.
- Adapters call undocumented internal APIs that break on vendor updates.
- Feature matrix is “full matrix” instead of **minimum viable parity**.

**Prevention**

- **Core is runtime-agnostic:** one routing and state implementation; adapters only translate I/O (auth, transport, UI affordances).
- **Capability negotiation:** adapters declare what they support (`slash_command`, `stdio`, `mcp`, …); degrade gracefully.
- Add a new runtime by **implementing the thinnest adapter** that passes a shared conformance checklist, not by cloning features.

**Suggested phase:** **P3 — First adapter** through **P4 — Second runtime** (enforce discipline before runtime #3).

---

### CP-6: Trust model mistakes (ambient membership, over-collection, secret leakage)

**What goes wrong:** Anyone on LAN or with a link joins a space; prompts or env snippets get echoed into shared threads; “debug logging” ships content to a server. Violates **local-first** and **explicit opt-in** from PROJECT.md.

**Why it happens:** Fast demos skip authz; logging is verbose; LLM payloads are tempting to log.

**Consequences:** Data exfiltration, compliance failure, loss of user trust, irreversible bad press.

**Warning signs**

- Presence or discovery implies authorization.
- Server stores full message bodies without retention controls.
- Adapters default to sending workspace paths, `.env`, or API keys in metadata.

**Prevention**

- **Join = cryptographic or human-confirmed capability** (invite token, explicit accept in UI), not discoverability.
- **Redaction pipeline** for metadata defaults; opt-in flags for “share file path” or “share excerpt.”
- Separate **transport encryption** from **authorization to space**; document threat model (malicious peer vs malicious server vs malicious adapter).
- Human-visible **audit** of what left the machine.

**Suggested phase:** **P1 — Membership** and **P5 — Hardening** (threat model and redaction are not a late add-on).

---

### CP-7: Scope creep into runtime replacement or “platform”

**What goes wrong:** Product becomes hosted agent runner, global memory, git merge bot, or approval UX for tools — contradicting **Out of Scope** and **narrow boundary** in PROJECT.md.

**Why it happens:** Users ask for one more feature; each runtime’s limitations tempt centralization.

**Consequences:** Unbounded roadmap, competing with vendors, losing “connect existing sessions” clarity.

**Warning signs**

- Requirements like “run agents in our cloud,” “single source of truth for all context,” or “replace Cursor approve dialog.”
- Collaboration layer starts executing tools on behalf of remote sessions without local human.

**Prevention**

- **Decision checklist** on every epic: “Does this require owning execution or centralizing local context?” If yes, defer or reject.
- Keep **tool layer first**: new semantics via harnesses/extensions, not new mandatory server models.
- Revisit PROJECT.md **Out of Scope** at each milestone (per PROJECT.md Evolution).

**Suggested phase:** **Ongoing — Product / roadmap gates** (every phase kickoff).

---

## Technical Debt Patterns

Smaller mistakes that compound into large refactors.


| Pattern                          | What happens                                                               | Warning signs                             | Prevention                                                                             | Suggested phase |
| -------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- | --------------- |
| **Stringly-typed payloads**      | No validation; agents parse ambiguous natural language in the wire format. | “Just put the plan in `content`.”         | Typed `payload_type` + schema validation; optional human-readable mirror.              | P0              |
| **Implicit timeouts everywhere** | Sessions block forever waiting for peer.                                   | Hung spaces; no cancel.                   | Default deadlines; `nudge` / `escalate_to_human` states; circuit breakers on adapters. | P2–P3           |
| **God space**                    | One space for all topics; noise and routing bugs.                          | Unbounded participant list; no threads.   | Thread or topic keys; archive; leave stale spaces.                                     | P2              |
| **Client-authoritative state**   | Server trusts last writer for roles/progress.                              | Cheating or confused clients break space. | Server validates transitions; clients are views.                                       | P2              |
| **No migration path**            | Schema changes brick old adapters.                                         | “Big bang” upgrade.                       | Feature flags; dual-read; deprecation windows.                                         | P0, P5          |


---

## Integration Gotchas

Specific to **multi-runtime** and **vendor adapters**.


| Gotcha                           | Detail                                                      | Prevention                                                                                                    |
| -------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Different concurrency models** | Some runtimes serialize tool calls; others parallelize.     | Document per-adapter concurrency; layer messages are logical turns, not OS threads.                           |
| **Reconnect identity**           | Vendor may issue new conversation ids on resume.            | Map vendor ids → stable `session_id` in layer; persist mapping in adapter config.                             |
| **Rate limits & token windows**  | Burst of peer messages hits provider limits.                | Back-pressure signals to space; summarize or batch; orchestrator throttles fan-out.                           |
| **Stdio vs HTTP vs MCP**         | Mixing transports without clear boundary.                   | One **adapter interface** (connect, send, subscribe, health); no protocol logic inside vendor-specific hacks. |
| **Human-in-the-loop stalls**     | Remote peer waits while local runtime shows approve dialog. | Model **stall reasons** in metadata; allow timeout + escalation without blaming wrong party.                  |
| **Clock skew**                   | `created_at` ordering breaks across machines.               | Prefer logical sequence per thread; use skew-tolerant UI (“received order”).                                  |


---

## Performance Traps


| Trap                            | Symptom                                                                                                                                                                                                                       | Prevention                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **O(n²) fan-out**               | Every message broadcasts to all sessions; coordination tax dominates ([coordination overhead in multi-agent handoffs](https://fazm.ai/blog/agent-handoff-coordination-bottleneck) is a recurring theme in industry writeups). | Route by thread/recipient; orchestrator-only fan-out when needed; metrics on messages per space per minute. |
| **Huge inline context**         | Full files in every turn.                                                                                                                                                                                                     | References + hashes; “attach” flow with explicit user consent.                                              |
| **Synchronous global ordering** | Single lock for all spaces.                                                                                                                                                                                                   | Partition by `space_id`; order within partition only.                                                       |
| **Chatty presence**             | Heartbeats per session per second at scale.                                                                                                                                                                                   | Coalesce; event-driven presence; backoff when idle.                                                         |
| **Unbounded client buffers**    | Memory growth on slow consumer.                                                                                                                                                                                               | Drop policy or disk spill with explicit “lagging” signal to human.                                          |


---

## Security Mistakes


| Mistake                                    | Why it bites agent-talkie                                         | Prevention                                                            |
| ------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Invite links as bearer secrets forever** | Leaked link = permanent access.                                   | Expiring invites; revocable tokens; optional human re-confirm.        |
| **No sender authentication**               | Forged `sender_session_id` if client trusted.                     | Server signs or attests membership; verify on ingest.                 |
| **Logging LLM content**                    | Secrets in prompts.                                               | Structured logs with redaction; sampling off by default for payloads. |
| **Confused deputy in adapters**            | Adapter uses user’s cloud API to act on another session’s behalf. | Strict OAuth/scopes per session; no cross-session token reuse.        |
| **Supply chain in slash commands**         | Malicious package suggests “install talkie plugin.”               | Document verified distribution paths; checksums.                      |


---

## UX Pitfalls


| Pitfall                             | User impact                                       | Prevention                                                                               |
| ----------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Invisible cross-runtime traffic** | User does not know data left machine.             | Clear “shared space” indicator; per-message share boundary.                              |
| **Notification overload**           | Every peer ping interrupts all runtimes.          | Digest; priority; “focus mode” respecting orchestrator.                                  |
| **False confidence**                | UI shows “delivered” when only one adapter acked. | Align UI with **delivery semantics** (e.g. “accepted by server” vs “displayed in peer”). |
| **Orchestrator confusion**          | Human does not know who drives.                   | Persistent orchestrator badge; handoff log.                                              |
| **Opt-in friction mis-set**         | Too easy = trust failure; too hard = no adoption. | One clear **attach** flow; sane defaults with explicit “share this excerpt.”             |


---

## “Looks Done But Isn’t” Checklist

Use before calling a milestone “collaboration complete.”

- **Reconnect:** All adapters survive disconnect/reconnect without duplicate orchestrator or lost membership.
- **Third participant:** Two humans + three sessions in one space — roles and routing still correct.
- **Delivery:** Duplicate `message_id` does not double-apply side effects (idempotency).
- **Ordering:** Multi-turn thread preserves order peers rely on (or UI shows partial order honestly).
- **Non-happy path:** Orchestrator leaves mid-task; space reaches defined next state.
- **Security:** Non-member cannot inject or read (attempt negative tests).
- **Scope:** No feature shipped that requires hosted execution or centralized memory (unless scope changed explicitly).
- **Parity:** Second runtime is not a “demo-only” path — passes same conformance scenarios as first.

---

## Recovery Strategies


| Failure mode                                 | Early detection                                         | Recovery                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Space wedged**                             | No progress metric updates; all sessions idle past SLA. | Human “reset orchestrator”; `nudge` broadcast; archive thread.                                                                 |
| **Adapter incompatible after vendor update** | Health check fails; schema reject spike.                | Version negotiation; read-only mode; prompt upgrade.                                                                           |
| **Partition (network split)**                | Divergent membership views; split brain.                | Favor **explicit partition behavior** (e.g. pause shared writes; show degraded); avoid silent merge of conflicting role state. |
| **Poison message**                           | Repeated handler crashes.                               | Quarantine by `message_id`; alert human; skip with audit entry.                                                                |
| **Runaway fan-out**                          | Message rate spike.                                     | Rate limit per session; orchestrator-only mode toggle.                                                                         |


---

## Pitfall-to-Phase Mapping

Consolidated view for planners. **Phases are suggested labels** — align to actual `ROADMAP.md` when it exists.


| Phase (suggested)                           | Primary pitfalls addressed                                    |
| ------------------------------------------- | ------------------------------------------------------------- |
| **P0 — Protocol & transport foundation**    | CP-2, CP-3; Technical: stringly-typed, migration              |
| **P1 — Session identity & membership**      | CP-1, CP-6 (authz, opt-in); Technical: client authority       |
| **P2 — Spaces, threads, orchestrator**      | CP-4, CP-7; Technical: god space, timeouts                    |
| **P3 — Messaging & routing implementation** | CP-2, CP-3, Performance (fan-out, ordering)                   |
| **P4 — Adapters (runtime 1..N)**            | CP-5, Integration gotchas                                     |
| **P5 — Human surface & oversight UX**       | UX pitfalls; CP-6 visibility                                  |
| **P6 — Hardening & scale**                  | Security table; Recovery; Performance; CP-6 logging/redaction |


---

## Sources


| Source                                                                                                                                      | Used for                                       | Confidence                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| `.planning/PROJECT.md` (agent-talkie requirements, principles, out-of-scope)                                                                | Boundary, trust, orchestrator, session-first   | **HIGH** (authoritative for product)                    |
| Distributed messaging practice: delivery guarantees, ordering scope, deduplication                                                          | CP-2, Performance                              | **HIGH** (industry standard)                            |
| [Message ordering in event-driven systems (OneUptime, 2026)](https://oneuptime.com/blog/post/2026-01-24-message-ordering-event-driven/view) | Ordering mistakes, stale/cancel races          | **MEDIUM** (vendor blog; aligns with textbook patterns) |
| [Ably — chat architecture / ordering](https://ably.com/blog/chat-architecture-reliable-message-ordering)                                    | Per-conversation ordering, scalability framing | **MEDIUM**                                              |
| [Handoff as bottleneck (Fazm)](https://fazm.ai/blog/agent-handoff-coordination-bottleneck)                                                  | Coordination tax, failure modes                | **MEDIUM** (interpretive; useful as risk signal)        |
| [Multi-agent coordination failure modes (Swarm Signal)](https://swarmsignal.net/multi-agent-coordination-failure-modes-and-mitigation/)     | Interference, fan-out, static roles            | **MEDIUM** (blog-level)                                 |


**Gaps / phase-specific follow-up:** Exact capabilities of Cursor / Claude Code / Codex extension APIs change frequently — validate adapter constraints per runtime in a dedicated **adapter research** pass before promising parity.

---

*Last updated: 2026-04-09*