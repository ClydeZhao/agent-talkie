# Phase 9: Core oversight UI - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

## Phase Boundary

Deliver the core oversight UI for the dashboard: a live session roster with runtime/workspace/role metadata, a real-time scrolling transcript timeline with catch-up, collaboration metadata at a glance, and human-readable relay error messages. No interactive controls (send, orchestrator management) — those belong to Phase 10. No search/filter or topology graph — those belong to Phase 12.



## Implementation Decisions

### Dashboard Layout

- **D-01:** Two-column layout: left panel (roster, ~280px fixed width) + main area (transcript timeline, fluid). Header bar spans full width with connection shell and space identifier.
- **D-02:** Dark theme default with CSS custom properties on `:root` (aligned with OpenClaw-style theming). Global `theme.css` imported from `index.html`; Lit components consume `var(--token)` inside shadow roots.
- **D-03:** Error notification strip sits directly below the header bar, full width, above the two-column content area. Only visible when errors are active.

### Roster View (OVER-01)

- **D-04:** Compact card-list in the left panel. Each entry is a horizontal row showing: displayName, runtime badge (e.g. "cursor", "codex", "browser"), workspace label, and inline metadata chips.
- **D-05:** Session type distinction via leading icon: person icon for `isHuman: true` sessions, bot icon for agent sessions. Orchestrator marked with a crown/star overlay badge on the icon.
- **D-06:** Roster initial state loaded via HTTP snapshot (`GET /__agent-talkie/v1/oversight/space-summary?slug=`) on connect, then refreshed by periodic polling (~10s). Live `metadata.patch` envelopes via `onEnvelope()` update individual entries between polls. Note: research confirmed that `space.joined`/`space.left` are NOT broadcast to other sockets and NOT written to transcript, so catch-up reconstruction is not viable for roster — HTTP snapshot is the reliable data source.
- **D-07:** Roster renders as a native Lit component (`<talkie-roster>`) containing `<talkie-roster-entry>` children. No Shoelace dependency for roster — keep it lightweight with custom CSS.

### Transcript Timeline (OVER-02)

- **D-08:** Terminal-log style, not chat bubbles. Each entry is a single horizontal row: `[HH:MM:SS] sender (kind): payload preview`. Fits the operations dashboard / control-plane feel aligned with OpenClaw.
- **D-09:** Virtualized rendering via `@lit-labs/virtualizer` to handle large transcript histories without DOM bloat.
- **D-10:** Live tail behavior: auto-scroll to bottom when new messages arrive AND the user is already at the bottom. When scrolled up, show a "↓ N new messages" indicator that jumps to bottom on click.
- **D-11:** Catch-up messages (from `BrowserSessionBridge.onTranscriptCatchup()`) load first on connect, then live envelopes (from `onEnvelope()`) append in real time. Both share the same rendering pipeline — no visual distinction between catch-up and live messages.
- **D-12:** Color-code by envelope `kind`: control messages dimmed (gray), conversation messages normal (foreground), error-type messages highlighted (red accent). Message `type` shown as a secondary badge when relevant (e.g. `task.assign`, `metadata.patch`).
- **D-13:** Transcript component: `<talkie-transcript>` with a `<talkie-transcript-entry>` per row. Timestamp uses locale-aware short format (HH:MM:SS).

### Metadata Chips (OVER-04)

- **D-14:** Collaboration metadata displayed inline within each roster entry, directly beneath the session name line. Dense chip layout: role chip (if set), focus as truncated subtitle, progress indicator.
- **D-15:** Progress states visualized as small colored dot + label: idle (gray), working (green pulse), blocked (red), done (blue). Matches the existing connection health dot pattern from Phase 7.
- **D-16:** Blocked sessions get a prominent red border/highlight on their roster entry with `blockedReason` shown as a tooltip on hover (or inline if short). Blocked sessions sort to the top of the roster.
- **D-17:** Metadata updates arrive as `metadata.patch` envelopes via the bridge and update the corresponding roster entry reactively. Debounce UI updates at 200ms to coalesce rapid patches.

### Error UX (OVER-07)

- **D-18:** Protocol error codes mapped to operator-friendly messages in a static lookup table. Error map covers all known codes: `no_orchestrator` → "No orchestrator designated — assign one to route messages", `not_in_space` → "Session is not in this space", `orchestrator_offline` → "Orchestrator is offline — messages cannot be delivered", `not_space_owner` → "Only the space owner can perform this action", etc.
- **D-19:** Transient errors (e.g. `invalid_envelope`) shown as auto-dismissing notification in the error strip (8 second timeout). Session-breaking errors (e.g. `resume_rejected`, `not_in_space` for self, `envelope_version_mismatch`) shown as sticky notification requiring user action (refresh or re-join). Note: `envelope_version_mismatch` is sticky because it means the client's protocol version is incompatible — aligns with Phase 7 D-07 (non-dismissible banner for protocol mismatch).
- **D-20:** Error strip component: `<talkie-error-bar>` renders a stack of error items, each with the mapped message and an optional recovery hint. Latest error on top; max 3 visible, older ones collapsed.
- **D-21:** Errors that arrive as protocol.error frames via the bridge are intercepted before normal envelope dispatch and routed to the error bar. The bridge already detects `protocol.error` type in `dispatchPostHandshake`.

### Data Flow Architecture

