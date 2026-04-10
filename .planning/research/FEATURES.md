# Feature Landscape — Cross-Runtime Agent Collaboration (Local-First Interop Layer)

**Product:** agent-talkie  
**Dimension:** Features (table stakes vs differentiators vs anti-features)  
**Researched:** 2026-04-10  
**Confidence:** **MEDIUM** — synthesis from PRD, architecture constraints, and public ecosystem signals; competitive landscape moves quickly.

**Scope reminder:** This is a **local-first interoperability layer** connecting **concrete running sessions** (not runtime brands). Default path: **zero external services**, **SQLite**, **WebSocket relay**. The product **does not host or execute** agents. **v1:** one collaboration space per session.

---

## Executive alignment (PRD design principles)

| PRD principle | Feature implication |
|---------------|---------------------|
| Session first | Stable session identity, disambiguated names, per-session metadata |
| Conversation first | Multi-turn threads, not one-shot task dispatch |
| Existing runtime first | Adapters only; no required hosted sandbox |
| Bring your own agents | Multi-human spaces; each human attaches local sessions |
| Humans are not middleware | Routing, orchestrator default for human input, legible timelines |
| Peer resolution before escalation | Direct session↔session messaging; orchestrator escalates selectively |
| Orchestrator as control point | Role assignment, follow-ups, synthesis, human consolidation |
| Collaboration metadata in layer | Role, focus, progress, blocked state — not repo artifacts |
| Local context stays local | No mandatory full workspace upload; explicit share only |
| Explicit participation | Join/invite/token; no ambient LAN membership |
| Narrow boundary | Message + metadata core; rich artifacts via harnesses, not bloated core |
| Tool layer first | Versioned envelope, validation, idempotency where required |

---

## Feature landscape

Cross-cutting product features for a **local-first, session-first, relay-based** collaboration layer. Subsections: table stakes (must ship to be credible), differentiators (why this product vs adjacent stacks), anti-features (explicit non-goals).

### Table stakes

Features without which the product fails the stated job: **replace the human as copy-paste transport** while staying **local-first** and **session-centric**.

| Feature | Why table stakes | Complexity | Notes |
|---------|------------------|------------|-------|
| **Named session identity** | Addressing is by session, not brand; collisions need disambiguators | Med | PRD: human-usable names + stable IDs |
| **Join / leave a collaboration space** | Explicit membership; v1 one space per session | Med | Depends on relay + store |
| **WebSocket relay transport** | Canonical real-time bus; local = localhost relay | Med–High | ARCHITECTURE-CONSTRAINTS |
| **Relay daemon lifecycle (auto local)** | Usable without manual infra; relay survives participant churn | Med–High | Not “first session is permanent host” |
| **SQLite-backed durable state** | Spaces, memberships, metadata, pointers to history | Med | Not JSON/Markdown as sole SoT |
| **Versioned message envelope + validation** | Cross-runtime consumers; evolution | Med | Zod + JSON Schema export per PROJECT.md |
| **Routed delivery (not broadcast-equals-context)** | Visibility ≠ automatic injection into every session | Med | PRD: explicit routing |
| **Session↔session messaging** | Peer resolution; core value vs human relay | Med | Orchestrator not required on every hop |
| **Multi-turn conversation threads** | Avoid “weak task queue”; ongoing clarification | Med | State + UI/adapter surfacing |
| **Orchestrator role (protocol + UX hooks)** | Default human recipient; coordination, follow-up, escalation | Med–High | Role not necessarily single process bottleneck |
| **Human-visible collaboration surface** | Oversight: who’s in, what’s blocked, timeline | Med | Minimal v1 may be CLI + logs; PRD allows growth |
| **Explicit opt-in / trust for cross-machine** | Invite, token, or approval — not presence = join | Med | Open design question in PRD |
| **Runtime/workspace awareness (minimal)** | Meaningful collaboration without exposing full local state | Low–Med | High-level labels: runtime, repo/workspace, branch, focus |
| **Collaboration metadata (layer-owned)** | Role, focus, progress, blocked — editable/refresh hybrid | Med | Distinct from full local context |
| **Adapter ingress pattern(s)** | Connect Cursor / Claude Code / Codex sessions without hosted runtime | High | stdio bridge etc. at edge |
| **Idempotency (where protocol requires)** | Safe retries on flaky connections | Low–Med | PROJECT.md / ARCHITECTURE-CONSTRAINTS |

