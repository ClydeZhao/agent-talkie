<!-- gsd-project-start source:PROJECT.md -->
## Project

**agent-talkie**

A local-first collaboration layer that connects independently running coding-agent sessions across different runtimes (Cursor, Claude Code, Codex, etc.) into a shared space where they can talk, coordinate, and unblock each other — without forcing the human to be the transport layer.

**Core Value:** Sessions from different runtimes can collaborate directly through a shared channel. The human supervises and guides but never acts as copy-paste middleware between tools.

### Constraints

- **Infrastructure**: Zero external services for default path — no NATS, no Postgres, no Kafka, no Firebase
- **Storage**: SQLite as default metadata store; JSON/Markdown/JSONL only for export/debug, not as sole durable source of truth
- **Transport**: WebSocket-based relay as canonical core transport; local and remote use one protocol
- **Architecture**: Relay-based with automatic local daemon; relay lifecycle must not depend on one participant staying alive; first session must not become permanent special host
- **Participation**: Explicit opt-in only; network presence alone must not grant membership
- **Packaging**: Installable via `npm install` or runnable via `npx`, usable without infrastructure setup
<!-- gsd-project-end -->

<!-- gsd-stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core technologies
| Technology | Version (pin with care) | Purpose | Rationale | Confidence |
|------------|-------------------------|---------|-----------|------------|
| **Node.js** | **24.x** Active LTS (e.g. 24.14.x); minimum **20.x** if you need broader install base | Runtime | Matches “install and run” npm/npx UX; LTS cadence per [Node.js releases](https://nodejs.org/en/about/previous-releases) (v24 Active LTS as of page snapshot). Native addons (`better-sqlite3`) track Node ABI; LTS reduces breakage. | **HIGH** |
| **TypeScript** | **`^5.9.3`** (recommended default for a **library**); **`^6.0.2`** (latest on npm same date) once CI + consumers pass | Types, build input | **5.9.x** maximizes compatibility with downstream toolchains (editors, bundlers, `skipLibCheck` consumers). **6.0.2** is current `typescript@latest` on npm; reasonable for greenfield **if** you validate the full matrix. | **HIGH** (5.9 for libs) / **MEDIUM** (6.0 as default) |
| **`ws`** | **`^8.20.0`** | Canonical **WebSocket** server and client in Node | Thin WebSocket layer; no alternate framing/protocol. Matches ARCHITECTURE-CONSTRAINTS: core transport = relay WebSocket, not adapter stdio. | **HIGH** |
| **`better-sqlite3`** | **`^12.8.0`** | **SQLite** access (sync API) | Default metadata store per constraints. Synchronous API fits a **single-process relay** and simple transactions; WAL + busy_timeout address modest concurrent readers/writers without external DB. Avoid `sql.js` for primary store here (in-memory/IO model is a poor default for a durable local daemon). | **HIGH** |
| **Zod** | **`^4.3.6`** | Runtime validation + types for **versioned envelope** | Zod 4 is current `zod@latest` on npm; native JSON Schema export (see below) reduces dependency surface vs older `zod-to-json-schema`-only workflows. | **HIGH** |
| **JSON Schema export** | **Zod 4 built-in `z.toJSONSchema()`** | Non-TS consumers, codegen, CI schema checks | Official Zod 4 feature ([JSON Schema | Zod](https://v4.zod.dev/json-schema)) with targets (e.g. draft-2020-12, OpenAPI-flavored options per docs). **Prefer this** over a third-party converter unless you hit a gap. | **HIGH** |
| **`zod-to-json-schema`** (optional) | **`^3.25.2`** | Fallback JSON Schema generation | Use **only if** you need behaviors/options not covered by `z.toJSONSchema()` on your schemas. Peer range on package includes Zod 4; treat as **optional** to avoid two sources of truth. | **MEDIUM** |
### Supporting libraries
| Library | Version | Purpose | Rationale | Confidence |
|---------|---------|---------|-----------|------------|
| **`commander`** | **`^14.0.3`** | CLI for `npx` entrypoints (`talkie`, `talkie relay`, etc.) | De facto minimal CLI parser; stable, no runtime broker. | **HIGH** |
| **`execa`** | **`^9.6.1`** | Spawn / supervise **local relay daemon** | Cross-platform process spawning, windowsHide, cancellation; clearer than raw `child_process` for lifecycle UX. | **HIGH** |
| **`proper-lockfile`** | **`^4.1.2`** | Single relay instance on a host / data dir | Prevents two daemons corrupting one SQLite file; file-based, no Redis. | **MEDIUM** (depends on filesystem semantics; document NFS caveat) |
| **`uuid`** | **`^13.0.0`** | Stable ids (sessions, envelopes, idempotency keys) | Standard, dependency-light; avoids rolling your own id scheme. **`nanoid@5.1.7`** is fine if you want shorter strings and accept non-UUID semantics—pick one style per id type. | **HIGH** |
| **`pino`** + **`pino-pretty`** (dev) | **`^10.3.1`** / **`^13.1.3`** | Structured logs for daemon | JSON logs rotate well; pretty only in dev. Avoid coupling core protocol to a specific logger—inject or wrap behind a tiny interface if the library is consumed as SDK. | **MEDIUM** |
### Development tools
| Tool | Version | Purpose | Rationale | Confidence |
|------|---------|---------|-----------|------------|
| **`tsup`** | **`^8.5.1`** | Bundle types + ESM/CJS for npm package | Fast defaults for libraries (`dts: true`, `splitting`). Alternative **`unbuild@3.6.1`** if you prefer unjs conventions. | **HIGH** |
| **`vitest`** | **`^4.1.4`** | Unit / integration tests | Native ESM, TS, watch; good fit for protocol + SQLite + WS tests. | **HIGH** |
| **`@types/node`** | **`^25.5.2`** | Node typings | Align major with Node **22+** typings story; downgrade major if you commit to Node 20-only typings (`@types/node@20`). | **MEDIUM** |
| **`@types/ws`** | **`^8.18.1`** | Typings for `ws` | Keeps server/client code strictly typed. | **HIGH** |
| **`@types/better-sqlite3`** | **`^7.6.13`** | Typings for `better-sqlite3` | Types lag native module major; verify against **12.x** API in code review. | **MEDIUM** |
| **`@biomejs/biome`** or **`ultracite`** | **`^2.4.11`** / **`^7.4.4`** | Lint/format (optional) | Fast, low-config; pick **one** formatter/linter to avoid Prettier+ESLint duplication. | **MEDIUM** |
| **`why-is-node-running`** | **`^3.2.2`** (dev) | Debug daemon / WS handle leaks | Helps validate “idle shutdown” and test hygiene. | **LOW** (dev-only convenience) |
### Optional SQL layer (not default)
| Library | Version | When | Rationale | Confidence |
|---------|---------|------|-----------|------------|
| **`drizzle-orm`** | **`^0.45.2`** | If schema migrations and typed queries outweigh raw SQL | Still uses **SQLite + better-sqlite3**; no Postgres. Adds migration story and type-safe queries; **not required** for v1 if you keep SQL minimal. | **MEDIUM** |
| **`kysely`** | **`^0.28.15`** | If you want query builder without ORM | Same DB story; more manual than Drizzle for migrations. | **MEDIUM** |
## Installation
# Runtime
# Dev
# Optional
# npm install zod-to-json-schema   # only if native z.toJSONSchema() is insufficient
## Alternatives considered
| Area | Instead of | Considered | Why not default |
|------|------------|--------------|-----------------|
| WebSocket | `ws` | `undici` WebSocket, `uWebSockets.js` | `undici` WS is viable **client-side**; server story is thinner vs `ws` ecosystem examples. `uWebSockets` is fast but **native** addon friction conflicts with “simple npm install” for a broad CLI audience. |
| SQLite | `better-sqlite3` | `sqlite3` (async), `sql.js` | `sqlite3` async callback API complicates transactional relay logic; `sql.js` is a poor durability default for daemon metadata. |
| Validation | Zod 4 | ArkType, TypeBox, pure JSON Schema | Zod is the **explicit product constraint**; TypeBox is strong if schema-first JSON Schema matters more than TS-first DX—here Zod + export wins. |
| Daemon spawn | `execa` | Raw `child_process`, `daemonize-process` | `execa` is maintained and portable; avoid obscure daemonizers that fight `npx` and signal semantics on Windows. |
| Bundler | `tsup` | `tsdown`, `unbuild`, `rollup` | All valid; `tsup` is the fastest path for a small protocol SDK + CLI. |
## What NOT to use (default path)
| Category | Do **not** adopt as **default** | Why |
|----------|-----------------------------------|-----|
| External brokers | **NATS**, **Kafka**, Redis Pub/Sub, cloud message buses | Violates **zero external services**; operationally heavy for local-first. |
| Databases | **Postgres**, MySQL, hosted **Firebase** / Firestore | Violates constraints; SQLite is the default durable metadata store. |
| “Realtime” platforms | **Socket.io**, Ably, Pusher as **core** transport | Extra protocol/session layers and often vendor/cloud assumptions; core should remain plain **WebSocket + your envelope**. |
| ORMs tied to hosted DBs | **Prisma** default Postgres workflows | Wrong default mental model; can drag in migrations/services assumptions. (Fine only if you explicitly add SQLite-only Prisma later—still usually heavier than needed.) |
| Heavy RPC frameworks | gRPC, GraphQL gateway as **canonical** transport | Conflicts with “canonical core transport = WebSocket” and simple relay semantics. |
| JSON-only primary state | JSONL / Markdown as **sole** source of truth | Explicitly ruled out in ARCHITECTURE-CONSTRAINTS; use only for export/debug mirrors. |
## Stack patterns by variant
### Variant A — Local relay daemon + localhost WebSocket
- **Process model:** one long-lived `relay` process; clients use `ws` to `ws://127.0.0.1:<port>`.
- **SQLite:** single file under user config dir (XDG on Linux, equivalent on macOS/Windows); `PRAGMA journal_mode=WAL`; `busy_timeout` set.
- **Lifecycle:** CLI uses `execa` to spawn daemon; `proper-lockfile` on a lock file next to the DB or socket path; PID + optional control socket for health.
- **Logs:** `pino` to stderr or file; structured fields for `sessionId`, `spaceId`, `envelopeVersion`.
### Variant B — Remote relay (same protocol)
- **Transport:** same `ws` + envelope; terminate TLS with Node `https`/`tls` (no extra dependency required beyond Node).
- **Auth:** keep **out of core stack** until design is fixed; when needed, prefer **`jose`** or hand-rolled HMAC with docs—still **no** external IdP as default.
### Variant C — Runtime adapters (Cursor, Claude Code, Codex)
- **Not core transport:** stdio bridges and editor hooks stay **adapter-edge**; they speak to your local client library, which uses **WebSocket** to the relay.
## Version compatibility
| Component | Notes |
|-----------|--------|
| **Node ↔ better-sqlite3** | Prebuilt binaries track Node ABI; unsupported Node majors may require build toolchain (`node-gyp`, Python, C++). Document supported Node range clearly. |
| **TypeScript ↔ Zod** | Zod 4 + TS 5.9+ is the mainstream pair; if you adopt TS 6, run full `vitest` + `tsc` on package **and** a sample consumer project. |
| **WebSocket ↔ proxies** | Corporate proxies may break WS; remote variant may need `wss://` and documented ports—product concern, not a library swap. |
| **SQLite concurrency** | One writer at a time; relay should serialize writes (single Node thread + WAL is usually enough); avoid many processes opening the same DB without a clear single-writer policy. |
## Sources
| Source | Used for |
|--------|-----------|
| [Node.js Releases](https://nodejs.org/en/about/previous-releases) | LTS choice (v24 Active LTS per 2026-03 snapshot on page) |
| npm registry `npm view` (2026-04-10) | Package versions: `ws`, `better-sqlite3`, `zod`, `typescript`, `vitest`, `tsup`, `commander`, `execa`, `uuid`, `pino`, etc. |
| [Zod 4 — JSON Schema](https://v4.zod.dev/json-schema) | Native `z.toJSONSchema()` as default export path |
| Project: `.planning/PROJECT.md`, `PRD.md`, `ARCHITECTURE-CONSTRAINTS.md` | Constraints alignment (WebSocket, SQLite, zero external services, npm/npx, Zod + schema export) |
## Confidence summary
| Area | Level | Notes |
|------|--------|--------|
| Core transport (`ws`) + SQLite (`better-sqlite3`) | **HIGH** | Standard, well-traveled pairing for local daemons. |
| Zod 4 + native JSON Schema | **HIGH** (feature) / **MEDIUM** (edge schemas) | Some Zod constructs remain non-representable in JSON Schema per official docs—envelope design should avoid those or document fallbacks. |
| TypeScript major default (5.9 vs 6.0) | **MEDIUM** for pinning 6.0 everywhere | 5.9.3 is safer for **library** consumers; 6.0.2 verified current on npm. |
| Daemon single-instance (`proper-lockfile`) | **MEDIUM** | Excellent on local disks; weak on some network filesystems. |
| Optional Drizzle/Kysely | **MEDIUM** | Valuable if migration complexity grows; omit until schema stabilizes. |
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
