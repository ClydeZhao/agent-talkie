# Phase 1: Protocol & transport foundation - Research

**Researched:** 2026-04-09  
**Domain:** Versioned JSON collaboration envelope, NATS/JetStream transport, channel topology, schema negotiation  
**Confidence:** **HIGH** for stack choices and NATS/Zod mechanics (Context7 + npm + official release page); **MEDIUM** for exact JetStream retention/dedup windows until pinned in `docker-compose` / server config

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Comprehensive envelope from day one — include `schema_version`, `message_id`, `thread_id`, `sender_session_id`, `space_id`, `type` (control vs conversation), `timestamp`, and `payload`. Research warns against stringly-typed payloads evolving into tech debt (PITFALLS.md technical debt table).
- **D-02:** Use Zod for TypeScript envelope validation and export JSON Schema for non-TS adapter implementations.
- **D-03:** NATS Server + JetStream as the primary message transport. Subject-based routing maps to spaces and sessions; request/reply supports orchestrator-style calls; JetStream provides durability where needed. Research (STACK.md) recommends NATS 2.12.x with `@nats-io/transport-node` and `@nats-io/jetstream` (~3.3.x).
- **D-04:** Start with Docker Compose for local development (NATS + Postgres). No Kubernetes or cloud-native infrastructure in v1.
- **D-05:** Strict rejection of unknown schema versions — the receiver responds with a clear error indicating the expected version range and an upgrade path (CP-2).
- **D-06:** Schema versions are integer-based and monotonically increasing. The envelope includes `schema_version`; receivers reject messages with versions they cannot handle.
- **D-07:** Separate NATS subject hierarchies for control traffic (join, leave, metadata updates) vs conversation traffic.
- **D-08:** Subject naming convention follows `talkie.{space_id}.control.{event_type}` and `talkie.{space_id}.conversation.{thread_id}` patterns.

### Claude's Discretion
- Exact Zod schema field types and validation rules
- NATS subject naming details beyond the convention above
- JetStream stream configuration (retention, max age, replicas)
- Test harness and conformance tooling approach

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **PROTO-01** | Versioned JSON envelope with schema version, message ID, thread scope | Zod object schema + `z.toJSONSchema()` [CITED: zod.dev v4]; integer `schema_version`; explicit `thread_id` in envelope (D-01) |
| **PROTO-02** | Idempotency keys for at-least-once delivery with deduplication | Dedicated `idempotency_key` in envelope (distinct from `message_id` for retries) + handler idempotency contract; JetStream `msgID` mirrors server-side publish dedup within `duplicate_window` [VERIFIED: Context7 `/nats-io/nats.js` JetStreamPublishOptions] |
| **PROTO-03** | Control vs conversation traffic separated | Dual subject trees (D-07/D-08); optional `type` field alignment with subject family (CP-3) |
| **PROTO-04** | Reject unknown schema versions with clear upgrade path | Strict parse → structured error payload documenting `supported_schema_versions_min/max` and doc URL (D-05/D-06; CP-2) |
</phase_requirements>

## Summary

Phase 1 establishes a **single normalized application protocol** (JSON envelope + Zod validation + exported JSON Schema) and a **NATS/JetStream transport layer** with **physically separated control and conversation subject hierarchies**. This matches the collaboration architecture pattern of a thin core protocol consumed by future relay, core, and adapters without embedding runtime-specific types [CITED: `.planning/research/ARCHITECTURE.md`].

**Idempotency** spans two layers: (1) **transport**: JetStream publishing accepts a `msgID`; duplicates within the stream’s duplicate window return `PubAck.duplicate` rather than creating a new stored message [VERIFIED: Context7 `/nats-io/nats.js`]. (2) **collaboration semantics**: the envelope carries an **`idempotency_key`** so logical handlers (introduced in later phases) can dedupe effects even if the transport duplicates or fan-out replays. PROTO-02 is satisfied only when both the **field contract** and **deduplication semantics** are documented and testable.

**Schema rejection (PROTO-04)** should not be “silent drop”: return a **documented error shape** (HTTP for edge APIs, or NATS request/reply / advisory pattern for in-band) that states supported integer schema versions and points to the repo’s protocol upgrade doc. This directly mitigates CP-2 (happy-path-only protocols).