**Bundled “hygiene” table stakes** (expected by integrators):

| Feature | Why table stakes | Complexity |
|---------|------------------|------------|
| Basic **authn** for remote relay (token/TLS story) | Cross-user spaces without open relay | Med |
| **Backpressure / rate hints** (minimal) | Many parallel sessions; avoid melting relay | Low–Med |
| **Graceful disconnect** | Session churn; relay independence | Low–Med |

### Differentiators

What makes **this** product win versus **generic multi-agent orchestration** or **enterprise agent buses** — given the hard constraints.

| Feature | Competitive value (for agent-talkie) | Complexity | Why not automatically copied by “frameworks” |
|---------|--------------------------------------|------------|---------------------------------------------|
| **Session-as-unit across vendor runtimes** | Same pattern for Cursor + Claude Code + Codex side-by-side | High | Most tools optimize intra-product subagents |
| **Local-first default (zero external services)** | Instant solo + team extension without cloud onboarding | Med | Hosted platforms optimize for their cloud |
| **Conversation-first protocol semantics** | Multi-turn unblock loops, not DAG-only workflows | Med | Many orchestrators center tasks/graphs |
| **Orchestrator + direct peer mesh** | Orchestrator owns outcome without forcing hub-and-spoke traffic | Med | Simpler products pick one topology |
| **Native interruption model** | Surfaces *which* session needs human in native UX; doesn’t fake approvals | Med | Keeps trust boundaries clear |
| **Multi-human BYO session** | Team shape: each human’s local agents in one space | Med–High | Single-tenant dev tools rarely model this |
| **Narrow core: messages + collaboration metadata** | Avoids boiling the ocean; harnesses for code/diffs | Low (scope discipline) | Platforms tend to grow artifact models |
| **Single canonical protocol (local = remote)** | Same mental model when relay moves | Med | Many stacks fork “dev” vs “prod” messaging |
| **v1 one-channel discipline** | Faster ship; clear mental model | Low | Competitors may push multi-room complexity early |

**Potential later differentiators** (not required for MVP credibility; align with PROJECT.md “idea for later”):

- Session finder / “ring my terminal” style UX  
- Richer **invitation** UX without breaking local-first defaults  

### Anti-features

Deliberately **out of scope** — aligned with PRD **non-goals** and PROJECT **Out of Scope**.

| Anti-feature | Why avoid | PRD / project anchor |
|--------------|-----------|----------------------|
| **Hosted agent execution / sandboxes** | Violates “connect existing sessions”; operational + trust burden | PRD non-goals; PROJECT Out of Scope |
| **Centralized long-term memory platform** | Collides with “local context stays local” | PRD non-goals; PROJECT |
| **Full workspace sync / mirror all repos** | Security, noise, scope creep | PRD non-goals; ARCHITECTURE |
| **Implicit global context from channel visibility** | Every message auto-injected everywhere | PRD non-goals; routing principle |
| **Replacing native approval / auth / prompts** | Wrong trust boundary | PRD non-goals; unblocking model |
| **General-purpose agent harness framework** | Becomes second LangGraph; narrows product | PRD “narrow boundary”; non-goals |
| **Git conflict / worktree management** | Problem belongs to dev workflows | PRD non-goals; PROJECT |
| **Default NATS / Kafka / Postgres / Firebase** | Breaks zero-external-services default | PROJECT + ARCHITECTURE |
| **Ambient discovery = membership** | LAN or “seen on network” join | PRD explicit participation |
| **Solo/local/team mode-switching UX** | Artificial modes; use invite/join | ARCHITECTURE-CONSTRAINTS |
| **Multi-channel per session (v1)** | Deferred complexity | PROJECT simplification note |
| **Runtime brand as identity** | Wrong abstraction | PRD session first |

