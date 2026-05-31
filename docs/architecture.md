# agent-talkie Architecture

`PRD.md` defines the product pattern. This document defines the implementation architecture and invariants that keep the product coherent.

## Product Boundary

`agent-talkie` is a local-first collaboration layer for independently running coding-agent sessions. It connects concrete sessions into a shared space, routes messages between them, maintains collaboration metadata, and exposes enough state for humans and sessions to coordinate.

It is not a hosted execution fleet, a generic project-management harness, a persistent memory platform, or a replacement for native runtime approval and prompt UX.

The core product primitive is message exchange plus collaboration metadata. Richer work exchange such as diffs, logs, API details, rollout assumptions, or local code context belongs in runtime-specific tools and repository harnesses.

## Package Topology

The monorepo is organized around one relay-centered runtime:

| Package | Responsibility |
|---|---|
| `@agent-talkie/protocol` | Versioned envelope, relay wire schemas, collaboration payload schemas, handshake rules, JSON Schema export |
| `@agent-talkie/persistence` | SQLite migrations, repositories for sessions, spaces, memberships, transcript, idempotency, collaboration metadata, oversight reads |
| `@agent-talkie/relay` | WebSocket relay, HTTP endpoints, routing, catch-up, collaboration controls, dashboard static hosting, daemon entry |
| `@agent-talkie/supervisor` | Local relay discovery, lockfile/liveness checks, automatic relay daemon startup |
| `@agent-talkie/client` | Shared Node session client used by CLI and adapters |
| `@agent-talkie/cli` | User-facing and debug commands, local smoke entry points, oversight fallback commands |
| `@agent-talkie/dashboard` | Lit/Vite dashboard, browser session bridge, reactive store, roster, transcript/search UI |
| `@agent-talkie/adapter-stdio` | Reference stdio ingress using Content-Length framing |
| `@agent-talkie/adapter-codex` | Codex CLI live sidecar bridge that listens to Talkie messages, runs `codex exec --json` / `codex exec --json resume`, and writes replies back |
| `@agent-talkie/adapter-cursor-mcp` | MCP server exposing Talkie tools and resources; currently wrapped for Cursor App and Claude Code |

## Default Architecture

The default path is:

- zero external services
- local-first
- relay-based
- SQLite-backed for collaboration metadata and state
- WebSocket-based as the canonical core transport
- automatically supervised local relay daemon
- dashboard served by the relay on the same origin in production

SQLite connections use WAL mode and a bounded busy timeout so local adapters, CLI oversight commands, and the relay can share one local database without turning transient write contention into immediate failures.

Local and future remote collaboration should use the same protocol. The difference is where the relay runs, not a different transport model.

Adapter ingress may use stdio, MCP, or runtime-specific tool calls, but those are edge concerns. The core transport remains the relay WebSocket protocol.

Codex CLI's default residency model is a live sidecar. `talkie codex start`
launches a durable `talkie-codex-adapter` process for one space, registers a
`codex-cli` session with `inboxMode: live`, and keeps receiving Talkie messages
without requiring `talkie pull`. The sidecar invokes the local `codex` CLI with
the user's permissions and reports native auth, permission, model, or reentry
failures as collaboration metadata. The older pull commands remain a fallback
for Codex App or emergency manual operation, but they are not the primary Codex
CLI product path.

The Codex CLI sidecar is bound to the joined space lifecycle. Normal users
should not need to remember to stop it: when the relay reports that the joined
space was archived or destroyed, or that the sidecar membership was removed,
the adapter exits and `talkie codex status` prunes the stale pid record. Manual
`talkie codex stop` remains an emergency/debug command for a still-running
sidecar.

## Data Flow

1. A runtime or dashboard creates a concrete session.
2. The session joins an explicit space.
3. The relay validates inbound protocol envelopes.
4. Persistence records spaces, memberships, transcript, idempotency state, and collaboration metadata.
5. The relay routes conversation/control wires to addressed sessions and records catch-up sequence.
6. Dashboard and oversight commands read live or persisted state and present it to the human.

The browser does not talk directly to SQLite. The relay owns database access and exposes only product-shaped HTTP/WebSocket surfaces.

When a human sends an untargeted conversation message, relay routing treats it as Human -> current orchestrator. The live WebSocket echo may keep the original envelope so the dashboard can present the default discussion without exposing transport fields, but the persisted transcript must include the effective target (`effectiveTo`) so offline runtime catch-up replays the message only to the session that was orchestrator at send time.

## Hard Invariants

- Participation is explicit. Discovery or local network presence must not grant membership.
- Relay lifecycle must not depend on any one participant process staying alive.
- The first session in a space must not become a permanent special host.
- Session identity is first-class and distinct from runtime brand.
- Orchestrator is a collaboration role, not a mandatory relay bottleneck for every message.
- Orchestrator and worker roles are not tied to runtime brands. Codex CLI,
  Cursor App, Claude Code, and future runtimes must be represented by their
  actual session behavior, not by assumed role suitability.
