# Phase 7: Browser connection & session bridge — Research

**Researched:** 2026-04-17  
**Domain:** Browser WebSocket client, relay protocol parity, reconnect & transcript ordering  
**Confidence:** HIGH (protocol/relay behavior verified in-repo); MEDIUM (dashboard package versions, generation bootstrap UX)

## Summary

Phase 7 adds `@agent-talkie/dashboard` with a **browser-native** `WebSocket` session bridge that mirrors the Node `TalkieSessionClient` lifecycle: **handshake → `session.register` or `session.resume` → `space.join` (envelope) → dispatch** of post-bind frames. Validation and types come from **`@agent-talkie/protocol`** (Zod 4), matching `packages/client` and `packages/relay` [VERIFIED: `session-client.ts`, `server.ts`, `relay-wire.ts`].

**Catch-up and `relaySeq`:** After join and after successful resume, the relay calls `sendTranscriptCatchUp`, which sends up to **100** rows from `listTranscriptTailBySeq` as JSON messages `{ type: "transcript.catchup", spaceId, relaySeq, envelope }` in ascending `relaySeq` order [VERIFIED: `catch-up.ts`, `server.ts`]. There is **no `afterSeq` filter** on this path—the tail is always the latest N rows. The dashboard bridge therefore uses `relaySeq` as a **client cursor for deduplication and ordering**, not as a server-side “resume from seq” cursor [VERIFIED: `catch-up.ts`].

**Reconnect secret rotation:** Every successful `session.resume` returns a **new** `reconnectSecret`; the relay replaces the stored hash in SQLite [VERIFIED: `server.ts`, `reconnect-secret.ts`]. The bridge must **overwrite** `sessionStorage` immediately on `session.resumed` [VERIFIED: `server.ts`; CONTEXT D-13–D-14].

**Relay “generation” (split-brain):** The daemon generates a 32-hex `generation`, passes it to `createRelayServer` as `relayGenerationToken`, and writes it to the lockfile [VERIFIED: `daemon.ts`, `ensure-relay.ts`]. HTTP `GET /__agent-talkie/v1/health?generation=...` returns **200** only when the query matches the live relay token [VERIFIED: `server.ts`, `daemon.test.ts`]. **WebSocket `handshake.ack` and `session.resumed` do not carry `generation`** [VERIFIED: `relay-wire.ts`, `server.ts`]. The UI must **persist** a baseline generation (CONTEXT D-12) obtained **out-of-band** (see Open Questions).

**Primary recommendation:** Implement a dedicated `BrowserSessionBridge` (or equivalent) that copies the state machine of `TalkieSessionClient`, subscribes to `message` **before** sending `session.resume`, parses non-envelope frames (`session.registered`, `session.resumed`, `space.joined`, `transcript.catchup`, `handshake.nack`, `protocol.error`) and envelopes via `safeParseEnvelope`, and layers reconnect backoff + health/generation checks on top.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** New `@agent-talkie/dashboard` package — Lit + Vite in monorepo. Does **not** extend `TalkieSessionClient` (`packages/client` uses Node `ws`).
- **D-02:** Browser **native** `WebSocket` only — no `ws`, no polyfills; evergreen browsers.
- **D-03:** Use **`@agent-talkie/protocol`** (Zod) for handshake, register, resume, envelope validation — protocol parity, no duplicated schemas.
- **D-04:** Lifecycle: **handshake → register/resume → join → dispatch** (same as Node client; API shape may be event-oriented).
- **D-05–D-08:** Health UX — states `connected` | `connecting` | `reconnecting` | `disconnected`; dot + label; **version/generation mismatch** → non-dismissible refresh banner (separate from dot); no toasts for normal transitions.
- **D-09–D-12:** Reconnect — exponential backoff **1 s → cap 30 s**, jitter optional; **unlimited** retries; track **max `relaySeq`**; on resume rely on server **`sendTranscriptCatchUp`**; **generation mismatch** → treat as stale / show refresh banner (split-brain).
- **D-13–D-15:** **`sessionStorage`** for `sessionId` + `reconnectSecret` after register; same-tab refresh uses **resume** then **register** fallback; **new tab = new session** (no `localStorage`/BroadcastChannel for identity).

