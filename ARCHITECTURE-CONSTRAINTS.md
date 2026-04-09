# Architecture Constraints

`PRD.md` defines the product.
This document defines the default architecture that implements it.

If a planning workflow, research pass, or implementation choice needs architectural guidance, use this document.
If this document does not decide something, use `PRD.md`.

## Core Position

`agent-talkie` is a local-first collaboration layer for independently running coding-agent sessions.

The default product must feel lightweight, direct, and immediate to use.
It should start from one person's local machine and extend naturally to more sessions and more participants.

## Default Experience

The default experience is:

- installable with `npm install` or runnable via `npx`
- usable without separately installing or starting infrastructure
- local-first by default
- naturally extendable through invite and join

The product should not require the user to think in terms of deployment modes before they can use it.

## Hard Constraints

- Default = zero external services
- Default path must not require NATS
- Default path must not require Postgres
- Default metadata store = SQLite
- JSON, Markdown, and JSONL may be used for export, debugging, or mirrors, but not as the only durable source of truth
- No explicit solo/local/team mode-switching UX
- Collaboration should extend naturally through invite and join
- Local and remote must use one canonical protocol
- The difference between local and remote is where the relay runs, not a different architecture
- Core transport and adapter ingress are separate concerns
- Control and conversation are protocol semantics, not transport-specific infrastructure concepts
- Relay lifecycle must not depend on one participant process staying alive
- The first session must not become a permanent special host

## Default Architecture

The default architecture is:

- relay-based
- local-first
- zero-external-services
- SQLite-backed for collaboration metadata and state
- WebSocket-based as the canonical core transport
- backed by an automatically spawned local relay daemon

This means:

- canonical core transport = relay-based WebSocket protocol
- local default = relay on localhost
- remote extension = same protocol, relay deployed elsewhere
- adapter-specific ingress may include stdio bridge, but stdio is an adapter-edge concern rather than the system's core transport model

## Product Boundaries

The product is responsible for:

- connecting running sessions into a shared collaboration layer
- routing messages between sessions
- maintaining session identity
- maintaining collaboration metadata
- exposing collaboration state to humans and other sessions

The product is not responsible for:

- hosted autonomous execution fleets
- centralized long-term memory systems
- full workspace sync
- replacing native runtime approval or auth UX
- becoming a generic harness framework
- becoming a git conflict resolution system

## Architectural Consequences

The system should be designed around these consequences:

- session identity is first-class
- collaboration metadata belongs to the collaboration layer
- local context stays local unless deliberately shared
- orchestrator is a role in the collaboration model, not a mandatory relay bottleneck
- multiple humans and multiple local agent setups must remain a valid shape of the product
- richer code context exchange belongs in harnesses or higher-level workflows, not in a bloated core artifact model

## What To Preserve

The following ideas remain part of the default direction:

- versioned message envelope
- Zod-based schema validation
- JSON Schema export for non-TypeScript consumers
- schema evolution and upgrade strategy
- idempotency where the protocol requires it
- session identity as a first-class concept
- collaboration metadata owned by the collaboration layer

## What To Avoid

Do not make these the default path:

- NATS as the default bus
- Postgres as the default metadata store
- Kafka or any heavy broker
- any external infrastructure prerequisite for local use
- Firebase or proprietary realtime databases as the product core
- divergent local and remote transport semantics
- explicit mode-switching UX for solo, local, and team use
- pure JSON or Markdown files as the only collaboration-state backend

## Open Design Questions

These still require research and planning:

- the exact SQLite schema for sessions, spaces, memberships, metadata patches, and transcript pointers
- the exact relay daemon lifecycle and idle shutdown behavior
- the exact connection and auth model for local and remote relay connections
- the exact adapter ingress patterns across runtimes
- the invite and join model when extending from local-first to remote collaboration
- how transcript durability should split between SQLite and append-only exports
