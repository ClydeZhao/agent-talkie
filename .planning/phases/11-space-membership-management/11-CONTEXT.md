# Phase 11: Space & membership management - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Operators manage space lifecycle (create and destroy) and session membership (remove) from the dashboard, with a space picker to list and switch between spaces. Invite is out of scope — sessions join by themselves via adapter/CLI. Search/filter/topology belong to Phase 12.

</domain>

<decisions>
## Implementation Decisions

### Space Creation
- **D-01:** Reuse existing `space.join` for creation — dashboard provides a slug input, the browser session sends `space.join` with the new slug. The relay's `resolveOrCreateSpaceForSlug` already creates-if-not-exists. No new protocol needed.
- **D-02:** Creation UI lives in the space picker dropdown as a "Create new space" entry that expands an inline slug input field + confirm button.

### Space Destruction
- **D-03:** Owner-only with confirmation dialog — only the space owner (first human to join) can destroy a space. Clicking "Destroy" shows a confirmation dialog before executing. Active sessions are forcibly removed.
- **D-04:** New WS control message `space.destroy` — the dashboard sends a `control` envelope with `type: "space.destroy"` and `payload: { slug }`. Relay validates owner identity, marks all memberships as left, closes WS connections for kicked sessions, then deletes the space row (CASCADE removes memberships and transcript). Consistent with existing `space.join`/`space.leave` control flow.
- **D-05:** Destroy action lives in the space picker dropdown (context menu on the current space entry) or in the header alongside the current space label, visible only to the owner.

### Membership Management
- **D-06:** No invite mechanism — runtime sessions join spaces by themselves via adapter/CLI with a slug. Session IDs are internal and not exposed to dashboard users in a way that enables targeted invitation. MGMT-02 "invite" is effectively a no-op for localhost v2.0.
- **D-07:** Owner kick (remove) via roster action menu — new "Remove" option in the roster entry context menu (alongside existing "Designate as orchestrator" from Phase 10). Owner-only visibility, same pattern as orchestrator management (D-07 in Phase 10).
- **D-08:** New WS control message `membership.remove` — `control` envelope with `type: "membership.remove"` and `payload: { targetSessionId }`. Relay validates the sender is the space owner, marks `left_at` on the target's membership, and closes the target session's WS connection. No confirmation dialog — click executes immediately (consistent with Phase 10 D-08 for orchestrator actions).

### Space Picker UX
- **D-09:** New HTTP endpoint `GET /__agent-talkie/v1/oversight/spaces` — returns list of active spaces with `slug`, `memberCount`, `ownerSessionId`, `orchestratorSessionId`. Lightweight query against the spaces table. Consistent with existing `space-summary` endpoint style.
- **D-10:** Header dropdown — header bar left side shows current space slug. Clicking expands a dropdown listing all active spaces (from the list API) plus a "Create new space" action at the bottom.
- **D-11:** New tab for space switch — clicking a different space in the dropdown opens `/dashboard?space=<slug>` in a new tab. Each tab is an independent browser session (per Phase 7 D-15: "new tab = new session" via `sessionStorage`). No leave/rejoin protocol logic needed; natural tab-level isolation.
- **D-12:** URL-driven space binding — dashboard reads `?space=<slug>` query param on load to determine which space to join. If no param, use a default slug (e.g., `default`) or show the space picker for initial selection.

### Agent's Discretion
- Slug input validation UX (inline error messages, character restrictions display)
- Confirmation dialog styling and animation
- Dropdown component implementation (custom Lit component vs Shoelace sl-dropdown)
- Space list refresh interval in the picker (on-open vs periodic polling)
- How the "Create new space" inline form is styled within the dropdown
- Whether destroying the current space auto-redirects or shows an empty state
- How the kicked session experiences disconnection (error message in their adapter)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Space Lifecycle (extend with destroy)
- `packages/relay/src/space-lifecycle.ts` — `handleSpaceJoin`, `handleSpaceLeave`, `resolveOrCreateSpaceForSlug`, `isSpaceJoinEnvelope`. Add `handleSpaceDestroy` and `isSpaceDestroyEnvelope` here.
- `packages/persistence/src/repositories/spaces.ts` — `insertSpaceWithSlug`, `getSpaceBySlug`, `deleteSpaceById`, `insertMembership`, `markMembershipLeft`, `findActiveMembershipForSession`, `normalizeSpaceSlug`. `deleteSpaceById` already exists with FK CASCADE.

### Space Owner (permission checks)
- `packages/persistence/src/repositories/space-owner.ts` — `getSpaceOwnerSessionId`, `tryAssignSpaceOwnerIfUnsetForHuman`. Owner validation for destroy and kick.

