# Feature Research

**Domain:** Cross-runtime coding-agent collaboration (session-connected workspaces)  
**Product:** agent-talkie  
**Researched:** 2026-04-09  
**Confidence:** **MEDIUM** — patterns are grounded in adjacent categories (orchestration SaaS, agent observability, multi-agent frameworks, enterprise AI control planes). Direct “Cursor + Claude Code + Codex in one product” comparables are sparse; several claims extrapolate from neighboring markets and should be revalidated against user interviews.

## Scope note (agent-talkie–specific)

This research is filtered through **PROJECT.md** principles: **session-first**, **conversation-first**, **existing-runtime-first**, **BYO agents**, **humans not middleware**, **local context stays local**, **explicit opt-in**, **narrow tool-layer semantics**. Features that assume **hosted agent execution**, **centralized code/context ingestion**, or **replacing native runtime UX** are treated as **anti-features** or out-of-category unless noted.

---

## Feature Landscape

### Table stakes (users expect these)

Missing these, a “collaboration layer” feels broken or unsafe; users churn or revert to copy-paste.

| Dimension | Feature | Why expected | Complexity | Notes |
|-----------|---------|--------------|------------|-------|
| **Session management** | Stable session identity | Others must address *this* session across reconnects and restarts | MEDIUM | Tie to user + device + explicit session name; avoid fragile “runtime instance” IDs only. |
| **Session management** | Join / leave / revoke participation | Users must control when a session is “in the room” | LOW–MEDIUM | Aligns with explicit opt-in; “network presence ≠ membership.” |
| **Session management** | Durable membership in a space | Collaboration isn’t a one-shot TCP session | MEDIUM | Needs clear semantics when a runtime restarts (same logical session vs new). |
| **Messaging** | Deliver messages to intended recipient session | Without delivery guarantees, coordination fails | MEDIUM | At minimum: at-least-once + dedupe keys; ordering per thread. |
| **Messaging** | Threaded or structured conversation units | Long-running work produces context; flat firehose is unusable | MEDIUM | “Conversation first” implies threads, replies, or explicit topic handles—not only one-shot jobs. |
| **Messaging** | Addressing by **session**, not only by runtime brand | Same product can run multiple sessions; brand is ambiguous | LOW–MEDIUM | Core differentiator is also a usability requirement. |
| **Orchestration** | Clear **orchestrator** / coordinator role semantics | Someone owns momentum, consolidation, default routing | MEDIUM | Many frameworks use hierarchical or manager patterns (e.g., manager + workers); product must define *human-default* and *session-default* behavior. |
| **Orchestration** | Escalation path from peer → orchestrator → human | Otherwise humans become implicit routers | MEDIUM | AutoGen-style modes (always / on terminate / never) are a useful analog for *when* to pull humans. |
| **Visibility / observability** | Human-visible **transcript** of collaboration | Oversight without reading every runtime’s private UI | MEDIUM | This is not the same as full chain-of-thought export; see anti-features. |
| **Visibility / observability** | Basic **status** signals (active, idle, blocked, error) | Others need to coordinate without polling humans | LOW–MEDIUM | “Collaboration metadata” (role, progress, focus) belongs here. |
| **Human-in-the-loop** | Human can **observe** and **intervene** without being the message bus | Principle: humans supervise, don’t shuttle | MEDIUM | Intervention may be “message orchestrator” or “broadcast clarification,” not retyping patches between tools. |
| **Workspace awareness** | Shared **workspace pointers** (repo, branch, root path) | Table stakes for *coding* agents to interpret “where we are” | LOW–MEDIUM | Depth can stay shallow v1; must be honest about staleness. |
| **Trust / access control** | **Explicit opt-in** to a space (invite, slash command, attach flow) | Prevents ambient surveillance of local agents | LOW–MEDIUM | Enterprise products stress workspace isolation + membership; same psychological bar applies to individuals. |
| **Trust / access control** | **Space-scoped** participation (who is in this room) | Multi-human teams need boundaries | MEDIUM | Maps to org → workspace patterns in team SaaS without requiring enterprise features day one. |
| **Team collaboration** | Multiple humans, each with local sessions, same space | Stated requirement for team use | MEDIUM | Must not assume single human operator. |

### Differentiators (competitive advantage)

These are where agent-talkie can win **if** table stakes are met. Several directly contradict “hosted fleet” orchestration products—intentionally.