---

## Feature Dependencies

Directed edges: **A → B** means B depends on A.

```
Session identity + validation (envelope)
  → Join/leave space + membership (SQLite)
  → WebSocket relay + daemon lifecycle
  → Routed messaging (direct + orchestrator paths)
  → Multi-turn threads / timeline
  → Collaboration metadata patches + visibility
  → Adapter ingress (per runtime)
  → Human oversight surface (minimal → richer)

Explicit trust (invite/token)
  → Remote relay deployment story (same protocol)
```

**Ordering insight for roadmaps:**

1. **Identity + envelope + store** before rich UX.  
2. **Relay + routing** before orchestrator semantics (orchestrator needs deliverability).  
3. **Adapters** parallelizable per runtime but need stable protocol hooks.  
4. **Orchestrator behaviors** (follow-up, synthesis) need **thread state** and **metadata**.  
5. **Cross-machine** trust model gates **remote relay** polish, not necessarily first local prototype.

---

## MVP Definition (feature slice)

**Goal:** A human running two (or more) **real** coding-agent sessions in **different** runtimes can put them in **one** space and **stop manually shuttling** prompts/outcomes, with **explicit join** and **local-first** defaults.

**MVP should include**

- Local relay (auto lifecycle), WebSocket core, SQLite SoT  
- Join one space per session; leave  
- Named sessions with minimal workspace/runtime labels  
- Deliver **session↔session** and **human→orchestrator (default)** paths; orchestrator can **assign / consolidate** at least at message-routing level  
- Multi-turn: thread or sequence model persisted enough to resume after reconnect  
- Collaboration metadata **v0**: role, focus, progress/blocked (even if partially manual)  
- One or two **adapters** proving cross-runtime (exact runtimes = implementation choice)  
- Versioned envelope + validation; idempotency on defined operations  

**MVP can defer**

- Polished multi-human invitation UX (if single-machine MVP: still design token hook)  
- Deep orchestrator automation (proactive follow-up agents) — start with **protocol + role**  
- Rich harness-driven artifact exchange in core  
- Session finder / Web UI  

**MVP must not include**

- Hosted execution, centralized memory, full workspace sync (see Anti-features)

---

## Feature Prioritization Matrix

Legend: **U** = user/value urgency for core thesis, **E** = engineering effort (rough), **R** = risk if wrong, **V** = vertical slice value for demos.

| Feature | U | E | R | V | Notes |
|---------|---|---|---|---|-------|
| Relay + WS + SQLite | High | High | High | High | Foundation |
| Envelope + schema + idempotency | High | Med | High | Med | Interop safety |
| Session identity + naming | High | Med | Med | High | PRD core |
| Join/leave + one space | High | Med | Low | High | v1 rule |
| Routed messaging | High | Med | High | High | vs broadcast-as-context |
| Adapter (runtime A) | High | High | High | High | Proof |
| Adapter (runtime B) | High | High | High | High | Cross-runtime proof |
| Orchestrator role + default human routing | High | Med | Med | High | Control point |
| Collaboration metadata | Med–High | Med | Med | Med | Legibility |
| Human oversight surface (minimal) | Med–High | Med | Med | Med | CLI OK early |
| Multi-human + invite/token | Med | Med–High | High | Med | Trust model |
| Remote relay (same protocol) | Med | Med | Med | Low early | Natural extension |
| Proactive orchestrator follow-ups | Low early | High | Med | Low | Nice later |

---

## Competitor Feature Analysis

*Purpose:* Map **adjacent products** to features — not to clone them, but to show **table stakes overlap** vs **differentiation**.

### A. Agent-to-agent interoperability protocols (e.g. A2A-style)

