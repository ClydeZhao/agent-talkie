# Phase 12: Discovery, topology & attention - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Dense operator console features: find messages quickly via full-text search and multi-dimensional filters, and surface stalled work through an attention lane. Scope covers OVER-03 (transcript search/filter) and OVER-06 (attention lane). OVER-05 (topology graph) is descoped from this phase — user determined it is too complex for insufficient value; deferred to a future milestone.

</domain>

<decisions>
## Implementation Decisions

### Transcript Search Engine (OVER-03)
- **D-01:** MiniSearch (~7KB gzip) as the client-side full-text search library. Supports fuzzy matching, prefix search, and weighted fields. Index built from `DashboardStore.transcriptLines` — no server-side search needed for the loaded transcript window.
- **D-02:** Index fields: sender displayName, envelope `type`, payload preview text. Weighted toward sender and type for operator-centric queries.

### Search UX (OVER-03)
- **D-03:** Right-side search panel — a dedicated panel that opens to the right of the transcript. Click a search icon (in the transcript header area) to toggle the panel open/closed.
- **D-04:** Split-pane layout — when the search panel is open, transcript compresses its width and the search results occupy the right portion. Both are visible simultaneously side-by-side.
- **D-05:** Search results list — each result shows timestamp, sender, kind/type, and payload snippet with highlighted matches. Clicking a result scrolls the transcript virtualizer to the corresponding entry.

### Transcript Filters (OVER-03)
- **D-06:** Filter dimensions: sender (displayName dropdown from roster), envelope kind (`control`/`conversation`), and time window (e.g., "last 5 min", "last 30 min", custom range).
- **D-07:** AND combination — multiple filters intersect. E.g., sender=Alice AND kind=conversation shows only Alice's conversation messages.
- **D-08:** Filter chips — active filters displayed as removable chips in the search panel header. Click the × on a chip to remove that filter.
- **D-09:** Filters apply to both the free-text search results and the main transcript view. When filters are active without search text, the transcript itself is filtered in place.

### Attention Lane (OVER-06)
- **D-10:** Roster inline section — the attention lane is a visually distinct "Needs Attention" section at the top of the roster (left column), above the normal session list. Blocked sessions are pulled out of the normal roster flow and displayed prominently in this section.
- **D-11:** Trigger condition: `progress === "blocked"` only. No stale-session heuristics (too noisy for localhost scope). Leverages existing `blockedReason` field and roster blocked markers (Phase 9 D-15/D-16).
- **D-12:** Visual treatment: attention section has a distinct background tint or border to separate it from the normal roster. Each entry in the attention section shows the session name, blocked reason, and a visual urgency indicator (reuses the existing red dot pattern).
- **D-13:** When no sessions are blocked, the attention section is hidden entirely — no empty "Needs Attention" label.

### Agent's Discretion
- MiniSearch configuration (fuzzy distance, prefix length, boost weights)
- Search panel width ratio relative to transcript
- Search icon design and placement within transcript header
- Time window filter presets (which intervals to offer)
- Filter chip styling and layout
- Attention section background color/border design
- Whether the search panel remembers its open/closed state across page reloads
- Scrolling behavior when clicking a search result (scroll into view strategy, highlight animation)
- Keyboard shortcut to toggle search panel (e.g., Ctrl+F or Cmd+K)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Dashboard Store (data source for search index and attention lane)
- `packages/dashboard/src/store/dashboard-store.ts` — `DashboardStore`: `transcriptLines` (Array<TranscriptLine>), `roster` (Map<sessionId, RosterRow>), `RosterRow.progress`, `RosterRow.blockedReason`. Search index builds from transcriptLines; attention lane filters from roster.

### Transcript Components (extend with search integration)
- `packages/dashboard/src/transcript/talkie-transcript.ts` — `TalkieTranscript`: `@lit-labs/virtualizer`, `scrollToIndex`, pin-to-bottom logic. Search results will need to invoke `scrollToIndex` to navigate.
- `packages/dashboard/src/transcript/talkie-transcript-entry.ts` — `TalkieTranscriptEntry`: renders `[HH:MM:SS] sender (kind/type): payload`. Search highlighting may need to augment this component.

### Roster Components (extend with attention lane)
- `packages/dashboard/src/roster/talkie-roster.ts` — `TalkieRoster`: existing blocked-first sort logic. Attention lane section adds above this sorted list.
- `packages/dashboard/src/roster/talkie-roster-entry.ts` — `TalkieRosterEntry`: existing blocked styling (red border, progress dot). Reuse in attention lane entries.

