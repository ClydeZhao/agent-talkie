<!-- gsd-project-start source:PROJECT.md -->
## Project

**agent-talkie**

A collaboration layer that connects independently running coding agent sessions across different runtimes (Cursor, Claude Code, Codex, etc.) into a shared collaboration space. Instead of forcing the human to copy-paste between tools, sessions talk directly, coordinate through an orchestrator, and resolve questions peer-to-peer.

**Core Value:** Running agent sessions can collaborate directly across runtime boundaries without the human acting as a copy-paste bridge.

### Constraints

- **Architecture**: Must work with existing runtimes without requiring them to change their internal architecture
- **Trust model**: Local-first — local context stays on user's machine unless deliberately shared
- **Participation**: Explicit opt-in required; network presence alone must not grant membership
- **Scope**: Collaboration layer only — no git conflict avoidance, no hosted memory, no runtime replacement
<!-- gsd-project-end -->

<!-- gsd-stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology                                                                                             | Version                                         | Purpose                                                                         | Why Recommended                                                                                                                                                                                                                                                                                                                                       | Confidence                                                                                          |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **NATS Server**                                                                                        | **2.12.6** (pin; track patch releases)          | Message routing, fan-out, optional persistence, queue groups                    | Subject-based routing maps cleanly to *spaces* and *sessions*; first-class **request/reply** fits orchestrator commands; **JetStream** gives durable inbox/replay without adopting Kafka ops; **native clients** across Go/Node/Python/etc. suit heterogeneous agent runtimes; WebSocket listener optional for browser/human UI without a second bus. | **HIGH** — verified [latest GitHub release](https://github.com/nats-io/nats-server/releases/latest) |
| **@nats-io/transport-node** + **@nats-io/jetstream** (+ **@nats-io/nats-core** as pulled by transport) | **3.3.1** each (npm latest as of research date) | TypeScript/Node (and similar) access to NATS + JetStream                        | Official modular NATS.js split; JetStream API via `jetstream()` / `jetstreamManager()`; prefer this over legacy monolithic `nats@2.x` for new work per upstream migration guidance.                                                                                                                                                                   | **HIGH** — Context7 `/nats-io/nats.js` + `npm view`                                                 |
| **Hono**                                                                                               | **4.12.12**                                     | HTTP control plane (auth, space/session admin, health)                          | **Web Standards** + multi-runtime (Node/Bun/Workers) so the *same* framework can host edge or VPS deployments; pairs with optional `ws` or a separate NATS connection for data plane.                                                                                                                                                                 | **HIGH** — `npm view` + Context7 `/websites/hono_dev`                                               |
| **PostgreSQL**                                                                                         | **16+** (server); **postgres** driver **3.4.9** | System of record for collaboration metadata (spaces, memberships, roles, audit) | ACID + JSONB for evolving metadata; standard ops story; fits “metadata belongs to the collaboration layer” from `PROJECT.md`.                                                                                                                                                                                                                         | **HIGH** — ecosystem standard; driver version from `npm view`                                       |
| **Drizzle ORM**                                                                                        | **0.45.2**                                      | Typed SQL migrations + queries for metadata                                     | Lightweight schema-as-code; good DX for small teams; avoids heavy ORM magic.                                                                                                                                                                                                                                                                          | **HIGH** — `npm view`                                                                               |
### Supporting Libraries
| Library                              | Version               | Purpose                                                                                         | When to Use                                                                                                                                                 | Confidence                                                                                                |
| ------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Zod**                              | **4.3.6**             | Versioned message envelopes + config validation in TS services                                  | Default for **application JSON protocol** validation and codegen-friendly JSON Schema export for non-TS adapters.                                           | **HIGH** — `npm view`                                                                                     |
| **ioredis**                          | **5.10.1**            | Presence, rate limits, short-lived tokens, optional Socket.IO scale-out                         | Use when you need **TTL-heavy ephemeral state** or a **Socket.IO Redis adapter**; optional if JetStream + NATS KV cover your ephemeral needs.               | **HIGH** — `npm view`                                                                                     |
| **socket.io** + **socket.io-client** | **4.8.3**             | Bidirectional WebSocket (+ fallback) for dashboards or runtimes that already bundle a JS client | **Alternate/complementary data plane** to NATS for web-first clients; use **@socket.io/redis-adapter** **8.3.0** if you horizontally scale Socket.IO nodes. | **HIGH** — [Socket.IO v4 server installation](https://socket.io/docs/v4/server-installation) + `npm view` |
| **ws**                               | **8.20.0**            | Thin WebSocket server when you own framing and do not need Socket.IO features                   | Prefer when **protocol is already NATS-like or JSON-RPC** and you want minimal deps on Node.                                                                | **HIGH** — `npm view`                                                                                     |
| **@bufbuild/protobuf**               | **2.11.0** (optional) | Strongly typed binary messages                                                                  | Only if you outgrow JSON (bandwidth/latency) or need **stable cross-language codegen**; default remains JSON for debuggability across agent tools.          | **MEDIUM** — `npm view`; adoption adds build/tooling cost                                                 |
### Development Tools
| Tool               | Version                                               | Purpose                                           | Notes                                                                               |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **TypeScript**     | **6.0.2** (or current **5.x** LTS if policy requires) | Shared types for server + SDK                     | Pin in repo; validate against Node LTS you target.                                  |
| **drizzle-kit**    | **0.31.10**                                           | Migrations / introspection                        | Pair with Drizzle ORM version from same release notes.                              |
| **Vitest**         | (pin to current stable when scaffolding)              | Unit + integration tests for protocol and routing | Run against Dockerized NATS + Postgres in CI.                                       |
| **Docker Compose** | —                                                     | Local **nats-server**, **postgres**, **redis**    | Matches production topology early; document `nats-server` JetStream config in repo. |
## Installation
# NATS.js modular client (Node) — use transport + jetstream
# HTTP control plane
# Persistence
# Validation
# Optional: Redis ephemeral layer
# Optional: Socket.IO data plane (dashboard or JS-heavy clients)
# Optional: thin WebSocket
# Optional: Protobuf runtime
## Alternatives Considered
| Recommended            | Alternative                              | When to Use Alternative                                                                                                                                |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **NATS + JetStream**   | **Redis Pub/Sub + Streams only**         | Tiny PoC or team already operates Redis at expert level; you accept weaker multi-tenant subject patterns and often build more routing yourself.        |
| **NATS + JetStream**   | **Apache Kafka / Redpanda**              | Very high sustained throughput, long retention analytics, or existing org standard; **avoid for v1** collaboration messaging (ops burden vs. benefit). |
| **Hono**               | **Fastify** or **Express**               | Team mandate or existing middleware ecosystem; swap is localized to HTTP edge if data plane stays NATS.                                                |
| **Drizzle + Postgres** | **Supabase** / **Neon** managed Postgres | Faster hosted MVP; same logical schema; watch egress and connection limits for chatty agents.                                                          |
| **JSON + Zod**         | **Protobuf / gRPC**                      | Many languages must share one strict IDL and you enforce codegen in CI; not required day one.                                                          |
## What NOT to Use
| Avoid                                          | Why                                                                                                                                  | Use Instead                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| **Kafka as the default bus**                   | Operational and modeling overhead for session-scoped traffic; slow local iteration.                                                  | NATS JetStream or Redis Streams until scale proves otherwise.      |
| **GraphQL subscriptions as primary transport** | Schema + resolver complexity for bidirectional agent chatter; debugging multi-session flows is harder than explicit subjects/topics. | NATS subjects or a small JSON protocol over WebSocket.             |
| **Socket.IO alone as global truth**            | Horizontal scale requires sticky sessions or Redis adapter; harder to reuse from non-JS runtimes than NATS TCP clients.              | NATS for cross-runtime core; Socket.IO only at the edge if needed. |
| **Legacy `nats` npm package for new code**     | Upstream modularization; migration path documented toward `@nats-io/*`.                                                              | `@nats-io/transport-node` + `@nats-io/jetstream`.                  |
| **Firebase / proprietary realtime DB as core** | Conflicts with **local-first** and self-hosted collaboration metadata in `PROJECT.md`.                                               | Postgres + self-hosted NATS (or BYO cloud NATS).                   |
## Stack Patterns by Variant
- Use **NATS** as the only message plane; Hono for HTTPS signup/token exchange only.
- Enable **NATS WebSocket** on server **or** front with **Socket.IO** + Redis adapter; keep **one** application message schema (Zod/JSON) behind both.
- Still recommend NATS; use **asyncio NATS** client; validate JSON with **pydantic** mirroring Zod JSON Schema.
## Version Compatibility
| Package A                       | Compatible With            | Notes                                                      |
| ------------------------------- | -------------------------- | ---------------------------------------------------------- |
| `socket.io@4.8.x`               | `socket.io-client@4.8.x`   | Major versions must match between client and server.       |
| `@socket.io/redis-adapter@8.x`  | `socket.io@4.x`, Redis 6/7 | Check adapter release notes when bumping Socket.IO.        |
| `@nats-io/transport-node@3.3.x` | `nats-server@2.12.x`       | Follow NATS server release notes for client feature gates. |
| `drizzle-orm@0.45.x`            | `drizzle-kit@0.31.x`       | Align using Drizzle release pairs.                         |
## Protocol & Adapter Guidance (prescriptive)
## Sources
- Context7 `**/nats-io/nats.js`** — JetStream installation and `jetstream()` / `jetstreamManager()` usage  
- Context7 `**/websites/socket_io_v4**` — Socket.IO v4 server installation and bundling notes  
- Context7 `**/websites/hono_dev**` — WebSocket helpers and multi-runtime positioning  
- [https://github.com/nats-io/nats-server/releases/latest](https://github.com/nats-io/nats-server/releases/latest) — **NATS Server 2.12.6** verification  
- [https://socket.io/docs/v4/server-installation](https://socket.io/docs/v4/server-installation) — Socket.IO v4 prerequisites and install commands  
- [https://github.com/modelcontextprotocol/specification](https://github.com/modelcontextprotocol/specification) — MCP as optional capability/protocol alignment  
- **npm registry** (`npm view <pkg> version` on 2026-04-09) — JS package pins listed above
<!-- gsd-stack-end -->

<!-- gsd-conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- gsd-conventions-end -->

<!-- gsd-architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- gsd-architecture-end -->

<!-- gsd-skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| pattern-doc-writing | Write or rewrite product docs, idea files, PRDs, and concept notes in a high-signal pattern-document style. Use when the document should communicate the core idea clearly, stay abstract but concrete, avoid premature implementation detail, and read more like a strong conceptual memo than a spec dump. | `.agents/skills/pattern-doc-writing/SKILL.md` |
<!-- gsd-skills-end -->

<!-- gsd-workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- gsd-workflow-end -->



<!-- gsd-profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- gsd-profile-end -->
