# Phase 10: Interactive human controls - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Human can send messages from the dashboard with CLI-equivalent routing (human→orchestrator default, direct session targeting), manage orchestrator designation from the roster, and safely retry failed sends using idempotent keys — all without leaving the web dashboard. No space/membership management (Phase 11) or transcript search/topology (Phase 12).

</domain>

<decisions>
## Implementation Decisions

### Send Panel
- **D-01:** Bottom input bar fixed below the transcript area. Sits within the right-column layout established in Phase 9. Always visible when connected.
- **D-02:** Multi-line text area. Shift+Enter inserts newline, Ctrl+Enter or dedicated send button submits. Expandable vertically for longer messages.
- **D-03:** Send panel only dispatches `conversation` kind envelopes. Control commands (`orchestrator.designate`, `orchestrator.clear`, `task.assign`) are triggered through dedicated UI elements (roster action menu), not composed in the text area.

### Target Selection & Routing
- **D-04:** Default routing is human→orchestrator. Input bar shows "To: Orchestrator" indicator by default. Clicking a session in the roster switches the target to that specific session (direct send via `to` field). Clicking the same roster entry again or clicking an "×" on the target indicator reverts to default orchestrator routing.
- **D-05:** When no orchestrator is designated, the default send path is disabled. Input bar shows a prompt like "Designate an orchestrator to send messages" and the send button is disabled. Direct targeting (via roster click) remains available.

### Orchestrator Management
- **D-06:** Designate/clear actions live in a roster entry action menu. Clicking a roster entry (or an action icon on the entry) opens a context menu. Non-orchestrator entries show "Designate as orchestrator". The current orchestrator's menu shows "Clear orchestrator". The roster already visually marks the orchestrator (crown/star overlay from Phase 9 D-05).
- **D-07:** Non-owner users do not see designate/clear menu options at all. The store already tracks `owner` status per roster row from the space-summary snapshot — use this to gate visibility.
- **D-08:** No confirmation dialog for designate or clear. Click executes immediately. Both operations are reversible on localhost, and the roster updates reactively to reflect the change.

### Send Feedback & Retry
- **D-09:** Optimistic send. On submit: clear the input, the sent envelope appears in the transcript via normal relay echo. If the relay returns a `protocol.error`, it surfaces through the existing error bar (Phase 9 D-18–21).
- **D-10:** Error bar retry button. When a send failure triggers an error bar item, that item includes a "Retry" action button. Clicking retry resends the same envelope with the same `idempotencyKey`, leveraging the relay's deduplication to guarantee exactly-once delivery.
- **D-11:** `idempotencyKey` is completely hidden from users. The bridge auto-generates a UUID v4 key per send, stores the pending envelope internally for retry, and reuses the same key on retry.

### Agent's Discretion
- Send button icon/label design and placement
- Input bar height, max-height, and resize behavior
- Roster action menu trigger mechanism (click, icon button, or hover reveal)
- Error bar retry button styling
- Keyboard shortcuts beyond Ctrl+Enter for send
- How the "To: [target]" indicator is styled and positioned relative to the text area
- Whether the target indicator shows session displayName, sessionId prefix, or both

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Protocol & Envelope
- `packages/protocol/src/envelope.ts` — Envelope schema (`version`, `id`, `sessionId`, `kind`, `type`, `payload`, `idempotencyKey`, `to`, `spaceId`)
- `packages/protocol/src/collaboration-wire.ts` — `orchestratorDesignatePayloadSchema`, `orchestratorClearPayloadSchema`, `progressSchema`

### Relay Message Handling
- `packages/relay/src/router.ts` — `routeEnvelope`: human→orchestrator default routing (conversation kind, no `to`, `isHuman`), direct targeting (`to` field), transcript append, error responses (`no_orchestrator`, `orchestrator_offline`, `not_in_space`)
- `packages/relay/src/collaboration-handlers.ts` — `orchestrator.designate` and `orchestrator.clear` handling: `isHuman` check, `idempotencyKey` required, `tryRecordIdempotencyKey` for deduplication, `fanOutOrchestratorUpdate` for roster sync
- `packages/relay/src/space-lifecycle.ts` — `tryRecordIdempotencyKey` implementation, `idempotency_replay_mismatch` error

### Dashboard Bridge (needs `send` method)
- `packages/dashboard/src/bridge/browser-session-bridge.ts` — Current lifecycle: connect→handshake→register/resume→join. Has `dispatchPostHandshake` for incoming messages, `onEnvelope`/`onProtocolError` callbacks. **No outbound send method exists yet — must be added.**

### Dashboard Store & UI
- `packages/dashboard/src/store/dashboard-store.ts` — `DashboardStore`: roster (Map with `orchestrator`/`owner` flags), transcript, errors. `hydrateFromSpaceSummary` sets orchestrator/owner identity.
- `packages/dashboard/src/errors/relay-error-copy.ts` — Error code→human-readable message mapping (extend for send-specific errors if needed)
- `packages/dashboard/src/roster/talkie-roster-entry.ts` — Existing roster entry component (add action menu here)
- `packages/dashboard/src/demo/main.ts` — App entry point wiring bridge→store→components

### Phase 9 Context (predecessor decisions)
- `.planning/phases/09-core-oversight-ui/09-CONTEXT.md` — Two-column layout (D-01), dark theme (D-02), roster entry design (D-04–07), error bar (D-18–21), centralized store (D-22–23)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DashboardStore`: Already tracks `orchestrator` and `owner` per roster row — use for gating designate/clear menu visibility and disabling default send when no orchestrator
- `talkie-error-bar`: Already handles protocol errors with sticky/transient distinction and auto-dismiss — extend with retry action button
- `safeParseEnvelope` from `@agent-talkie/protocol`: Validates outbound envelopes before send
- `relay-error-copy.ts`: Error code→copy mapping already covers `no_orchestrator`, `orchestrator_offline`, `orchestrator_designate_forbidden`, `orchestrator_target_invalid`, `idempotency_replay_mismatch`

### Established Patterns
- Bridge uses callback-based listener pattern (`onEnvelope`, `onProtocolError`, `onConnectionHealthChange`) — send method should follow the same style
- Relay expects envelopes as JSON over WebSocket with `version`, `id`, `sessionId`, `kind`, `type`, `payload`, optional `idempotencyKey`/`to`/`spaceId`
- All control operations (`orchestrator.designate/clear`) require `idempotencyKey` — the bridge must auto-generate these
- Lit Web Components with TypeScript decorators, shadow DOM, `css` tagged template literals

### Integration Points
- `BrowserSessionBridge`: Add `send(envelope)` method that serializes and sends via the open WebSocket, storing the pending envelope for retry
- `DashboardStore`: Add send-related state (pending target, last failed envelope for retry)
- `demo/main.ts`: Wire new send panel and roster action menu to bridge and store
- `talkie-roster-entry`: Add action menu trigger and event emission for designate/clear/target-select

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the OpenClaw-aligned dark theme direction established in Phase 9.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-interactive-human-controls*
*Context gathered: 2026-04-20*