### Relay Server (add space list endpoint + handle new control messages)
- `packages/relay/src/server.ts` — HTTP handler (add `/oversight/spaces` route), WS message dispatch (route `space.destroy` and `membership.remove`).
- `packages/relay/src/session-registry.ts` — Session→WebSocket mapping. Need to look up WS connections to close kicked sessions.
- `packages/relay/src/collaboration-handlers.ts` — Pattern for owner-gated control messages (e.g., `orchestrator.designate` checks `isHuman`).

### Dashboard Bridge (add space lifecycle methods)
- `packages/dashboard/src/bridge/browser-session-bridge.ts` — Add `sendSpaceDestroy(slug)` and `sendMembershipRemove(targetSessionId)` methods. `sendEnvelope` pattern from Phase 10.

### Dashboard Store & UI
- `packages/dashboard/src/store/dashboard-store.ts` — `DashboardStore`: `activeSpaceId`, `setActiveSpaceId`, `selfIsOwner`, `hydrateFromSpaceSummary`. Extend with space list state.
- `packages/dashboard/src/roster/talkie-roster-entry.ts` — Roster entry with action menu. Add "Remove" option (owner-only).
- `packages/dashboard/src/demo/main.ts` — App entry point: wire space picker, read `?space=` query param.
- `packages/dashboard/src/shell/connection-shell.ts` — Header component: add space picker dropdown.

### Phase 9–10 Context (predecessor decisions)
- `.planning/phases/09-core-oversight-ui/09-CONTEXT.md` — Two-column layout (D-01), dark theme (D-02), roster entry design (D-04–07), centralized store (D-22–23)
- `.planning/phases/10-interactive-human-controls/10-CONTEXT.md` — Roster action menu (D-06–08), owner-gated visibility (D-07), optimistic send (D-09)

### Persistence Oversight (space list query source)
- `packages/persistence/src/repositories/oversight.ts` — `getOversightSpaceSummaryBySlug`. Reference for building `listOversightSpaces`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `handleSpaceJoin` in `space-lifecycle.ts`: Already handles create-or-revive — dashboard space creation reuses this exact path
- `deleteSpaceById` in `spaces.ts`: FK CASCADE already deletes memberships and transcript rows — space destroy just needs to call this after validation
- `DashboardStore.selfIsOwner`: Already computed from roster — gates destroy and kick visibility
- Roster action menu from Phase 10: Pattern for adding "Remove" alongside "Designate as orchestrator"
- `getRelayErrorCopy` in `relay-error-copy.ts`: Error code→message mapping — extend with new errors (`not_space_owner` already exists, add `membership_remove_self`, `space_destroy_not_empty` if needed)

### Established Patterns
- Control messages follow `{ kind: "control", type: "space.join" | "space.leave" | "orchestrator.designate" | ... }` — new types `space.destroy` and `membership.remove` follow the same shape
- All control operations require `idempotencyKey` — destroy and kick must too
- Owner checks use `getSpaceOwnerSessionId(db, spaceId)` — same pattern for destroy and kick
- HTTP oversight endpoints use `GET /__agent-talkie/v1/oversight/...` with query params — spaces list follows this convention

### Integration Points
- `server.ts` HTTP handler: Add `/__agent-talkie/v1/oversight/spaces` route alongside existing `space-summary`
- `server.ts` WS dispatch: Route `space.destroy` and `membership.remove` types to new handlers in `space-lifecycle.ts`
- `SessionRegistry`: Maps sessionId→WebSocket. Used to close connections when kicking sessions or destroying spaces
- `connection-shell.ts`: Add space picker dropdown to header
- `demo/main.ts`: Parse `?space=` query param, pass slug to bridge `join` call

</code_context>

<specifics>
## Specific Ideas

- User strongly feels dashboard should NOT have complex session management — sessions join by themselves, dashboard just observes and controls at the space level.
- "One space = one tab" mental model — switching spaces opens new tabs, each tab is an independent session. No complex in-tab rebind.
- Destruction should have a confirmation dialog (unlike orchestrator designate/clear which is instant) because it's irreversible and affects all participants.

</specifics>

<deferred>
## Deferred Ideas

- **Invite mechanism** — not feasible in localhost v2.0 because session IDs aren't exposed. Would require a session discovery/registry API. Relevant when remote relay + auth story (RSEC-01/02) lands.
- **Multi-space per session** — deferred per PROJECT.md (MSPC-01). Current v1 constraint: one session per space.
- **In-tab space switching** — leave/rejoin within a single tab. Skipped in favor of new-tab model for simplicity.

</deferred>

---

*Phase: 11-space-membership-management*
*Context gathered: 2026-04-21*