- **D-22:** Centralized reactive store (Lit reactive controller or simple event-driven state class) that the bridge feeds and all UI components consume. Bridge → Store → Components. Store holds: roster entries (Map<sessionId, RosterEntry>), transcript entries (ordered array), active errors (array), space metadata.
- **D-23:** The store initializes roster from HTTP snapshot on connect (via the space-summary endpoint), then keeps it updated via periodic polling (~10s) and live `metadata.patch` envelopes. Transcript state is reconstructed from catch-up messages, then live envelopes append. Orchestrator identity comes from the space-summary snapshot (`orchestratorSessionId` field).

### Agent's Discretion

- Exact CSS token values (colors, spacing, font sizes) — follow OpenClaw's dark theme conventions
- Virtualizer configuration details (overscan, item sizing strategy)
- Internal store implementation (reactive controller vs standalone class with events)
- Exact icon set choice (inline SVG, Shoelace icons, or Lucide)
- Whether to add Shoelace for error bar dismiss buttons or keep fully custom
- Transcript entry truncation length for long payloads
- Responsive breakpoint behavior (if any — localhost dashboard is primarily desktop)



## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Protocol & Wire Schemas

- `packages/protocol/src/relay-wire.ts` — Session register/resume schemas, handshake ack/nack
- `packages/protocol/src/envelope.ts` — Envelope schema, `safeParseEnvelope`
- `packages/protocol/src/collaboration-wire.ts` — Metadata patch/query schemas, progress enum, orchestrator designate/clear

### Dashboard Bridge (data source for all UI components)

- `packages/dashboard/src/bridge/browser-session-bridge.ts` — `onEnvelope()`, `onTranscriptCatchup()`, health change listeners — the single data feed for roster, transcript, and errors
- `packages/dashboard/src/bridge/wire-schemas.ts` — `transcriptCatchupMessageSchema`, `sessionRegisteredWireSchema`, `spaceJoinedWireSchema`
- `packages/dashboard/src/shell/connection-shell.ts` — Existing Lit component pattern (styling, decorators, health dot) — reference for new components

### Persistence (understand what data exists)

- `packages/persistence/src/repositories/oversight.ts` — `OversightMember` type, `getOversightSpaceSummaryBySlug`, `listOversightTranscriptTailBySlug`, `listOversightBlockedSessionsBySlug` — server-side data model the client-side roster/transcript mirrors
- `packages/persistence/src/repositories/collaboration-metadata.ts` — `CollaborationMetadataSnapshot`, `getCollaborationMetadataSnapshot` — metadata structure the bridge delivers

### Relay Error Codes (error map source)

- `packages/relay/src/router.ts` — Protocol errors from routing: `not_in_space`, `no_orchestrator`, `orchestrator_offline`, `invalid_envelope`, `session_mismatch`
- `packages/relay/src/collaboration-handlers.ts` — Protocol errors from collaboration: `not_space_owner`, `orchestrator_designate_forbidden`, `task_assign_forbidden`, `metadata_patch_forbidden`, `orchestrator_target_invalid`, `idempotency_replay_mismatch`
- `packages/relay/src/server.ts` — Protocol errors from connection/session: `invalid_handshake`, `invalid_json`, `invalid_session_message`, `resume_rejected`, `envelope_version_mismatch`, `expected_session_register_or_resume`

### Stack Research

- `.planning/research/STACK.md` — Lit, Vite, @lit-labs/virtualizer, Shoelace, CSS approach, OpenClaw design reference

### Phase 7 & 8 Context (predecessor decisions)

- `.planning/phases/07-browser-connection-session-bridge/07-CONTEXT.md` — Browser session bridge architecture, health states, reconnect strategy
- `.planning/phases/08-dashboard-distribution-cli-entry/08-CONTEXT.md` — `/dashboard` URL path, CLI entry, static serving



## Existing Code Insights

### Reusable Assets

- `BrowserSessionBridge` (bridge/browser-session-bridge.ts): Full WebSocket lifecycle with `onEnvelope()` and `onTranscriptCatchup()` — the single data source for all Phase 9 UI components
- `TalkieConnectionShell` (shell/connection-shell.ts): Lit component pattern to follow — `@customElement`, `@property`, `static styles`, health dot rendering
- `@agent-talkie/protocol` collaboration-wire schemas: `progressSchema` (idle/working/blocked/done), `metadataPatchPayloadSchema` — directly usable for type-safe metadata parsing in the store
- `safeParseEnvelope` from protocol: Validates incoming envelopes — already used in bridge, can be reused in store for catch-up reconstruction

### Established Patterns

- Lit Web Components with TypeScript decorators, shadow DOM, `css` tagged template styling
- Event-based reactivity: bridge uses callback-based listeners (`onEnvelope`, `onTranscriptCatchup`, `onConnectionHealthChange`)
- No existing global state management — the store will be the first centralized state layer in the dashboard

### Integration Points

- `demo/main.ts`: Current app entry point that creates bridge + shell. Phase 9 will expand this to create roster, transcript, error bar, and wire them to the bridge via the store
- `connection-shell.ts`: Header component. Phase 9 components will sit alongside/below it in the app layout
- `index.html`: App mount point (`<div id="app">`). Layout composition happens in the main entry script



## Specific Ideas

- Design reference: OpenClaw dashboard (Lit Web Components + dark theme + CSS tokens). Cited in PROJECT.md and STACK.md as the canonical design direction.
- User explicitly prefers short paths and minimal ceremony (from Phase 8).
- All UI decisions deferred to agent — user trusts builder judgment within the OpenClaw-aligned direction.



## Deferred Ideas

None — discussion stayed within phase scope



---

*Phase: 09-core-oversight-ui*
*Context gathered: 2026-04-17*