| Dimension | Feature | Value proposition | Complexity | Notes |
|-----------|---------|-------------------|------------|-------|
| **Cross-runtime** | **Runtime-agnostic session linking** (Cursor, Claude Code, Codex, …) | Removes the copy-paste bridge *between products* | HIGH | Hard problem; success is the core wedge. |
| **Conversation-first** | **Multi-turn negotiation** (clarify, challenge, re-scope) vs one-shot task dispatch | Captures how real engineering work proceeds | MEDIUM–HIGH | Task queues alone don’t substitute; needs conversational primitives in the protocol/UI. |
| **Architecture** | **BYO execution** — connect sessions users already run | No migration to a hosted agent platform | MEDIUM | Tradeoff: less uniform observability than LangSmith-style integrated tracing. |
| **Trust** | **Local-first context** — coordination without centralizing code | Acceptable for security-conscious teams | HIGH | Must pair with clear “what left the machine” disclosure. |
| **Orchestration** | **Peer-first resolution** before human escalation | Reduces human as middleware | MEDIUM | Pattern: delegate / ask-colleague (cf. crew-style delegation) before paging a person. |
| **Metadata** | **Collaboration-layer metadata** (role, progress, focus) not buried in each repo | Cross-session legibility without shared memory platform | MEDIUM | Aligns with “metadata managed by collaboration layer” decision. |
| **Team** | **Session-level presence** across humans’ machines | Team-scale coordination without shared VMs | HIGH | Operational concerns: NAT, credentials, policy—often P2 or P3 for polish. |
| **Visibility** | **Cross-session timeline** optimized for humans (decisions, blockers, handoffs) | Faster review than replaying three IDE transcripts | MEDIUM | Different from developer-oriented trace viewers. |

### Anti-features (deliberately do not build)

Aligned with **PROJECT.md** out-of-scope and common multi-agent platform traps.

| Feature (request pattern) | Why it sounds appealing | Why it’s problematic for agent-talkie | Alternative |
|----------------------------|-------------------------|--------------------------------------|-------------|
| **Hosted autonomous agent fleet** (“run all agents in our cloud”) | Uniform scaling, easy demos | Violates **existing-runtime-first**, **BYO agents**, and local trust | Stay execution-local; host only coordination + metadata. |
| **Central “source of truth” codebase or full workspace sync** | Perfect workspace awareness | Violates **local context stays local**, huge data liability | Share **pointers + explicit excerpts**; optional user-approved bundles only. |
| **Global ambient discovery** (“see all agents on LAN/VPN”) | Magic pairing | Violates **explicit opt-in**, creates surveillance risk | Invites, pairing codes, org directory—**explicit** joins. |
| **Replace native approval / auth / prompt UX** | Single pane for all approvals | Explicitly **out of scope**; fight you can’t win per runtime | Deep links + summarized **intent** in collaboration layer; user acts in native UI. |
| **Full reasoning / tool trace export by default** | Debugging nirvana | Privacy, IP, noise; may leak secrets from local context | Opt-in redacted exports; prefer **decision-oriented** human logs. |
| **Generic multi-agent git merge / conflict resolver** | “Agents broke the repo—fix it” | **Out of scope**; different product category | Surface **branch/PR pointers** and human-handoff messages; use normal git workflows. |
| **Omnibus harness framework in v1** | Faster feature velocity | Conflicts with **narrow tool-layer semantics** | Core: message exchange + collaboration metadata; **harnesses second**. |
| **Omniscient orchestrator auto-routing everything** | Removes thinking | Humans lose agency; debuggability drops | Transparent routing rules + orchestrator **explainable** summaries. |
| **Persistent cross-session memory platform** | Long-term learning | **Out of scope** per PROJECT.md | Optional integrations later; don’t become the memory vendor by default. |

---

## Feature dependencies

```text
[Explicit opt-in + space membership]
    └──requires──> [Stable session identity]
                           └──requires──> [Session lifecycle: join/leave/reconnect semantics]

[Threaded / structured messaging]
    └──requires──> [Reliable delivery + dedupe]
                           └──enhances──> [Human-visible transcript]

[Orchestrator role]
    └──requires──> [Addressing by session + message routing]
    └──enhances──> [Escalation: peer → orchestrator → human]

[Workspace pointers (repo/branch/path)]
    └──enhances──> [Peer-first Q&A and handoffs]
    └──requires──> [Honest staleness / refresh model] (soft dependency)

[Cross-runtime linking]
    └──requires──> [Runtime-agnostic wire protocol + adapters]
    └──conflicts-with──> [“Single SDK owns all traces”] (architectural tension, not user feature)

[Team-scale multi-human]
    └──requires──> [Space-scoped RBAC / roles (even if minimal)]
    └──requires──> [Audit-friendly collaboration log]
```

### Dependency notes

- **Opt-in and membership require stable session identity** — otherwise revokes and invites attach to the wrong participant.
- **Orchestrator depends on routing** — “coordinator” is meaningless without deterministic addressing and delivery.
- **Workspace pointers enhance peer resolution** — coding agents ask better questions when branch/repo context is shared; without it, collaboration degrades to generic chat.
- **Cross-runtime linking** tensions with **deep observability**: integrated platforms (e.g., LangSmith-style tracing) trade away heterogeneity; agent-talkie should not depend on owning execution traces.
- **Team features** need **minimal trust primitives** early — even simple “owner / member / guest” prevents spaces becoming public IRC for agents.

---

## MVP definition

### Launch with (v1)