**Typical feature set:** agent cards / capability discovery, standardized RPC-style interaction, enterprise auth, long-running tasks, HTTP/SSE/JSON-RPC stacks, vendor-neutral *agent* endpoints.

**Overlap with agent-talkie:** “agents can talk without you copy-pasting,” security-minded interaction, multi-vendor story.

**Gap vs this product:** Protocols like [Google’s A2A announcement](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability) target **interoperable agent services** (often server-to-server, productized agents), not **attaching to an already-running Cursor/Codex terminal session**. agent-talkie optimizes for **live session wiring + human-local trust**, not enterprise agent marketplaces.

**Confidence:** MEDIUM (ecosystem positioning from public materials; A2A scope evolves).

### B. Tool/context protocols (e.g. MCP)

**Typical feature:** standard tool/data attachment to a host; stdio or HTTP+SSE; reduces N×M integrations.

**Overlap:** “pluggable wiring” mindset; stdio as **adapter edge** is compatible with ARCHITECTURE-CONSTRAINTS.

**Gap:** MCP is **tool/context for a host**, not **a shared collaboration space with orchestrator semantics across multiple human-local sessions**. Multi-agent papers/extensions (e.g. shared context store proposals) trend **centralized** — tension with **local context stays local**.

**Sources:** [Anthropic MCP introduction](https://www.anthropic.com/research/model-context-protocol); engineering posts on code execution with MCP.

### C. Multi-agent orchestration frameworks (LangGraph, CrewAI, AutoGen-style, etc.)

**Typical features:** task decomposition, supervisor/worker graphs, state machines, tracing, sometimes hosted runners.

**Overlap:** orchestration, multi-turn flows, roles.

**Gap:** Usually **single stack / single process / single runtime environment** assumptions; not **session-first cross-vendor** with **no execution hosting**. agent-talkie’s differentiator is **interop at the session edge**, not replacing internal subagent systems.

**Confidence:** MEDIUM — category is broad; map to specific framework when implementing harness examples.

### D. Coding-agent products (Cursor, Claude Code, Codex, etc.)

**Typical features:** native tools, approvals, workspace index, subagents *inside* the product.

**Overlap:** users already there; adapters must **respect** native UX.

**Gap:** They **don’t** standardize **each other’s** live sessions; agent-talkie is the **bridge layer**.

### E. Chatops / team messaging (Slack, Discord bots, etc.)

**Typical features:** channels, bots, notifications.

**Overlap:** “channel” metaphor, human visibility.

**Gap:** Not session-typed, no **orchestrator role for coding agents**, no **runtime-local trust model** by default; risk of **implicit broadcast-as-context** if copied naively.

---

## Sources

| Source | Used for | Confidence |
|--------|----------|------------|
| `PRD.md` (agent-talkie) | Principles, capabilities, non-goals | HIGH |
| `ARCHITECTURE-CONSTRAINTS.md` | Default stack, boundaries | HIGH |
| `.planning/PROJECT.md` | Active requirements, out-of-scope list | HIGH |
| [Google Developers Blog — A2A](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability) | Competitor/protocol positioning | MEDIUM |
| [Anthropic — Model Context Protocol](https://www.anthropic.com/research/model-context-protocol) | MCP scope vs collaboration layer | MEDIUM |
| Web search synthesis (orchestration / MCP multi-agent articles, 2026) | Ecosystem trends | LOW–MEDIUM |

---

## Quality gate (self-check)

- [x] Categories clear: **Table stakes**, **Differentiators**, **Anti-features**  
- [x] Complexity noted per feature (Low / Med / High)  
- [x] Dependencies documented (graph + ordering notes)  
- [x] Features align with PRD design principles (Executive alignment table)  
- [x] Anti-features match PRD non-goals and PROJECT out-of-scope  

## Gaps for downstream requirements work

- Exact **invite/token** UX and **orchestrator failover** (PRD open questions) → phase-specific specs.  
- **Adapter** parity plan (which runtimes first) → roadmap, not features doc.  
- **Transcript durability** split (SQLite vs export) → architecture research companion doc.
