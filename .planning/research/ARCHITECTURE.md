# Architecture Research: Cross-Runtime Agent Collaboration Layer

**Product:** agent-talkie  
**Dimension:** Architecture (heterogeneous sessions, local-first, orchestration)  
**Researched:** 2026-04-09  
**Confidence:** **MEDIUM** — synthesis from published multi-agent patterns, collaboration-system design, and MCP’s documented host/client/server model; not verified against a shipped agent-talkie implementation.

## System Overview

Typical systems that connect **independently running** peers (different products, processes, or transports) converge on a **thin collaboration core** plus **runtime-specific adapters**. Real-time behavior is usually implemented as **long-lived connections** (WebSocket, SSE, MQTT, or stdio framing) with a **relay or broker** in the middle; **strong convergence** of rich shared state (CRDTs) is optional and is a separate product bet from **message routing + metadata**.

```
                    +------------------ human surface ------------------+
                    |  oversight UI, approvals, space membership, audit  |
                    +---------------------------+------------------------+
                                                |
                    +---------------------------v------------------------+
                    |           Collaboration Core (product)            |
                    |  spaces, session registry, routing, metadata, ACL  |
                    +--+---------------+---------------+---------------+-+
                       |               |               |               |
              +--------v----+   +------v------+  +-----v------+  +----v-----+
              |  Transport  |   |  Metadata   |  |  Routing   |  | Presence |
              |  / relay    |   |  store      |  |  policy    |  | / typing |
              +-------------+   +-------------+  +------------+  +----------+
                       |
         +-------------+-------------+ ... -------------+
         |                           |
   +-----v------+              +-----v------+
   |  Adapter   |              |  Adapter   |   (one per runtime / install shape)
   |  Cursor    |              |  Codex     |
   +-----+------+              +-----+------+
         |                           |
   +-----v------+              +-----v------+
   | Local host |              | Local host |
   | (session)  |              | (session)  |
   +------------+              +------------+
```

**Reading the diagram:** humans and policy attach at the top; the core owns **cross-session** truth (who is in which space, what is routed where, collaboration fields like role/focus). Each **adapter** is the only component that should know Cursor vs Claude Code vs Codex **wire format and UX hooks**; the core speaks a **normalized collaboration envelope** (see Data Flow).

## Component Responsibilities


| Component                        | Responsibility                                                                                             | Talks to                        | Must not                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------- |
| **Human surface**                | Spaces, membership, visibility, intervention, export/audit                                                 | Core APIs, auth                 | Replace native runtime approval UX (per product scope)           |
| **Collaboration core**           | Space lifecycle, session identity, routing rules, orchestrator binding, metadata schema                    | Adapters, metadata store, relay | Absorb full workspace context by default                         |
| **Transport / relay**            | Durable fan-out, ordering (if chosen), reconnect, optional persistence of messages                         | Adapters, core                  | Encode runtime-specific tool protocols                           |
| **Metadata store**               | Roles, progress, focus, pointers to artifacts — **product-owned**                                          | Core                            | Store raw repo secrets or full file trees without explicit share |
| **Routing / policy**             | Peer-first rules, orchestrator default for human input, escalation                                         | Core, metadata                  | Impersonate a session without opt-in                             |
| **Presence / typing (optional)** | Lightweight signals for “who is active / thinking”                                                         | Relay, adapters                 | Block message delivery                                           |
| **Runtime adapter (connector)**  | Map local session ↔ normalized envelope; handle local auth; attach/opt-in                                  | Local agent host, relay         | Reimplement each runtime’s internal subagent system              |
| **Orchestrator session**         | Same as any session at the wire level; **semantics** = default recipient of human steering + consolidation | Core, peers                     | Centralize all reasoning (anti-pattern if forced)                |


**Orchestrator note:** Architecturally it is usually a **role** (and routing rules) applied to a normal session, not a separate binary — unless you deliberately split “coordination service” from “participant” for reliability.

## Recommended Project Structure

Suggested repository layout that keeps boundaries enforceable:

```
packages/
  core/                 # space + session model, routing policy, metadata schema (pure logic)
  protocol/             # versioned message envelope, capability flags, error codes
  relay/                # optional: standalone process for fan-out / persistence
  adapters/
    cursor/             # extension or bridge: hooks, commands, transport client
    claude-code/        # plugin / CLI sidecar pattern
    codex/              # ...
  human-app/            # minimal UI / TUI: spaces, transcript, intervention
```