Minimum to validate: *sessions collaborate across runtimes without the human as copy-paste middleware.*

- [ ] **Named sessions** with stable identity and runtime label (label for UX, not routing key) — *identity table stakes*.
- [ ] **Shared collaboration space** with explicit join (slash/attach/invite) — *opt-in + membership*.
- [ ] **Session-to-session messaging** across at least two distinct runtime adapters — *core wedge*.
- [ ] **Threads or reply structure** for multi-turn exchanges — *conversation-first*.
- [ ] **Orchestrator role** + default routing rules (e.g., human → orchestrator → fan-out) — *coordination table stakes*.
- [ ] **Peer-first escalation policy** (try session peers before human) — *principle enabler*.
- [ ] **Collaboration metadata** surface (role, progress, focus) stored in layer — *legibility*.
- [ ] **Human-visible transcript + basic session status** — *oversight table stakes*.
- [ ] **Workspace pointers** (repo, branch, root) — *coding-agent table stakes*, can be manual v1.

### Add after validation (v1.x)

- [ ] **Rich delivery guarantees** (ordering, read receipts if needed) — *trigger: user complaints about lost messages*.
- [ ] **Minimal RBAC** (owner/member/guest) and audit export — *trigger: first team customer*.
- [ ] **Reconnect continuity** (session tokens, device pairing) — *trigger: daily-driver usage*.
- [ ] **Harness hooks** for richer artifacts — *trigger: repeated custom payload hacks*.

### Future consideration (v2+)

- [ ] **Federated identity / SSO** for enterprises — *defer until enterprise pull*.
- [ ] **Policy engine** (data residency, allowlisted peers) — *defer until compliance sales cycle*.
- [ ] **Optional** trace capture with redaction pipeline — *only if customers demand parity with observability SaaS*.

---

## Feature prioritization matrix

| Feature | User value | Implementation cost | Priority |
|---------|------------|-------------------|----------|
| Cross-runtime session messaging | HIGH | HIGH | P1 |
| Explicit opt-in + space membership | HIGH | MEDIUM | P1 |
| Stable session identity + lifecycle | HIGH | MEDIUM | P1 |
| Orchestrator role + routing | HIGH | MEDIUM | P1 |
| Threaded / multi-turn structure | HIGH | MEDIUM | P1 |
| Human-visible transcript + status | HIGH | MEDIUM | P1 |
| Collaboration metadata (role/progress/focus) | MEDIUM | MEDIUM | P1 |
| Workspace pointers (repo/branch/path) | HIGH | LOW–MEDIUM | P1 |
| Peer-first escalation | MEDIUM | MEDIUM | P2 |
| Minimal team RBAC + audit | MEDIUM | MEDIUM | P2 |
| Reconnect + session continuity polish | MEDIUM | MEDIUM | P2 |
| Deep observability / full traces | LOW (for stated principles) | HIGH | P3 |
| Hosted execution / unified runner | NEGATIVE vs positioning | HIGH | Avoid |

**Priority key:** P1 = launch / validation path; P2 = next after traction; P3 = only with shifted strategy.

---

## Sources

- **LangChain / LangGraph / LangSmith** — observability patterns: run tracing, selective tracing, cost/latency dashboards ([LangSmith observability docs](https://docs.langchain.com/oss/javascript/langgraph/observability), [LangSmith product](https://www.langsmith.com/langgraph)). *Use:* inform what users may **ask for**, not what agent-talkie must replicate locally.
- **Microsoft AutoGen** — multi-agent conversation + human input modes (`NEVER` / `TERMINATE` / `ALWAYS`) and group chat patterns ([Human feedback tutorial](https://microsoft.github.io/autogen/0.2/docs/tutorial/human-in-the-loop), [Conversation patterns](https://microsoft.github.io/autogen/0.2/docs/tutorial/conversation-patterns/)). *Use:* HITL and escalation semantics.
- **CrewAI** — delegation / ask-colleague collaboration and hierarchical processes ([Collaboration](https://docs.crewai.com/en/concepts/collaboration), [Hierarchical process](https://docs.crewai.com/learn/hierarchical-process)). *Use:* peer delegation prior to human escalation.
- **Enterprise control planes (e.g., GitHub)** — audit, actor identification, agentic session monitoring ([Monitor agentic activity](https://docs.github.com/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/monitor-agentic-activity), [Enterprise AI controls changelog](https://github.blog/changelog/2026-02-26-enterprise-ai-controls-agent-control-plane-now-generally-available)). *Use:* team RBAC + audit expectations.
- **Industry summaries** — orchestration capability checklists (observability, checkpoints, routing) e.g. [Deloitte 2026 orchestration outlook](https://www.deloitte.com/us/en/insights/industry/technology/technology-media-and-telecom-predictions/2026/ai-agent-orchestration.html). *Use:* sales-language feature pressure; validate against principles before building.

---

*Feature research for: agent-talkie (cross-runtime agent collaboration layer)*  
*Researched: 2026-04-09*