**Primary recommendation:** Implement `packages/protocol` (or equivalent) with Zod schemas, generated JSON Schema artifacts in-repo, NATS subject constants, and a minimal Docker Compose NATS 2.12.6 profile with JetStream enabled — before building relay routing or adapters.

## Project Constraints (from .cursor/rules/)

Actionable directives from `.cursor/rules/gsd-project.md` (mirrors `PROJECT.md` / STACK excerpt):

| Constraint | Implication for Phase 1 |
|------------|---------------------------|
| Architecture must work **without changing vendor runtime internals** | Protocol is **normalized**; no Cursor/Codex-specific fields in the canonical envelope |
| **Local-first** trust | Payloads favor references/summaries; document max inline size guidance (align PITFALLS CP-3) |
| **Explicit opt-in** for participation | Control-plane subjects carry membership-changing events; do not conflate with ambient discovery |
| Collaboration **layer only** — narrow scope | Phase 1 delivers **wire contract + transport**; no full session registry, orchestrator, or ACL logic here |
| **GSD workflow** — prefer GSD commands before ad-hoc edits | Planning/execution should route through `/gsd-plan-phase` / `/gsd-execute-phase` per project norms |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **NATS Server** | **2.12.6** (pin; track patches) | Message routing, JetStream persistence | Subject model fits spaces/threads; request/reply; multi-language clients [VERIFIED: [nats-server releases](https://github.com/nats-io/nats-server/releases/latest)] |
| **@nats-io/transport-node** | **3.3.1** | Node TCP/WebSocket client | Official modular client; replaces legacy `nats@2.x` for new code [VERIFIED: `npm view`] |
| **@nats-io/jetstream** | **3.3.1** | JetStream publish/consume/manager API | `jetstream()` + `jetstreamManager()` for streams and deduping publish [VERIFIED: Context7 `/nats-io/nats.js`] |
| **Zod** | **4.3.6** | Runtime validation + TS inference | First-party `z.toJSONSchema()` in v4 for adapter interoperability [VERIFIED: `npm view` + Context7 `/websites/zod_dev_v4`] |
| **TypeScript** | **5.x or 6.x** (pin at scaffold) | Shared types for protocol package | Ecosystem default; align with Node LTS used in CI |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Vitest** | **4.1.4** (current `npm view`; pin at scaffold) | Unit tests for parsers and subject helpers | Protocol pure functions, Zod round-trips [VERIFIED: `npm view vitest`] |
| **Docker Compose** | v2.x (desktop/engine) | Local NATS + Postgres | D-04; verify JetStream persistence locally [VERIFIED: environment probe — Docker 28.x, Compose v2.34] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| NATS + JetStream | Redis Streams only | Weaker subject tenancy patterns; team ops may still favor Redis-only PoC [CITED: STACK.md] |
| Zod v4 JSON Schema | Hand-written JSON Schema | Drift between TS and docs; avoid for PROTO-01/04 |
| Per-message protobuf | JSON + Zod | Better bandwidth later; higher codegen burden for heterogeneous adapters now [CITED: STACK.md] |

**Installation (protocol + transport dev):**

```bash
npm install zod @nats-io/transport-node @nats-io/jetstream
npm install -D typescript vitest @types/node
```

**Infrastructure (Compose):** `nats:2.12.x` (or pinned digest) with `jetstream` block enabled; **PostgreSQL 16+** per STACK.md (metadata phases consume it; Phase 1 may only declare the service for parity).

**Version verification (2026-04-09):** `npm view zod` → 4.3.6; `@nats-io/transport-node` / `jetstream` / `nats-core` → 3.3.1; `vitest` → 4.1.4.

## Architecture Patterns

### Recommended package layout

Aligns with ARCHITECTURE.md dependency direction: adapters → protocol; relay → protocol.

```
packages/
  protocol/
    src/
      envelope.ts          # Zod schemas, types, parse/serialize
      subjects.ts          # talkie.{space_id}.control|conversation.* builders
      errors.ts            # SCHEMA_VERSION_UNSUPPORTED, etc.
    json-schema/           # committed artifacts from z.toJSONSchema()
```

**Dependency rule:** `protocol` must not import `relay`, `core`, or adapters.

### Pattern 1: Envelope + discriminated payload

**What:** Fixed envelope fields (D-01) + `payload` validated by a discriminated union on `payload_type` or `type` (discretion: exact field names).  
**When to use:** Always — prevents stringly-typed payloads (technical debt table, PITFALLS).  
**Example:**

```typescript
// Source: Zod 4 docs — https://zod.dev/v4 (JSON Schema export)
import * as z from "zod";

const envelope = z.object({
  schema_version: z.number().int().positive(),
  message_id: z.string().uuid(),
  idempotency_key: z.string().min(1),
  thread_id: z.string(),
  sender_session_id: z.string(),
  space_id: z.string(),
  type: z.enum(["control", "conversation"]),
  timestamp: z.string().datetime(), // or z.iso.datetime() per Zod 4 API
  payload: z.unknown(), // narrow in superRefine or use discriminated union
});

z.toJSONSchema(envelope);
```

*(Field names `schema_version` vs `schemaVersion`: pick one convention in implementation; JSON on wire should match exported JSON Schema.)*

### Pattern 2: Subject builders + stream capture map

**What:** Centralize `talkie.${spaceId}.control.*` and `talkie.${spaceId}.conversation.*` to avoid ad-hoc string concat (injection-style bugs with raw `space_id`). Sanitize or validate `space_id` / `thread_id` for NATS subject token safety.  
**When to use:** Any publish/subscribe path.  
**JetStream:** Create streams whose `subjects` patterns cover `talkie.*.control.>` and `talkie.*.conversation.>` (exact pattern is discretion — may be one or two streams).

### Pattern 3: Schema negotiation error

**What:** On `schema_version` outside supported range, respond with machine-readable error:

- `code: SCHEMA_VERSION_UNSUPPORTED`
- `supported_min`, `supported_max` (integers)
- `upgrade_doc_url` (stable link to `.planning` or `docs/protocol-upgrades.md`)

**When to use:** Every ingress validator (future relay/core); Phase 1 defines the **type** and **documentation**.

### Anti-patterns to avoid

- **Single catch-all subject for all message kinds:** Causes CP-3 head-of-line blocking between control and fat conversation payloads.
- **Using only JetStream dedup without envelope `idempotency_key`:** Transport dedup window is time-bounded; logical dedup for collaboration effects still needs an application key (PROTO-02).
- **Rejecting old versions without documentation:** Violates PROTO-04 and CP-2.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Type-safe envelope + docs drift | Ad-hoc interfaces + manual JSON Schema | **Zod + `z.toJSONSchema()`** | Single source of truth [VERIFIED: zod.dev v4] |
| Cross-language messaging bus | Custom TCP fan-out | **NATS** | Mature routing, clients in Go/Python/etc. [CITED: STACK.md] |
| Durable inbox / replay | File-based queues in v1 | **JetStream** | Ops simpler than Kafka for session-scoped traffic [CITED: STACK.md] |
| Publish dedup within window | Client-only “hope” dedup | **JetStream `msgID`** | Server tracks duplicates in `duplicate_window` [VERIFIED: Context7] |

**Key insight:** Hand-rolled framing + retry semantics tend to rediscover CP-2; use NATS + explicit protocol types early.

## Common Pitfalls

### Pitfall 1: CP-2 — Happy-path protocol (versioning / idempotency)

**What goes wrong:** Demos work; retries duplicate tool calls or fork thread state.  
**Why it happens:** At-least-once delivery without dedup keys or version checks.  
**How to avoid:** Enforce PROTO-01/02/04 in the **reference parser**; document behavior for duplicate `idempotency_key`. Use JetStream `msgID` aligned with that key when publishing durably.  
**Warning signs:** No tests for duplicate delivery; no `schema_version` in fixtures.

### Pitfall 2: CP-3 — Control interleaved with conversation

**What goes wrong:** Join/leave delayed behind large conversation payloads.  
**Why it happens:** Single subject or single consumer queue mixing types.  
**How to avoid:** D-07/D-08 subject split; consider priority consumers or separate JetStream consumers per family.  
**Warning signs:** “Stuck joining” under load tests with large messages.

### Pitfall 3: Conflating `message_id` and `idempotency_key`

**What goes wrong:** Retries generate new `message_id` but operators expect dedup — effects double-apply.  
**Why it happens:** UUID per attempt feels natural for tracing.  
**How to avoid:** **Stable `idempotency_key` across retries** of the same logical operation; `message_id` unique per emission (or document if they intentionally coincide).  
**Warning signs:** Dedup tests pass only when republishing identical full JSON.

### Pitfall 4: NATS subject token collisions / injection

**What goes wrong:** Raw `space_id` with `.` or `*` widens subscriptions or breaks routing.  
**Why it happens:** Treating IDs as opaque without normalization.  
**How to avoid:** Validate ID format (e.g., constrained charset) or encode/hashed segment in subjects (discretion).  
**Warning signs:** Fuzzing subjects causes cross-space leakage in tests.

### Pitfall 5: Zod/JSON field naming inconsistency

**What goes wrong:** TS uses camelCase, wire uses snake_case, JSON Schema differs — adapters drift.  
**Why it happens:** Mixed conventions across layers.  
**How to avoid:** Pick **one wire convention**, enforce in Zod `.transform` or consistent property names; regenerate JSON Schema in CI.

## Code Examples

### Zod → JSON Schema (interop)

```typescript
// Source: https://zod.dev/v4 — JSON Schema conversion
import * as z from "zod";

const mySchema = z.object({
  firstName: z.string().describe("Your first name"),
  lastName: z.string().meta({ title: "last_name" }),
  age: z.number().meta({ examples: [12, 99] }),
});

z.toJSONSchema(mySchema);
```

### NATS JetStream: stream + publish with dedup `msgID`

```typescript
// Source: Context7 /nats-io/nats.js (jetstream README / llms.txt)
import { connect } from "@nats-io/transport-node";
import { jetstream, jetstreamManager } from "@nats-io/jetstream";

const nc = await connect({ servers: "nats://localhost:4222" });
const jsm = await jetstreamManager(nc);
await jsm.streams.add({ name: "TALKIE", subjects: ["talkie.*.control.>", "talkie.*.conversation.>"] });

const js = jetstream(nc);
const pa = await js.publish(
  "talkie.space-1.conversation.thread-a",
  new TextEncoder().encode(JSON.stringify({ /* envelope */ })),
  { msgID: "idempotency-key-123" }
);
// pa.duplicate === true when msgID repeats within duplicate_window
await nc.close();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monolithic `nats` npm package | `@nats-io/transport-node` + `@nats-io/jetstream` | NATS.js modular split | New code should use modular packages [CITED: STACK.md] |
| Zod + third-party JSON Schema converters | Zod 4 `z.toJSONSchema()` | Zod 4 | First-party export; fewer deps [VERIFIED: zod.dev v4] |
| “JSON blob” protocols | Versioned envelope + typed payloads | Industry lesson (CP-2) | Plan upgrades explicitly (PROTO-04) |

**Deprecated/outdated:**

- **Legacy `nats@2.x` as default for new work:** Prefer `@nats-io/*` [CITED: STACK.md].

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `idempotency_key` is a separate envelope field from `message_id` | Phase Requirements / Pitfalls | If merged incorrectly, dedup semantics break under retries |
| A2 | Integer `schema_version` is sufficient for v1 (no semver string) | User Constraints | If future needs prerelease channels, encoding may need extension |
| A3 | One JetStream stream can cover both `control` and `conversation` subjects with two consumer groups | Architecture Patterns | If isolation requirements grow, split streams (still fine if subjects differ) |

## Open Questions

1. **Wire casing convention (camelCase vs snake_case)?**  
   - What we know: Zod and JSON Schema export preserve property names.  
   - What’s unclear: Human readability vs TS ecosystem defaults.  
   - Recommendation: Decide in PLAN.md; document in `protocol` README.

2. **Where does schema rejection get surfaced for pure NATS subscribers (no HTTP)?**  
   - What we know: Request/reply can return JSON errors; core NATS pub/sub has no built-in ACK to publisher.  
   - What’s unclear: Whether Phase 1 defines only “validation API” in-process vs a NATS reply subject.  
   - Recommendation: For Phase 1, specify **reference validator function** + documented error object; defer global “negative ack on pub” until relay design (Phase 3).

3. **JetStream `duplicate_window` default vs collaboration SLA?**  
   - What we know: Dedup is time-bounded server-side.  
   - What’s unclear: Required window for agent reconnect scenarios.  
   - Recommendation: Discretion — tune in Compose config; document relationship to application-level dedup.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Zod, NATS.js, Vitest | ✓ | v22.14.0 (probe) | Use Node 20+ LTS in CI if policy requires |
| npm | Package install | ✓ | (bundled with Node) | pnpm/yarn if repo standardizes later |
| Docker | Local NATS + Postgres (D-04) | ✓ | 28.0.4 | Install Docker Desktop / engine; CI uses service containers |
| Docker Compose | Orchestrating deps | ✓ | v2.34.0 | — |
| NATS Server (container) | Transport | ✓ via image pull | Pin 2.12.6 | Use `nats:2.12.6` official image |

**Missing dependencies with no fallback:** None observed on research machine.

**Missing dependencies with fallback:** None.

## Validation Architecture

> `workflow.nyquist_validation` is enabled in `.planning/config.json`.

### Test framework

| Property | Value |
|----------|-------|
| Framework | Vitest **4.1.4** (`npm view` at research time) |
| Config file | `vitest.config.ts` — **to be added at scaffold (Wave 0)** |
| Quick run command | `npx vitest run packages/protocol` (after scaffold) |
| Full suite command | Same for Phase 1 scope until monorepo grows |

### Phase requirements → test map

| Req ID | Behavior | Test Type | Automated command | File exists? |
|--------|----------|-----------|-------------------|--------------|
| PROTO-01 | Parse valid envelope; reject missing `schema_version` / `message_id` / `thread_id` | unit | `npx vitest run packages/protocol -t envelope` | ❌ Wave 0 |
| PROTO-02 | Same `idempotency_key` + handler stub does not double-apply (in-memory dedup) | unit | `npx vitest run packages/protocol -t idempotency` | ❌ Wave 0 |
| PROTO-03 | Published subject matches control vs conversation builder | unit | `npx vitest run packages/protocol -t subjects` | ❌ Wave 0 |
| PROTO-04 | Unsupported `schema_version` returns documented error shape | unit | `npx vitest run packages/protocol -t schema` | ❌ Wave 0 |
| Integration | JetStream `msgID` dedup (`PubAck.duplicate`) | integration | `npx vitest run packages/protocol -t jetstream` (Docker NATS) | ❌ Wave 0 |

### Sampling rate

- **Per task commit:** `npx vitest run packages/protocol` (fast subset)
- **Per wave merge:** Full protocol tests + integration if touched
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 gaps

- [ ] `packages/protocol` package scaffold + `tsconfig`
- [ ] `vitest.config.ts` at repo root or package
- [ ] `docker-compose.yml` with NATS JetStream enabled for integration tests
- [ ] Golden JSON fixtures for envelope round-trip

*(Greenfield: no existing test infrastructure.)*

## Security Domain

### Applicable ASVS categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no* | *Phase 1 — transport wiring; auth attaches in later phases |
| V3 Session Management | no* | * |
| V4 Access Control | no* | * |
| V5 Input Validation | yes | **Zod** parse on every ingress envelope; reject oversized payloads (size cap in validator) |
| V6 Cryptography | no | No custom crypto in envelope; TLS for NATS in deployment guides later |

### Known threat patterns (protocol ingress)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed / schema-breaking JSON | Tampering | Zod safeParse; reject with structured errors |
| Oversized messages (DoS) | Denial of service | Max payload bytes; stream limits |
| Subject injection via IDs | Spoofing / elevation | Validate/normalize `space_id` / `thread_id` tokens |

## Sources

### Primary (HIGH confidence)

- Context7 `/nats-io/nats.js` — JetStream publish, `msgID`, `PubAck.duplicate`, stream management
- Context7 `/websites/zod_dev_v4` — `z.toJSONSchema()` and metadata
- [https://github.com/nats-io/nats-server/releases/tag/v2.12.6](https://github.com/nats-io/nats-server/releases/tag/v2.12.6) — server version + security notes
- **npm registry** — `npm view` for `zod`, `@nats-io/*`, `vitest` on 2026-04-09

### Secondary (MEDIUM confidence)

- `.planning/research/STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md` — product-specific synthesis
- `.planning/phases/01-protocol-transport-foundation/01-CONTEXT.md` — locked decisions

### Tertiary (LOW confidence)

- None required for core stack choices; open questions flag unresolved NATS error-channel binding.

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — verified pins + Context7
- Architecture: **HIGH** — aligns with locked CONTEXT + ARCHITECTURE.md
- Pitfalls: **HIGH** — CP-2/CP-3 are explicit in PITFALLS.md

**Research date:** 2026-04-09  
**Valid until:** ~30 days for npm pins; refresh NATS server patch level on security advisories
