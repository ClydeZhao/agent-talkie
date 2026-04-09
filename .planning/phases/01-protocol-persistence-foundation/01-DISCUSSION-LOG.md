# Phase 1: Protocol & persistence foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 01-protocol-persistence-foundation
**Areas discussed:** Envelope structure, Session identity model, SQLite schema approach, Versioning strategy, Idempotency scope
**Mode:** --auto (all decisions auto-selected)

---

## Envelope Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Flat envelope | version, id, kind, type, payload at top level; addressing fields explicit | ✓ |
| Nested envelope | Outer wire wrapper with inner typed payload object | |
| Discriminated union | Top-level union type per message kind | |

**User's choice:** Flat envelope (auto-selected — recommended default)
**Notes:** Flat structure is simplest for Zod validation and JSON Schema export. Addressing fields (to, channel) at top level keep routing logic simple.

---

## Session Identity Model

| Option | Description | Selected |
|--------|-------------|----------|
| UUID v7 + auto-suffix disambiguation | Time-sortable IDs, relay-managed name suffixes on collision | ✓ |
| nanoid + hash-based disambiguation | Shorter IDs, deterministic suffix from session properties | |
| UUID v4 + manual naming | Random IDs, users must choose unique names | |

**User's choice:** UUID v7 + auto-suffix disambiguation (auto-selected — recommended default)
**Notes:** UUID v7 is time-sortable which helps with debugging and log correlation. Auto-suffix is relay-managed, reducing burden on session authors.

---

## SQLite Schema Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Raw better-sqlite3 + migration files | Direct SQL, numbered migration files, schema_version table | ✓ |
| Drizzle ORM | Type-safe query builder, auto-migrations | |
| Kysely | Lightweight query builder, manual migrations | |

**User's choice:** Raw better-sqlite3 + migration files (auto-selected — recommended default)
**Notes:** Schema is small enough in v1 that ORM overhead is not justified. Raw SQL keeps dependencies minimal and aligns with zero-external-services philosophy.

---

## Versioning Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Single integer version | Start at 1, increment on breaking changes, handshake negotiation | ✓ |
| Semver in envelope | Major.minor.patch string, more granular compatibility | |
| Content-based versioning | Hash of schema, auto-detected compatibility | |

**User's choice:** Single integer version (auto-selected — recommended default)
**Notes:** Simplest approach for v1. Semver adds complexity without clear benefit until the protocol stabilizes. Integer is sufficient for handshake rejection logic.

---

## Idempotency Scope

| Option | Description | Selected |
|--------|-------------|----------|
| State-changing ops + time-window dedup | UUID keys on join/leave/metadata; 5-min dedup window | ✓ |
| All messages + permanent dedup | Every message gets a key; permanent storage | |
| No built-in idempotency | Application-level only | |

**User's choice:** State-changing ops + time-window dedup (auto-selected — recommended default)
**Notes:** Conversation messages are append-only and ordering handles duplicates via sequence numbers. State-changing ops need idempotency for reconnect safety. Time window keeps storage bounded.

---

## Claude's Discretion

- Zod schema naming conventions (camelCase)
- JSON Schema export build integration
- Migration file naming convention
- Test fixture design

## Deferred Ideas

None.