**Dependency rule:** `adapters/`* → `protocol` (+ `core` client SDK). `relay` → `protocol`. `human-app` → `core` API. Avoid adapters importing each other.

## Architectural Patterns

### 1. Normalized envelope + adapters (mandatory for heterogeneity)

Each runtime exposes different surfaces (slash commands, MCP, LSP, custom APIs). The collaboration layer should define a **single internal message type**: identity, space id, thread/conversation id, payload type (text, structured question, metadata patch), and **explicit references** to shared artifacts rather than inlined secrets.

This mirrors **protocol layering**: a stable inner schema and pluggable outer transport — analogous in spirit to MCP’s separation of data layer (JSON-RPC semantics) and transport (stdio vs HTTP) ([Model Context Protocol architecture overview](https://modelcontextprotocol.io/docs/concepts/architecture)).

### 2. Hub-and-spoke vs peer delivery

Production multi-agent discussions commonly list **hub-and-spoke** (central broker/orchestrator), **pipeline**, **peer-to-peer**, and **hierarchical** topologies. For **cross-runtime** tools with a **local-first** posture:

- **Logical** peer-to-peer (session A ↔ session B) improves narrative fit (“sessions talk directly”).
- **Physical** delivery is still often **via a relay** on-device or team-owned — for fan-out, ACL enforcement, and audit — unless you adopt full mesh with pairwise authenticated links (operationally heavy).

**Recommendation for agent-talkie:** **logical direct addressing** with **physical relay** (and optional P2P later for niche deployments).

### 3. Collaboration metadata as first-class patches

Metadata (role, progress, focus) should be **small, structured events** (patch or CRDT-like maps) rather than embedding in free-form chat only. That supports automation, filters, and human dashboards without parsing natural language.

### 4. Local-first trust

“Local context stays local” implies:

- **Default:** payloads are **references + summaries**; fetching full content is **explicit** and **scoped**.
- **Storage:** metadata and transcripts may be **local encrypted store** + **relay**; strong CRDT merge across machines is only needed if you build **offline-first shared documents** — usually **not** the first milestone for agent chat.

### 5. Orchestrator as policy, not as sole bottleneck

The orchestrator **receives default human input** and **coordinates**, but peer channels should stay open for **multi-turn** clarification — otherwise the product collapses to “single dispatcher,” conflicting with conversation-first goals.

## Data Flow

**Directions are explicit below (producer → consumer).**

### Session registration (opt-in)

```
Adapter → Core: register_session(capabilities, workspace_id, human_id?, public_key?)
Core → Metadata store: upsert session record
Core → Relay: authorize connection for session_id
Relay → Adapter: connection ack + space subscriptions
```

### Outbound message (session → peers)

```
Adapter → Core: submit_message(envelope)  [optional pre-check: policy, size, redaction]
Core → Routing: resolve recipients (peers + orchestrator rules + human visibility)
Routing → Relay: fan_out(envelope, recipient_session_ids)
Relay → Adapters: push / poll chunk
Adapter → Local host: inject as native UX (panel, tool result, command output)
```

### Human steering (default to orchestrator)

```
Human surface → Core: human_input(text | structured command)
Core → Routing: route_to(orchestrator_session_id) + broadcast visibility as policy dictates
Relay → Orchestrator adapter → runtime
```

### Metadata update (collaboration layer owned)

```
Any adapter → Core: metadata_patch(space_id, patch)
Core → Metadata store: apply + version
Core → Relay: fan_out_metadata(subscribers)
```

### Peer question resolution (peer-first)

```
Session A adapter → Core: question(envelope targeting B or space)
Routing: try direct session B; if absent, escalate to orchestrator/human per rules
```

**Ordering:** Most relays choose **per-thread total order** (simpler UX) or **causal** (weaker guarantees). Cross-space ordering is rarely needed; document the choice.

## Scaling Considerations


| Scale                         | Pressure         | Typical response                                                     |
| ----------------------------- | ---------------- | -------------------------------------------------------------------- |
| **Few sessions, one machine** | Process count    | Single local relay; stdio or localhost socket; SQLite/FS metadata    |
| **Team, many spaces**         | Connection count | Horizontal relay partitions by space; sticky routing per space       |
| **Large messages**            | Bandwidth        | Chunking, blob sidecar (user-approved upload), reference by URL/hash |
| **Many adapters**             | Version skew     | Strict `protocol` versioning; capability negotiation at handshake    |
| **Compliance**                | Retention        | Explicit retention on relay; adapters avoid logging secrets          |


## Anti-Patterns


| Anti-pattern                           | Why it hurts                         | Instead                                   |
| -------------------------------------- | ------------------------------------ | ----------------------------------------- |
| **Runtime-specific types inside core** | Every new tool requires core changes | Envelope + adapter translation            |
| **Silent full workspace sync**         | Breaks local-first trust             | Opt-in shares, references                 |
| **Orchestrator-only message path**     | Kills peer multi-turn                | Peer routing + orchestrator as role       |
| **CRDT-first without a doc product**   | Heavy engineering before message MVP | Relay + ordered log for v1                |
| **Ambient discovery**                  | Violates explicit opt-in             | Invite, slash command, signed join token  |
| **Replacing native approval UX**       | Out of scope; fragile                | Surface pending actions in human-app only |


## Integration Points


| Integration                       | Role for agent-talkie                                                                     | Notes                                                                                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MCP**                           | Adapters may expose **tools/resources** so a host can send/receive collaboration messages | MCP is **host↔server context**, not a standard for agent↔agent; still useful as **integration surface** ([MCP architecture](https://modelcontextprotocol.io/docs/concepts/architecture)) |
| **LSP / editor APIs**             | Cursor-like adapters: panels, commands, webviews                                          | Product-specific                                                                                                                                                                         |
| **CLI sidecars**                  | Claude Code / Codex style: subprocess or socket bridge                                    | Keep protocol identical to GUI adapters                                                                                                                                                  |
| **A2A / agent federation papers** | Conceptual alignment: capability discovery, semantic routing                              | Evaluate for **future** interoperability; URLs and specs move — validate before hard dependency                                                                                          |
| **MQTT / pub-sub**                | Optional transport for fan-out                                                            | Useful if you already operate brokers; not required for MVP                                                                                                                              |


## Suggested Build Order (dependencies)

1. `**protocol` + session/envelope model** — unlocks parallel adapter work.
2. **Core logic (routing rules, orchestrator role binding, ACL)** — in-memory first.
3. **Minimal relay** (localhost, single process) — proves fan-out and reconnect.
4. **One reference adapter** (deepest engagement runtime) — end-to-end dogfood.
5. **Metadata store + patches** — legibility for humans and peers.
6. **Second adapter** — forces generalization (no Cursor-isms in core).
7. **Human surface** — oversight, membership, intervention.
8. **Hardening** — persistence, auth between relay and adapters, quotas.

**Critical path:** `protocol` → `relay` → **first adapter**; metadata and human surface can trail slightly but should not be deferred past early dogfood or you lose the “collaboration layer” feel.

## Sources

- [Model Context Protocol — Architecture overview](https://modelcontextprotocol.io/docs/concepts/architecture) — Host / client / server, JSON-RPC data layer, transport separation (**HIGH** for MCP claims).  
- Multi-agent topology summaries (hub-spoke, P2P, hierarchical) — e.g. industry write-ups such as [Multi-Agent Orchestration Patterns (2026)](https://amirbrooks.com.au/guides/multi-agent-orchestration-patterns) (**MEDIUM** — secondary, not a standard).  
- Research directions on federated / semantic agent fabrics — e.g. [Federation of Agents (arXiv)](https://arxiv.org/html/2509.20175v1), [Mod-X (arXiv)](https://arxiv.org/pdf/2507.04376) (**LOW–MEDIUM** for production structure — academic, informs long-term options).  
- Local-first / CRDT vs relay discussions — e.g. [Multi-user collaboration: CRDTs and real-time syncing (2026)](https://blog.weskill.org/2026/03/multi-user-collaboration-crdts-and-real.html) (**MEDIUM** — general software architecture).  
- **Project authority:** [.planning/PROJECT.md](../PROJECT.md) — requirements, trust model, orchestrator semantics (**HIGH** for product constraints).

