# Phase 7: Browser connection & session bridge - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a browser-native WebSocket session bridge that registers (or resumes) a canonical human session with the relay, maintains visible connection health state, and recovers monotonic ordering across reconnects via relaySeq cursor catch-up. No UI beyond the connection shell and health indicator — roster, transcript, and controls belong to later phases.

</domain>

<decisions>
## Implementation Decisions

### Browser Client Architecture
- **D-01:** New `@agent-talkie/dashboard` package — standalone Lit + Vite package in the monorepo. Does NOT wrap or extend `TalkieSessionClient` from `packages/client` (which depends on the Node.js `ws` library).
- **D-02:** Browser-native `WebSocket` API only — no polyfills, no `ws` shim. The dashboard targets modern evergreen browsers.
- **D-03:** Share `@agent-talkie/protocol` for Zod schema validation (handshake, envelope, register, resume). Zod 4 runs in the browser; this ensures protocol parity without code duplication.
- **D-04:** Session bridge class follows the same lifecycle as the Node.js client: handshake → register/resume → join → dispatch loop. Method signatures may differ to fit browser ergonomics (event-based rather than promise-per-pending-op).

### Connection Health UX
- **D-05:** Four canonical states: `connected`, `connecting`, `reconnecting`, `disconnected`. No intermediate sub-states at this phase.
- **D-06:** Visual indicator: color dot (green / amber / red) with adjacent text label. Placed in a connection shell component that Phase 9+ will embed in the dashboard header.
- **D-07:** Generation or protocol version mismatch triggers a prominent, non-dismissible banner instructing the user to refresh. This is distinct from the transient health indicator.
- **D-08:** No toast notifications for normal state transitions — the indicator updates reactively. Toasts reserved for user-actionable errors (stale generation, auth failures in future).

### Reconnect Strategy
- **D-09:** Exponential backoff starting at 1 s, doubling each attempt, capped at 30 s. Jitter optional but allowed.
- **D-10:** No maximum retry count — localhost relay should always be recoverable. The `disconnected` state is shown but reconnect attempts continue indefinitely.
- **D-11:** relaySeq cursor: the bridge stores the highest `relaySeq` received. On reconnect, after session.resume succeeds, the relay's existing `sendTranscriptCatchUp` path delivers the gap-fill (server-driven, not client-requested — no protocol change needed for v1).
- **D-12:** Split-brain avoidance: on reconnect, if the relay returns a generation token that differs from the one stored at initial connect, transition to a `stale` sub-state within `disconnected` and show the refresh banner (D-07). This prevents silently operating against a restarted relay with a different database.

### Session Identity Persistence
- **D-13:** Use `sessionStorage` (tab-scoped). Stores `sessionId` and `reconnectSecret` after successful register.
- **D-14:** Same-tab page refresh triggers `session.resume` with stored credentials. If resume fails (expired, relay restarted), fall back to fresh `session.register`.
- **D-15:** New tab = new session. No cross-tab identity sharing — keeps the model simple and aligns with localhost-only v2.0 scope.

### Agent's Discretion
- Backoff jitter implementation details
- Internal event bus or reactive state management pattern within the bridge class (Lit reactive controllers, custom events, or signals — agent picks what fits best with Lit conventions)
- Test harness approach for WebSocket mocking in Vitest (mock server vs. protocol-level stubs)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Protocol & Handshake
- `packages/protocol/src/relay-wire.ts` — Handshake, register, resume schemas (the bridge must send/parse these exact shapes)
- `packages/protocol/src/handshake.ts` — Version negotiation logic (versionRangesOverlap, agreeProtocolVersion)
- `packages/protocol/src/envelope.ts` — Envelope schema and safeParseEnvelope

### Existing Client (reference, not to extend)
- `packages/client/src/session-client.ts` — Node.js reference implementation of the handshake → register/resume → join → dispatch lifecycle

### Relay Server (must be compatible)
- `packages/relay/src/server.ts` — Connection handling, message dispatch, session bind flow
- `packages/relay/src/catch-up.ts` — `sendTranscriptCatchUp` — server-driven gap-fill on join/resume
- `packages/relay/src/reconnect-secret.ts` — Secret rotation on resume (bridge must store new secret after resume)

### Persistence (read-only reference)
- `packages/persistence/src/repositories/transcript.ts` — `listTranscriptTailBySeq` and `nextRelaySeq` — understand what the relay sends during catch-up

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@agent-talkie/protocol` schemas: Direct dependency — import Zod schemas for handshake, envelope, register, resume validation in the browser
- `relay/catch-up.ts`: Server-side catch-up is already implemented — the browser bridge just needs to handle `transcript.catchup` messages, no new relay-side code needed

### Established Patterns
- Handshake → register/resume → join → dispatch: The Node.js `TalkieSessionClient` establishes this 4-step lifecycle; the browser bridge follows the same sequence
- `reconnectSecret` rotation: On every `session.resume`, the relay issues a new secret. The bridge must overwrite the stored secret immediately
- Health endpoint: `/__agent-talkie/v1/health?generation=TOKEN` exists — can be used for pre-flight generation checks

### Integration Points
- Relay server (`packages/relay/src/server.ts`): No relay changes expected — browser WebSocket sessions are protocol-identical to Node.js sessions
- `isHuman: true` flag in `session.register`: The dashboard session should register with `isHuman: true` to distinguish from agent sessions
- Relay port default: `18765` on `127.0.0.1`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User deferred all decisions to agent discretion with the constraint of matching existing protocol patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-browser-connection-session-bridge*
*Context gathered: 2026-04-17*