### Claude's Discretion

- Backoff jitter details.
- Internal state wiring (Lit reactive controllers vs custom events vs signals).
- Vitest strategy: mock `WebSocket` vs in-process relay integration tests.

### Deferred Ideas (OUT OF SCOPE)

- None per CONTEXT.md.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| **CONN-01** | Dashboard connects to relay via WebSocket with live health indicator | Mirror `TalkieSessionClient.connect` handshake [VERIFIED: `session-client.ts`]; relay pre/post bind rules [VERIFIED: `server.ts`]; UI states D-05–D-06; optional HTTP health for liveness [VERIFIED: `server.ts`]. |
| **CONN-02** | Dashboard auto-reconnects with gap-fill via `relaySeq` cursor | Unlimited retry + backoff D-09–D-10; resume path triggers `sendTranscriptCatchUp` when membership exists [VERIFIED: `server.ts`]; client maintains **max `relaySeq`** and **dedupes** catch-up + live envelopes [VERIFIED: `catch-up.ts` sends fixed tail]. |
</phase_requirements>

## Project Constraints (from `.cursor/rules/`)

From embedded GSD context (`.cursor/rules/gsd-context.md`):

- **Zero external services** default; **WebSocket + SQLite** architecture; explicit opt-in membership [CITED: `.cursor/rules/gsd-context.md`].
- **GSD workflow:** Prefer GSD entry points (`/gsd-quick`, `/gsd-debug`, `/gsd-execute-phase`) so planning artifacts stay aligned [CITED: `.cursor/rules/gsd-context.md`].
- **Stack reference:** Node 20+, Zod 4, `ws` on server, Vitest — dashboard adds **browser** client only; do not introduce Socket.io or alternate realtime protocol [CITED: `.cursor/rules/gsd-context.md`].

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|----------------|
| `@agent-talkie/protocol` | workspace `^0.0.0` / Zod `^4.3.6` | Handshake, session messages, `safeParseEnvelope` | Single source of truth with relay [VERIFIED: `packages/protocol/package.json`, `relay-wire.ts`, `envelope.ts`] |
| `lit` | **3.3.2** (npm; confirm on lock) | Web components for connection shell | CONTEXT + OpenClaw alignment; stable WC baseline [VERIFIED: npm registry via `npm view lit` / npmjs.com] |
| `typescript` | `^5.9.3` (align monorepo) | Types | Matches other packages [VERIFIED: `packages/protocol/package.json`] |
| `vitest` | `^4.1.4` | Unit / integration tests | Existing monorepo standard [VERIFIED: `packages/protocol/package.json`] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vite` | Pin at **`npm view vite version`** when adding package | Dev server + build for dashboard | Phase 7–8 UI; version moves quickly — verify at plan time [CITED: vite.dev releases / npm; exact pin not verified in-session] |
| `@lit/context` or reactive controllers | optional | Inject bridge into shell | If shell needs DI without globals [ASSUMED: optional pattern] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `WebSocket` | `undici` / third-party WS | CONTEXT forbids; native is sufficient for localhost `ws:` |
| Extend `TalkieSessionClient` | Shared abstraction | Blocked — `ws` is Node-only [VERIFIED: `session-client.ts` imports `ws`] |

**Installation (illustrative — exact workspace wiring in PLAN):**

```bash
# New workspace packages/dashboard — dependencies to be pinned in PLAN after npm view
npm install lit @agent-talkie/protocol@workspace:* --workspace @agent-talkie/dashboard
npm install -D vite typescript vitest @types/node --workspace @agent-talkie/dashboard
```

## Architecture Patterns

### Recommended package layout

```
packages/dashboard/
├── src/
│   ├── bridge/           # BrowserSessionBridge — protocol state machine
│   ├── connection-shell/ # Lit: dot + label + banner slot
│   └── index.ts
├── vite.config.ts
└── package.json
```

### Pattern 1: Handshake-first socket open (parity with Node client)

**What:** On `open`, send `{ type: "handshake", supportedVersions }` only; first message handler validates `handshake.ack` / `handshake.nack` then swaps to post-handshake dispatcher [VERIFIED: `session-client.ts` L143–151, L98–138].

**When to use:** All connections; binary frames are rejected pre-handshake [VERIFIED: `server.ts` L275–278].

### Pattern 2: Pending-op queue for register / resume / join

**What:** Serialize responses for `session.register`, `session.resume`, and first `space.joined` / `protocol.error` using small pending structs (same idea as `pendingRegister` / `pendingResume` / `pendingJoin` in Node client) [VERIFIED: `session-client.ts` L168–239].

**When to use:** Until bound and joined; after that route everything through envelope handlers + side-channel types.

### Pattern 3: Subscribe before `session.resume` (catch-up race)

**What:** Attach `onmessage` **before** sending `session.resume` so `transcript.catchup` frames that fire immediately after `session.resumed` are not lost [VERIFIED: `integration.test.ts` “Test D”; `.planning/milestones/.../02-03-SUMMARY.md`].

### Pattern 4: `relaySeq` cursor for deduplication

**What:** Maintain `maxRelaySeq`; for each `transcript.catchup` and for each conversation/control envelope that carries durable transcript semantics, update cursor; **ignore or merge** rows with `relaySeq <= maxRelaySeq` when applying catch-up [VERIFIED: catch-up sends overlapping tail; CONTEXT D-11].

**When to use:** CONN-02; Phase 9 timeline consumes the same invariant.

### Anti-patterns to avoid

- **Assuming catch-up is incremental from cursor:** Server sends **tail window**, not `afterSeq` [VERIFIED: `catch-up.ts`].
- **Skipping secret persistence after resume:** Stale secret breaks next resume [VERIFIED: `server.ts` L399–404].
- **Treating `handshake.nack` as transport error only:** User-facing **refresh / upgrade** banner per D-07 [CITED: CONTEXT].
- **Using `localStorage` for session identity:** Violates D-15.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Protocol version overlap | Inline min/max checks | `versionRangesOverlap`, `agreeProtocolVersion` from `@agent-talkie/protocol` | Matches relay exactly [VERIFIED: `handshake.ts`, `server.ts`] |
| Envelope validation | Ad-hoc `typeof` checks | `safeParseEnvelope`, `parseEnvelope` | UUID v7 rules, kind enums, etc. [VERIFIED: `envelope.ts`] |
| Session wire shapes | Duplicate Zod | `relayClientHandshakeSchema`, `sessionRegisterMessageSchema`, `sessionResumeMessageSchema`, `sessionResumedMessageSchema`, ack/nack schemas [VERIFIED: `relay-wire.ts`] |
| Timing-safe secret compare on client | Client-side verification of secret | N/A — verification is **server-side** only [VERIFIED: `reconnect-secret.ts`] |

**Key insight:** The hard parts (hashing, transcript ordering in DB, catch-up selection) stay in relay/persistence; the browser only needs a **faithful client** and **idempotent merge** logic.

## Common Pitfalls

### Pitfall 1: Lost `transcript.catchup` after resume

**What goes wrong:** Tests or UI miss catch-up bursts right after `session.resumed`.  
**Why:** Relay schedules catch-up immediately after bind on resume [VERIFIED: `server.ts` L412–418].  
**How to avoid:** Register message listener first; use integration test pattern from `integration.test.ts` Test D [VERIFIED].  
**Warning signs:** Flaky tests; empty timeline after reconnect despite DB rows.

### Pitfall 2: Duplicate timeline rows after reconnect

**What goes wrong:** Same logical events appear twice.  
**Why:** Catch-up tail **overlaps** previously received `relaySeq` values.  
**How to avoid:** Dedupe by `relaySeq` (and/or envelope `id` where applicable) against cursor [VERIFIED: `catch-up.ts`; CONTEXT D-11].

### Pitfall 3: Infinite reconnect loop against wrong relay process

**What goes wrong:** UI reconnects forever while session/resume is invalid or DB was wiped.  
**Why:** `resume_rejected` closes socket [VERIFIED: `server.ts` L384–386]; client must fall back to **register** and clear bad secrets [CONTEXT D-14].  
**How to avoid:** Map `protocol.error` codes to state machine: refresh credentials vs full register.

### Pitfall 4: `envelope_version_mismatch` after negotiate

**What goes wrong:** Relay closes connection on post-handshake envelopes with wrong `version` [VERIFIED: `server.ts` L443–449].  
**Why:** `negotiatedVersion` from `handshake.ack` must be echoed on every envelope (Node client uses `version: 1` today) [VERIFIED: `session-client.ts` join envelope].

### Pitfall 5: Generation / health check chicken-and-egg

**What goes wrong:** Cannot call health without knowing generation; first load has no token.  
**Why:** Health is **auth-by-shared-secret query param**, not a public probe [VERIFIED: `server.ts` L214–221].  
**How to avoid:** Define bootstrap (see Open Questions): e.g. dev server injects generation, or first navigation includes `?generation=` from CLI (Phase 8) [ASSUMED: product wiring].

## Code Examples

### Handshake send (client)

```typescript
// Source: packages/client/src/session-client.ts (browser: same JSON shape)
ws.send(
  JSON.stringify({
    type: "handshake",
    supportedVersions: { minVersion: 1, maxVersion: 1 },
  }),
);
```

### Resume + catch-up trigger (server)

```typescript
// Source: packages/relay/src/server.ts (excerpt — resume branch)
sendJson(ws, {
  type: "session.resumed",
  sessionId: res.data.sessionId,
  reconnectSecret: newSecret,
});
const mem = findActiveMembershipForSession(db, res.data.sessionId);
if (mem) {
  void sendTranscriptCatchUp({ db, ws, spaceId: mem.spaceId });
}
```

### Catch-up wire shape

```typescript
// Source: packages/relay/src/catch-up.ts
sendJson(opts.ws, {
  type: "transcript.catchup",
  spaceId: opts.spaceId,
  relaySeq: row.relaySeq,
  envelope,
});
```

## State of the Art

| Old Approach | Current Approach | When | Impact |
|--------------|------------------|------|--------|
| CLI-only oversight | Browser session as first-class participant | v2.0 Phase 7 | Same protocol as adapters; `isHuman: true` on register [VERIFIED: `relay-wire.ts` L32–41; CONTEXT] |
| N/A | Bounded tail catch-up (100 rows) | v1 relay | Large gaps may need **`transcript.query`** with `afterSeq` in later phases [VERIFIED: grep/router references; not required for minimal CONN-02 if tail suffices] |

**Deprecated/outdated:** None identified for this slice.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Vite major suitable for new dashboard is current stable (verify with `npm view vite`) | Standard Stack | Build/plugin drift |
| A2 | `@lit/context` is optional, not mandatory | Standard Stack | Over-engineering |
| A3 | Baseline `generation` for health checks will be supplied by app bootstrap (URL param, injected global, or Phase 8 CLI) — not by WS handshake today | Open Questions | Stale detection blocked until wired |

**If A3 is wrong:** Would require protocol change (e.g. generation in `handshake.ack`) — out of current CONTEXT.

## Open Questions

1. **Where does the dashboard obtain the initial `generation` token for `sessionStorage` and reconnect comparison (D-12)?**  
   - **What we know:** Token exists in supervisor lockfile and `relay.ready` IPC [VERIFIED: `daemon.ts`, `ensure-relay.ts`]; health endpoint requires it [VERIFIED: `server.ts`].  
   - **What's unclear:** Pure browser dev (Vite only) has no lockfile read.  
   - **Recommendation:** PLAN should specify: dev `import.meta.env`, query string from `talkie dashboard` (Phase 8), or temporary dev-only endpoint — and store beside session secrets once known.

2. **Should Phase 7 call HTTP health before each reconnect attempt?**  
   - **What we know:** CLI uses health for liveness [VERIFIED: `cli.ts`, `liveness.ts`].  
   - **What's unclear:** CORS same-origin — OK when relay serves static assets (Phase 8); cross-origin dev may need Vite proxy.  
   - **Recommendation:** Document in PLAN; use same-origin policy as success criterion.

3. **Is tail-100 catch-up enough for CONN-02 “gap-fill,” or do we need client-initiated `transcript.query` in Phase 7?**  
   - **What we know:** Resume path only uses `sendTranscriptCatchUp` [VERIFIED: `server.ts`].  
   - **What's unclear:** Very chatty spaces during long offline periods.  
   - **Recommendation:** Phase 7 satisfies CONN-02 with **deduped tail**; defer `transcript.query` gap-fill to Phase 9+ unless UAT fails.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Modern browser (`WebSocket`, `JSON`, `sessionStorage`) | Dashboard | ✓ (evergreen) | — | — |
| Relay daemon (localhost) | Integration tests / manual QA | ✓ in dev | `DEFAULT_RELAY_PORT` 18765 [VERIFIED: `server.ts`] | Ephemeral port in tests |
| HTTP health same-origin | Generation/stale detection | Partial until Phase 8 | — | Dev proxy or skip check in pure WS dev [ASSUMED] |
| Node + Vitest | Package tests | ✓ | `>=20` [VERIFIED: root `package.json`] | — |

**Missing dependencies with no fallback:** None for core WS session.

**Missing dependencies with fallback:** Same-origin health in dev → proxy or defer strict generation checks to manual QA until Phase 8.

## Validation Architecture

> **Skipped:** `workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`. Re-enable in a later milestone if the project adopts per-requirement automated test gates.

## Security Domain

| ASVS area | Applies | Notes |
|-----------|---------|-------|
| V5 Input validation | yes | All inbound JSON through Zod (`safeParseEnvelope`, relay-wire schemas) [VERIFIED: protocol package]. |
| V13 API / WebSocket | yes | Size cap `MAX_INBOUND_WS_BYTES` (262144) on relay [VERIFIED: `server.ts`]; browser should avoid sending huge frames. |
| V2 / V4 AuthZ | partial | Localhost trust model; `isHuman` is client-asserted [VERIFIED: `relay-wire.ts` comment]. No TLS in v2.0 scope per PROJECT.md. |

**Threat patterns:** Malformed JSON → relay closes or `protocol.error` [VERIFIED: `server.ts`]; client must not execute `envelope` payloads as code—treat as data until Phase 9 rendering rules.

## Sources

### Primary (HIGH confidence)

- `packages/client/src/session-client.ts` — client lifecycle reference  
- `packages/protocol/src/relay-wire.ts`, `handshake.ts`, `envelope.ts` — wire schemas and helpers  
- `packages/relay/src/server.ts` — handshake, register, resume, envelope version check  
- `packages/relay/src/catch-up.ts` — `transcript.catchup` shape and tail query  
- `packages/relay/src/reconnect-secret.ts` — server-side secret hashing  
- `packages/relay/src/integration.test.ts` — resume + catch-up expectations  
- `packages/relay/src/daemon.ts` — generation token creation and relay wiring  
- `.planning/phases/07-browser-connection-session-bridge/07-CONTEXT.md` — locked decisions  

### Secondary (MEDIUM confidence)

- [npm `lit` package](https://www.npmjs.com/package/lit) — version 3.3.2  
- `.cursor/rules/gsd-context.md` — project constraints snapshot  
- `.planning/research/ARCHITECTURE.md` — dashboard parser should handle envelopes + side channels  

### Tertiary (LOW confidence)

- Vite current pin — verify with `npm view vite version` at PLAN time  

## Metadata

**Confidence breakdown:**

- Standard stack (protocol + relay path): **HIGH** — read from repo  
- Dashboard bundler pins: **MEDIUM** — verify on npm at execution  
- Pitfalls / race conditions: **HIGH** — matches integration tests and code  

**Research date:** 2026-04-17  
**Valid until:** ~30 days (stable protocol) / ~7 days if Vite/Lit minors move  

---

*Phase: 07-browser-connection-session-bridge*