- A session's residency model is independent of role. Long-running and
  pull-based sessions can both be orchestrators or workers if their adapter/tool
  loop can receive Talkie messages, act on them, and report back.
- Sessions declare their inbox mode explicitly as `live` or `pull`; dashboard
  availability and relay actionability must use that declared capability rather
  than inferring behavior from runtime brand strings.
- Collaboration metadata belongs to the collaboration layer, not worker repo files.
- Local context stays local unless deliberately shared into the collaboration layer.
- Raw envelope JSON is diagnostic data, not the default human-facing product surface.
- SQLite is the default durable store. JSON, Markdown, and JSONL can be exports, debug artifacts, or mirrors, but not the only durable source of collaboration truth.
- Stdio framing is adapter ingress, not the product's canonical transport.
- Core protocol and adapter ingress must remain decoupled.
- Dashboard state must be projected from relay and persistence state, not invented as a second source of truth.
- User-visible names should be stable, human-usable labels with disambiguation when needed.

## Current Delivery Target

Codex CLI live sidecar and Claude Code explicitly joining the same Talkie Space is now the proven runtime baseline. The current delivery target is the local orchestrator dashboard built on top of that baseline: a human-facing dashboard that makes the current space, orchestrator, runtime availability, default discussion, private intervention, and failure states understandable without exposing relay internals as the primary surface.

Codex App is not assumed live. It remains pull-based/best-effort unless a stable app hook, app server, or extension injection path is found and verified. Cursor App remains a supported architecture direction through the MCP adapter, but it is not part of the current delivery gate. The gate should stay narrow until the dashboard proves that the verified Codex CLI live sidecar + Claude Code loop is operable by a user, not merely observable by a developer.

## Current Simplifications

The local product assumes a runtime-facing session participates in one active collaboration space at a time. Multi-space UX and routing semantics are deferred. Low-level adapters may keep separate space-scoped attachments for debugging or compatibility, but the primary product should not make users manage multiple active spaces for one runtime session.

## Security And Trust Constraints

The current product target is localhost. Future cross-machine or team collaboration requires explicit trust mechanisms such as invitations, approvals, access tokens, or another scoped authorization model.

Do not treat LAN discovery, process discovery, or a reachable relay as permission to join a space.

Workspace-label visibility should be minimal by default. Runtime, repo or workspace label, branch, and current focus may be visible. Full local paths and sensitive local context should not be exposed unless explicitly shared.

Transcript and agent-produced text are untrusted UI input. Dashboard rendering should treat them as text or sanitized content, not executable markup.

## Dashboard Architecture

The dashboard is a product surface, not a debug console.

The browser session bridge owns WebSocket lifecycle, health state, reconnect, generation checks, session register/resume, join, send, and catch-up. The dashboard store is the reactive state tree consumed by Lit components.

The default dashboard direction for the local product is orchestrator-first:

- Human ↔ Orchestrator discussion is the primary view.
- Participant private chats are secondary intervention paths.
- Participant roster shows role, runtime, workspace label, status, and last activity.
- The dashboard owner can directly edit participant collaboration metadata
  such as role, focus, progress, and blocked reason.
- Dashboard-created spaces use generated slugs with human-visible labels by
  default; custom slugs remain an explicit advanced path.
- Raw envelope diagnostics stay available behind explicit debug affordances.

## Relay And Lifecycle Architecture

The relay may run as a daemon, but its lifecycle must be legible to the user:

- ensure/start must be idempotent
- liveness must be testable
- stop/restart must avoid orphaned state
- stale participants must not appear as active collaborators
- dashboard reloads must not create duplicate active humans

Space lifecycle should be product-level state, not a side effect of rows disappearing. The local product needs active, idle, archived, and destroyed semantics so runtimes can present a short useful active-space list.

## Validation Harness

Use package tests for unit and integration behavior:

- `npm run test -w @agent-talkie/protocol`
- `npm run test -w @agent-talkie/persistence`
- `npm run test -w @agent-talkie/relay`
- `npm run test -w @agent-talkie/supervisor`
- `npm run test -w @agent-talkie/cli`
- `npm run test -w @agent-talkie/client`
- `npm run test -w @agent-talkie/dashboard`
- `npm run test -w @agent-talkie/adapter-stdio`
- `npm run test -w @agent-talkie/adapter-codex`
- `npm run test -w @agent-talkie/adapter-cursor-mcp`

Use `npm test` for a full package test baseline and `npm run build` for a full build baseline. Use `npm run smoke:local` for local cross-runtime product smoke when CLI, adapter, relay lifecycle, or dashboard launch behavior changes. Use `npm run smoke:codex-live` for the Codex CLI live sidecar path with a fake Codex child process, including automatic receive/reply and reentry blocked metadata. Use `npm run smoke:codex-claude` before claiming the Codex CLI live sidecar + Claude Code collaboration loop still works.

Use Playwright for browser-visible dashboard behavior. Use Computer Use only when verifying real desktop/runtime integration such as Codex CLI terminal behavior, Claude Code MCP/tool availability, Cursor App MCP availability when Cursor is in scope, native prompts, or a true copy-paste join flow across tools.