### Protocol (envelope shape for indexing)
- `packages/protocol/src/envelope.ts` — Envelope schema: `sessionId`, `kind`, `type`, `payload`, `to`, `spaceId`. These fields feed the search index and filter dimensions.

### Bridge (data feed)
- `packages/dashboard/src/bridge/browser-session-bridge.ts` — `onEnvelope()`, `onTranscriptCatchup()`: data sources. New transcript entries should be indexed into MiniSearch as they arrive.

### Persistence (server-side blocked query — reference only)
- `packages/persistence/src/repositories/oversight.ts` — `listOversightBlockedSessionsBySlug`: server-side blocked sessions query. The attention lane uses client-side roster data instead, but this confirms the data model.

### App Entry Point
- `packages/dashboard/src/demo/main.ts` — App entry: wires bridge→store→components. New search panel and attention lane components will be wired here.

### Phase 9–11 Context (predecessor decisions)
- `.planning/phases/09-core-oversight-ui/09-CONTEXT.md` — Two-column layout (D-01), dark theme (D-02), transcript terminal-log style (D-08), virtualizer (D-09), blocked markers (D-15/D-16), centralized store (D-22)
- `.planning/phases/10-interactive-human-controls/10-CONTEXT.md` — Send bar (D-01), roster action menu (D-06)
- `.planning/phases/11-space-membership-management/11-CONTEXT.md` — Space picker in header (D-10), URL-driven space binding (D-12)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DashboardStore.transcriptLines`: Complete envelope data already in memory — MiniSearch indexes this directly, no new data fetching needed.
- `DashboardStore.roster`: Map<sessionId, RosterRow> with `progress` and `blockedReason` fields — attention lane reads directly from this.
- `TalkieTranscript` with `@lit-labs/virtualizer`: `scrollToIndex(n, "end")` already implemented for new-message jump — search result navigation reuses this pattern.
- `TalkieRosterEntry`: Existing blocked styling (red border `.row-wrap--blocked`, red dot `.progress-dot--blocked`) — attention lane entries reuse this component.
- `TalkieRoster`: Existing blocked-first sort (`progress === "blocked"` comparison) — attention lane extraction follows this logic.

### Established Patterns
- Lit Web Components with TypeScript decorators, shadow DOM, `css` tagged template styling
- Bridge → Store → Components reactive data flow via `addListener` callback pattern
- No external UI component library (no Shoelace) — all custom Lit components
- OpenClaw-aligned dark theme with CSS custom properties (`--talkie-fg`, `--talkie-muted`, `--talkie-border`, etc.)

### Integration Points
- `talkie-transcript.ts`: Add search toggle button in header area, manage split-pane layout when search panel is open
- `talkie-roster.ts`: Add attention lane section above the sorted roster list
- `dashboard-store.ts`: Add search state (query, filters, results) and attention-lane computed property
- `demo/main.ts`: Wire new `talkie-search-panel` component, connect to store and transcript

</code_context>

<specifics>
## Specific Ideas

- User explicitly descoped topology graph (OVER-05) as too complex for insufficient value in localhost context.
- OpenClaw design reference uses pure SVG for charts — if topology is ever revisited, follow the same zero-dependency approach.
- All UI decisions deferred to agent within OpenClaw-aligned dark theme direction.

</specifics>

<deferred>
## Deferred Ideas

- **Topology graph (OVER-05)** — Session topology visualization showing message flow relationships. User descoped as too complex for the value it provides in localhost context. Could be revisited in a future milestone if multi-machine remote relay makes topology operationally useful. If implemented, use pure SVG (OpenClaw-aligned) with periodic rebuild, envelope-derived edges.
- **Stale-session detection** — Surfacing sessions that haven't sent messages in N minutes as "possibly stalled". Descoped from attention lane triggers to avoid false positives. Could be added later with configurable timeout threshold.
- **Server-side full-text search (DASH-01)** — SQLite FTS5 for unbounded history search beyond the loaded transcript window. Already in future requirements (REQUIREMENTS.md). Current phase uses client-side MiniSearch over loaded data only.

</deferred>

---

*Phase: 12-discovery-topology-attention*
*Context gathered: 2026-04-22*
